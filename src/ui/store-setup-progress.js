import {escapeHtml as esc} from "./layout.js";
import {annAnsweredStages} from "../public/ann-projection.js";
import {publishChecklist} from "../public/validation.js";
const STAGES=[["business","Business"],["selling","Store address"],["style","Style"],["palette","Colours"],["fonts","Fonts"],["category","Category"],["collections","Collections"],["products","Products"],["story","Brand story (optional)"]];
export function buildProgress(data) {
  if(data.annProgressAvailable === false) return null;
  const answers=data.annSession?.answers || {};
  const completed=new Set(annAnsweredStages(answers,data.annReference || {}));
  const settings=data.draft?.settings || {}, gst=data.draft?.gstinVerification;
  if(settings.brand_name?.trim()&&gst?.state==="verified"&&gst.confirmed===true)completed.add("business");
  if(settings.subdomain&&settings.subdomain===data.store?.subdomain)completed.add("selling");
  if(Object.hasOwn(answers,"extra_sections"))completed.add("story");
  return STAGES.map(([key,label])=>({key,label,complete:completed.has(key)}));
}
export function openingChecks(data) {
  const draft=data.draft || {settings:{},products:[],policies:[]};
  const checkout=data.checkoutSettings || {};
  return [
    ...publishChecklist({...draft,settings:draft.settings || {},store:data.store}),
    {label:"Verified invoice identity confirmed",complete:draft.gstinVerification?.state==="verified"&&draft.gstinVerification?.confirmed===true},
    {label:"Checkout and delivery settings saved",complete:data.checkoutSaved===true&&!!checkout.store_state},
    {label:"Cash on Delivery or online checkout enabled",complete:checkout.cod_enabled===true||data.onlineAvailable===true},
  ];
}
export function setupProgressCard(data) {
  const root=`/stores/${encodeURIComponent(data.store?.store_id || "")}`;
  const stages=buildProgress(data),checks=openingChecks(data);
  const done=stages?.filter(s=>s.complete).length || 0, ready=checks.filter(c=>c.complete).length;
  const live=data.store?.status==="live"&&!data.store?.approval_revoked_at;
  const progress=(n,total,label)=>`<div class="lb-setup-progress"><span>${n} of ${total} ${esc(label)}</span><div role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}"><i style="width:${n/total*100}%"></i></div></div>`;
  const content=`<div class="lb-setup-tracks"><section><h3>Build with Ann</h3>${stages ? progress(done,stages.length,"build steps complete") : '<p role="status">Saved Ann progress is unavailable. Your store data is unchanged.</p>'}${stages ? `<details><summary>${stages.length-done} not completed · See steps</summary><ul class="lb-setup-stages">${stages.map(s=>`<li>${s.complete ? "✓" : "○"} ${esc(s.label)} <small>${s.complete ? "Complete" : "Not completed"}</small></li>`).join("")}</ul></details>` : ""}<a class="lb-button lb-button-outline lb-button-small" href="${root}/build/ann">Continue with Ann</a></section><section><h3>Ready to open</h3>${progress(ready,checks.length,"opening checks complete")}<details><summary>${checks.length-ready} remaining · See checks</summary><ul class="lb-setup-stages">${checks.filter(c=>!c.complete).map(c=>`<li>${esc(c.label)}</li>`).join("") || "<li>Required setup checks are complete. Publishing and platform approval are checked separately.</li>"}</ul></details><div class="lb-export-buttons"><a class="lb-button lb-button-outline lb-button-small" href="${root}/setup?step=4">Review opening checks</a><a href="${root}/settings/checkout">Checkout settings</a></div></section></div><p class="lb-muted lb-setup-note">Your own domain, online payment partner and shipping partner are optional. These do not count as unfinished Ann steps. Publication and platform approval checks still apply.</p>`;
  return live ? `<section class="lb-card lb-setup-card"><details><summary>Your store setup · ${ready} of ${checks.length} opening checks complete</summary>${content}</details></section>` : `<section class="lb-card lb-setup-card"><div class="lb-card-heading lb-card-heading-toggle"><span><h2>Your store setup</h2><small>${stages ? `${done} of ${stages.length} Ann steps complete` : "Review your saved progress"}</small></span><button type="button" data-setup-toggle aria-expanded="true">Collapse</button></div><div data-setup-content>${content}</div></section>`;
}
