import { INDIAN_STATES } from "./commerce-rules.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DEFAULT_NAME = /^my store$/i;
export const GST_COPY = "This verified address will appear on your invoices. You cannot edit it here.";

/*
 * Ann onboarding controller. Modes:
 *   brand   - brand name, saved to the REAL draft (PATCH annApi/onboarding)
 *   gstin   - explicit GSTIN verify then confirm of the registered address
 *   address - included store address (subdomain), custom domain comes later
 * Nothing here publishes. GST is never treated as verified from local checks.
 */
export function attachAnnOnboarding({ api, storeId, readOnly, mode = "brand", onDraft, onContinue, onPreview }) {
  const url = `${api}/onboarding`, gstApi = `${api.replace(/\/ann$/,"")}/gstin`;
  const slotId = `ann-ob-${mode}-slot`;
  let env = null, loading = false, busy = "", error = "", note = "", attempted = false, skipped = false, done = false;
  let name = null, sub = null, subMsg = null, timer = 0;
  let stateCode = null, gstinVal = null, pending = null, pick = 0, unavailable = false;
  const slot = () => document.getElementById(slotId);
  const off = () => readOnly || loading || !!busy;
  const dis = () => off() ? " disabled" : "";

  async function call(u, method = "GET", body) {
    const res = await fetch(u, { method, credentials: "same-origin", cache: "no-store",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const result = await res.json().catch(() => ({}));
    return { res, result };
  }
  const failText = (result, fallback) => [result.error || fallback, ...Object.values(result.errors || {}).filter(x => typeof x === "string")].join(" ");
  const displayName = () => name ?? (env && !DEFAULT_NAME.test(env.store?.name || "") ? env.store.name : "");
  const displaySub = () => sub ?? env?.store?.subdomain ?? "";
  // Real contract: verification = {id,gstin,state,confirmed,registration:{legal_name,trade_name,principal_address,additional_addresses}}
  const isConfirmed = v => !!v && v.state === "verified" && v.confirmed === true;
  const isVerified = v => !!v && v.state === "verified" && !!v.registration;
  const confirmed = () => isConfirmed(env?.verification);
  const addrText = a => a ? [a.line1, a.line2, [a.city, a.pin].filter(Boolean).join(" "), a.state].filter(Boolean).join(", ") : "";
  const addrList = v => v?.registration ? [v.registration.principal_address, ...(v.registration.additional_addresses || [])].filter(Boolean) : [];
  // A verified record that is not yet confirmed still needs an address choice.
  const toConfirm = () => [pending, env?.verification].find(v => isVerified(v) && !isConfirmed(v) && addrList(v).length) || null;
  const code = () => stateCode ?? env?.settings?.business_state ?? "";
  const gstValue = () => (gstinVal ?? env?.settings?.gstin ?? "").toUpperCase().trim();
  function gstProblem() {
    const g = gstValue();
    if (!code()) return "Choose the state of your registered business address.";
    if (!GSTIN.test(g)) return "Enter all 15 characters of your GSTIN.";
    if (g.slice(0, 2) !== code()) return "The first two digits of your GSTIN must match the state you chose.";
    return "";
  }
  const nameProblem = () => { const n = displayName().trim(); return n.length < 2 ? "Use at least 2 characters." : n.length > 40 ? "Use 40 characters or fewer." : DEFAULT_NAME.test(n) && DEFAULT_NAME.test(env?.store?.name || "") ? "Give your store its own name." : ""; };
  const subProblem = () => /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/.test(displaySub()) ? "" : "Use 3 to 30 lowercase letters, numbers or hyphens. Start and end with a letter or number.";

  function take(result, initial = false) { env = result; try { onDraft?.(result, { initial, mode }); } catch { /* host error */ } }
  async function load() {
    if (loading) return;
    loading = true; attempted = true; error = ""; draw();
    try {
      const { res, result } = await call(url);
      if (!res.ok) throw new Error(failText(result, "Your store details could not be loaded."));
      take(result, true);
      if (mode === "gstin") {
        const record=result.verification;
        if(isVerified(record)&&!isConfirmed(record)&&!pending)pending=record;
        if(isConfirmed(record)&&stateCode==null&&gstinVal==null){stateCode=result.settings?.business_state_code||"";gstinVal=record.gstin||"";}
      }
    } catch (e) { error = e.message; }
    finally { loading = false; draw(); }
  }
  async function refetch() { const { res, result } = await call(url); if (res.ok) take(result); return res.ok; }
  const stale = async () => { await refetch().catch(() => false); error = "Your store changed in another window. We refreshed it and kept what you typed. Please press the button again."; };

  async function saveBrand() {
    if (off() || !env) return;
    const problem = nameProblem(); if (problem) { error = problem; draw(); return; }
    const n = displayName().trim();
    if (n === env.store?.name) { note = "Name saved."; return void onContinue?.(); }
    busy = "brand"; error = ""; draw();
    try {
      const { res, result } = await call(url, "PATCH", { expected_draft: env.expected_draft, confirm: true, brand_name: n });
      if (res.status === 409) return void await stale();
      if (!res.ok) throw new Error(failText(result, "Your name was not saved. Please try again."));
      take(result); name = null; note = "Your brand name is saved to your draft. Your live store is unchanged.";
      busy = ""; draw(); onContinue?.();
    } catch (e) { error = e.message; }
    finally { busy = ""; draw(); }
  }
  async function checkSub() {
    const s = displaySub(); const problem = subProblem();
    if (problem) { subMsg = { bad: true, text: problem }; draw(); return false; }
    if (s === env?.store?.subdomain) { subMsg = { text: "This is your current address." }; draw(); return true; }
    busy = "check"; draw();
    try {
      const { res, result } = await call(`/api/subdomain-check?name=${encodeURIComponent(s)}&store_id=${storeId}`);
      if (!res.ok) throw new Error(failText(result, "We could not check that address. Try again."));
      const ok = result.available === true;
      subMsg = ok ? { text: "That address is free." } : { bad: true, text: result.error || "That address is taken. Try another." };
      return ok;
    } catch (e) { subMsg = { bad: true, text: e.message }; return false; }
    finally { busy = ""; draw(); }
  }
  async function saveAddress() {
    if (off() || !env) return;
    const s = displaySub();
    if (s === env.store?.subdomain) { done = true; return void onContinue?.(); }
    if (!await checkSub()) return;
    busy = "address"; error = ""; draw();
    try {
      const { res, result } = await call(url, "PATCH", { expected_draft: env.expected_draft, confirm: true, subdomain: s });
      if (res.status === 409) return void await stale();
      if (!res.ok) throw new Error(failText(result, "Your address was not saved. Please try again."));
      take(result); sub = null; done = true; busy = ""; draw(); onContinue?.();
    } catch (e) { error = e.message; }
    finally { busy = ""; draw(); }
  }
  async function verify() {
    if (off()) return;
    const problem = gstProblem(); if (problem) { error = problem; draw(); return; }
    busy = "verify"; error = ""; unavailable = false; note = ""; draw();
    try {
      const { res, result } = await call(`${gstApi}/verify`, "POST", { gstin: gstValue(), state_code: code() });
      if (!res.ok) { unavailable = res.status >= 500 || res.status === 429; throw new Error(unavailable ? "The GST service is not available right now. Your entries are kept. You can try again or save for later." : failText(result, "We could not verify this GSTIN. Check it and try again.")); }
      if (result.enabled === false) throw new Error("GST checks are not turned on yet. Your entries are kept. You can save for later.");
      pending = result; pick = 0;
      if (result.state === "unverified") { unavailable = true; error = result.message || "Verification is unavailable right now. Try again later."; }
      else if (result.state === "blocked") error = result.message || "An active Regular GSTIN is required.";
      else note = result.message || "Registration verified. Confirm a registered address.";
    } catch (e) { error = e.message; }
    finally { busy = ""; draw(); }
  }
  async function confirm() {
    const v = toConfirm(); if (off() || !v?.id) return;
    busy = "confirm"; error = ""; draw();
    try {
      const { res, result } = await call(`${gstApi}/confirm`, "POST", { verification_id: v.id, address_index: pick });
      if (!res.ok) throw new Error(failText(result, "We could not confirm this address. Try again."));
      pending = null;
      // Fresh onboarding GET is the source of truth; no local confirmed flag.
      if (!await refetch()) throw new Error("Confirmed, but your details could not be refreshed. Reload this page to see them.");
      note = confirmed() ? "Your GST details are verified and saved to your draft." : "The address was saved, but it is not shown as confirmed yet. Reload to check.";
    } catch (e) { error = e.message; }
    finally { busy = ""; draw(); }
  }

  const msgs = () => `${loading ? `<p class="ann-note" role="status">Loading your details...</p>` : ""}${busy ? `<p class="ann-note" role="status">Working on it...</p>` : ""}${error ? `<p class="ann-error" role="alert">${esc(error)}</p>${!env ? `<button type="button" class="ann-btn alt sm" data-ob="retry">Try again</button>` : ""}` : ""}${note ? `<p class="ann-note" role="status">${esc(note)}</p>` : ""}${readOnly ? `<p class="ann-callout">Only an owner or admin can change this.</p>` : ""}`;

  function brandHtml() {
    const bad = nameProblem();
    return `<label class="ann-field">Brand name<input data-ob-in="name" maxlength="40" autocomplete="organization" placeholder="Type your brand name" value="${esc(displayName())}"${dis()}></label>
      <p class="ann-note">2 to 40 characters. This changes your draft only. Your live store is unchanged.</p>${msgs()}
      <div class="ann-actions"><button type="button" class="ann-btn" data-ob="save"${off() || !env || bad ? " disabled" : ""}>${busy === "brand" ? "Saving" : "Save name and continue"}</button></div>`;
  }
  function gstHtml() {
    if (confirmed()) {
      const v = env.verification, r = v.registration || {}, a = addrList(v).find(x => x.pin === env.settings?.business_pincode && (x.line1 || x.line2) === env.settings?.business_line1) || addrList(v)[0];
      return `<div class="ann-callout" role="status"><strong>GST verified</strong></div>
        <dl class="ann-summary"><div><dt>Legal name</dt><dd>${esc(r.legal_name || "")}</dd></div><div><dt>Registered address</dt><dd>${esc(addrText(a))}</dd></div></dl>
        <p class="ann-note">${GST_COPY}</p>${msgs()}
        <div class="ann-actions"><button type="button" class="ann-btn" data-ob="continue">Continue</button></div>`;
    }
    const p = toConfirm(), list = addrList(p), g = gstValue(), problem = gstProblem();
    const hint = (g || stateCode) && problem ? `<p class="ann-note">${esc(problem)}</p>` : "";
    return `<p class="ann-note">We will check your GSTIN with the GST service. Nothing counts as verified until you press Verify and confirm the address.</p>
      <label class="ann-field">State of your registered address<select data-ob-in="state"${dis()}><option value="">Choose a state</option>${INDIAN_STATES.map(s => `<option value="${s.code}"${s.code === code() ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
      <label class="ann-field">GSTIN<input data-ob-in="gstin" maxlength="15" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="15 characters" value="${esc(gstValue())}"${dis()}></label>${hint}
      ${p ? `<fieldset class="ann-item"${dis()}><legend>Registered name and address</legend><p><strong>${esc(p.registration.legal_name || "")}</strong>${p.registration.trade_name ? `<br><small>${esc(p.registration.trade_name)}</small>` : ""}</p>
        ${list.map((a, i) => `<label class="ann-check"><input type="radio" name="ann-ob-addr" data-ob-in="addr" value="${i}"${i === pick ? " checked" : ""}><span>${esc(addrText(a))}</span></label>`).join("")}
        <p class="ann-note">${GST_COPY}</p></fieldset>` : ""}${msgs()}
      <div class="ann-actions"><button type="button" class="ann-btn${p ? " alt" : ""}" data-ob="verify"${off() || problem ? " disabled" : ""}>${busy === "verify" ? "Verifying" : p || pending ? "Verify again" : "Verify GSTIN"}</button>
      ${p ? `<button type="button" class="ann-btn" data-ob="confirm"${off() ? " disabled" : ""}>${busy === "confirm" ? "Confirming" : "Confirm this address"}</button>` : ""}
      <button type="button" class="ann-link" data-ob="skip"${busy ? " disabled" : ""}>Save for later and continue</button></div>
      <p class="ann-note">You can skip for now and your draft is kept. A verified and confirmed GST registration is required before you can publish your store.</p>`;
  }
  function addressHtml() {
    const s = displaySub(), m = subMsg;
    return `<label class="ann-field">Your store address name<input data-ob-in="sub" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(s)}"${dis()}></label>
      ${m ? `<p class="${m.bad ? "ann-error" : "ann-note"}" role="${m.bad ? "alert" : "status"}">${esc(m.text)}</p>` : ""}${msgs()}
      <div class="ann-actions"><button type="button" class="ann-btn alt" data-ob="check"${off() || !s ? " disabled" : ""}>${busy === "check" ? "Checking" : "Check this address"}</button>
      <button type="button" class="ann-btn" data-ob="save"${off() || !env || subProblem() ? " disabled" : ""}>${busy === "address" ? "Saving" : "Keep this address and continue"}</button></div>
      <p class="ann-note">Want your own domain, like www.yourbrand.com? You can connect it later in this conversation.</p>`;
  }
  const html = () => mode === "brand" ? brandHtml() : mode === "gstin" ? gstHtml() : addressHtml();
  function draw() {
    const n = slot(); if (!n) return;
    const a = document.activeElement, k = n.contains(a) ? a.dataset?.obIn : null;
    const sel = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    n.innerHTML = html();
    if (k && k !== "addr") { const el = n.querySelector(`[data-ob-in="${k}"]`); if (el && !el.disabled) { el.focus({ preventScroll: true }); try { if (sel) el.setSelectionRange(...sel); } catch { /* select */ } } }
  }
  function sync() {
    const n = slot(); if (!n) return;
    const set = (a, bad) => { const b = n.querySelector(`[data-ob="${a}"]`); if (b) b.disabled = off() || !env || !!bad; };
    if (mode === "brand") set("save", nameProblem());
    else if (mode === "gstin") set("verify", gstProblem());
    else { set("save", subProblem()); const c = n.querySelector('[data-ob="check"]'); if (c) c.disabled = off() || !displaySub(); }
  }
  document.addEventListener("input", e => {
    const t = e.target, k = t.dataset?.obIn; if (!k || !slot()?.contains(t)) return;
    if (k === "name") { name = t.value; clearTimeout(timer); timer = setTimeout(() => onPreview?.({ brand_name: displayName().trim() }), 400); error = ""; }
    else if (k === "sub") { sub = t.value.toLowerCase().replace(/\s/g, ""); if (t.value !== sub) t.value = sub; subMsg = null; error = ""; const m = slot().querySelector(".ann-error,.ann-note[role=status]"); if (m && m.closest("label") == null && subMsg === null) { /* message refreshed on next draw */ } }
    else if (k === "gstin") { gstinVal = t.value.toUpperCase().replace(/[^0-9A-Z]/g, ""); if (t.value !== gstinVal) t.value = gstinVal; pending = null; error = ""; }
    sync();
  });
  document.addEventListener("change", e => {
    const t = e.target, k = t.dataset?.obIn; if (!k || !slot()?.contains(t)) return;
    if (k === "state") { stateCode = t.value; pending = null; error = ""; draw(); }
    else if (k === "addr") pick = Number(t.value) || 0;
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-ob]"); if (!b || !slot()?.contains(b) || b.disabled) return;
    e.preventDefault();
    const a = b.dataset.ob;
    if (a === "retry") { attempted = false; void load(); }
    else if (a === "save") void (mode === "brand" ? saveBrand() : saveAddress());
    else if (a === "check") void checkSub();
    else if (a === "verify") void verify();
    else if (a === "confirm") void confirm();
    else if (a === "skip") { skipped = true; onContinue?.(); }
    else if (a === "continue") onContinue?.();
  });
  document.addEventListener("submit", e => { if (slot()?.contains(e.target)) e.preventDefault(); });

  return {
    html,
    mount() { const n = slot(); if (!n) return; if (!attempted) void load(); else if (!n.childElementCount) draw(); },
    // Brand mode only: the bottom composer sends a typed name here.
    submit(text) { if (mode !== "brand") return; name = String(text || "").trim().slice(0, 40); draw(); void saveBrand(); },
    envelope: () => env,
    isConfirmed: () => confirmed(),
    summary() {
      if (mode === "brand") return env && !DEFAULT_NAME.test(env.store?.name || "") ? env.store.name : "";
      if (mode === "gstin") return confirmed() ? `GST verified${env.verification.registration?.legal_name ? `: ${env.verification.registration.legal_name}` : ""}` : skipped ? "Skipped for now. Verified GST is needed before you can publish." : toConfirm() ? "Verified, address not confirmed yet" : "";
      return done && env?.store?.subdomain ? `Address name: ${env.store.subdomain}` : "";
    },
    hasUnsavedChanges: () => !!busy || (mode === "brand" && name !== null && name.trim() !== (env?.store?.name || "")) || (mode === "address" && sub !== null && sub !== env?.store?.subdomain) || (mode === "gstin" && !!toConfirm()),
  };
}
