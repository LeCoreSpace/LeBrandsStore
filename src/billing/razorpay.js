// Platform billing only. Never use a brand's shopper-payment credentials here.
import {verifyHmac} from "../connections/runtime-client.js";
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
export const billingFailure=(message,status=409)=>Object.assign(new Error(message),{status});
export async function billingVerifier(secret){
  if(typeof secret!=="string"||secret.length<32)throw billingFailure("Platform test billing is not configured.",503);
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,enc.encode("lebrands.store/platform-billing/test-verifier/v1")));
}
export function platformRazorpay(env,fetcher=fetch){
  const key=env.RAZORPAY_KEY_ID,secret=env.RAZORPAY_KEY_SECRET;
  if(typeof key!=="string"||!/^rzp_test_[A-Za-z0-9]+$/.test(key)||typeof secret!=="string"||!secret)
    throw billingFailure("Razorpay test keys are required. Live keys are not accepted in this phase.",503);
  return {key,verify:(order,payment,signature)=>verifyHmac(secret,`${order}|${payment}`,signature),
    async request(path,method="GET",body){
      if(!/^\/orders(?:[/?]|$)|^\/payments\/pay_[A-Za-z0-9]+$/.test(path))throw billingFailure("Unsupported billing operation.",400);
      let res;
      try{
        res=await fetcher(`https://api.razorpay.com/v1${path}`,{method,redirect:"manual",
          signal:AbortSignal.timeout(12000),headers:{authorization:`Basic ${btoa(`${key}:${secret}`)}`,"content-type":"application/json"},
          ...(body?{body:JSON.stringify(body)}:{})});
      }catch{throw billingFailure("Razorpay could not be reached. Use Check test payment before trying again.",503);}
      if(!res.ok)throw billingFailure("Razorpay could not complete this request. Your current plan is unchanged.",503);
      try{return await res.json();}catch{throw billingFailure("Razorpay returned an unreadable response. Check this payment again.",503);}
    }};
}
export function verifiedOrder(order,checkout){
  if(!/^order_[A-Za-z0-9]+$/.test(order?.id||"")||order.receipt!==checkout.id||
    order.currency!==checkout.currency||order.amount!==Number(checkout.total_minor))
    throw billingFailure("Razorpay order does not match this checkout.",409);
}
export function verifiedPayment(payment,checkout){
  if(!/^pay_[A-Za-z0-9]+$/.test(payment?.id||"")||payment.order_id!==checkout.provider_order_id||
    payment.currency!==checkout.currency||payment.amount!==Number(checkout.total_minor)||
    payment.status!=="captured"||payment.captured!==true||Number(payment.amount_refunded||0)!==0)
    throw billingFailure("No matching captured test payment was found. Check again after Razorpay captures it.",409);
}
