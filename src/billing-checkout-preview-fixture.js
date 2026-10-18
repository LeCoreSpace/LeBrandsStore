// Node-only provider simulator and database setup for isolated verification.
// Never imported by the Worker; never uses any workspace secrets.
import {readFile} from "node:fs/promises";
import {createHash,createHmac} from "node:crypto";
import {billingVerifier} from "./billing/razorpay.js";
import {freeSubscriptionState,activateFreeSubscription} from "./billing/free.js";
export const TEST_BILLING_ENV={
 SESSION_SECRET:"public-local-fixture-session-secret-not-for-production",
 RAZORPAY_KEY_ID:"rzp_test_PublicFixture",
 RAZORPAY_KEY_SECRET:"public-synthetic-provider-secret"
};
export function simulatedRazorpay(){
 const orders=new Map(),payments=new Map();let sequence=0,failCreate=false;
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
 return {orders,payments,get createCount(){return sequence;},
  timeoutNextCreate(){failCreate=true;},
  capture(orderId,overrides={}){
   const order=orders.get(orderId);if(!order)throw Error("Synthetic order missing");
   const p={id:`pay_Fixture${payments.size+1}`,order_id:order.id,amount:order.amount,currency:order.currency,
    status:"captured",captured:true,amount_refunded:0,...overrides};
   payments.set(p.id,p);return {payment:p,razorpay_order_id:order.id,razorpay_payment_id:p.id,
    razorpay_signature:createHmac("sha256",TEST_BILLING_ENV.RAZORPAY_KEY_SECRET).update(`${order.id}|${p.id}`).digest("hex")};
  },
  async fetcher(url,options){
   if(!url.startsWith("https://api.razorpay.com/v1/"))throw Error("No external connections in fixture");
   const u=new URL(url),path=u.pathname.slice(3);
   if(path==="/orders"&&options.method==="POST"){
    const body=JSON.parse(options.body),order={...body,id:`order_Fixture${++sequence}`,status:"created"};
    orders.set(order.id,order);
    if(failCreate){failCreate=false;throw Error("Synthetic lost create response");}
    return json(order);
   }
   if(path==="/orders")return json({items:[...orders.values()].filter(o=>o.receipt===u.searchParams.get("receipt"))});
   const op=path.match(/^\/orders\/(order_[A-Za-z0-9]+)(\/payments)?$/);
   if(op)return op[2]?json({items:[...payments.values()].filter(p=>p.order_id===op[1])}):json(orders.get(op[1])||{},orders.has(op[1])?200:404);
   const pp=path.match(/^\/payments\/(pay_[A-Za-z0-9]+)$/);
   if(pp)return json(payments.get(pp[1])||{},payments.has(pp[1])?200:404);
   return json({},404);
  }
 };
}
export async function prepareCheckoutFixture(f){
 const marker=(await f.pg.query("SELECT to_regprocedure('public.billing_test_state(uuid,text)') AS f")).rows[0].f;
 if(!marker){
  await f.pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0039_ann_plan_selection.sql','synthetic fixture') ON CONFLICT DO NOTHING");
  await f.pg.exec(await readFile(new URL("../db/staged/0040_billing_test_checkout.sql",import.meta.url),"utf8"));
 }
 const capability=await billingVerifier(TEST_BILLING_ENV.SESSION_SECRET);
 await f.pg.query("UPDATE public.billing_test_configuration SET enabled=true,verifier_sha256=$1",
  [createHash("sha256").update(capability).digest("hex")]);
 await f.pg.query("UPDATE public.store_setup SET settings=settings||'{\"ann_store_name_confirmed\":true}'::jsonb WHERE store_id=$1",[f.store]);
 await f.db.withMemberStore(f.store,f.ownerToken,async tx=>{
  const state=await freeSubscriptionState(tx,f.store,f.ownerToken);
  if(state.can_enrol)await activateFreeSubscription(tx,f.store,f.ownerToken,{
   price_id:state.offer.price_id,terms_version:"free-v1",accepted:true
  });
 });
 await f.pg.query(`INSERT INTO public.store_business_verifications(store_id,country_code,legal_name,
  registration_type,requirement_key,requirement_version,status)
  VALUES($1,'IN','Example Studio Private Limited','gst_registered','IN-v1',1,'approved')
  ON CONFLICT(store_id) DO UPDATE SET status='approved'`,[f.store]);
 return {capability,provider:simulatedRazorpay()};
}
