import { DEFAULT_CHECKOUT_SETTINGS, checkoutSettings, inferStoreState, quoteCart, commerceError } from "../public/commerce-rules.js";

const denied = () => commerceError("This store is not available for checkout.",undefined,404);
export async function checkoutContext(tx, id, lock = false) {
  const rows = lock ? await tx`SELECT store_id,subdomain,name,status FROM public.stores WHERE store_id = ${id} FOR UPDATE` :
    await tx`SELECT store_id,subdomain,name,status FROM public.stores WHERE store_id = ${id}`;
  const store = rows[0];
  if (!store || store.status !== "live") throw denied();
  const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id = ${id}`;
  if (!publication?.snapshot) throw denied();
  const [saved] = await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}`;
  const settings = checkoutSettings({...DEFAULT_CHECKOUT_SETTINGS,
    store_state:inferStoreState(publication.snapshot.settings),...saved?.settings});
  return {store,snapshot:publication.snapshot,settings};
}
export async function inventoryFor(tx,id,items,lock = false) {
  const result = [];
  // Sorted locks plus the store lock give deterministic, atomic inventory writes.
  for (const item of [...items].sort((a,b) => a.product_id.localeCompare(b.product_id))) {
    const rows = lock ? await tx`SELECT id,status,stock,track_inventory FROM public.products
      WHERE store_id = ${id} AND id = ${item.product_id} FOR UPDATE` :
      await tx`SELECT id,status,stock,track_inventory FROM public.products WHERE store_id = ${id} AND id = ${item.product_id}`;
    if (rows[0]) result.push(rows[0]);
  }
  return result;
}
export async function checkoutQuote(tx,id,items,state = "") {
  const context = await checkoutContext(tx,id);
  return quoteCart(context.snapshot.products ?? [],await inventoryFor(tx,id,items),items,context.settings,state);
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
export async function placeCodOrder(tx,id,input,requestHash,receiptHash,source) {
  const context = await checkoutContext(tx,id,true);
  const replay = await findReplay(tx,id,input,requestHash);
  if (replay) return replay;
  const quote = quoteCart(context.snapshot.products ?? [],await inventoryFor(tx,id,input.items,true),
    input.items,context.settings,input.address.state);
  if (quote.issues.length) throw commerceError(quote.issues.map((i) => i.message).join(" "),{cart:"Update your cart before placing the order."},409);
  if (!context.settings.cod_enabled) throw commerceError("Cash on Delivery is not available at this store.",undefined,409);
  if (!context.settings.store_state) throw commerceError("This store has not completed its checkout setup.",undefined,503);
  if (quote.total_paise > context.settings.cod_max_paise) throw commerceError("This order exceeds the store's Cash on Delivery limit. Reduce your cart total.",undefined,400);
  const [count] = await tx`SELECT count(*)::integer AS count FROM public.orders o
    WHERE o.store_id = ${id} AND o.shipping_address->>'phone' = ${input.contact.phone} AND o.payment_method = 'cod'
      AND o.created_at > now() - interval '24 hours'`;
  if (Number(count?.count ?? 0) >= 3) throw commerceError("You can place up to 3 Cash on Delivery orders per 24 hours at this store.",undefined,429);
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
    (id,store_id,customer_id,order_number,status,payment_method,subtotal_paise,tax_paise,shipping_paise,total_paise,
      shipping_address,source,idempotency_key,request_hash,confirmation_hash)
    VALUES (${orderId},${id},${customer.id},${order_number},'confirmed_cod','cod',${quote.subtotal_paise},
      ${quote.tax_paise},${quote.delivery_paise},${quote.total_paise},${tx.json(address)},${source},
      ${input.idempotency_key},${requestHash},${receiptHash})`;
  for (const line of quote.items) {
    await tx`INSERT INTO public.order_items
      (store_id,order_id,product_id,title,hsn_code,gst_rate,quantity,unit_price_paise,total_paise,
        tax_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise)
      VALUES (${id},${orderId},${line.product_id},${line.title},${line.hsn_code},${line.gst_rate},
        ${line.quantity},${line.unit_price_paise},${line.line_total_paise},${line.tax_paise},
        ${line.taxable_paise},${line.cgst_paise},${line.sgst_paise},${line.igst_paise})`;
    const [updated] = await tx`UPDATE public.products SET stock = CASE WHEN track_inventory THEN stock - ${line.quantity} ELSE stock END
      WHERE store_id = ${id} AND id = ${line.product_id} AND status = 'active'
        AND (NOT track_inventory OR stock >= ${line.quantity}) RETURNING id`;
    if (!updated) throw commerceError("A product just sold out. Update your cart and try again.",undefined,409);
  }
  return {order_number,total_paise:quote.total_paise,receipt_url:`/orders/${input.receipt_token}`,replayed:false};
}
export async function receiptOrder(tx,id,hash) {
  const [order] = await tx`SELECT id,order_number,status,subtotal_paise,shipping_paise,total_paise,shipping_address,created_at
    FROM public.orders WHERE store_id = ${id} AND confirmation_hash = ${hash}`;
  if (!order) throw commerceError("Order not found.",undefined,404);
  const items = await tx`SELECT title,quantity,unit_price_paise,total_paise AS line_total_paise
    FROM public.order_items WHERE store_id = ${id} AND order_id = ${order.id} ORDER BY created_at,id`;
  return {...order,subtotal_paise:Number(order.subtotal_paise),shipping_paise:Number(order.shipping_paise),
    total_paise:Number(order.total_paise),items:items.map((i) => ({...i,unit_price_paise:Number(i.unit_price_paise),line_total_paise:Number(i.line_total_paise)}))};
}
