import {lookupGSTIN} from "./provider.js";
import {gstinError,INDIAN_STATES} from "../public/commerce-rules.js";
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export async function gstinEnabled(tx){const[r]=await tx`SELECT to_regclass('public.store_gstin_verifications') IS NOT NULL AS enabled`;return !!r?.enabled}
export function supplierPatch(registration,index=0){
 const addresses=[registration.principal_address,...registration.additional_addresses],a=addresses[index];
 if(!a)throw problem("Choose one of the verified registered addresses.");
 return {gstin:registration.gstin,legal_name:registration.legal_name,trade_name:registration.trade_name,
 business_line1:a.line1||a.line2,business_line2:a.line1?a.line2:"",business_city:a.city,
 business_pincode:a.pin,business_state:a.state_code,
 address:[a.line1,a.line2,`${a.city} ${a.pin}`,a.state].filter(Boolean).join("\n")};
}
export function supplierMatches(settings,registration){
 if(!registration)return false;
 return [registration.principal_address,...registration.additional_addresses].some((a,index)=>{
  const p=supplierPatch(registration,index);
  return ["gstin","legal_name","trade_name","business_line1","business_line2","business_city","business_pincode","business_state"].every(k=>(settings[k]||"")===p[k]);
 });
}
export async function verificationState(tx,id,settings){
 const[row]=await tx`SELECT id,gstin,state,normalized,verified_at,created_at,error_code FROM public.store_gstin_verifications
 WHERE store_id=${id} AND gstin=${settings.gstin||""} ORDER BY created_at DESC,id DESC LIMIT 1`;
 if(!row)return{enabled:true,state:"unverified",confirmed:false};
 return {enabled:true,id:row.id,gstin:row.gstin,state:row.state,registration:row.normalized,
 verified_at:row.verified_at,checked_at:row.created_at,error_code:row.error_code,
 confirmed:row.state==="verified"&&supplierMatches(settings,row.normalized)};
}
export async function verifyGSTIN(tx,env,id,{gstin,state_code},{lookup=lookupGSTIN,now=Date.now()}={}){
 gstin=String(gstin||"").trim().toUpperCase();
 const invalid=gstinError(gstin);
 if(invalid)throw problem(invalid);
 if(!INDIAN_STATES.some(s=>s.code===state_code)||gstin.slice(0,2)!==state_code)throw problem("GSTIN state code must match the registered business state.");
 if(!await gstinEnabled(tx))throw problem("GSTIN verification migration has not been applied.",503);
 const[previous]=await tx`SELECT * FROM public.store_gstin_verifications WHERE store_id=${id} AND gstin=${gstin} ORDER BY created_at DESC,id DESC LIMIT 1`;
 if(previous && now-new Date(previous.created_at).getTime()< (previous.state==="unverified"?60000:86400000))
  return publicResult(previous,previous.state==="unverified"?60:0);
 const[quota]=await tx`SELECT public.reserve_gstin_lookup(${id}) AS reservation`;
 if(!quota?.reservation?.allowed)throw Object.assign(problem("GSTIN lookup limit reached. Please retry later.",429),{retry_after:quota?.reservation?.retry_after||60});
 let result,state,errorCode=null;
 try{result=await lookup(env,gstin);state=result.registration.status==="Active"&&result.registration.taxpayer_type==="Regular"?"verified":"blocked";}
 catch(error){state="unverified";errorCode=["NOT_FOUND","TIMEOUT","MALFORMED","HTTP_ERROR","RATE_LIMIT","UNAVAILABLE","CONFIGURATION"].includes(error.code)?error.code:"PROVIDER_ERROR";}
 const[row]=await tx`INSERT INTO public.store_gstin_verifications(store_id,gstin,state,normalized,raw_response,verified_at,error_code)
 VALUES(${id},${gstin},${state},${result?JSON.stringify(result.registration):null}::jsonb,
 ${result?JSON.stringify(result.raw_response):null}::jsonb,${state==="verified"?new Date(now).toISOString():null},${errorCode}) RETURNING *`;
 return publicResult(row,state==="unverified"?60:0);
}
function publicResult(row,retry=0){return {id:row.id,gstin:row.gstin,state:row.state,registration:row.normalized,verified_at:row.verified_at,
 retry_after:retry,message:row.state==="blocked"?"An active Regular GSTIN is required. Inactive and Composition registrations cannot publish or issue tax invoices.":
 row.state==="unverified"?"Verification is unavailable. You may enter your address manually, but invoices remain blocked until verification succeeds.":"Registration verified. Confirm a registered address."};}
export async function protectSupplier(tx,id,patch,current){
 if(patch.gstin&&patch.gstin!==current.gstin)return;
 const state=await verificationState(tx,id,current);
 if(state.confirmed &&["legal_name","trade_name","business_line1","business_line2","business_city","business_pincode","business_state","address"].some(k=>k in patch&&(patch[k]||"")!==(current[k]||"")))
  throw problem("Verified supplier details are read-only. Choose another address through GSTIN verification.",409);
}
// Run in its own committed transaction BEFORE the shipping transaction.
// Provider failures and quota reservations must survive a blocked invoice attempt.
export async function refreshVerification(tx,env,id,{published=false}={}){
 if(!await gstinEnabled(tx))return{enabled:false,ready:true};
 const[row]=published?await tx`SELECT snapshot->'settings' AS settings FROM public.store_publications WHERE store_id=${id}`:
 await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
 const settings=row?.settings||{};
 if(!settings.gstin)return{enabled:true,state:"unverified",ready:false};
 let state=await verificationState(tx,id,settings);
 if(!state.verified_at||Date.now()-new Date(state.verified_at).getTime()>30*86400000){
  await verifyGSTIN(tx,env,id,{gstin:settings.gstin,state_code:settings.business_state});
  state=await verificationState(tx,id,settings);
 }
 return {...state,ready:state.state==="verified"&&state.confirmed&&Date.now()-new Date(state.verified_at).getTime()<=30*86400000};
}
