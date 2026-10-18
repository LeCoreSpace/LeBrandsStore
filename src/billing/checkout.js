import {billingFailure,billingVerifier,platformRazorpay,verifiedOrder,verifiedPayment} from "./razorpay.js";
const decode=v=>typeof v==="string"?JSON.parse(v):v;
export async function testBillingState(tx,store,token){
  const [r]=await tx`SELECT to_regprocedure('public.billing_test_state(uuid,text)') AS definition`;
  if(!r?.definition)return {available:false,eligible:false,reason:"migration_required",attempts:[]};
  const [s]=await tx`SELECT public.billing_test_state(${store}::uuid,${token}::text) AS state`;
  return decode(s.state);
}
async function write(tx,store,token,capability,action,input){
  const [r]=await tx`SELECT public.billing_test_write(${store}::uuid,${token}::text,
    ${capability}::text,${action}::text,${JSON.stringify(input)}::text::jsonb) AS result`;
  return decode(r.result);
}
function summary(c,key){
  return {id:c.id,status:c.status,mode:"test",currency:c.currency,amount:Number(c.total_minor),
    order_id:c.provider_order_id,expires_at:c.expires_at,key,
    verified:c.status==="paid",message:c.status==="paid"
      ?"Test payment verified. Your live plan and Free dates are unchanged."
      :"Test checkout only. No real money or live paid benefits."};
}
export async function runTestCheckout({db,store,token,env,action,input,fetcher}){
  const api=platformRazorpay(env,fetcher),capability=await billingVerifier(env.SESSION_SECRET);
  const transaction=fn=>db.withMemberStore(store,token,fn);
  if(action==="checkout"){
    const prepared=await transaction(tx=>write(tx,store,token,capability,"prepare",input));
    let c=prepared.checkout;
    if(prepared.create_order){
      // Reservation commits BEFORE the external request. Retries never create a
      // second order after a timeout; recovery searches by this persisted receipt.
      const order=await api.request("/orders","POST",{
        amount:Number(c.total_minor),currency:c.currency,receipt:c.id,
        notes:{purpose:"lebrands_store_platform_test",checkout_id:c.id}
      });
      verifiedOrder(order,c);
      c=(await transaction(tx=>write(tx,store,token,capability,"bind",{checkout_id:c.id,order_id:order.id}))).checkout;
    }
    if(!c.provider_order_id)throw billingFailure("The test order response is uncertain. Use Check test payment to recover it.",409);
    if(c.status!=="paid"&&Date.parse(c.expires_at)<=Date.now())throw billingFailure("This test checkout has expired. Check its payment status before starting another.",409);
    return summary(c,api.key);
  }
  // RLS + owner function keep even the lookup inaccessible to tenant staff.
  let c=await transaction(async tx=>{
    const state=await testBillingState(tx,store,token);
    if(!state.available)throw billingFailure("Test checkout is not configured.",503);
    const [row]=await tx`SELECT * FROM public.billing_checkout_sessions
      WHERE store_id=${store} AND id=${input.checkout_id}::uuid AND mode='test' AND provider='razorpay'`;
    if(!row)throw billingFailure("Test checkout not found.",404);
    return row;
  });
  if(!c.provider_order_id){
    const orders=await api.request(`/orders?receipt=${encodeURIComponent(c.id)}&count=100`);
    const exact=Array.isArray(orders.items)?orders.items.filter(o=>o.receipt===c.id):[];
    if(exact.length!==1)throw billingFailure("No unique test order was found yet. Check again shortly; no second order was created.",409);
    verifiedOrder(exact[0],c);
    c=(await transaction(tx=>write(tx,store,token,capability,"bind",{checkout_id:c.id,order_id:exact[0].id}))).checkout;
  }
  if(action==="resume"){
    if(c.status!=="paid"&&Date.parse(c.expires_at)<=Date.now())throw billingFailure("This test checkout has expired. Check its payment status instead.",409);
    return summary(c,api.key);
  }
  if(action==="confirm"){
    if(input.razorpay_order_id!==c.provider_order_id||
      !await api.verify(c.provider_order_id,input.razorpay_payment_id,input.razorpay_signature))
      throw billingFailure("Payment signature could not be verified. Nothing was activated.",400);
    const payment=await api.request(`/payments/${input.razorpay_payment_id}`);
    verifiedPayment(payment,c);
    c=(await transaction(tx=>write(tx,store,token,capability,"settle",{
      checkout_id:c.id,order_id:c.provider_order_id,payment_id:payment.id,
      amount_minor:payment.amount,currency:payment.currency
    }))).checkout;
  }else{
    const order=await api.request(`/orders/${c.provider_order_id}`);
    verifiedOrder(order,c);
    const result=await api.request(`/orders/${c.provider_order_id}/payments`);
    const captured=Array.isArray(result.items)?result.items.filter(p=>p.status==="captured"):[];
    if(captured.length===0&&c.status!=="paid")return {...summary(c,api.key),
      message:"No captured test payment yet. Resume this checkout or check again."};
    if(captured.length!==1)throw billingFailure("No unique captured test payment was found. Your plan is unchanged.",409);
    verifiedPayment(captured[0],c);
    c=(await transaction(tx=>write(tx,store,token,capability,"settle",{
      checkout_id:c.id,order_id:c.provider_order_id,payment_id:captured[0].id,
      amount_minor:captured[0].amount,currency:captured[0].currency
    }))).checkout;
  }
  return summary(c,api.key);
}
