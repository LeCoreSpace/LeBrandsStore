import {SECURITY_HEADERS,isValidOrigin} from "../auth/security.js";
import {readJson} from "../store/input.js";
import {UUID} from "../public/validation.js";
import {FREE_TERMS_VERSION,freeSubscriptionState,activateFreeSubscription} from "./free.js";

const pattern=/^\/api\/stores\/([0-9a-f-]{36})\/subscription(?:\/(free))?$/i;
export const isBillingRoute=path=>pattern.test(path);
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...SECURITY_HEADERS,"content-type":"application/json; charset=utf-8"}
});
const messages={
  "42501":[403,"Only the store owner can manage its subscription."],
  "22023":[400,"Accept the current Free plan terms before continuing."],
  PBF01:[409,"The Free offer is not available for this store or country. No subscription was created."],
  PBF02:[409,"This previously published store needs the existing-store transition. Its current service is unchanged."],
  PBF03:[409,"The plan offer changed. Reload it before accepting."]
};
export async function handleBillingRoutes(request,db,user,tokenHash) {
  const match=new URL(request.url).pathname.match(pattern);
  if(!match||!UUID.test(match[1]))return json({error:"Page not found."},404);
  if(!user||user.must_change_password)return json({error:"Sign in and complete any required password change first."},401);
  const [,storeId,action]=match;
  if((!action&&!["GET","HEAD"].includes(request.method))||(action&&request.method!=="POST"))
    return json({error:"Method not allowed."},405);
  if(action&&!isValidOrigin(request))return json({error:"This request did not come from the account website."},403);
  try {
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
