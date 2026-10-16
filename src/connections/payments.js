import { connection, keyFor, failure, razorpayClient, verifyHmac, boundedText } from "./runtime-client.js";
import { openCredentials, sealCredentials } from "./providers.js";
import { sha256 } from "../auth/passwords.js";

export async function runtimeAvailable(tx) {
  const [row] = await tx`SELECT to_regclass('public.payment_attempts') IS NOT NULL AS ready`;
  return row?.ready === true;
}
export async function onlineAvailable(tx, id) {
  if (!await runtimeAvailable(tx)) return false;
  const [row] = await tx`SELECT 1 AS ready FROM public.integrations WHERE store_id=${id} AND provider='razorpay'
    AND status='connected' AND metadata->>'enabled'='true' AND metadata->>'mode'='live'
    AND metadata->>'webhook_verified'='true' AND metadata->>'credentials_verified'='true'`;
  return Boolean(row);
}
export async function reservePayment(tx, id, orderId, env) {
  const c = await connection(tx, id, "razorpay", env);
  const encrypted = await sealCredentials(keyFor(env), id, "razorpay", c.credentials);
  await tx`INSERT INTO public.payment_attempts(store_id,order_id,credentials_ciphertext)
    VALUES(${id},${orderId},${encrypted}) ON CONFLICT DO NOTHING`;
}
export async function checkoutPayment(tx, id, input, env, fetcher = fetch) {
  await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
  const [o] = await tx`SELECT o.*,a.provider_order_id,a.credentials_ciphertext,a.state AS payment_state,a.expires_at
    FROM public.orders o JOIN public.payment_attempts a ON a.store_id=o.store_id AND a.order_id=o.id
    WHERE o.store_id=${id} AND o.idempotency_key=${input.idempotency_key} FOR UPDATE OF o,a`;
  if (!o) throw failure("Payment attempt not found.",404);
  if (["expired","refunded"].includes(o.payment_state)) throw Object.assign(failure("This checkout has closed. Your bag is kept. You can start again with a fresh security check."),{restart_checkout:true});
  if (o.status !== "pending_payment") return { order_number:o.order_number,receipt_url:`/orders/${input.receipt_token}`,pending:false,
    paid:["paid","processing","packed","shipped","delivered"].includes(o.status) && o.payment_state==="captured",payment_status:o.payment_state };
  if (new Date(o.expires_at).getTime() <= Date.now()) throw Object.assign(failure("This payment window expired. Your bag is kept. If you paid, check your order before paying again; a late capture is queued for refund."),{restart_checkout:true});
  const credentials = await openCredentials(keyFor(env),id,"razorpay",o.credentials_ciphertext);
  const api = razorpayClient(credentials,fetcher);
  let remoteId = o.provider_order_id;
  if (!remoteId) {
    // A committed local order is the stable receipt. If a previous HTTP response
    // or DB commit was lost, recover it from Razorpay rather than starting over.
    const found = await api(`/orders?receipt=${encodeURIComponent(o.id)}&count=100`);
    if (!Array.isArray(found.items)) throw failure("Cannot reconcile the payment order.",502);
    const matches = found.items.filter(p => p.receipt===o.id && p.notes?.store_id===id && p.amount===Number(o.total_paise) && p.currency==="INR");
    const remote = matches[0] || await api("/orders","POST",{amount:Number(o.total_paise),currency:"INR",receipt:o.id,
      notes:{store_id:id,order_id:o.id},payment_capture:1});
    if (!/^order_[A-Za-z0-9]+$/.test(remote.id) || remote.amount!==Number(o.total_paise) || remote.currency!=="INR") throw failure("Payment provider returned an inconsistent order.",502);
    remoteId=remote.id;
    await tx`UPDATE public.payment_attempts SET provider_order_id=${remoteId},updated_at=now() WHERE store_id=${id} AND order_id=${o.id}`;
  }
  const [store] = await tx`SELECT name FROM public.stores WHERE store_id=${id}`;
  return {order_number:o.order_number,total_paise:Number(o.total_paise),receipt_url:`/orders/${input.receipt_token}`,
    payment:{key_id:credentials.key_id,order_id:remoteId,amount:Number(o.total_paise),currency:"INR",name:store.name,verification_url:"/api/checkout/verify"}};
}
export async function restoreReservedStock(tx,id,order) {
  if (order.stock_restored_at) return;
  const items=await tx`SELECT product_id,product_option_id,quantity,inventory_deducted FROM public.order_items
    WHERE store_id=${id} AND order_id=${order.id} ORDER BY product_id,product_option_id,id`;
  for (const item of items) {
    if (!item.inventory_deducted || !item.product_id) continue;
    if (item.product_option_id) await tx`UPDATE public.product_options SET stock=stock+${item.quantity} WHERE store_id=${id} AND product_id=${item.product_id} AND id=${item.product_option_id}`;
    else await tx`UPDATE public.products SET stock=stock+${item.quantity} WHERE store_id=${id} AND id=${item.product_id}`;
  }
  await tx`UPDATE public.orders SET stock_restored_at=now() WHERE store_id=${id} AND id=${order.id} AND stock_restored_at IS NULL`;
}
export async function recordCapture(tx,id,payment) {
  if (!/^pay_[A-Za-z0-9]+$/.test(payment.id) || payment.status!=="captured" || payment.captured!==true || payment.currency!=="INR") throw failure("A captured INR payment is required.",400);
  await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
  const [o]=await tx`SELECT o.*,a.state AS payment_state,a.captured_payment_id,a.expires_at FROM public.orders o
    JOIN public.payment_attempts a ON a.store_id=o.store_id AND a.order_id=o.id
    WHERE o.store_id=${id} AND a.provider_order_id=${payment.order_id} FOR UPDATE OF o,a`;
  if (!o || Number(o.total_paise)!==payment.amount || o.payment_method!=="online") throw failure("Payment does not match this order.",400);
  if (o.captured_payment_id && o.captured_payment_id!==payment.id) throw failure("A different payment is already recorded. Review the provider account.");
  if (o.payment_state==="refunded") return;
  const late=o.payment_state==="expired" || ["cancelled","returned","rto","refunded"].includes(o.status) ||
    (o.status==="pending_payment" && new Date(o.expires_at).getTime()<=Date.now());
  await tx`INSERT INTO public.payments(store_id,order_id,provider,provider_payment_id,status,amount_paise,currency)
    VALUES(${id},${o.id},'razorpay',${payment.id},'captured',${payment.amount},'INR')
    ON CONFLICT(store_id,provider,provider_payment_id) DO NOTHING`;
  await tx`UPDATE public.payment_attempts SET state=${late?"refund_pending":"captured"},captured_payment_id=${payment.id},
    updated_at=now(),next_check_at=now()+interval '1 hour' WHERE store_id=${id} AND order_id=${o.id}`;
  if (late) {
    if (o.status==="pending_payment") {
      await restoreReservedStock(tx,id,o);
      await tx`UPDATE public.orders SET status='cancelled' WHERE store_id=${id} AND id=${o.id}`;
    }
    await tx`INSERT INTO public.commerce_jobs(store_id,order_id,kind) VALUES(${id},${o.id},'refund') ON CONFLICT DO NOTHING`;
  } else if (o.status==="pending_payment") {
    await tx`UPDATE public.orders SET status='paid',payment_collected_at=now() WHERE store_id=${id} AND id=${o.id}`;
    await tx`INSERT INTO public.audit_log(store_id,actor_type,action,entity_type,entity_id,metadata)
      VALUES(${id},'system','order.payment_captured','order',${o.id},'{}'::jsonb)`;
  }
}
export async function verifyCheckout(tx,id,body,env,fetcher=fetch) {
  if (!/^[a-f0-9]{64}$/.test(body.receipt_token||"") || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id||"") ||
      !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id||"")) throw failure("Invalid payment confirmation.",400);
  const hash=await sha256(`${id}:${body.receipt_token}`);
  const [o]=await tx`SELECT o.id,o.status,a.credentials_ciphertext,a.provider_order_id FROM public.orders o
    JOIN public.payment_attempts a ON a.store_id=o.store_id AND a.order_id=o.id
    WHERE o.store_id=${id} AND o.confirmation_hash=${hash} AND a.provider_order_id=${body.razorpay_order_id}`;
  if (!o) throw failure("Order not found.",404);
  const credentials=await openCredentials(keyFor(env),id,"razorpay",o.credentials_ciphertext);
  if (!await verifyHmac(credentials.key_secret,`${o.provider_order_id}|${body.razorpay_payment_id}`,body.razorpay_signature)) throw failure("Payment signature could not be verified.",400);
  const api=razorpayClient(credentials,fetcher);
  let payment=await api(`/payments/${encodeURIComponent(body.razorpay_payment_id)}`);
  if (payment.order_id!==o.provider_order_id) throw failure("Payment does not match the order.",400);
  if (payment.status==="authorized") {
    const [attempt]=await tx`SELECT expires_at FROM public.payment_attempts WHERE store_id=${id} AND order_id=${o.id}`;
    if (o.status==="pending_payment" && new Date(attempt.expires_at)>new Date()) {
      const [amount]=await tx`SELECT total_paise FROM public.orders WHERE store_id=${id} AND id=${o.id}`;
      if (payment.amount!==Number(amount.total_paise) || payment.currency!=="INR") throw failure("Payment amount does not match.",400);
      payment=await api(`/payments/${payment.id}/capture`,"POST",{amount:Number(amount.total_paise),currency:"INR"});
    }
  }
  // Server fetch, not the browser success callback, establishes payment truth.
  if (payment.status==="captured") await recordCapture(tx,id,payment);
  const [fresh]=await tx`SELECT status FROM public.orders WHERE store_id=${id} AND id=${o.id}`;
  const [a]=await tx`SELECT state FROM public.payment_attempts WHERE store_id=${id} AND order_id=${o.id}`;
  return {pending:fresh.status==="pending_payment",paid:a.state==="captured" && ["paid","processing","packed","shipped","delivered"].includes(fresh.status),
    payment_status:a.state,receipt_url:`/orders/${body.receipt_token}`};
}
export async function razorpayWebhook(request,env,db,storeId) {
  try {
    if (request.method!=="POST") return new Response("Method not allowed",{status:405});
    const raw=await boundedText(request), body=JSON.parse(raw);
    const supported=["payment.captured","payment.authorized","payment.failed","order.paid","refund.processed"];
    if (!supported.includes(body.event)) throw failure("Unsupported payment event.",400);
    const payment=body.payload?.payment?.entity, refund=body.payload?.refund?.entity;
    return await db.withStore(storeId,async tx=>{
      const [attempt]=refund ? await tx`SELECT a.* FROM public.payment_attempts a WHERE store_id=${storeId} AND captured_payment_id=${String(refund.payment_id||"")}` :
        await tx`SELECT a.* FROM public.payment_attempts a WHERE store_id=${storeId} AND provider_order_id=${String(payment?.order_id||body.payload?.order?.entity?.id||"")}`;
      let credentials;
      if (attempt) credentials=await openCredentials(keyFor(env),storeId,"razorpay",attempt.credentials_ciphertext);
      else credentials=(await connection(tx,storeId,"razorpay",env)).credentials;
      if (!await verifyHmac(credentials.webhook_secret,raw,request.headers.get("x-razorpay-signature"))) throw failure("Invalid webhook signature.",400);
      await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
      const eventId=request.headers.get("x-razorpay-event-id") || await sha256(raw);
      if (eventId.length>200) throw failure("Invalid event ID.",400);
      const [event]=await tx`INSERT INTO public.webhook_events(store_id,provider,event_id,event_type,payload)
        VALUES(${storeId},'razorpay',${eventId},${body.event},'{}'::jsonb)
        ON CONFLICT(store_id,provider,event_id) DO NOTHING RETURNING id`;
      if (!event) return Response.json({received:true});
      // An old credential snapshot may settle its own orders after disconnection,
      // but cannot verify a newly connected account's webhook.
      try {
        const current=await connection(tx,storeId,"razorpay",env);
        if (current.credentials.key_id===credentials.key_id && current.credentials.webhook_secret===credentials.webhook_secret) {
          await tx`UPDATE public.integrations SET metadata=jsonb_set(metadata,'{webhook_verified}','true'::jsonb),updated_at=now() WHERE store_id=${storeId} AND provider='razorpay'`;
        }
      } catch(e) { if (e.status!==409) throw e; }
      if (attempt && payment && ["payment.captured","order.paid"].includes(body.event)) await recordCapture(tx,storeId,payment);
      if (attempt && refund?.status==="processed") {
        const api=razorpayClient(credentials);
        const actual=await api(`/payments/${encodeURIComponent(attempt.captured_payment_id)}`);
        if (actual.id===attempt.captured_payment_id && actual.status==="refunded" && actual.amount_refunded===actual.amount) {
          await recordRefund(tx,storeId,attempt.order_id,actual);
        }
      }
      await tx`UPDATE public.webhook_events SET status='processed',processed_at=now() WHERE store_id=${storeId} AND id=${event.id}`;
      return Response.json({received:true});
    });
  } catch(e) { return Response.json({error:e.status?e.message:"Webhook processing is temporarily unavailable."},{status:e.status||503}); }
}
export async function recordRefund(tx,id,orderId,payment) {
  const [o]=await tx`SELECT total_paise,status FROM public.orders WHERE store_id=${id} AND id=${orderId} FOR UPDATE`;
  if (!o || payment.currency!=="INR" || payment.amount!==Number(o.total_paise) || payment.amount_refunded!==payment.amount) throw failure("Refund total does not match this order.");
  await tx`UPDATE public.payments SET status='refunded' WHERE store_id=${id} AND order_id=${orderId} AND provider='razorpay' AND provider_payment_id=${payment.id}`;
  await tx`UPDATE public.payment_attempts SET state='refunded',updated_at=now() WHERE store_id=${id} AND order_id=${orderId} AND captured_payment_id=${payment.id}`;
  // Invoice/credit-note mutation remains exclusively in existing protected
  // financial functions. Never silently rewrite a fulfilled order here.
  if (o.status==="cancelled") await tx`UPDATE public.orders SET status='refunded' WHERE store_id=${id} AND id=${orderId}`;
  await tx`UPDATE public.commerce_jobs SET status='done',last_error=NULL,updated_at=now() WHERE store_id=${id} AND order_id=${orderId} AND kind='refund'`;
}
