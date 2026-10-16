import { loadDraft, saveSetup } from "./repository.js";
import { draftFingerprint } from "./ann-application.js";
import { settingsPatch, badInput } from "./input.js";
import { gstinEnabled, verificationState } from "../gstin/service.js";
import { audit } from "../dashboard/repository.js";
export async function prepareAnnOnboarding(tx,id) {
  const draft=await loadDraft(tx,id);
  return {expected_draft:await draftFingerprint(draft),draft,store:draft.store,settings:draft.settings,
    verification:await gstinEnabled(tx)?await verificationState(tx,id,draft.settings):{enabled:false,state:"unverified"}};
}
export async function requireAnnGSTIN(tx,id){
  if(!await gstinEnabled(tx))throw Object.assign(new Error("GST verification needs a platform database update before onboarding can continue."),{status:503});
  const draft=await loadDraft(tx,id),state=await verificationState(tx,id,draft.settings);
  if(state.state!=="verified"||!state.confirmed||draft.settings.gstin_invoice_identity_locked!==true)
    throw Object.assign(new Error("Verify your GSTIN and confirm the registered invoice address before continuing."),{status:409});
}
export async function saveAnnOnboarding(tx,id,userId,body) {
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["expected_draft","confirm","brand_name","subdomain"].includes(k))||
    body.confirm!==true||!/^[a-f0-9]{64}$/.test(body.expected_draft||"")||
    !["brand_name","subdomain"].some(k=>Object.hasOwn(body,k)))throw badInput("Confirm your brand name or included store address.");
  await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
  await tx`SELECT store_id FROM public.store_setup WHERE store_id=${id} FOR UPDATE`;
  const current=await loadDraft(tx,id);
  if(await draftFingerprint(current)!==body.expected_draft)throw Object.assign(new Error("Your draft changed in another window. Reload it before saving. Your entry is kept."),{status:409});
  const values=Object.fromEntries(["brand_name","subdomain"].filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
  if("brand_name"in values&&(typeof values.brand_name!=="string"||values.brand_name.trim().length<2||values.brand_name.trim().length>40))
    throw badInput("Enter a brand name from 2 to 40 characters.");
  const settings=settingsPatch(values);
  await saveSetup(tx,id,settings,undefined,{confirmAddress:"subdomain"in values});
  await audit(tx,id,userId,"ann.onboarding_saved","store",id,{fields:Object.keys(values)});
  return prepareAnnOnboarding(tx,id);
}
