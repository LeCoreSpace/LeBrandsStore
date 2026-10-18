import { verificationState } from "../gstin/service.js";
export const ACCESS_MESSAGES = {
  country_required: "Confirm your business country in Ann before editing your store.",
  gst_required: "Verify your GSTIN and confirm the registered invoice address in Ann before editing your store.",
  documents_required: "Submit your business documents in Ann before editing your store.",
  changes_requested: "Update the requested business documents in Ann before editing your store.",
  exception_review_required: "Your registration exception needs a review decision before theme editing can open.",
  setup_required: "Business setup is unavailable. Your saved design is unchanged.",
};
const decode = v => typeof v === "string" ? JSON.parse(v) : v;
export async function businessEditorAccess(tx,id,tokenHash) {
  const [schema] = await tx`SELECT to_regprocedure('public.business_editor_access(uuid,text)') AS business_access_definition`;
  // Explicit staged-rollout compatibility only, not an error fallback.
  // Until 0032 is applied, previously published editor rules remain in effect.
  if (!schema?.business_access_definition) return {available:false,enforced:false,allowed:true,reason:"rollout_pending",business_country:null};
  const [row] = await tx`SELECT public.business_editor_access(${id},${tokenHash}) AS business_access`;
  const access = decode(row.business_access);
  if(access.allowed && access.business_country==="IN"){
    const [setup] = await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
    const settings=decode(setup?.settings)||{},gst=await verificationState(tx,id,settings);
    if(gst.state!=="verified"||!gst.confirmed||settings.gstin_invoice_identity_locked!==true)
      Object.assign(access,{allowed:false,reason:"gst_required"});
  }
  return {...access,message:ACCESS_MESSAGES[access.reason]||""};
}
export async function requireBusinessEditorAccess(tx,id,tokenHash) {
  const access=await businessEditorAccess(tx,id,tokenHash);
  if(!access.allowed)throw Object.assign(new Error(access.message),{status:403,businessAccess:access});
  return access;
}
export function protectedEditorLinks(html,id,access) {
  if(!access||access.allowed)return html;
  const escaped=String(access.message||"Complete business setup in Ann.").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const targets=new Set([`/stores/${id}/editor`,`/stores/${id}/styles`,`/stores/${id}/style-studio`]);
  return html.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>/g,(all,before,href,after)=>
    targets.has(href.split("?")[0])?`<a${before}role="link" aria-disabled="true" data-editor-locked data-editor-href="${href}" title="${escaped}"${after}>`:all);
}
