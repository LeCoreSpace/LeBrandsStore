import {SECURITY_HEADERS,isValidOrigin} from "../auth/security.js";
import {readJson} from "../store/input.js";
import {UUID} from "../public/validation.js";
import {FREE_TERMS_VERSION,freeSubscriptionState,activateFreeSubscription} from "./free.js";
import {runTestCheckout} from "./checkout.js";

const pattern=/^\/api\/stores\/([0-9a-f-]{36})\/subscription(?:\/(free|checkout|confirm|reconcile|resume))?$/i;
export const isBillingRoute=path=>pattern.test(path);
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...SECURITY_HEADERS,"content-type":"application/json; charset=utf-8"}
});
const messages={
  "42501":[403,"Only the store owner can manage its subscription."],
  "22023":[400,"Accept the current Free plan terms before continuing."],
  PBF01:[409,"The Free offer is not available for this store or country. No subscription was created."],
  PBF02:[409,"This previously published store needs the existing-store transition. Its current service is unchanged."],
  PBF03:[409,"The plan offer changed. Reload it before accepting."],
  PBF04:[409,"Confirm your store name in Ann before choosing a plan."]
  ,PBT01:[409,"Business documents for your Indian business must be approved before testing paid checkout."]
  ,PBT02:[409,"Accept Free in Ann before testing a paid plan."]
  ,PBT03:[409,"A test checkout is already open. Resume it or check its payment before starting another."]
};
export async function handleBillingRoutes(request,db,user,tokenHash,env={},dependencies={}) {
  const match=new URL(request.url).pathname.match(pattern);
  if(!match||!UUID.test(match[1]))return json({error:"Page not found."},404);
  if(!user||user.must_change_password)return json({error:"Sign in and complete any required password change first."},401);
  const [,storeId,action]=match;
  if((!action&&!["GET","HEAD"].includes(request.method))||(action&&request.method!=="POST"))
    return json({error:"Method not allowed."},405);
  if(action&&!isValidOrigin(request))return json({error:"This request did not come from the account website."},403);
  try {
    if(action&&action!=="free"){
      const input=await readJson(request);
      const fields=action==="checkout"?["price_id","idempotency_key","terms_version","accepted"]:
        action==="confirm"?["checkout_id","razorpay_order_id","razorpay_payment_id","razorpay_signature"]:["checkout_id"];
      if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||
        fields.some(k=>!(k in input))||
        (action==="checkout"&&(!UUID.test(input.price_id||"")||!UUID.test(input.idempotency_key||"")||
          input.terms_version!=="paid-test-v1"||input.accepted!==true))||
        (action!=="checkout"&&!UUID.test(input.checkout_id||""))||
        (action==="confirm"&&(!/^order_[A-Za-z0-9]+$/.test(input.razorpay_order_id||"")||
          !/^pay_[A-Za-z0-9]+$/.test(input.razorpay_payment_id||"")||!/^[a-f0-9]{64}$/i.test(input.razorpay_signature||""))))
        throw Object.assign(new Error("Use the current test checkout form and accept its terms."),{status:400});
      return json(await runTestCheckout({db,store:storeId,token:tokenHash,env,action,input,fetcher:dependencies.fetcher}));
    }
    const data=await db.withMemberStore(storeId,tokenHash,async tx=>{
      if(!action)return freeSubscriptionState(tx,storeId,tokenHash);
      const input=await readJson(request);
      if(!input||typeof input!=="object"||Array.isArray(input)||
        Object.keys(input).some(k=>!["price_id","terms_version","accepted"].includes(k))||
        typeof input.price_id!=="string"||!UUID.test(input.price_id)||
        input.terms_version!==FREE_TERMS_VERSION||input.accepted!==true)
        throw Object.assign(new Error("Accept the current Free plan offer using the provided fields."),{status:400});
      return activateFreeSubscription(tx,storeId,tokenHash,input);
    },{lockStore:!!action});
    return request.method==="HEAD"?new Response(null,{headers:{...SECURITY_HEADERS,"content-type":"application/json; charset=utf-8"}}):json(data);
  }catch(error){
    const known=messages[error?.code];
    if(known)return json({error:known[1]},known[0]);
    if([400,403,404,409,413,415,503].includes(error?.status))
      return json({error:error.message},error.status);
    console.error("Platform subscription request failed",{code:error?.code||"UNKNOWN"});
    return json({error:"Subscription services are temporarily unavailable. Please try again."},503);
  }
}
