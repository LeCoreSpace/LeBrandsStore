import { createDb } from "../db.js";
import { openCredentials } from "./providers.js";
import {refreshOAuth} from "./razorpay-oauth.js";
import { keyFor, razorpayClient, shiprocketClient, failure } from "./runtime-client.js";
import { shippingSettings, shippingOrder, serviceable } from "./shipping.js";
import { recordCapture, recordRefund, restoreReservedStock } from "./payments.js";
import { changeOrderStatus } from "../dashboard/repository.js";

async function locked(db,id,fn) {
  return db.withStore(id,async tx=>{await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;return fn(tx);});
}
async function patch(db,id,jobId,payload) {
  await locked(db,id,tx=>tx`UPDATE public.commerce_jobs SET payload=${JSON.stringify(payload)}::text::jsonb,updated_at=now()
    WHERE store_id=${id} AND id=${jobId}`);
}
export async function runCommerceJob(db,id,jobId,env,fetcher=fetch) {
  const work=await locked(db,id,async tx=>{
    const [j]=await tx`UPDATE public.commerce_jobs SET status='running',lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
      WHERE store_id=${id} AND id=${jobId} AND (status='waiting' OR(status='running' AND lease_until<now())) AND next_attempt_at<=now()
      RETURNING *,payload::text AS payload_text`;
    if (!j) return null;
    const [o]=await tx`SELECT * FROM public.orders WHERE store_id=${id} AND id=${j.order_id}`;
    return {job:j,order:o,p:JSON.parse(j.payload_text)};
  });
  if (!work) return;
  const {job,order:o,p}=work;
  try {
    if (job.kind==="refund") await refundJob(db,id,job,o,p,env,fetcher);
    else await shippingJob(db,id,job,o,p,env,fetcher);
  } catch(e) {
    // Fixed, non-PII messages only; never persist raw provider bodies.
    const attention=e.ambiguous===true || e.status===409 || job.attempts>=8;
    await locked(db,id,tx=>tx`UPDATE public.commerce_jobs SET status=${attention?"attention":"waiting"},lease_until=NULL,
      next_attempt_at=now()+interval '15 minutes',last_error=${e.status?e.message:"This operation needs platform assistance."},updated_at=now()
      WHERE store_id=${id} AND id=${job.id}`);
  }
}
async function finish(db,id,job,status="done",minutes=60) {
  await locked(db,id,tx=>tx`UPDATE public.commerce_jobs SET status=${status},lease_until=NULL,last_error=NULL,updated_at=now(),
    next_attempt_at=now()+${minutes}*interval '1 minute' WHERE store_id=${id} AND id=${job.id}`);
}
async function refundJob(db,id,job,o,p,env,fetcher) {
  const attempt=await locked(db,id,async tx=>(await tx`SELECT * FROM public.payment_attempts WHERE store_id=${id} AND order_id=${o.id}`)[0]);
  if (!attempt?.captured_payment_id) throw failure("No captured online payment is available to refund.");
  const credentials=await locked(db,id,async tx=>refreshOAuth(tx,id,await openCredentials(keyFor(env),id,"razorpay",attempt.credentials_ciphertext),env,fetcher)),api=razorpayClient(credentials,fetcher);
  let payment=await api(`/payments/${attempt.captured_payment_id}`);
  if (payment.order_id!==attempt.provider_order_id || payment.amount!==Number(o.total_paise) || payment.currency!=="INR") throw failure("Refund payment does not match the order.");
  if (payment.amount_refunded===payment.amount && payment.status==="refunded") {
    await locked(db,id,tx=>recordRefund(tx,id,o.id,payment)); return;
  }
  const list=await api(`/payments/${payment.id}/refunds?count=100`);
  if (!Array.isArray(list.items)) throw failure("Cannot reconcile provider refunds.",502);
  const receipt=`LB-${o.id}`, existing=list.items.find(r=>r.receipt===receipt);
  if (existing?.status==="failed") throw failure("Razorpay reports a failed refund. Resolve it in Razorpay, then retry reconciliation here.");
  if (existing) { await finish(db,id,job,"waiting",15);return; }
  if (payment.amount_refunded>0) throw failure("A partial refund already exists. Reconcile the balance in Razorpay before continuing.");
  if (p.refund_attempted) throw Object.assign(failure("Refund response uncertain. Check Razorpay; confirm no refund exists before permitting another attempt."),{ambiguous:true});
  p.refund_attempted=true;await patch(db,id,job.id,p);
  await api(`/payments/${payment.id}/refund`,"POST",{amount:Number(o.total_paise),receipt,notes:{store_id:id,order_id:o.id}});
  payment=await api(`/payments/${payment.id}`);
  if (payment.status==="refunded" && payment.amount_refunded===payment.amount) await locked(db,id,tx=>recordRefund(tx,id,o.id,payment));
  else await finish(db,id,job,"waiting",15);
}
async function shippingJob(db,id,job,o,p,env,fetcher) {
  if (job.kind==="cancel-shipment") {
    const original=await locked(db,id,async tx=>(await tx`SELECT payload::text FROM public.commerce_jobs WHERE store_id=${id} AND order_id=${o.id} AND kind='ship'`)[0]);
    const source=original?JSON.parse(original.payload):{};
    if (!source.remote_order_id) {
      if (source.create_attempted) throw failure("Shipping creation is uncertain. Reconcile the original booking before cancelling.");
      await finish(db,id,job);return;
    }
    const creds=await openCredentials(keyFor(env),id,"shiprocket",source.credentials_ciphertext),api=shiprocketClient(creds,fetcher);
    await api("/orders/cancel","POST",{ids:[source.remote_order_id]});
    const details=await api(`/orders/show/${source.remote_order_id}`);
    if (!["CANCELED","CANCELLED"].includes(String(details.data?.status).toUpperCase())) throw failure("Cancellation requested. Confirm the carrier cancellation before rescheduling.");
    await locked(db,id,tx=>tx`UPDATE public.shipments SET status='cancelled' WHERE store_id=${id} AND order_id=${o.id} AND provider='shiprocket' AND status<>'delivered'`);
    await finish(db,id,job);return;
  }
  if (["cancelled","returned","rto","refunded"].includes(o.status)) {await finish(db,id,job);return;}
  if (o.payment_method==="online" && !["paid","processing","packed","shipped","delivered"].includes(o.status)) throw failure("Online payment has not been captured. Shipment was not booked.");
  if (o.payment_method==="online") {
    const state=await db.withStore(id,async tx=>(await tx`SELECT state FROM public.payment_attempts WHERE store_id=${id} AND order_id=${o.id}`)[0]?.state);
    if (state!=="captured") throw failure("Online payment has been refunded or needs reconciliation. Review the shipment before continuing.");
  }
  const s=shippingSettings(p.shipping),creds=await openCredentials(keyFor(env),id,"shiprocket",p.credentials_ciphertext),api=shiprocketClient(creds,fetcher);
  const reference=`LB-${o.id}`;
  if (!p.remote_order_id) {
    const found=await api(`/orders?search=${encodeURIComponent(reference)}&per_page=200`);
    if (!Array.isArray(found.data)) throw failure("Cannot reconcile Shiprocket orders.",502);
    const matches=found.data.filter(r=>r.channel_order_id===reference);
    if (matches.length>1) throw failure("Multiple carrier orders match. Reconcile them in Shiprocket before continuing.");
    if (matches[0]) {
      p.remote_order_id=Number(matches[0].id);p.shipment_id=Number(matches[0].shipments?.[0]?.id);
    } else {
      if (p.create_attempted) throw Object.assign(failure("Booking response uncertain. Check Shiprocket; confirm no order exists before permitting another attempt."),{ambiguous:true});
      const courier=await serviceable(api,s,o.shipping_address.pincode,o.payment_method,Number(o.total_paise));
      const content=await locked(db,id,async tx=>({
        items:await tx`SELECT * FROM public.order_items WHERE store_id=${id} AND order_id=${o.id} ORDER BY id`,
        customer:(await tx`SELECT email FROM public.customers WHERE store_id=${id} AND id=${o.customer_id}`)[0]
      }));
      p.courier_id=Number(courier.courier_company_id);p.create_attempted=true;await patch(db,id,job.id,p);
      const created=await api("/orders/create/adhoc","POST",shippingOrder(o,content.items,content.customer,s));
      p.remote_order_id=Number(created.order_id);p.shipment_id=Number(created.shipment_id);
    }
    if (!Number.isSafeInteger(p.remote_order_id) || p.remote_order_id<1 || !Number.isSafeInteger(p.shipment_id) || p.shipment_id<1) throw failure("Carrier order needs reconciliation; no valid shipment ID was returned.");
    await patch(db,id,job.id,p);
  }
  const details=await api(`/orders/show/${p.remote_order_id}`),remote=details.data;
  if (remote?.channel_order_id!==reference) throw failure("Carrier order does not match this store order.");
  const shipment=Array.isArray(remote.shipments)?remote.shipments.find(r=>Number(r.id)===p.shipment_id):remote.shipments;
  if (shipment && Number(shipment.id)!==p.shipment_id) throw failure("Carrier shipment does not match this order.");
  if (shipment?.awb) {p.awb=String(shipment.awb);p.courier=String(shipment.courier||"Shiprocket");await patch(db,id,job.id,p);}
  if (!p.awb) {
    if (p.awb_attempted) throw Object.assign(failure("AWB response uncertain. Check the carrier order before permitting another assignment."),{ambiguous:true});
    const courier=await serviceable(api,s,o.shipping_address.pincode,o.payment_method,Number(o.total_paise));
    p.courier_id=Number(courier.courier_company_id);p.awb_attempted=true;await patch(db,id,job.id,p);
    const assigned=await api("/courier/assign/awb","POST",{shipment_id:p.shipment_id,courier_id:p.courier_id,is_return:0});
    if (assigned.awb_assign_status!==1 || !assigned.response?.data?.awb_code) throw failure("AWB was not assigned. Check wallet balance, KYC and courier availability.");
    p.awb=String(assigned.response.data.awb_code);p.courier=String(assigned.response.data.courier_name||"Shiprocket");
    await patch(db,id,job.id,p);
  }
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(p.awb)) throw failure("Carrier returned an invalid tracking number.");
  await locked(db,id,tx=>tx`INSERT INTO public.shipments(store_id,order_id,provider,provider_shipment_id,status,courier,tracking_number,tracking_url)
    VALUES(${id},${o.id},'shiprocket',${String(p.shipment_id)},'pending',${p.courier},${p.awb},${`https://shiprocket.co/tracking/${encodeURIComponent(p.awb)}`})
    ON CONFLICT(store_id,provider,provider_shipment_id) DO NOTHING`);
  if (s.auto_pickup && !p.pickup) {
    if (shipment?.pickup_scheduled_date) p.pickup=true;
    else {
      if (p.pickup_attempted) throw Object.assign(failure("Pickup response uncertain. Check the pickup schedule before requesting it again."),{ambiguous:true});
      p.pickup_attempted=true;await patch(db,id,job.id,p);
      const result=await api("/courier/generate/pickup","POST",{shipment_id:[p.shipment_id]});
      if (result.pickup_status!==1) throw failure("Pickup was not confirmed. Check Shiprocket and request pickup again if needed.");
      p.pickup=true;
    }
    await patch(db,id,job.id,p);
  }
  const tracking=await api(`/courier/track/shipment/${p.shipment_id}`),data=tracking.tracking_data;
  const scan=data?.shipment_track?.find(x=>Number(x.shipment_id)===p.shipment_id);
  if (scan && scan.awb_code!==p.awb) throw failure("Tracking number does not match the booked shipment.");
  const status=String(scan?.current_status||"").toUpperCase();
  if (["PICKED UP","IN TRANSIT","SHIPPED","OUT FOR DELIVERY","DELIVERED"].includes(status)) {
    await locked(db,id,async tx=>{
      const [fresh]=await tx`SELECT status FROM public.orders WHERE store_id=${id} AND id=${o.id} FOR UPDATE`;
      if (["confirmed_cod","paid","confirmed","processing","packed"].includes(fresh.status)) {
        // This calls the existing tenant-checked financial issue_invoice path.
        if (fresh.status!=="packed") await changeOrderStatus(tx,id,o.id,null,{status:"packed"});
        await changeOrderStatus(tx,id,o.id,null,{status:"shipped",courier:p.courier,tracking_number:p.awb,tracking_url:`https://shiprocket.co/tracking/${encodeURIComponent(p.awb)}`},{managedShipment:true});
      }
      await tx`UPDATE public.shipments SET status='shipped',shipped_at=COALESCE(shipped_at,now())
        WHERE store_id=${id} AND order_id=${o.id} AND provider='shiprocket' AND status='pending'`;
      if (status==="DELIVERED") {
        const [current]=await tx`SELECT status FROM public.orders WHERE store_id=${id} AND id=${o.id}`;
        if (current.status==="shipped") await changeOrderStatus(tx,id,o.id,null,{status:"delivered"});
      }
    });
  }
  // Booking/pickup is not dispatch or delivery. COD collection also remains
  // explicit: a carrier scan is not proof that funds were remitted.
  await finish(db,id,job,status==="DELIVERED"?"done":"waiting",60);
}
export async function reconcilePayments(db,id,env,fetcher=fetch) {
  const attempts=await db.withStore(id,tx=>tx`SELECT * FROM public.payment_attempts WHERE store_id=${id}
    AND state IN ('pending','expired','refund_pending') AND next_check_at<=now() ORDER BY next_check_at LIMIT 2`);
  for (const a of attempts) {
    await locked(db,id,tx=>tx`UPDATE public.payment_attempts SET next_check_at=now()+interval '15 minutes' WHERE store_id=${id} AND order_id=${a.order_id}`);
    try {
      const creds=await openCredentials(keyFor(env),id,"razorpay",a.credentials_ciphertext),api=razorpayClient(creds,fetcher);
      if (a.provider_order_id) {
        const result=await api(`/orders/${a.provider_order_id}/payments`);
        if (!Array.isArray(result.items)) throw failure("Cannot reconcile payments.",502);
        const captured=result.items.filter(p=>p.status==="captured" && p.captured===true);
        if (captured.length>1) throw failure("Multiple captures need reconciliation.");
        if (captured[0]) await locked(db,id,tx=>recordCapture(tx,id,captured[0]));
        else {
          const authorized=result.items.find(p=>p.status==="authorized" && /^pay_[A-Za-z0-9]+$/.test(p.id));
          if (authorized && a.state==="pending" && new Date(a.expires_at)>new Date()) {
            await locked(db,id,async tx=>{
              const [local]=await tx`SELECT o.total_paise,o.status,a.state,a.expires_at FROM public.orders o
                JOIN public.payment_attempts a ON a.store_id=o.store_id AND a.order_id=o.id
                WHERE o.store_id=${id} AND o.id=${a.order_id} FOR UPDATE OF o,a`;
              if (local.state!=="pending" || local.status!=="pending_payment" || new Date(local.expires_at)<=new Date()) return;
              if (authorized.order_id!==a.provider_order_id || authorized.amount!==Number(local.total_paise) || authorized.currency!=="INR") throw failure("Authorized payment does not match.");
              const actual=await api(`/payments/${authorized.id}/capture`,"POST",{amount:Number(local.total_paise),currency:"INR"});
              await recordCapture(tx,id,actual);
            });
          }
        }
      }
      await locked(db,id,async tx=>{
        const [fresh]=await tx`SELECT o.*,a.state AS attempt_state FROM public.orders o JOIN public.payment_attempts a ON a.store_id=o.store_id AND a.order_id=o.id
          WHERE o.store_id=${id} AND o.id=${a.order_id} AND a.expires_at<=now() FOR UPDATE OF o,a`;
        if (fresh?.attempt_state==="pending" && fresh.status==="pending_payment") {
          await restoreReservedStock(tx,id,fresh);
          await tx`UPDATE public.orders SET status='cancelled' WHERE store_id=${id} AND id=${a.order_id}`;
          await tx`UPDATE public.payment_attempts SET state='expired',next_check_at=now()+interval '1 hour',updated_at=now() WHERE store_id=${id} AND order_id=${a.order_id}`;
        } else if (fresh?.attempt_state==="expired") {
          await tx`UPDATE public.payment_attempts SET next_check_at=now()+interval '6 hours' WHERE store_id=${id} AND order_id=${a.order_id}`;
        }
      });
    } catch {
      // Keep reservation on an uncertain provider response. Never release stock
      // while a capture might be in progress; the next cron retries.
    }
  }
}
export async function scheduleCommerce(env) {
  const db=createDb(env);
  try {
    const ready=await db.account(async tx=>(await tx`SELECT to_regclass('public.commerce_jobs') IS NOT NULL AS ready`)[0]?.ready);
    if (!ready) return;
    const stores=await db.account(tx=>tx`SELECT * FROM public.commerce_due_stores(3)`);
    for (const row of stores) {
      const id=row.store_id;
      await reconcilePayments(db,id,env);
      const jobs=await db.withStore(id,tx=>tx`SELECT id FROM public.commerce_jobs WHERE store_id=${id}
        AND (status='waiting' OR(status='running' AND lease_until<now())) AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 1`);
      for (const j of jobs) await runCommerceJob(db,id,j.id,env);
    }
  } catch(e) { console.error("Commerce recovery failed",{code:e.code||"unavailable"}); }
  finally { await db.close(); }
}
