import { DEFAULT_CHECKOUT_SETTINGS, checkoutSettings, inferStoreState, registeredBusinessState, quoteCart, commerceError } from "../public/commerce-rules.js";
import { onlineAvailable, reservePayment, runtimeAvailable } from "../connections/payments.js";
import { checkShipping } from "../connections/shipping.js";
import {requireSkuCheckout,updateAggregateStock} from "./sku-inventory.js";
import {discountedQuote,recordOffer} from "../offers/repository.js";

const denied = () => commerceError("This store is not available for checkout.",undefined,404);
export async function checkoutContext(tx, id, lock = false) {
  const rows = lock ? await tx`SELECT store_id,subdomain,name,status FROM public.stores WHERE store_id = ${id} FOR UPDATE` :
    await tx`SELECT store_id,subdomain,name,status FROM public.stores WHERE store_id = ${id}`;
  const store = rows[0];
  if (!store || store.status !== "live") throw denied();
  const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id = ${id}`;
  if (!publication?.snapshot) throw denied();
  const [saved] = await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}`;
  const registered = registeredBusinessState(publication.snapshot.settings);
  const settings = checkoutSettings({...DEFAULT_CHECKOUT_SETTINGS,
    store_state:inferStoreState(publication.snapshot.settings),...saved?.settings,
    ...(registered ? {store_state:registered} : {})});
  return {store,snapshot:publication.snapshot,settings};
}
export async function inventoryFor(tx,id,items,lock = false) {
  const result = [];
  // Sorted locks plus the store lock give deterministic, atomic inventory writes.
  for (const item of [...new Map(items.map(i=>[i.product_id,i])).values()].sort((a,b) => a.product_id.localeCompare(b.product_id))) {
    const rows = lock ? await tx`SELECT id,status,stock,track_inventory FROM public.products
      WHERE store_id = ${id} AND id = ${item.product_id} FOR UPDATE` :
      await tx`SELECT id,status,stock,track_inventory FROM public.products WHERE store_id = ${id} AND id = ${item.product_id}`;
    if (rows[0]) {
      const row=rows[0],variants=[];
      for(const selected of items.filter(i=>i.product_id===item.product_id&&i.product_option_id).sort((a,b)=>a.product_option_id.localeCompare(b.product_option_id))){
        const found=lock?await tx`SELECT id,stock,attributes FROM public.product_options
          WHERE store_id=${id} AND product_id=${item.product_id} AND id=${selected.product_option_id} FOR UPDATE`:
          await tx`SELECT id,stock,attributes FROM public.product_options
          WHERE store_id=${id} AND product_id=${item.product_id} AND id=${selected.product_option_id}`;
        if(found[0])variants.push(found[0]);
      }
      result.push({...row,variants});
    }
  }
  return result;
}
export async function checkoutQuote(tx,id,items,state = "",code="",{allowCodeError=false}={}) {
  if(items.some(i=>i.product_option_id))await requireSkuCheckout(tx);
  const context = await checkoutContext(tx,id);
  const quote=quoteCart(context.snapshot.products ?? [],await inventoryFor(tx,id,items),items,context.settings,state);
  const discounted=await discountedQuote(tx,id,quote,context.snapshot,{code,state,allowCodeError});
  return {...discounted,online_available:discounted.total_paise>0&&await onlineAvailable(tx,id)};
}
export async function consumeIpLimit(tx,id,hash,purpose) {
  // Committed in its own transaction before validation/Turnstile. Failed attempts
  // count too; otherwise rolling back an invalid order would bypass rate limits.
  await tx`SELECT store_id FROM public.stores WHERE store_id = ${id} FOR UPDATE`;
  const [count] = purpose === "track" ?
    await tx`SELECT count(*)::integer AS count FROM public.checkout_attempts
      WHERE store_id = ${id} AND ip_hash = ${hash} AND purpose = ${purpose} AND created_at > now() - interval '15 minutes'` :
    await tx`SELECT count(*)::integer AS count FROM public.checkout_attempts
      WHERE store_id = ${id} AND ip_hash = ${hash} AND purpose = ${purpose} AND created_at > now() - interval '1 minute'`;
  if (Number(count?.count ?? 0) >= 10) return false;
  await tx`INSERT INTO public.checkout_attempts (store_id,ip_hash,purpose) VALUES (${id},${hash},${purpose})`;
  await tx`DELETE FROM public.checkout_attempts WHERE store_id = ${id} AND created_at < now() - interval '1 day'`;
  return true;
}
export async function findReplay(tx,id,input,requestHash) {
  const [existing] = await tx`SELECT order_number,total_paise,request_hash FROM public.orders
    WHERE store_id = ${id} AND idempotency_key = ${input.idempotency_key}`;
  if (!existing) return null;
  if (existing.request_hash !== requestHash) throw commerceError("This checkout attempt has changed. Start a new order.",undefined,409);
  return {order_number:existing.order_number,total_paise:Number(existing.total_paise),
    receipt_url:`/orders/${input.receipt_token}`,replayed:true};
}
export async function placeCodOrder(tx,id,input,requestHash,receiptHash,source,env={},fetcher=fetch) {
  if(input.items.some(i=>i.product_option_id))await requireSkuCheckout(tx);
  const context = await checkoutContext(tx,id,true);
  const replay = await findReplay(tx,id,input,requestHash);
  if (replay) return replay;
  const quote = await discountedQuote(tx,id,quoteCart(context.snapshot.products ?? [],await inventoryFor(tx,id,input.items,true),
    input.items,context.settings,input.address.state),context.snapshot,{code:input.code||"",state:input.address.state});
  if (quote.issues.length) throw commerceError(quote.issues.map((i) => i.message).join(" "),{cart:"Update your cart before placing the order."},409);
  if(input.expected_discount_paise!=null&&input.expected_discount_paise!==(quote.discount_paise||0))
    throw commerceError("Your offer changed. Refresh your bag and review the new total before placing the order.",undefined,409);
  const online=input.payment_method==="online";
  if(online&&quote.total_paise===0)throw commerceError("Choose Cash on Delivery for this zero-total order. No payment will be collected.",undefined,400);
  if (online && !await onlineAvailable(tx,id)) throw commerceError("Online payment is not available at this store.",undefined,409);
  if (!online && !context.settings.cod_enabled) throw commerceError("Cash on Delivery is not available at this store.",undefined,409);
  if (!context.settings.store_state) throw commerceError("This store has not completed its checkout setup.",undefined,503);
  if (!online && quote.total_paise > context.settings.cod_max_paise) throw commerceError("This order exceeds the store's Cash on Delivery limit. Reduce your cart total.",undefined,400);
  await checkShipping(tx,id,input,quote.total_paise,env,fetcher);
  const [count] = await tx`SELECT count(*)::integer AS count FROM public.orders o
    WHERE o.store_id = ${id} AND o.shipping_address->>'phone' = ${input.contact.phone} AND o.payment_method = 'cod'
      AND o.created_at > now() - interval '24 hours'`;
  if (!online && Number(count?.count ?? 0) >= 3) throw commerceError("You can place up to 3 Cash on Delivery orders per 24 hours at this store.",undefined,429);
  const [customer] = await tx`INSERT INTO public.customers (store_id,name,phone,email)
    VALUES (${id},${input.contact.name},${input.contact.phone},${input.contact.email || null})
    ON CONFLICT (store_id,phone) DO UPDATE SET name = EXCLUDED.name,
      email = COALESCE(EXCLUDED.email,public.customers.email) RETURNING id`;
  const address = {...input.address,name:input.contact.name,phone:input.contact.phone};
  await tx`INSERT INTO public.customer_addresses
    (store_id,customer_id,recipient_name,phone,address_line_1,address_line_2,landmark,city,state,pincode)
    VALUES (${id},${customer.id},${input.contact.name},${input.contact.phone},${address.line1},
      ${address.line2},${address.landmark},${address.city},${address.state},${address.pincode})`;
  await tx`INSERT INTO public.checkout_settings (store_id) VALUES (${id}) ON CONFLICT DO NOTHING`;
  const [sequence] = await tx`UPDATE public.checkout_settings SET next_order_number = next_order_number + 1
    WHERE store_id = ${id} RETURNING next_order_number - 1 AS number`;
  const prefix = context.store.subdomain.replace(/[^a-z]/g,"").slice(0,3).toUpperCase() || "ORD";
  const order_number = `${prefix}-${sequence.number}`, orderId = crypto.randomUUID();
  await tx`INSERT INTO public.orders
    (id,store_id,customer_id,order_number,status,payment_method,subtotal_paise,tax_paise,shipping_paise,discount_paise,total_paise,
      shipping_address,source,idempotency_key,request_hash,confirmation_hash,supplier_snapshot)
    VALUES (${orderId},${id},${customer.id},${order_number},${online?"pending_payment":"confirmed_cod"},${online?"online":"cod"},${quote.subtotal_paise},
      ${quote.tax_paise},${quote.delivery_paise},${quote.discount_paise||0},${quote.total_paise},${tx.json(address)},${source},
      ${input.idempotency_key},${requestHash},${receiptHash},${tx.json({
        legal_name:context.snapshot.settings?.legal_name || context.store.name,
        address:context.snapshot.settings?.address || "",gstin:context.snapshot.settings?.gstin || "",state:context.settings.store_state,
      })})`;
  for (const line of quote.items) {
    if(line.product_option_id){
      await tx`INSERT INTO public.order_items
        (store_id,order_id,product_id,product_option_id,title,sku,option_snapshot,hsn_code,gst_rate,quantity,unit_price_paise,total_paise,
          tax_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,inventory_deducted)
        VALUES (${id},${orderId},${line.product_id},${line.product_option_id},${line.title},${line.sku},${tx.json(line.variant_values)},
          ${line.hsn_code},${line.gst_rate},${line.quantity},${line.unit_price_paise},${line.line_total_paise},
          ${line.tax_paise},${line.taxable_paise},${line.cgst_paise},${line.sgst_paise},${line.igst_paise},true)`;
      const [updated]=await tx`UPDATE public.product_options SET stock=stock-${line.quantity}
        WHERE store_id=${id} AND product_id=${line.product_id} AND id=${line.product_option_id}
          AND stock>=${line.quantity} RETURNING id`;
      if(!updated)throw commerceError("Stock changed while you were checking out. Please review your cart.",undefined,409);
      await updateAggregateStock(tx,id,line.product_id);
      continue;
    }
    await tx`INSERT INTO public.order_items
      (store_id,order_id,product_id,title,hsn_code,gst_rate,quantity,unit_price_paise,total_paise,
        tax_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,inventory_deducted,sku)
      VALUES (${id},${orderId},${line.product_id},${line.title},${line.hsn_code},${line.gst_rate},
        ${line.quantity},${line.unit_price_paise},${line.line_total_paise},${line.tax_paise},
        ${line.taxable_paise},${line.cgst_paise},${line.sgst_paise},${line.igst_paise},
        (SELECT track_inventory FROM public.products WHERE store_id = ${id} AND id = ${line.product_id}),${line.sku})`;
    const [updated] = await tx`UPDATE public.products SET stock = CASE WHEN track_inventory THEN stock - ${line.quantity} ELSE stock END
      WHERE store_id = ${id} AND id = ${line.product_id} AND status = 'active'
        AND (NOT track_inventory OR stock >= ${line.quantity}) RETURNING id`;
    if (!updated) throw commerceError("A product just sold out. Update your cart and try again.",undefined,409);
  }
  await recordOffer(tx,id,orderId,customer.id,quote,online);
  if (online) await reservePayment(tx,id,orderId,env);
  await tx`INSERT INTO public.audit_log (store_id,actor_type,action,entity_type,entity_id,metadata)
    VALUES (${id},'system','order.created','order',${orderId},${tx.json({payment_method:input.payment_method || "cod",source})})`;
  return {order_number,total_paise:quote.total_paise,receipt_url:`/orders/${input.receipt_token}`,replayed:false};
}
export async function receiptOrder(tx,id,hash) {
  const [order] = await tx`SELECT id,order_number,status,payment_method,subtotal_paise,tax_paise,shipping_paise,discount_paise,total_paise,shipping_address,created_at
    FROM public.orders WHERE store_id = ${id} AND confirmation_hash = ${hash}`;
  if (!order) throw commerceError("Order not found.",undefined,404);
  const items = await tx`SELECT i.title,i.sku,to_jsonb(i)->'option_snapshot' AS option_snapshot,i.quantity,i.unit_price_paise,
    i.total_paise-coalesce((to_jsonb(i)->>'discount_paise')::bigint,0) AS line_total_paise
    FROM public.order_items i WHERE i.store_id = ${id} AND i.order_id = ${order.id} ORDER BY i.created_at,i.id`;
  const [invoice] = await tx`SELECT id,invoice_number,status FROM public.invoices WHERE store_id = ${id} AND order_id = ${order.id}`;
  const attempt=order.payment_method==="online" && await runtimeAvailable(tx)
    ? (await tx`SELECT state FROM public.payment_attempts WHERE store_id=${id} AND order_id=${order.id}`)[0] : null;
  return {...order,invoice,payment_status:attempt?.state||null,subtotal_paise:Number(order.subtotal_paise),tax_paise:Number(order.tax_paise),shipping_paise:Number(order.shipping_paise),
    total_paise:Number(order.total_paise),items:items.map((i) => ({...i,unit_price_paise:Number(i.unit_price_paise),line_total_paise:Number(i.line_total_paise)}))};
}
