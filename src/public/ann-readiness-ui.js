import { INDIAN_STATES } from "./commerce-rules.js";
import { attachAnnProducts } from "./ann-products-ui.js";
import { inrToPaise, paiseToInr } from "./ann-money.js";
export { inrToPaise } from "./ann-money.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIZ = ["brand_name", "tagline", "description", "legal_name", "trade_name", "address", "business_line1", "business_line2", "business_city", "business_pincode", "business_state", "gstin", "support_email", "support_phone", "notification_email", "logo_media_id"];
const LOCKED = ["legal_name", "trade_name", "address", "business_line1", "business_line2", "business_city", "business_pincode", "business_state", "gstin"];
const BIZ_LABELS = { brand_name: "Brand name", tagline: "Tagline", description: "About your brand", legal_name: "Legal name", trade_name: "Trade name", address: "Business address", business_line1: "Address line 1", business_line2: "Address line 2", business_city: "City", business_pincode: "PIN code", business_state: "State", gstin: "GSTIN", support_email: "Support email", support_phone: "Support phone", notification_email: "Order notification email", logo_media_id: "Logo" };
const POLICY_NAMES = { shipping: "Shipping", "cancellation-refund": "Cancellation and refund", pricing: "Pricing", privacy: "Privacy", terms: "Terms", contact: "Contact" };
const KINDS_ORDER = 6;

export function attachAnnReadiness({ api, root, readOnly, onSaved }) {
  let data = null, loading = false, loadError = "", busy = "", conflict = false, saved = "";
  const msgs = {}; // section -> {type,text}
  let biz = {}, co = {}, pol = {};
  let ackBiz = false, ackCo = false, ackGen = false;
  let lastSection = "", refreshPending = false, deepLinked = false;
  const productUI=attachAnnProducts({api,readOnly,submit,onDraw:()=>{
    if(refreshPending&&!busy&&!loading&&!productUI.isUploading()){refreshPending=false;storeChanged();}
    else draw();
  }});
  const slot = () => document.querySelector("#ann-readiness-slot");
  const lockedOn = () => !!data?.supplier_locked;
  const bizFrom = s => Object.fromEntries(BIZ.map(k => [k, s?.[k] ?? ""]));
  const coFrom = c => ({ delivery_mode: c?.delivery_mode || "free", flat: paiseToInr(c?.flat_paise), free_above: paiseToInr(c?.free_above_paise), cod_enabled: !!c?.cod_enabled, cod_max: paiseToInr(c?.cod_max_paise), store_state: c?.store_state ?? "" });
  const polFrom = p => ({ body: p.body ?? "", reviewed: !!p.reviewed });
  function resetAll() {
    biz = bizFrom(data.settings); co = coFrom(data.checkout?.settings);
    pol = Object.fromEntries((data.policies || []).map(p => [p.kind, polFrom(p)]));
    ackBiz = ackCo = ackGen = false;
    productUI.receive(data,{reset:true});
  }
  const bizDirty = () => !!data && BIZ.some(k => !(lockedOn() && LOCKED.includes(k)) && String(biz[k] ?? "") !== String(data.settings[k] ?? ""));
  const coDirty = () => { if (!data?.checkout?.can_edit) return false; const b = coFrom(data.checkout.settings); return Object.keys(b).some(k => b[k] !== co[k]); };
  const polDirty = kind => { const p = data?.policies?.find(x => x.kind === kind); if (!p || !pol[kind]) return false; return pol[kind].body !== (p.body ?? "") || pol[kind].reviewed !== !!p.reviewed; };
  const anyDirty = () => bizDirty() || coDirty() || productUI.hasUnsavedChanges() || (data?.policies || []).some(p => polDirty(p.kind));

  async function request(method, body) {
    const res = await fetch(`${api}/readiness`, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await res.json().catch(() => ({}));
    return { res, result };
  }
  async function load(force) {
    if (loading || productUI.isUploading()) return;
    loading = true; loadError = ""; draw();
    try {
      const { res, result } = await request("GET");
      if (!res.ok) throw new Error(result.error || "Could not load the current store readiness.");
      data = result; resetAll(); conflict = false; if (force) for (const k in msgs) delete msgs[k];
    } catch (e) { loadError = e.message; }
    finally { loading = false; draw(); if(refreshPending){refreshPending=false;storeChanged();} }
  }
  async function submit(section, extra, onOk) {
    if (readOnly || busy || productUI.isUploading() || conflict || !data) return;
    busy = section; msgs[section] = null; draw();
    try {
      const { res, result } = await request("PATCH", { expected_draft: data.expected_draft, confirm: true, ...extra });
      if (res.status === 409) { conflict = true; throw new Error(result.error || "The store changed since you loaded this check. Your edits are kept below. Nothing was saved."); }
      if (!res.ok) throw new Error([result.error || "Could not save. Your edits are kept below.",...Object.values(result.errors||{})].join(" "));
       const bizWasDirty=bizDirty(), coWasDirty=coDirty();
       const dirtyPolicies=new Set((data.policies||[]).filter(p=>polDirty(p.kind)).map(p=>p.kind));
       data = result;
       productUI.receive(data);
       if(section!=="business"&&!bizWasDirty)biz=bizFrom(data.settings);
       if(section!=="checkout"&&!coWasDirty)co=coFrom(data.checkout.settings);
       for(const p of data.policies||[]){
         if(!dirtyPolicies.has(p.kind))pol[p.kind]=polFrom(p);
         // Saved business or selling changes invalidate even an unsaved tick.
         // Keep edited policy text, but ask the merchant to review it again.
         if((["business","checkout"].includes(section)||section.startsWith("product:"))&&pol[p.kind])pol[p.kind].reviewed=false;
       }
       onOk?.();
      saved = "Saved. These checks reflect the stored store.";
      msgs[section] = { type: "ok", text: "Saved. Checks below show what is stored now." };
      lastSection = section;
      try { onSaved?.(result); } catch { /* host callback must not break the panel */ }
    } catch (e) { msgs[section] = { type: "err", text: e.message }; }
    finally { busy = ""; draw(); if(refreshPending){refreshPending=false;storeChanged();} }
  }
  function saveBusiness() {
    const settings = {};
    for (const k of BIZ) {
      if (lockedOn() && LOCKED.includes(k)) continue;
      const v = String(biz[k] ?? "").trim();
      if (k === "logo_media_id") {
        if (v && !UUID.test(v)) { msgs.business = { type: "err", text: "Choose a logo from your uploads." }; return draw(); }
        settings[k] = v || null;
      } else settings[k] = v;
    }
    void submit("business", { action: "business", settings }, () => { biz = bizFrom(data.settings); ackBiz = false; });
  }
  function saveCheckout() {
    try {
      const c0 = data.checkout.settings, mode = co.delivery_mode;
      const settings = { delivery_mode: mode,
         flat_paise: ["flat","free_above"].includes(mode) ? inrToPaise(co.flat, { allowZero: true }) : 0,
        free_above_paise: mode === "free_above" ? inrToPaise(co.free_above) : (c0.free_above_paise ?? 0),
        cod_enabled: co.cod_enabled,
        cod_max_paise: co.cod_enabled ? inrToPaise(co.cod_max) : (c0.cod_max_paise ?? 0),
        store_state: co.store_state.trim() };
      void submit("checkout", { action: "checkout", checkout: settings }, () => { co = coFrom(data.checkout.settings); ackCo = false; });
    } catch (e) { msgs.checkout = { type: "err", text: e.message }; draw(); }
  }
  function savePolicy(kind) {
    const p = pol[kind];
    void submit(`policy:${kind}`, { action: "policy", policy: { kind, body: p.body, reviewed: !!p.reviewed } }, () => { const n = data.policies.find(x => x.kind === kind); if (n) pol[kind] = polFrom(n); });
  }
  function generate() {
    if (!ackGen) return;
    void submit("generate", { action: "generate-policies" }, () => { pol = Object.fromEntries(data.policies.map(p => [p.kind, polFrom(p)])); ackGen = false; });
  }
  function reload() {
    if (busy || productUI.isUploading()) return;
    if (anyDirty() && !window.confirm("Reloading discards your unsaved readiness edits. Continue?")) return;
    void load(true);
  }
  function storeChanged(){
    if(busy||loading||productUI.isUploading()){refreshPending=true;return;}
    if(anyDirty()){conflict=true;draw();return;}
    void load(true);
  }

  /* ---------- drawing ---------- */
  const dis = (extra = false) => (readOnly || busy || loading || productUI.isUploading() || extra) ? " disabled" : "";
  const msg = s => msgs[s] ? `<p class="${msgs[s].type === "err" ? "ann-error" : "ann-callout"}" role="${msgs[s].type === "err" ? "alert" : "status"}">${esc(msgs[s].text)}</p>` : "";
  function field(key, name, value, opts = {}) {
    const err = opts.error, id = `rd-${key}`;
    const lock = opts.locked;
     const control = opts.state
       ? `<select id="${id}" data-rd-key="${key}" ${opts.attr}${dis(lock)}><option value="">Choose a state or UT</option>${INDIAN_STATES.map(s=>`<option value="${s.code}"${value===s.code?" selected":""}>${esc(s.name)}</option>`).join("")}</select>`
       : opts.area
      ? `<textarea id="${id}" rows="4" data-rd-key="${key}" ${opts.attr}${dis(lock)}${err ? ` aria-invalid="true" aria-describedby="${id}-e"` : ""}>${esc(value)}</textarea>`
      : `<input id="${id}" data-rd-key="${key}" ${opts.attr} value="${esc(value)}"${opts.mode ? ` inputmode="${opts.mode}"` : ""}${opts.type ? ` type="${opts.type}"` : ""}${dis(lock)}${err ? ` aria-invalid="true" aria-describedby="${id}-e"` : ""}${lock ? ' aria-describedby="rd-lock-note"' : ""}>`;
    return `<label class="ann-field" for="${id}">${esc(name)}${control}</label>${err ? `<p class="ann-error" id="${id}-e">${esc(err)}</p>` : ""}`;
  }
  function draw() {
    const node = slot(); if (!node) return;
    const active = document.activeElement, key = node.contains(active) ? active.dataset?.rdKey : null;
    const sel = key && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    const top = node.scrollTop;
    node.innerHTML = html();
    // Review is a long sidebar. Keep product deep links usable even when
    // readiness arrives after the browser's initial fragment navigation.
    const fragment=location.hash.slice(1);
    if(!deepLinked && (fragment==="ann-products" || /^pd-[0-9a-f-]{36}-(?:hsn|gst|price|file)$/.test(fragment))){
      const target=node.querySelector(`#${fragment}`);
      if(target){deepLinked=true;queueMicrotask(()=>target.isConnected&&target.scrollIntoView({block:"center",inline:"nearest"}));}
    }
    if (key) { const el = node.querySelector(`[data-rd-key="${key}"]`); if (el && !el.disabled) { el.focus({ preventScroll: true }); try { if (sel) el.setSelectionRange(...sel); } catch { /* not text */ } } }
    node.scrollTop = top;
  }
  function html() {
    const head = `<h2>Launch readiness</h2>
      <p>This panel reads your actual store, not your Ann answers. Setup fields below are saved to the store separately from the Ann plan. The Save button under the conversation only saves the Ann plan.</p><p><a href="#ann-products">Jump to products</a></p>`;
    if (loading && !data) return `${head}<div class="ann-skel" aria-busy="true"><i></i><i></i><i></i></div>`;
    if (!data) return `${head}${loadError ? `<p class="ann-error" role="alert">${esc(loadError)}</p>` : ""}<button type="button" class="ann-btn" data-rd="load"${loading ? " disabled" : ""}>${loadError ? "Try again" : "Load readiness"}</button>`;
    const errs = data.business_errors || {}, st = data.store || {};
    const chk = data.checklist || [];
    const allDone = chk.length > 0 && chk.every(c => c.complete);
    const host = st.subdomain ? `Your assigned store subdomain is ${esc(st.subdomain)}.` : "Your store host is not assigned yet.";
    const reqDiff = st.requested_subdomain && st.requested_subdomain !== st.subdomain ? ` You requested ${esc(st.requested_subdomain)}, which is saved as a request but is not the live host.` : "";
    const statusLine = `<p class="ann-note">Store status: ${esc(st.status || "unknown")}. ${host}${reqDiff} Custom domains are not connected here.${st.approval_enabled ? ` Platform review: ${esc(st.approval_status || "not requested")}.` : ""}</p>`;
    const lockNote = lockedOn() ? `<p class="ann-callout" id="rd-lock-note">Legal name, trade name, address, state and GSTIN come from your verified supplier record and cannot be edited here. Change them in <a href="${root}/setup">setup</a>.</p>` : `<p class="ann-note" id="rd-lock-note">Address availability, GST verification and uploads are handled in <a href="${root}/setup">setup</a>.</p>`;
    const L = k => lockedOn() && LOCKED.includes(k);
    const f = (k, o = {}) => field(`biz-${k}`, BIZ_LABELS[k], biz[k], { attr: `data-rd-biz="${k}"`, error: errs[k], locked: L(k), ...o });
    const logos = data.logo_media || [];
    const logoSel = `<label class="ann-field" for="rd-biz-logo">Logo<select id="rd-biz-logo" data-rd-key="biz-logo" data-rd-biz="logo_media_id"${dis()}${errs.logo_media_id ? ' aria-invalid="true" aria-describedby="rd-biz-logo-e"' : ""}><option value="">No logo</option>${logos.map(l => `<option value="${esc(l.id)}"${biz.logo_media_id === l.id ? " selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label>${errs.logo_media_id ? `<p class="ann-error" id="rd-biz-logo-e">${esc(errs.logo_media_id)}</p>` : ""}<p class="ann-note">Upload new logos in <a href="${root}/setup">setup</a>.</p>`;
    const bd = bizDirty();
    const business = `<fieldset class="ann-item"><legend>Business details</legend>
      ${Object.keys(errs).length ? `<p class="ann-callout" role="status">Some saved business details fail the shared checks. You can still save a draft.</p>` : ""}
       ${lockNote}${f("brand_name")}${f("tagline")}${f("description", { area: true })}${f("legal_name")}${f("trade_name")}${f("address", { area: true })}${f("business_line1")}${f("business_line2")}${f("business_city")}${f("business_pincode", { mode: "numeric" })}${f("business_state", {state:true})}${f("gstin")}${f("support_email", { type: "email" })}${f("support_phone", { type: "tel" })}${f("notification_email", { type: "email" })}${logoSel}
      <label class="ann-check"><input type="checkbox" data-rd-key="ack-biz" data-rd-ack="biz"${ackBiz ? " checked" : ""}${dis(!bd)}><span>I confirm saving these business details to my store. Incomplete drafts can be saved.</span></label>
      ${msg("business")}
      <div class="ann-actions"><button type="button" class="ann-btn" data-rd="save-business"${dis(!bd || !ackBiz)}>${busy === "business" ? "Saving business details" : "Save business details"}</button></div></fieldset>`;
    const prodBlock=productUI.render(data,{disabled:readOnly||!!busy||loading||conflict,messages:msgs});
    const c = data.checkout || {}, canEdit = !!c.can_edit && !!c.available;
     const cd = coDirty() || !c.saved, mode = co.delivery_mode;
    const checkout = `<fieldset class="ann-item"${!c.available ? "" : ""}><legend>Shipping and cash on delivery</legend>
      ${!c.available ? `<p class="ann-note">Checkout settings are not available for this store yet.</p>` : !c.can_edit ? `<p class="ann-callout">Only the store owner can change shipping and payment settings. Current values are shown read-only.</p>` : ""}
      <p class="ann-callout">Changes here apply to your live checkout immediately, even though the rest of the store may be a draft.</p>
      <label class="ann-field" for="rd-co-mode">Delivery charge<select id="rd-co-mode" data-rd-key="co-mode" data-rd-co="delivery_mode"${dis(!canEdit)}>${[["free", "Free delivery"], ["flat", "Flat delivery charge"], ["free_above", "Free above an order value"]].map(([v, n]) => `<option value="${v}"${mode === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>
       ${["flat","free_above"].includes(mode) ? field("co-flat", mode==="flat" ? "Flat charge (INR, zero allowed)" : "Delivery below threshold (INR, zero allowed)", co.flat, { attr: 'data-rd-co="flat"', mode: "decimal", locked: !canEdit }) : ""}
      ${mode === "free_above" ? field("co-free", "Free above (INR)", co.free_above, { attr: 'data-rd-co="free_above"', mode: "decimal", locked: !canEdit }) : ""}
      <label class="ann-check"><input type="checkbox" data-rd-key="co-cod" data-rd-co="cod_enabled"${co.cod_enabled ? " checked" : ""}${dis(!canEdit)}><span>Accept cash on delivery</span></label>
      ${co.cod_enabled ? field("co-codmax", "Largest COD order (INR, above zero)", co.cod_max, { attr: 'data-rd-co="cod_max"', mode: "decimal", locked: !canEdit }) : ""}
      <p class="ann-note">Cash on delivery is the only payment method configured here. No online payment gateway is connected.</p>
       ${field("co-state", "Store state for tax", co.store_state, { attr: 'data-rd-co="store_state"', state:true, locked: !canEdit })}
      <label class="ann-check"><input type="checkbox" data-rd-key="ack-co" data-rd-ack="co"${ackCo ? " checked" : ""}${dis(!canEdit || !cd)}><span>I understand these shipping and COD changes go live for customers as soon as I save.</span></label>
      ${msg("checkout")}
      <div class="ann-actions"><button type="button" class="ann-btn" data-rd="save-checkout"${dis(!canEdit || !cd || !ackCo)}>${busy === "checkout" ? "Saving checkout" : "Save checkout settings"}</button></div></fieldset>`;
    const pols = data.policies || [];
    const policies = `<fieldset class="ann-item"><legend>Policies</legend>
       <p class="ann-note">Policy drafts are a starting point, not legal approval. Check your actual delivery, payment, cancellation and privacy practices before ticking reviewed. Editing the text clears its review.</p>
      ${pols.map(p => { const m = pol[p.kind] || polFrom(p), k = p.kind, d = polDirty(k), name = POLICY_NAMES[k] || k;
        return `<div class="ann-item">${field(`pol-${k}`, `${name} policy`, m.body, { area: true, attr: `data-rd-pol="${esc(k)}" data-rd-pf="body"` })}
          <label class="ann-check"><input type="checkbox" data-rd-key="polr-${esc(k)}" data-rd-pol="${esc(k)}" data-rd-pf="reviewed"${m.reviewed ? " checked" : ""}${dis()}><span>I have reviewed the ${esc(name.toLowerCase())} policy</span></label>
          ${msg(`policy:${k}`)}
          <button type="button" class="ann-btn alt" data-rd="save-policy" data-kind="${esc(k)}"${dis(!d)}>${busy === `policy:${k}` ? "Saving" : `Save ${esc(name.toLowerCase())} policy`}</button></div>`; }).join("")}
      <div class="ann-callout"><p>Regenerating replaces all ${pols.length || KINDS_ORDER} policy texts with standard drafts, discarding every edit you made, and clears all reviewed ticks. Your unsaved policy edits are also lost.</p>
      <label class="ann-check"><input type="checkbox" data-rd-key="ack-gen" data-rd-ack="gen"${ackGen ? " checked" : ""}${dis()}><span>I understand this overwrites all policies and resets all reviews.</span></label>
      ${msg("generate")}
      <button type="button" class="ann-btn alt" data-rd="generate"${dis(!ackGen)}>${busy === "generate" ? "Regenerating" : "Regenerate all policies"}</button></div></fieldset>`;
    const list = `<h3>Current checks</h3>${saved && lastSection ? `<p class="ann-note" role="status">${esc(saved)}</p>` : ""}<ul>${chk.map(x => `<li>${x.complete ? "Complete" : "Needs attention"}: ${esc(x.label)}</li>`).join("")}</ul>
      <p class="ann-note">${allDone ? "Every check is complete. That does not mean the store is live. " : ""}Platform review, GST verification and supplier supply stay authoritative, and the editor checks everything again when you publish. There is no publish button here.</p>`;
    return `${head}
      ${conflict ? `<div class="ann-conflict" role="alert"><p>The store changed elsewhere. Your edits are kept and nothing was overwritten.</p><button type="button" class="ann-btn alt" data-rd="reload"${busy ? " disabled" : ""}>Reload current store data</button></div>` : ""}
      ${statusLine}${business}${prodBlock}${checkout}${policies}${list}
      <div class="ann-actions"><button type="button" class="ann-btn alt" data-rd="reload"${busy || loading || productUI.isUploading() ? " disabled" : ""}>Reload current data</button><a class="ann-btn alt" href="${root}/setup">Open setup</a><a class="ann-btn alt" href="${root}/products">Products</a><a class="ann-btn" href="${root}/editor">Final review in editor</a></div>`;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-rd]"); if (!b || !slot()?.contains(b)) return;
    e.preventDefault();
    const a = b.dataset.rd;
    if (a === "load") void load();
    else if (a === "reload") reload();
    else if (a === "save-business") { if (ackBiz) saveBusiness(); }
    else if (a === "save-checkout") { if (ackCo) saveCheckout(); }
    else if (a === "save-policy") savePolicy(b.dataset.kind);
    else if (a === "generate") generate();
  });
  function onField(e, redraw) {
    const n = e.target, d = n.dataset; if (!d || !slot()?.contains(n) || readOnly) return;
    const val = n.type === "checkbox" ? n.checked : n.value;
    if ("rdBiz" in d) { biz[d.rdBiz] = val; ackBiz = false; }
    else if ("rdCo" in d) { co[d.rdCo] = val; ackCo = false; }
    else if ("rdPol" in d) {
      const p = pol[d.rdPol]; if (!p) return;
      if (d.rdPf === "body") { p.body = val; p.reviewed = false; } else p.reviewed = !!val;
    } else if ("rdAck" in d) { if (d.rdAck === "biz") ackBiz = val; else if (d.rdAck === "co") ackCo = val; else ackGen = val; }
    else return;
    if (redraw) draw(); else syncButtons();
  }
  function syncButtons() { draw(); }
  document.addEventListener("input", e => { if (e.target.type !== "checkbox" && e.target.tagName !== "SELECT") onField(e, false); });
  document.addEventListener("change", e => { if (e.target.type === "checkbox" || e.target.tagName === "SELECT") onField(e, true); });
  document.addEventListener("submit", e => { if (slot()?.contains(e.target)) e.preventDefault(); });

  return {
    hasUnsavedChanges: () => !!busy || anyDirty(),
    onStoreChanged:storeChanged,
    mount() { if (!slot()) return; if (!data && !loading && !loadError) void load(); else draw(); },
  };
}
