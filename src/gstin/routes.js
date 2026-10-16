import {verifyGSTIN,verificationState,gstinEnabled,supplierPatch,supplierMatches} from "./service.js";
import {readJson} from "../store/input.js";
import {saveSetup} from "../store/repository.js";
import {dashboardAccess} from "../dashboard/repository.js";
import {SECURITY_HEADERS} from "../auth/security.js";
import {UUID} from "../public/validation.js";
export const isGSTINRoute=path=>/^\/api\/stores\/[^/]+\/gstin\/(?:verify|confirm|state)$/.test(path);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...SECURITY_HEADERS,"content-type":"application/json","cache-control":"no-store"}});
export async function handleGSTINRoutes(request,env,db,user,tokenHash){
 const match=new URL(request.url).pathname.match(/^\/api\/stores\/([^/]+)\/gstin\/(verify|confirm|state)$/);
 if(!match||!UUID.test(match[1]))return json({error:"Store not found."},404);
 if(!user||user.must_change_password)return json({error:"Sign in first."},401);
 const[,id,action]=match;
 if(request.method!==(action==="state"?"GET":"POST"))return json({error:"Method not allowed."},405);
 try{
  const result=await db.withMemberStore(id,tokenHash,async tx=>{
   if(!await gstinEnabled(tx)){
    if(action==="state")return{enabled:false,state:"unverified",confirmed:false};
    throw Object.assign(new Error("GST verification needs a platform database update before it can be used."),{status:503,publicCode:"GSTIN_SETUP_REQUIRED"});
   }
   const[setup]=await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
   if(action==="state")return verificationState(tx,id,setup?.settings||{});
   const body=await readJson(request);
    if(action==="confirm")await dashboardAccess(tx,id,user.id,true);
   if(action==="verify"){
    if(Object.keys(body).some(k=>!["gstin","state_code"].includes(k)))throw Object.assign(new Error("Unknown verification field."),{status:400});
     if(setup?.settings?.gstin_invoice_identity_locked===true&&
       (String(body.gstin||"").trim().toUpperCase()!==setup.settings.gstin||body.state_code!==setup.settings.business_state))
       throw Object.assign(new Error("Your confirmed GST registration and invoice address are locked and cannot be changed."),{status:409});
    const result=await verifyGSTIN(tx,env,id,body);
    return {...result,confirmed:result.state==="verified"&&supplierMatches(setup?.settings||{},result.registration)};
   }
    if(Object.keys(body).some(k=>!["verification_id","address_index","lock_invoice_address"].includes(k))||
      Object.hasOwn(body,"lock_invoice_address")&&body.lock_invoice_address!==true||
      !UUID.test(body.verification_id||"")||!Number.isInteger(body.address_index)||body.address_index<0)
    throw Object.assign(new Error("Choose a verified address."),{status:400});
   const[row]=await tx`SELECT * FROM public.store_gstin_verifications WHERE store_id=${id} AND id=${body.verification_id}`;
   const[latest]=row?await tx`SELECT id FROM public.store_gstin_verifications WHERE store_id=${id} AND gstin=${row.gstin} ORDER BY created_at DESC,id DESC LIMIT 1`:[];
   if(!row||latest?.id!==row.id||row.state!=="verified"||Date.now()-new Date(row.verified_at).getTime()>30*86400000)
    throw Object.assign(new Error("Verify this registration again before confirming."),{status:409});
   const patch=supplierPatch(row.normalized,body.address_index);
    if(body.lock_invoice_address===true)patch.gstin_invoice_identity_locked=true;
   return saveSetup(tx,id,patch);
  });
  return json(result);
   }catch(error){
    const diagnostic=!error.status&&/^[0-9A-Z]{5}$/.test(error.code||"")?error.code:undefined;
    if(!error.status)console.error(JSON.stringify({event:"gstin_request_failed",action,diagnostic:diagnostic||"UNEXPECTED"}));
    return json({error:error.status?error.message:`GST verification could not finish. Please retry; if this continues, share support code GST-${diagnostic||"REQUEST"} with LeBrands.`,
      code:error.publicCode||(!error.status?"GSTIN_REQUEST_FAILED":undefined),retry_after:error.retry_after},
      error.code==="42501"?403:error.status||503);
   }
}
