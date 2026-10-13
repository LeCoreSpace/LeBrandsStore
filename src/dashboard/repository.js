import { loadDraft } from "../store/repository.js";
import { transitionInput, shouldRestoreStock, dateFilters, stateName, indianDate, statusLabel } from "../public/dashboard-rules.js";
import { commerceError } from "../public/commerce-rules.js";

const missing = () => commerceError("Record not found.",undefined,404);
const numberFields = ["total_paise","subtotal_paise","shipping_paise","tax_paise","cod_fee_paise","discount_paise",
  "unit_price_paise","taxable_paise","cgst_paise","sgst_paise","igst_paise","quantity","item_count","orders_count","total_spent_paise","revenue_paise"];
export function numbers(row) {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key,numberFields.includes(key) && value != null ? Number(value) : value]));
}
export async function audit(tx,id,userId,action,entityType,entityId,metadata = {}) {
  await tx`INSERT INTO public.audit_log (store_id,actor_user_id,action,entity_type,entity_id,metadata)
    VALUES (${id},${userId},${action},${entityType},${entityId},${tx.json(metadata)})`;
}
export async function dashboardAccess(tx,id,userId,write = false,owner = false) {
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id = ${id} AND user_id = ${userId}`;
  if (!member || (owner && member.role !== "owner") || (write && !["owner","admin"].includes(member.role))) {
    throw commerceError(owner ? "Only the store owner can do this." : "You do not have permission for this action.",undefined,403);
  }
  return member.role;
}
export async function listOrders(tx,id,filters = {}) {
  const f = dateFilters(filters);
  const rows = await tx`SELECT o.*,c.name AS customer_name,c.phone,
    (SELECT COALESCE(sum(i.quantity),0)::integer FROM public.order_items i WHERE i.store_id = o.store_id AND i.order_id = o.id) AS item_count
    FROM public.orders o JOIN public.customers c ON c.store_id = o.store_id AND c.id = o.customer_id
    WHERE o.store_id = ${id} AND (${f.status} = '' OR o.status = ${f.status})
      AND (${f.from}::date IS NULL OR o.created_at >= (${f.from}::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND (${f.to}::date IS NULL OR o.created_at < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND (${f.search} = '' OR o.order_number ILIKE ${`%${f.search}%`} OR c.name ILIKE ${`%${f.search}%`} OR c.phone ILIKE ${`%${f.search}%`})
    ORDER BY o.created_at DESC,o.id DESC LIMIT 500`;
  return rows.map(numbers);
}
export async function orderDetail(tx,id,orderId) {
  const [order] = await tx`SELECT o.*,c.name AS customer_name,c.phone,c.email FROM public.orders o
    JOIN public.customers c ON c.store_id = o.store_id AND c.id = o.customer_id WHERE o.store_id = ${id} AND o.id = ${orderId}`;
  if (!order) throw missing();
  const items = await tx`SELECT * FROM public.order_items WHERE store_id = ${id} AND order_id = ${orderId} ORDER BY created_at,id`;
  const shipments = await tx`SELECT * FROM public.shipments WHERE store_id = ${id} AND order_id = ${orderId} ORDER BY created_at DESC,id DESC`;
  const timeline = await tx`SELECT a.*,public.store_actor_name(a.store_id,a.actor_user_id) AS actor_name FROM public.audit_log a
    WHERE a.store_id = ${id} AND a.entity_type = 'order' AND a.entity_id = ${orderId} ORDER BY a.created_at,a.id`;
  const [invoice] = await tx`SELECT * FROM public.invoices WHERE store_id = ${id} AND order_id = ${orderId}`;
  const lines = items.map(numbers), taxTotals = {};
  for (const key of ["taxable_paise","cgst_paise","sgst_paise","igst_paise"]) taxTotals[key] = lines.reduce((n,i) => n + Number(i[key] || 0),0);
  return {...numbers(order),...taxTotals,items:lines,shipments,timeline,invoice:invoice ? numbers(invoice) : null};
}
export async function overview(tx,id,period = 7) {
  const [stats] = await tx`SELECT
    count(*) FILTER (WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))::integer AS today_orders,
    count(*)::integer AS orders,
    COALESCE(sum(total_paise) FILTER (WHERE status NOT IN ('cancelled','refunded','returned','rto')),0) AS revenue_paise,
    COALESCE(round(avg(total_paise) FILTER (WHERE status NOT IN ('cancelled','refunded','returned','rto'))),0) AS aov_paise
    FROM public.orders WHERE store_id = ${id}
      AND created_at >= ((date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') - (${period}::integer - 1) * interval '1 day') AT TIME ZONE 'Asia/Kolkata')`;
  const top = await tx`SELECT i.product_id,i.title,sum(i.quantity)::integer AS quantity,sum(i.total_paise) AS revenue_paise
    FROM public.order_items i JOIN public.orders o ON o.store_id = i.store_id AND o.id = i.order_id
    WHERE i.store_id = ${id} AND o.status NOT IN ('cancelled','refunded','returned','rto')
      AND o.created_at >= ((date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') - (${period}::integer - 1) * interval '1 day') AT TIME ZONE 'Asia/Kolkata')
    GROUP BY i.product_id,i.title ORDER BY sum(i.total_paise) DESC LIMIT 5`;
  const sources = await tx`SELECT CASE WHEN source IN ('mall','direct') THEN source ELSE 'other' END AS source,count(*)::integer AS orders
    FROM public.orders WHERE store_id = ${id}
      AND created_at >= ((date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') - (${period}::integer - 1) * interval '1 day') AT TIME ZONE 'Asia/Kolkata')
    GROUP BY 1 ORDER BY 1`;
  const action = await tx`SELECT o.id,o.order_number,o.status,o.total_paise,o.created_at,o.payment_method,c.name AS customer_name FROM public.orders o
    JOIN public.customers c ON c.store_id=o.store_id AND c.id=o.customer_id
    WHERE o.store_id = ${id} AND (o.status IN ('confirmed_cod','confirmed','paid','packed','processing')
      OR (o.status = 'delivered' AND o.payment_method = 'cod' AND o.payment_collected_at IS NULL))
    ORDER BY o.created_at,o.id LIMIT 50`;
  return {...numbers(stats),orders:Number(stats.orders),aov_paise:Number(stats.aov_paise),top_products:top.map(numbers),sources,needing_action:action.map(numbers)};
}
export async function listCustomers(tx,id,search = "") {
  return (await tx`SELECT c.*,
    count(o.id)::integer AS orders_count,
    COALESCE(sum(o.total_paise) FILTER (WHERE o.status NOT IN ('cancelled','refunded','returned','rto')),0) AS total_spent_paise,
    max(o.created_at) AS last_order_at
    FROM public.customers c LEFT JOIN public.orders o ON o.store_id = c.store_id AND o.customer_id = c.id
    WHERE c.store_id = ${id} AND (${search} = '' OR c.name ILIKE ${`%${search}%`} OR c.phone ILIKE ${`%${search}%`} OR c.email ILIKE ${`%${search}%`})
    GROUP BY c.id ORDER BY max(o.created_at) DESC NULLS LAST,c.id LIMIT 500`).map(numbers);
}
export async function customerDetail(tx,id,customerId) {
  const [customer] = await tx`SELECT * FROM public.customers WHERE store_id = ${id} AND id = ${customerId}`;
  if (!customer) throw missing();
  const orders = (await tx`SELECT * FROM public.orders WHERE store_id = ${id} AND customer_id = ${customerId} ORDER BY created_at DESC,id DESC`).map(numbers);
  const addresses = await tx`SELECT * FROM public.customer_addresses WHERE store_id = ${id} AND customer_id = ${customerId} ORDER BY created_at DESC,id DESC`;
  return {...customer,orders,addresses,orders_count:orders.length,
    total_spent_paise:orders.filter((o) => !["cancelled","refunded","returned","rto"].includes(o.status)).reduce((n,o) => n + o.total_paise,0),last_order_at:orders[0]?.created_at ?? null};
}
export async function listInvoices(tx,id) {
  return (await tx`SELECT i.*,o.order_number FROM public.invoices i JOIN public.orders o ON o.store_id = i.store_id AND o.id = i.order_id
    WHERE i.store_id = ${id} ORDER BY i.issued_at DESC,i.id DESC LIMIT 500`).map(numbers);
}
export async function invoiceDetail(tx,id,invoiceId) {
  const [invoice] = await tx`SELECT * FROM public.invoices WHERE store_id = ${id} AND id = ${invoiceId}`;
  if (!invoice) throw missing();
  return numbers(invoice);
}
export async function issueInvoice(tx,id,orderId,actorId) {
  const [existing] = await tx`SELECT * FROM public.invoices WHERE store_id = ${id} AND order_id = ${orderId}`;
  const [issued] = await invoiceMutation(() => tx`SELECT * FROM public.issue_invoice(${orderId})`);
  const [invoice] = await tx`SELECT * FROM public.invoices WHERE store_id = ${id} AND id = ${issued.id}`;
  if (!invoice) throw missing();
  if (!existing) await audit(tx,id,actorId,"invoice.issued","order",orderId,
    {invoice_number:invoice.invoice_number,document_type:invoice.document_type});
  return numbers(invoice);
}
async function cancelInvoice(tx,id,orderId,actorId) {
  const [invoice] = await invoiceMutation(() => tx`SELECT * FROM public.cancel_invoice(${orderId})`);
  if (invoice?.changed) await audit(tx,id,actorId,"invoice.cancelled","order",orderId,
    {invoice_number:invoice.invoice_number,credit_note_number:invoice.credit_note_number});
}
async function invoiceMutation(fn) {
  try { return await fn(); } catch (error) {
    if (error.code === "42501") throw commerceError("You do not have permission to change this invoice.",undefined,403);
    if (error.code === "23514" && ["Document serial cannot exceed 16 characters","Complete the registered legal name, full address and valid GSTIN in Settings before shipping","Complete the registered supplier address and GSTIN in Settings"].includes(error.message)) throw commerceError(error.message,undefined,409);
    if (error.code === "23514") throw commerceError("Cannot ship or issue this document. Complete the registered legal name, full business address and valid GSTIN in Settings, and check the stored tax split and serial limit.",undefined,409);
    throw error;
  }
}
export async function changeOrderStatus(tx,id,orderId,actorId,body) {
  const [order] = await tx`SELECT * FROM public.orders WHERE store_id = ${id} AND id = ${orderId} FOR UPDATE`;
  if (!order) throw missing();
  const input = transitionInput(order,body);
  if (shouldRestoreStock(input.status,input.restock) && !order.stock_restored_at) {
    const items = await tx`SELECT product_id,product_option_id,quantity,inventory_deducted FROM public.order_items
      WHERE store_id = ${id} AND order_id = ${orderId} ORDER BY product_id,product_option_id,id`;
    for (const item of items) {
      if (!item.product_id || !item.inventory_deducted) continue;
      if (item.product_option_id) await tx`UPDATE public.product_options SET stock = stock + ${item.quantity}
        WHERE store_id = ${id} AND product_id = ${item.product_id} AND id = ${item.product_option_id}`;
      else await tx`UPDATE public.products SET stock = stock + ${item.quantity} WHERE store_id = ${id} AND id = ${item.product_id}`;
    }
    await tx`UPDATE public.orders SET stock_restored_at = now() WHERE store_id = ${id} AND id = ${orderId}`;
  }
  await tx`UPDATE public.orders SET status = ${input.status} WHERE store_id = ${id} AND id = ${orderId}`;
  if (input.status === "shipped") {
    await tx`INSERT INTO public.shipments(store_id,order_id,status,courier,tracking_number,tracking_url,shipped_at)
      VALUES (${id},${orderId},'shipped',${input.courier},${input.tracking_number},${input.tracking_url},now())`;
    await issueInvoice(tx,id,orderId,actorId);
  }
  if (input.status === "delivered") await tx`UPDATE public.shipments SET status = 'delivered',delivered_at = now()
    WHERE store_id = ${id} AND order_id = ${orderId} AND status = 'shipped'`;
  if (["cancelled","returned","rto"].includes(input.status)) await cancelInvoice(tx,id,orderId,actorId);
  await audit(tx,id,actorId,"order.status_changed","order",orderId,{from:order.status,to:input.status,...input});
  return orderDetail(tx,id,orderId);
}
export async function collectPayment(tx,id,orderId,actorId,body) {
  const [order] = await tx`SELECT * FROM public.orders WHERE store_id = ${id} AND id = ${orderId} FOR UPDATE`;
  if (!order) throw missing();
  if (order.payment_method !== "cod" || !["shipped","delivered"].includes(order.status)) throw commerceError("Payment can be recorded for a shipped or delivered COD order.",undefined,409);
  if (order.payment_collected_at) throw commerceError("Payment collection has already been recorded.",undefined,409);
  const value = body.collected_at;
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)) ||
    Date.parse(value) > Date.now() || Date.parse(value) < new Date(order.created_at).getTime()) throw commerceError("Enter a valid collection date between the order date and now.");
  const collected = new Date(value).toISOString();
  await tx`UPDATE public.orders SET payment_collected_at = ${collected}::timestamptz WHERE store_id = ${id} AND id = ${orderId}`;
  await audit(tx,id,actorId,"order.payment_collected","order",orderId,{collected_at:collected});
  return orderDetail(tx,id,orderId);
}
export async function archiveProduct(tx,id,productId,actorId) {
  const [product] = await tx`UPDATE public.products SET status = 'archived' WHERE store_id = ${id} AND id = ${productId} RETURNING id`;
  if (!product) throw missing();
  await syncPublishedProducts(tx,id,productId);
  await audit(tx,id,actorId,"product.archived","product",productId);
  return {archived:true};
}
export async function adjustStock(tx,id,productId,actorId,body) {
  if (!Number.isInteger(body.delta) || body.delta === 0 || Math.abs(body.delta) > 1000000 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 240) throw commerceError("Enter an adjustment and reason.");
  const [product] = await tx`UPDATE public.products SET stock = stock + ${body.delta}
    WHERE store_id = ${id} AND id = ${productId} AND track_inventory AND stock + ${body.delta} >= 0 RETURNING id,stock`;
  if (!product) throw commerceError("Product not found, stock is untracked, or adjustment would make stock negative.",undefined,409);
  await audit(tx,id,actorId,"product.stock_adjusted","product",productId,{delta:body.delta,reason:body.reason.trim(),stock:product.stock});
  return product;
}
export async function syncPublishedProducts(tx,id,productId,activate = false) {
  const [store] = await tx`SELECT status FROM public.stores WHERE store_id = ${id}`;
  if (store?.status !== "live") return;
  if (activate) await tx`UPDATE public.products SET status = 'active' WHERE store_id = ${id} AND id = ${productId} AND status = 'draft'`;
  const [publication] = await tx`SELECT snapshot FROM public.store_publications WHERE store_id = ${id}`;
  if (!publication) return;
  const draft = await loadDraft(tx,id);
  const product = draft.products.find((p) => p.id === productId && p.status === "active");
  const products = [...(publication.snapshot.products || [])];
  const index = products.findIndex((p) => p.id === productId);
  // A stock/price/archive or explicit catalogue save is not a theme publish.
  // Retain published per-product content and collection assignment until republish.
  if (product) {
    product.content = index >= 0 ? products[index].content || {} : {};
    product.collection_ids = index >= 0 ? products[index].collection_ids || [] : [];
  }
  if (index >= 0) {
    if (product) products[index] = product; else products.splice(index,1);
  } else if (product) products.push(product);
  // Refresh only this product. Never publish other catalogue/setup/policy drafts.
  await tx`UPDATE public.store_publications SET snapshot = jsonb_set(snapshot,'{products}',${tx.json(products)})
    WHERE store_id = ${id}`;
}
export async function exportRows(tx,id,kind,filters) {
  const f = dateFilters(filters);
  if (kind === "customers") {
    const rows = await tx`SELECT c.name,c.phone,c.email,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',a.recipient_name,'phone',a.phone,'address',a.address_line_1,
        'address_line_2',a.address_line_2,'landmark',a.landmark,'city',a.city,'state',a.state,'pincode',a.pincode,
        'country',a.country,'is_default',a.is_default)),'[]'::jsonb)
        FROM public.customer_addresses a WHERE a.store_id = c.store_id AND a.customer_id = c.id) AS addresses,
      count(o.id)::integer AS orders_count,COALESCE(sum(o.total_paise) FILTER(WHERE o.status NOT IN ('cancelled','refunded','returned','rto')),0) AS total_spent_paise,
      min(o.created_at) AS first_order_at,max(o.created_at) AS last_order_at
      FROM public.customers c LEFT JOIN public.orders o ON o.store_id = c.store_id AND o.customer_id = c.id
      WHERE c.store_id = ${id} GROUP BY c.id ORDER BY c.id`;
    return {headers:["Name","Phone","Email","Addresses","Orders","Total spent (paise)","First order","Last order"],
      rows:rows.map((r) => [r.name,r.phone,r.email,JSON.stringify(r.addresses.map((a) => ({...a,state:stateName(a.state)}))),r.orders_count,r.total_spent_paise,indianDate(r.first_order_at),indianDate(r.last_order_at)])};
  }
  if (kind === "products") {
    const rows = await tx`SELECT p.*,to_json(p.tags) AS tags,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('url','https://media.lebrands.store/' || m.object_key,'alt',m.alt_text)
        ORDER BY pm.sort_order),'[]'::jsonb) FROM public.product_media pm JOIN public.media m ON m.store_id = pm.store_id AND m.id = pm.media_id
        WHERE pm.store_id = p.store_id AND pm.product_id = p.id) AS images
      FROM public.products p WHERE p.store_id = ${id} ORDER BY p.id`;
    return {headers:["ID","Title","Description","SKU","Status","Price (paise)","Compare price (paise)","Stock","Track inventory","HSN","GST rate","Tags","Images"],
      rows:rows.map((r) => [r.id,r.title,r.description,r.sku,r.status,r.price_paise,r.compare_at_price_paise,r.stock,r.track_inventory,r.hsn_code,r.gst_rate,r.tags.join("|"),JSON.stringify(r.images)])};
  }
  if (kind !== "orders") throw missing();
  const rows = await tx`SELECT o.*,c.name,c.phone,c.email,i.title,i.sku,i.hsn_code,i.quantity,i.unit_price_paise,
    i.gst_rate,i.taxable_paise,i.cgst_paise,i.sgst_paise,i.igst_paise,i.total_paise AS line_total_paise,
    inv.invoice_number,s.courier,s.tracking_number,s.tracking_url
    FROM public.orders o JOIN public.customers c ON c.store_id = o.store_id AND c.id = o.customer_id
    JOIN public.order_items i ON i.store_id = o.store_id AND i.order_id = o.id
    LEFT JOIN public.invoices inv ON inv.store_id = o.store_id AND inv.order_id = o.id
    LEFT JOIN LATERAL (SELECT * FROM public.shipments sh WHERE sh.store_id = o.store_id AND sh.order_id = o.id ORDER BY sh.created_at DESC,sh.id DESC LIMIT 1) s ON true
    WHERE o.store_id = ${id}
      AND (${f.from}::date IS NULL OR o.created_at >= (${f.from}::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND (${f.to}::date IS NULL OR o.created_at < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
    ORDER BY o.created_at,o.id,i.id`;
  return {headers:["Order","Date","Name","Phone","Email","Status","Payment method","Collected at","Product","SKU","HSN","Quantity","Unit price (paise)","GST rate","Taxable (paise)","CGST (paise)","SGST (paise)","IGST (paise)","Line total (paise)","Order total (paise)","Delivery name","Address","Address line 2","Landmark","City","Pincode","State","Source","Courier","Tracking number","Tracking link","Invoice"],
    rows:rows.map((r) => [r.order_number,indianDate(r.created_at),r.name,r.phone,r.email,statusLabel(r.status,r.payment_method),r.payment_method === "cod" ? "Cash on Delivery" : r.payment_method,indianDate(r.payment_collected_at),r.title,r.sku,r.hsn_code,r.quantity,r.unit_price_paise,r.gst_rate,r.taxable_paise,r.cgst_paise,r.sgst_paise,r.igst_paise,r.line_total_paise,r.total_paise,r.shipping_address.name,r.shipping_address.line1,r.shipping_address.line2,r.shipping_address.landmark,r.shipping_address.city,r.shipping_address.pincode,stateName(r.shipping_address.state),r.source,r.courier,r.tracking_number,r.tracking_url,r.invoice_number])};
}
