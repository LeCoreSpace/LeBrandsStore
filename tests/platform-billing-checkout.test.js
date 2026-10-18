import test from "node:test";
import assert from "node:assert/strict";
import {getAnnPlanFixture} from "../src/ann-plan-preview-fixture.js";
import {prepareCheckoutFixture,TEST_BILLING_ENV} from "../src/billing-checkout-preview-fixture.js";
import {handleBillingRoutes} from "../src/billing/routes.js";
import {billingVerifier,platformRazorpay,verifiedPayment} from "../src/billing/razorpay.js";
import {freeSubscriptionState} from "../src/billing/free.js";
import {billingPageData} from "../src/billing/pages.js";
import {migrationSelection} from "../db/migration-selection.js";

const origin="https://app.lebrands.store";
test("test billing refuses live credentials and validates captured payment identity",async()=>{
 assert.throws(()=>platformRazorpay({...TEST_BILLING_ENV,RAZORPAY_KEY_ID:"rzp_live_notAllowed"}),/Live keys/);
 await assert.rejects(billingVerifier("short"),/not configured/);
 const c={provider_order_id:"order_One",currency:"INR",total_minor:"149900"};
 const p={id:"pay_One",order_id:"order_One",currency:"INR",amount:149900,status:"captured",captured:true,amount_refunded:0};
 assert.doesNotThrow(()=>verifiedPayment(p,c));
 for(const change of [{amount:1},{currency:"USD"},{order_id:"order_Other"},{status:"authorized"},{captured:false},{amount_refunded:100}]){
  assert.throws(()=>verifiedPayment({...p,...change},c),/captured/);
 }
 assert.equal(migrationSelection(["--","--staged-billing-test-checkout"]).requires,"0039_ann_plan_selection.sql");
});

test("paid test checkout is owner-only, recoverable, idempotent, and never live authority",async t=>{
 const f=await getAnnPlanFixture();
 try{
  const {provider,capability}=await prepareCheckoutFixture(f);
  const {pg,db,store,owner,ownerToken}=f;
  const prices=(await pg.query(`SELECT x.id,p.code,x.billing_interval FROM public.billing_plan_prices x
   JOIN public.billing_plans p ON p.id=x.plan_id WHERE p.code IN ('launch','grow','scale')`)).rows;
  const price=prices.find(p=>p.code==="launch"&&p.billing_interval==="monthly").id;
  const input=()=>({price_id:price,idempotency_key:crypto.randomUUID(),terms_version:"paid-test-v1",accepted:true});
  const call=async(action,body,{token=ownerToken,user=owner,method="POST",requestOrigin=origin,environment=TEST_BILLING_ENV}={})=>{
   const r=await handleBillingRoutes(new Request(`${origin}/api/stores/${store}/subscription/${action}`,{
    method,headers:{"content-type":"application/json",origin:requestOrigin},...(method!=="GET"?{body:JSON.stringify(body)}:{})
   }),db,user,token,environment,{fetcher:provider.fetcher});
   return {...await r.json(),status:r.status};
  };
  const readFree=()=>db.withMemberStore(store,ownerToken,tx=>freeSubscriptionState(tx,store,ownerToken));
  const before=await readFree();
  assert.equal(before.subscription.plan,"free");
  await t.test("GET, bad origin, invalid input and live keys never create orders",async()=>{
   assert.equal((await call("checkout",input(),{method:"GET"})).status,405);
   assert.equal((await call("checkout",input(),{requestOrigin:"https://evil.test"})).status,403);
   assert.equal((await call("checkout",{...input(),amount:1})).status,400);
   assert.equal((await call("checkout",{...input(),accepted:false})).status,400);
   assert.equal((await call("checkout",input(),{environment:{...TEST_BILLING_ENV,RAZORPAY_KEY_ID:"rzp_live_Example"}})).status,503);
   assert.equal(provider.createCount,0);
  });
  await t.test("staff and direct APP financial writes cannot forge verified capture",async()=>{
   const staffToken="c".repeat(64);
   assert.equal((await call("checkout",input(),{token:staffToken})).status,403);
   await assert.rejects(db.withMemberStore(store,ownerToken,tx=>tx`SELECT public.billing_test_write(
    ${store}::uuid,${ownerToken}::text,'forged','prepare',${JSON.stringify(input())}::text::jsonb)`),e=>e.code==="42501");
   await assert.rejects(db.withMemberStore(store,ownerToken,tx=>tx`UPDATE public.billing_payments SET status='captured'`),e=>e.code==="42501");
  });
  await t.test("business approval and authoritative business country are enforced",async()=>{
   await pg.query("UPDATE public.store_business_verifications SET status='pending_review' WHERE store_id=$1",[store]);
   assert.equal((await call("checkout",input())).status,409);
   await pg.query("UPDATE public.store_business_verifications SET status='approved' WHERE store_id=$1",[store]);
   // Country mismatch cannot inherit account-level IN prices.
   await pg.query("UPDATE public.store_business_access SET business_country='US' WHERE store_id=$1",[store]);
   assert.equal((await call("checkout",input())).status,409);
   await pg.query("UPDATE public.store_business_access SET business_country='IN' WHERE store_id=$1",[store]);
   assert.equal(provider.createCount,0);
  });
  let checkout,request;
  await t.test("explicit consent creates one persistent order; repeat and other tabs cannot duplicate it",async()=>{
   request=input();checkout=await call("checkout",request);
   assert.equal(checkout.status,200,JSON.stringify(checkout));
   assert.equal(checkout.mode,"test");assert.equal(checkout.amount,149900);
   assert.match(checkout.order_id,/^order_/);
   assert.equal((await call("checkout",request)).id,checkout.id);
   assert.equal(provider.createCount,1);
   assert.equal((await call("checkout",input())).status,409);
   assert.equal((await call("checkout",{...request,price_id:prices.find(x=>x.code==="grow").id})).status,400);
  });
  await t.test("forged signatures and mismatched or authorized payments cannot activate a plan",async()=>{
   const confirmation=provider.capture(checkout.order_id,{status:"authorized",captured:false});
   const body={checkout_id:checkout.id,razorpay_order_id:confirmation.razorpay_order_id,
    razorpay_payment_id:confirmation.razorpay_payment_id,razorpay_signature:confirmation.razorpay_signature};
   assert.equal((await call("confirm",{...body,razorpay_signature:"0".repeat(64)})).status,400);
   assert.equal((await call("confirm",body)).status,409);
   provider.payments.get(confirmation.razorpay_payment_id).status="captured";
   provider.payments.get(confirmation.razorpay_payment_id).captured=true;
   provider.payments.get(confirmation.razorpay_payment_id).amount=1;
   assert.equal((await call("confirm",body)).status,409);
   provider.payments.get(confirmation.razorpay_payment_id).amount=checkout.amount;
   const result=await call("confirm",body);
   assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.verified,true);
   assert.equal((await call("confirm",body)).verified,true);
   assert.equal((await call("reconcile",{checkout_id:checkout.id})).verified,true);
   assert.equal(Number((await pg.query("SELECT count(*) n FROM public.billing_payments")).rows[0].n),1);
  });
  await t.test("lost provider create response is recovered by receipt, not retried",async()=>{
   const next=input();provider.timeoutNextCreate();
   assert.equal((await call("checkout",next)).status,503);
   assert.equal((await call("checkout",next)).status,409);
   assert.equal(provider.createCount,2);
   const c=(await pg.query("SELECT id FROM public.billing_checkout_sessions WHERE idempotency_key=$1",[next.idempotency_key])).rows[0];
   const resume=await call("resume",{checkout_id:c.id});
   assert.equal(resume.status,200,JSON.stringify(resume));
   assert.equal(provider.createCount,2);
   provider.capture(resume.order_id);
   assert.equal((await call("reconcile",{checkout_id:c.id})).verified,true);
   assert.equal(provider.createCount,2);
  });
  await t.test("Free and paid offers remain unchanged, payment history is real and clearly test",async()=>{
   const after=await readFree();
   for(const k of ["id","plan","mode","status","accepted_at","free_live_started_at","free_expires_at"])
    assert.equal(after.subscription[k],before.subscription[k],k);
   const paid=(await pg.query("SELECT enabled FROM public.billing_plan_prices WHERE billing_interval<>'free'")).rows;
   assert.ok(paid.every(p=>!p.enabled));
   const subs=(await pg.query("SELECT status,period_start FROM public.billing_subscriptions WHERE mode='test'")).rows;
   assert.ok(subs.every(s=>s.status==="pending"&&s.period_start===null));
   const data=await db.withMemberStore(store,ownerToken,tx=>billingPageData(tx,store,owner,ownerToken));
   assert.equal(data.billing.payments.length,2);
   assert.equal(data.billing.testCheckout.attempts.filter(x=>x.verified).length,2);
   assert.ok(data.billing.payments.every(p=>p.mode==="test"));
   // Expired/cancelled Free also remains the current non-sandbox plan.
   await pg.query("UPDATE public.billing_subscriptions SET status='cancelled' WHERE mode='none'");
   assert.equal((await readFree()).subscription.plan,"free");
   assert.equal(Number((await pg.query("SELECT count(*) n FROM public.billing_invoices")).rows[0].n),0);
  });
 }finally{await f.pg.close();}
});
