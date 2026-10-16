import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase,annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { sealCredentials } from "../src/connections/providers.js";
import { verifyHmac } from "../src/connections/runtime-client.js";
import { onlineAvailable,checkoutPayment,verifyCheckout,razorpayWebhook } from "../src/connections/payments.js";
import { placeCodOrder,checkoutQuote,receiptOrder } from "../src/checkout/repository.js";
import { renderCommerceBody } from "../src/public/commerce-view.js";
import { runCommerceJob,reconcilePayments } from "../src/connections/jobs.js";
import { shippingSettings,serviceable } from "../src/connections/shipping.js";
import { prepareAnnLaunch,saveAnnLaunch } from "../src/store/ann-launch.js";
import { sha256 } from "../src/auth/passwords.js";
import { gstinChecksum } from "../src/public/commerce-rules.js";
import { configureDomains } from "../scripts/configure-custom-domains.mjs";
import { migrationSelection } from "../db/migration-selection.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",product="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const secret="isolated-encryption-test-not-a-real-key",env={SESSION_SECRET:secret};
const credentials={key_id:"rzp_live_12345678",key_secret:"isolated-key-secret",webhook_secret:"isolated-webhook-secret"};
const json=x=>Response.json(x);
async function sign(secret,value) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
}
test("commerce runtime migration remains explicitly staged; HMAC rejects tampering; package limits and serviceability fail closed",async()=>{
  assert.equal(migrationSelection(["--staged-commerce"]).requires,"0017_ann_launch_setup.sql");
  const signature=await sign("local-only","body");
  assert.equal(await verifyHmac("local-only","body",signature),true);
  assert.equal(await verifyHmac("local-only","body-changed",signature),false);
  assert.equal(await verifyHmac("local-only","body","x"),false);
  assert.throws(()=>shippingSettings({weight_kg:-1}));
  await assert.rejects(serviceable(async()=>({data:{available_courier_companies:[{courier_company_id:1,rate:100,cod:0}]}}),
    {pickup_pincode:"600001",weight_kg:1,length_cm:20,breadth_cm:20,height_cm:20,max_freight_paise:5000},"600002","cod",10000));
});
test("real tenant DB: checkout, capture, webhook deduplication, stock reservation, late capture, outbox and carrier retries",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true}),adapter=annFixtureAdapter(pg);
  const db={...adapter,withStore:(tenant,fn)=>adapter.withMemberStore(tenant,"a".repeat(64),fn)};
  let remoteOrder,paid=false,carrierOrder,awb=false,pickup=false,createCount=0,refundCount=0,ambiguous=false,carrierCreates=0,scanStatus="NEW",lateRefunded=false;
  const shipping={pickup_location:"Primary",pickup_pincode:"600001",weight_kg:1,length_cm:25,breadth_cm:20,height_cm:10,max_units:3,max_freight_paise:20000,auto_pickup:true};
  const fetcher=async(url,options={})=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};
    if (url.startsWith("https://api.razorpay.com/")) {
      if (path==="/v1/orders" && options.method==="GET") return json({items:remoteOrder?[remoteOrder]:[]});
      if (path==="/v1/orders" && options.method==="POST") {
        createCount++;remoteOrder={...body,id:"order_example",status:"created"};return json(remoteOrder);
      }
      if (path==="/v1/orders/order_example/payments") return json({items:paid?[payment()]:[]});
      if (path==="/v1/payments/pay_example") return json(payment());
      if (path==="/v1/payments/pay_late") return json({...payment(),id:"pay_late",order_id:"order_late",status:lateRefunded?"refunded":"captured",amount_refunded:lateRefunded?129909:0});
      if (path.endsWith("/refunds")) return json({items:[]});
      if (path.endsWith("/refund")) {refundCount++;lateRefunded=true;return json({id:"rfnd_example",status:"processed"});}
      throw new Error(`Unexpected payment request ${path}`);
    }
    if (path.endsWith("/auth/login")) return json({token:"isolated-token-for-api-tests-only".repeat(3)});
    if (path.endsWith("/settings/company/pickup")) return json({data:{shipping_address:[{pickup_location:"Primary",pin_code:"600001"}]}});
    if (path.includes("/courier/serviceability")) return json({data:{available_courier_companies:[{courier_company_id:10,rate:80,cod:1,blocked:0}]}});
    if (path.endsWith("/orders") && options.method==="GET") return json({data:carrierOrder?[{id:101,channel_order_id:carrierOrder.order_id,shipments:[{id:202}]}]:[]});
    if (path.endsWith("/orders/create/adhoc")) {
      carrierCreates++;carrierOrder=body;
      if (ambiguous) throw new Error("isolated network loss");
      return json({order_id:101,shipment_id:202});
    }
    if (path.endsWith("/orders/show/101")) return json({data:{channel_order_id:carrierOrder.order_id,shipments:{id:202,awb:awb?"AWB123":"",courier:"Example Courier",pickup_scheduled_date:pickup?"2026-10-16":null}}});
    if (path.endsWith("/courier/assign/awb")) {awb=true;return json({awb_assign_status:1,response:{data:{awb_code:"AWB123",courier_name:"Example Courier"}}});}
    if (path.endsWith("/courier/generate/pickup")) {pickup=true;return json({pickup_status:1});}
    if (path.endsWith("/courier/track/shipment/202")) return json({tracking_data:{track_status:1,shipment_track:[{shipment_id:202,awb_code:"AWB123",current_status:scanStatus}]}});
    throw new Error(`Unexpected carrier request ${path}`);
  };
  function payment(){return {id:"pay_example",order_id:"order_example",amount:129909,currency:"INR",status:"captured",captured:true,amount_refunded:0};}
  const input={items:[{product_id:product,quantity:1}],contact:{name:"Example Buyer",phone:"+919876543210",email:"buyer@example.invalid"},
    address:{line1:"10 Example Street",line2:"",landmark:"",city:"Chennai",state:"33",pincode:"600002"},payment_method:"online",idempotency_key:crypto.randomUUID(),receipt_token:"a".repeat(64)};
  try {
    const gstin="33ABCDE1234F1Z"+gstinChecksum("33ABCDE1234F1Z");
    const settings={brand_name:"Example Studio",legal_name:"Example Studio",address:"10 Example Street, Chennai, Tamil Nadu 600001",
      business_line1:"10 Example Street",business_city:"Chennai",business_pincode:"600001",business_state:"33",gstin};
    await pg.query("SELECT set_config('app.store_id',$1,false)",[id]);
    await pg.query("UPDATE stores SET status='live' WHERE store_id=$1",[id]);
    await pg.query("UPDATE products SET status='active',hsn_code='6205' WHERE store_id=$1",[id]);
    await pg.query("UPDATE store_setup SET settings=$2 WHERE store_id=$1",[id,JSON.stringify(settings)]);
    await pg.query("INSERT INTO store_publications(store_id,snapshot) VALUES($1,$2)",[id,JSON.stringify({settings,products:[{id:product,title:"Sample cotton shirt",slug:"sample-cotton-shirt",price_paise:129909,gst_rate:12,hsn_code:"6205",status:"active"}]})]);
    const encrypted=await sealCredentials(secret,id,"razorpay",credentials);
    await pg.query("INSERT INTO integrations(store_id,provider,status,credentials_ciphertext,metadata) VALUES($1,'razorpay','connected',$2,$3)",[id,encrypted,JSON.stringify({credentials_verified:true,mode:"live"})]);
    assert.equal(await db.withStore(id,tx=>onlineAvailable(tx,id)),false);
    let launch=await db.withMemberStore(id,"a".repeat(64),tx=>prepareAnnLaunch(tx,id,owner,env));
    const save=(state,action,extra={})=>db.withMemberStore(id,"a".repeat(64),tx=>saveAnnLaunch(tx,id,owner,env,{action,expected_revision:state.revision,confirm:true,...extra},fetcher));
    await assert.rejects(save(launch,"activate",{provider:"razorpay",enabled:true,provider_domain_confirmed:true}),{status:409});
    const handshake=JSON.stringify({event:"payment.authorized",payload:{payment:{entity:{order_id:"order_unknown"}}}});
    let response=await razorpayWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/"+id,{method:"POST",headers:{"x-razorpay-signature":await sign(credentials.webhook_secret,handshake)},body:handshake}),env,db,id);
    assert.equal(response.status,200);
    launch=await save(launch,"activate",{provider:"razorpay",enabled:true,provider_domain_confirmed:true});
    assert.equal(launch.providers.razorpay.runtime_ready,true);
    assert.equal(await db.withStore(id,tx=>checkoutQuote(tx,id,input.items,"33")).then(q=>q.online_available),true);
    launch=await save(launch,"shiprocket-connect",{credentials:{email:"shipping@example.invalid",password:"isolated-password"}});
    launch=await save(launch,"shipping-settings",{shipping});
    launch=await save(launch,"activate",{provider:"shiprocket",enabled:true,provider_domain_confirmed:true});
    assert.equal(launch.providers.shiprocket.runtime_ready,true);
    const hash=await sha256(JSON.stringify(input)),receiptHash=await sha256(`${id}:${input.receipt_token}`);
    const place=()=>db.withStore(id,tx=>placeCodOrder(tx,id,input,hash,receiptHash,"direct",env,fetcher));
    await place();
    assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[product])).rows[0].stock,6);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM commerce_jobs")).rows[0].n,0);
    let checkout=await db.withStore(id,tx=>checkoutPayment(tx,id,input,env,fetcher));
    assert.equal(checkout.payment.amount,129909);assert.equal(checkout.payment.key_id,credentials.key_id);
    assert.ok(!JSON.stringify(checkout).includes(credentials.key_secret));
    await place();await db.withStore(id,tx=>checkoutPayment(tx,id,input,env,fetcher));
    assert.equal(createCount,1);
    await assert.rejects(db.withStore(id,tx=>verifyCheckout(tx,id,{receipt_token:input.receipt_token,razorpay_order_id:"order_example",razorpay_payment_id:"pay_example",razorpay_signature:"0".repeat(64)},env,fetcher)),{status:400});
    const captured=JSON.stringify({event:"payment.captured",payload:{payment:{entity:payment()}}});
    response=await razorpayWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/"+id,{method:"POST",headers:{"x-razorpay-signature":"0".repeat(64)},body:captured}),env,db,id);
    assert.equal(response.status,400);
    const wrong=JSON.stringify({event:"payment.captured",payload:{payment:{entity:{...payment(),amount:1}}}});
    response=await razorpayWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/"+id,{method:"POST",headers:{"x-razorpay-signature":await sign(credentials.webhook_secret,wrong)},body:wrong}),env,db,id);
    assert.equal(response.status,400);
    for(let n=0;n<2;n++){
      response=await razorpayWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/"+id,{method:"POST",headers:{"x-razorpay-event-id":"same-event","x-razorpay-signature":await sign(credentials.webhook_secret,captured)},body:captured}),env,db,id);
      assert.equal(response.status,200);
    }
    paid=true;
    const verified=await db.withStore(id,async tx=>verifyCheckout(tx,id,{receipt_token:input.receipt_token,razorpay_order_id:"order_example",razorpay_payment_id:"pay_example",razorpay_signature:await sign(credentials.key_secret,"order_example|pay_example")},env,fetcher));
    assert.equal(verified.paid,true);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM payments")).rows[0].n,1);
    const job=(await pg.query("SELECT id FROM commerce_jobs WHERE kind='ship'")).rows[0];
    assert.ok(job);
    ambiguous=true;
    await runCommerceJob(db,id,job.id,env,fetcher);
    assert.equal((await pg.query("SELECT status FROM commerce_jobs WHERE id=$1",[job.id])).rows[0].status,"attention");
    launch=await db.withMemberStore(id,"a".repeat(64),tx=>prepareAnnLaunch(tx,id,owner,env));
    launch=await save(launch,"retry-job",{id:job.id});
    ambiguous=false;
    await runCommerceJob(db,id,job.id,env,fetcher);
    assert.equal(carrierCreates,1);assert.equal(pickup,true);
    const shipment=(await pg.query("SELECT * FROM shipments")).rows[0];
    assert.equal(shipment.provider,"shiprocket");assert.equal(shipment.tracking_number,"AWB123");assert.equal(shipment.status,"pending");
    assert.equal((await pg.query("SELECT status FROM orders")).rows[0].status,"paid","booking is not dispatch");
    scanStatus="DELIVERED";
    await pg.query("UPDATE commerce_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[job.id]);
    await runCommerceJob(db,id,job.id,env,fetcher);
    const dispatchJob=(await pg.query("SELECT status,last_error FROM commerce_jobs WHERE id=$1",[job.id])).rows[0];
    assert.equal(dispatchJob.status,"done",dispatchJob.last_error);
    assert.equal((await pg.query("SELECT status FROM orders")).rows[0].status,"delivered");
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM invoices")).rows[0].n,1);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM shipments")).rows[0].n,1);
    assert.ok(!JSON.stringify(launch).includes("credentials_ciphertext"));
    await db.withStore(id,async tx=>assert.equal((await tx`SELECT * FROM public.payment_attempts WHERE store_id=${"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}`).length,0));
    // A second pending order expires; restore tracked stock once, then refund
    // a late capture rather than shipping a product whose reservation was released.
    remoteOrder=null;paid=false;
    const second={...input,idempotency_key:crypto.randomUUID(),receipt_token:"b".repeat(64)};
    await db.withStore(id,async tx=>placeCodOrder(tx,id,second,await sha256(JSON.stringify(second)),await sha256(`${id}:${second.receipt_token}`),"direct",env,fetcher));
    const pending=(await pg.query("SELECT id FROM orders WHERE status='pending_payment'")).rows[0];
    await pg.query("UPDATE payment_attempts SET expires_at=now()-interval '1 hour',next_check_at=now()-interval '1 second' WHERE order_id=$1",[pending.id]);
    await reconcilePayments(db,id,env,fetcher);
    await reconcilePayments(db,id,env,fetcher);
    assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[product])).rows[0].stock,6);
    assert.equal((await pg.query("SELECT status FROM orders WHERE id=$1",[pending.id])).rows[0].status,"cancelled");
    await assert.rejects(db.withStore(id,tx=>checkoutPayment(tx,id,second,env,fetcher)),error=>error.status===409 && error.restart_checkout===true);
    // Give this already-expired attempt its own provider ID for late webhook settlement.
    await pg.query("UPDATE payment_attempts SET provider_order_id='order_late' WHERE order_id=$1",[pending.id]);
    const late=JSON.stringify({event:"payment.captured",payload:{payment:{entity:{...payment(),id:"pay_late",order_id:"order_late"}}}});
    response=await razorpayWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/"+id,{method:"POST",headers:{"x-razorpay-signature":await sign(credentials.webhook_secret,late)},body:late}),env,db,id);
    assert.equal(response.status,200);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM commerce_jobs WHERE order_id=$1 AND kind='refund'",[pending.id])).rows[0].n,1);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM commerce_jobs WHERE order_id=$1 AND kind='ship'",[pending.id])).rows[0].n,0);
    assert.equal(refundCount,0,"no real refund API call is made by a webhook handler");
    const refundJob=(await pg.query("SELECT id FROM commerce_jobs WHERE order_id=$1 AND kind='refund'",[pending.id])).rows[0];
    await runCommerceJob(db,id,refundJob.id,env,fetcher);
    await runCommerceJob(db,id,refundJob.id,env,fetcher);
    assert.equal(refundCount,1);
    assert.equal((await pg.query("SELECT status FROM orders WHERE id=$1",[pending.id])).rows[0].status,"refunded");
    assert.equal((await pg.query("SELECT state FROM payment_attempts WHERE order_id=$1",[pending.id])).rows[0].state,"refunded");
    const receipt=await db.withStore(id,async tx=>receiptOrder(tx,id,await sha256(`${id}:${second.receipt_token}`)));
    assert.equal(receipt.payment_status,"refunded");
    const page=renderCommerceBody({store:{store_id:id}},{page:"confirmation",order:receipt});
    assert.match(page,/Your payment was refunded/);assert.doesNotMatch(page,/Your order is confirmed/);
  } finally {await pg.close();}
});
test("Cloudflare operator defaults to read-only and refuses conflicting shared infrastructure",async()=>{
  let mutations=0,conflict=false;
  const fetcher=async(url,options)=>{
    if (options.method!=="GET") mutations++;
    if (url.includes("/zones?")) return json({success:true,result:[{id:"a".repeat(32),status:"active"}]});
    if (url.includes("/dns_records?")) return json({success:true,result:conflict?[{name:"brands.lebrands.store",type:"A",content:"192.0.2.10",proxied:true}]:[]});
    if (url.endsWith("/workers/routes")) return json({success:true,result:[]});
    if (url.endsWith("/fallback_origin")) return json({success:true,result:{}});
    throw new Error("Unexpected Cloudflare API request");
  };
  await configureDomains({token:"isolated-token",accountId:"isolated-account",fetcher,log:()=>{}});
  assert.equal(mutations,0);conflict=true;
  await assert.rejects(configureDomains({token:"isolated-token",accountId:"isolated-account",apply:true,fetcher,log:()=>{}}));
  assert.equal(mutations,0);
});
