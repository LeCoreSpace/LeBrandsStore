import { loadDraft, saveSetup, regeneratePolicies, savePolicy } from "./repository.js";
import { settingsPatch, badInput } from "./input.js";
import { publishChecklist, validateBasics, validateProduct } from "../public/validation.js";
import { DEFAULT_CHECKOUT_SETTINGS, checkoutSettings, inferStoreState } from "../public/commerce-rules.js";
import { protectSupplier } from "../gstin/service.js";
import { audit } from "../dashboard/repository.js";
import { draftFingerprint } from "./ann-application.js";

export const ANN_BUSINESS_FIELDS = [
  "brand_name","tagline","description","legal_name","trade_name","address","gstin","business_state",
  "business_line1","business_line2","business_city","business_pincode",
  "support_email","support_phone","notification_email","logo_media_id",
];
const supplierFields = ["legal_name","trade_name","address","gstin","business_state","business_line1","business_line2","business_city","business_pincode"];
const fail = message => { throw badInput(message); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
async function snapshot(tx, id) {
  const data = await loadDraft(tx,id);
  const [schema] = await tx`SELECT to_regclass('public.checkout_settings') IS NOT NULL AS enabled`;
  const [saved] = schema.enabled ? await tx`SELECT settings FROM public.checkout_settings WHERE store_id = ${id}` : [];
  const checkout = checkoutSettings({...DEFAULT_CHECKOUT_SETTINGS,store_state:inferStoreState(data.settings),...saved?.settings});
  const fingerprint = await draftFingerprint({...data,settings:{...data.settings,
    __ann_checkout_snapshot:{enabled:schema.enabled,saved:saved?.settings ?? null},
    __ann_policy_snapshot:data.policies,
  }});
  return {data,checkout,checkoutAvailable:schema.enabled,checkoutSaved:!!saved,fingerprint};
}
export async function prepareAnnReadiness(tx,id,userId) {
  const s = await snapshot(tx,id);
  const [member] = await tx`SELECT role FROM public.store_members WHERE store_id = ${id} AND user_id = ${userId}`;
  const logos = await tx`SELECT id,alt_text,object_key FROM public.media WHERE store_id = ${id}
    AND upload_type = 'logo' ORDER BY created_at DESC LIMIT 100`;
  const {data} = s;
  return {
    expected_draft:s.fingerprint,
    settings:Object.fromEntries(ANN_BUSINESS_FIELDS.map(k=>[k,data.settings[k] ?? (k==="logo_media_id"?null:"")])),
    business_errors:validateBasics(data.settings),
    products:data.products.map(p=>({id:p.id,title:p.title,errors:validateProduct(p)})),
    policies:data.policies.map(p=>({kind:p.kind,title:p.title,body:p.body,reviewed:p.reviewed})),
    logo_media:logos.map(m=>({id:m.id,label:m.alt_text || m.object_key.split("/").pop()})),
    checkout:{available:s.checkoutAvailable,saved:s.checkoutSaved,can_edit:member?.role==="owner",settings:s.checkout},
    checklist:[...publishChecklist(data),
      {label:"Delivery and Cash on Delivery settings explicitly saved",complete:s.checkoutAvailable&&s.checkoutSaved},
      {label:"Checkout origin state configured",complete:!!s.checkout.store_state},
      {label:"Cash on Delivery enabled for the currently supported checkout",complete:s.checkout.cod_enabled===true},
      ...(data.store.approval_enabled ? [
        {label:"Verified GST registration and supplier details confirmed",complete:data.gstinVerification?.state==="verified"&&data.gstinVerification?.confirmed===true},
        {label:"Platform approval is current",complete:!!data.store.approved_at&&!data.store.approval_revoked_at},
      ]:[])],
    store:{status:data.store.status,subdomain:data.store.subdomain,requested_subdomain:data.settings.subdomain,
      approval_enabled:data.store.approval_enabled===true,approval_status:data.store.approved_at&&!data.store.approval_revoked_at ? "Approved" : "Not approved"},
    supplier_locked:data.gstinVerification?.confirmed===true || data.gstinVerification?.state==="confirmed",
    draft:{...data,checkout_settings:s.checkout},
  };
}
export async function saveAnnReadiness(tx,id,userId,body) {
  const actions = {"business":"settings","checkout":"checkout","policy":"policy","generate-policies":null};
  if (!object(body) || typeof body.action!=="string" || !Object.hasOwn(actions,body.action) || body.confirm!==true ||
      typeof body.expected_draft!=="string" || !/^[a-f0-9]{64}$/.test(body.expected_draft) ||
      Object.keys(body).some(k=>!["expected_draft","confirm","action",actions[body.action]].includes(k)))
    fail("Use Ann's setup confirmation form.");
  const current = await snapshot(tx,id);
  if (current.fingerprint!==body.expected_draft) throw Object.assign(new Error("The store changed in another window. Your edits are kept. Reload the current setup before saving."),{status:409});
  if (body.action==="business") {
    if (!object(body.settings) || !Object.keys(body.settings).length || Object.keys(body.settings).some(k=>!ANN_BUSINESS_FIELDS.includes(k)))
      fail("Use the business and support fields. Confirm store address changes in the existing setup.");
    const patch = settingsPatch(body.settings,{storeId:id});
    if (current.data.store.approval_enabled && supplierFields.some(k=>Object.hasOwn(patch,k)))
      await protectSupplier(tx,id,patch,current.data.settings);
    await saveSetup(tx,id,patch);
  } else if (body.action==="checkout") {
    const [member] = await tx`SELECT role FROM public.store_members WHERE store_id = ${id} AND user_id = ${userId}`;
    if (member?.role!=="owner") throw Object.assign(new Error("Only the store owner can change checkout settings."),{status:403});
    if (!current.checkoutAvailable) throw Object.assign(new Error("Checkout settings are not available. Use the existing setup to check the installation."),{status:503});
    // Same parser and table as the merchant checkout controller. These rules
    // affect live checkout immediately; never put an unsaved plan here.
    const parsed = checkoutSettings(body.checkout,true);
    if (!Object.keys(parsed).length) fail("Confirm your checkout settings.");
    const values = checkoutSettings({...current.checkout,...parsed});
    await tx`INSERT INTO public.checkout_settings(store_id,settings) VALUES(${id},${tx.json(values)})
      ON CONFLICT(store_id) DO UPDATE SET settings=EXCLUDED.settings`;
    // Delivery/payment terms changed, so policy review cannot remain valid.
    await tx`UPDATE public.policy_pages SET reviewed_at=NULL WHERE store_id=${id}`;
    await tx`UPDATE public.store_setup SET completed=array_remove(completed,4) WHERE store_id=${id}`;
  } else if (body.action==="policy") {
    const p=body.policy;
    if (!object(p) || Object.keys(p).some(k=>!["kind","body","reviewed"].includes(k))) fail("Review one policy draft at a time.");
    await savePolicy(tx,id,p.kind,{body:p.body,reviewed:p.reviewed});
  } else await regeneratePolicies(tx,id);
  await audit(tx,id,userId,"ann.setup_saved","store",id,{action:body.action});
  return prepareAnnReadiness(tx,id,userId);
}
