const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 15000;
const REASONS = {
  already_enrolled: "This store already has a plan. No second plan can be added.",
  legacy_transition_required: "This previously published store needs the existing-store transition before it can join a plan. Its current service is unchanged.",
  country_required: "Confirm your business country in Ann first. The Free plan depends on it.",
  unsupported_country: "The Free plan is not offered for your business country yet.",
  offer_unavailable: "The Free plan offer is not available right now.",
};
const num = n => Number.isFinite(n) ? new Intl.NumberFormat("en-IN").format(n) : String(n);

export function attachAnnPlanSelection({ endpoint, role, getStoreName, onStateChange, onAccepted } = {}) {
  let dlg = null, opener = null, ctl = null, seq = 0;
  let loading = false, busy = false, error = "", response = null, opened = false;
  let agreed = false, accepted = false, note = "";
  const isOwner = () => role === "owner";
  const emit = () => { try { onStateChange?.(); } catch { /* host error */ } };
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  async function request(url, method, body) {
    ctl?.abort();
    const c = new AbortController(); ctl = c;
    const t = setTimeout(() => c.abort("timeout"), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, credentials: "same-origin", cache: "no-store", signal: c.signal,
        headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json().catch(() => null);
      return { res, data };
    } catch (e) {
      if (c.signal.aborted && c.signal.reason === "timeout") throw Object.assign(new Error("The request took too long."), { timeout: true });
      if (c.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
      throw new Error("The network failed.");
    } finally { clearTimeout(t); if (ctl === c) ctl = null; }
  }
  const validEnvelope = d => d && typeof d === "object" && "subscription" in d && typeof d.can_enrol === "boolean" && typeof d.reason === "string";
  const offer = () => response?.offer;
  const ent = k => offer()?.entitlements?.[k];
  const offerValid = () => {
    const o = offer(); if (!o) return false;
    return o.plan === "free" && UUID.test(o.price_id || "") && o.terms_version === "free-v1" && o.amount_minor === 0 &&
      o.currency === "INR" && Number.isFinite(o.live_days) && ent("published_products")?.included === true &&
      Number.isFinite(ent("published_products")?.value) && ent("published_skus")?.included === true && Number.isFinite(ent("published_skus")?.value);
  };
  const canAccept = () => isOwner() && !!response && !response.subscription && response.can_enrol === true && response.reason === "available" && offerValid();

  async function load() {
    const my = ++seq;
    loading = true; error = ""; note = ""; emit(); draw();
    try {
      const { res, data } = await request(endpoint, "GET");
      if (my !== seq) return;
      if (!res.ok) throw new Error(data?.error || "Plan details could not be loaded.");
      if (!validEnvelope(data)) throw new Error("The plan details came back in an unexpected form.");
      response = data;
    } catch (e) {
      if (e.cancelled || my !== seq) return;
      error = e.timeout ? "Loading plan details took too long. No changes were made." : e.message.includes("network") ? "The network failed while loading plan details. No changes were made." : `${e.message} No changes were made.`;
    } finally { if (my === seq) { loading = false; emit(); draw(); } }
  }

  async function accept() {
    if (busy || loading || !agreed || !canAccept()) return;
    const o = offer();
    busy = true; error = ""; note = ""; emit(); draw();
    let ok = false;
    try {
      const { res, data } = await request(`${endpoint}/free`, "POST", { price_id: o.price_id, terms_version: o.terms_version, accepted: true });
      if (!res.ok) { error = `${data?.error || "The plan could not be started."} No plan was started by this attempt.`; }
      else if (!validEnvelope(data) || !data.subscription) { error = "The server reply did not confirm a plan. Refresh to check your plan status."; }
      else { response = data; ok = true; accepted = true; agreed = false; note = "Your Free plan is active."; }
    } catch (e) {
      if (!e.cancelled) error = e.timeout ? "The request took too long, so we cannot tell whether the plan started. Refresh to check before trying again." : "The network failed, so we cannot tell whether the plan started. Refresh to check before trying again.";
    } finally { busy = false; emit(); draw(); }
    if (ok) { try { onAccepted?.(response); } catch { /* host error */ } }
  }

  const row = (label, ok, text) => `<li class="ann-plan-ent" data-on="${ok ? "yes" : "no"}"><span class="ann-plan-mark" aria-hidden="true">${ok ? "+" : "-"}</span><span><span class="ann-sr">${ok ? "Included: " : "Not included: "}</span><strong>${esc(label)}</strong> ${esc(text)}</span></li>`;
  function planCard() {
    const o = offer(), p = ent("published_products"), s = ent("published_skus");
    return `<section class="ann-plan-card" aria-labelledby="ann-plan-name">
      <div class="ann-plan-cardhead"><div><p class="ann-plan-kicker">Starter plan</p><h3 id="ann-plan-name">Free</h3></div>
      <p class="ann-plan-price"><strong>${esc(o.currency === "INR" ? "Rs 0" : "0")}</strong><span>for ${esc(num(o.live_days))} live days</span></p></div>
      <ul class="ann-plan-list">
        ${row("Published products", true, `Up to ${num(p.value)}`)}
        ${row("Published SKUs", true, `Up to ${num(s.value)}`)}
        ${row("Live period", true, `${num(o.live_days)} days, counted from your first successful publication`)}
        ${row("Payment", true, "No card needed and no automatic charge")}
        ${row("LeBrands.Space placement", false, "Not included")}
        ${row("Custom domain", false, "Not included")}
      </ul></section>`;
  }
  function subCard(sub) {
    const st = sub.effective_status || sub.status;
    return `<section class="ann-plan-card" aria-labelledby="ann-plan-name"><div class="ann-plan-cardhead"><div><p class="ann-plan-kicker">Current plan</p><h3 id="ann-plan-name">${esc(String(sub.plan || "").replace(/^./, c => c.toUpperCase()))}</h3></div>
      <p class="ann-plan-badge" data-s="${esc(st)}">${esc(String(st || "").replace(/_/g, " "))}</p></div>
      <dl class="ann-plan-dl">${sub.status && sub.status !== st ? `<div><dt>Recorded status</dt><dd>${esc(String(sub.status).replace(/_/g, " "))}</dd></div>` : ""}
      ${[["accepted_at","Plan accepted"],["free_live_started_at","First publication"],["free_expires_at","Free live period ends"]].filter(([k]) => sub[k]).map(([k,label]) => `<div><dt>${esc(label)}</dt><dd>${esc(new Date(sub[k]).toLocaleString())}</dd></div>`).join("")}</dl>
      ${sub.status==="building"?'<p class="ann-plan-note">Your 30 live days have not started. They begin at your first successful publication.</p>':""}</section>`;
  }
  function body() {
    if (loading && !response) return `<div class="ann-plan-skel" role="status" aria-label="Loading plan details"><i></i><i></i><i></i></div>`;
    let h = "";
    if (error) h += `<p class="ann-plan-error" role="alert" id="ann-plan-error">${esc(error)}</p>`;
    if (note) h += `<p class="ann-plan-ok" role="status">${esc(note)}</p>`;
    if (!response) return h;
    const r = response;
    if (r.subscription) {
      h += subCard(r.subscription);
      if (!accepted) h += `<p class="ann-plan-note">This store already has a plan, so no second plan can be added. Nothing was changed.</p>`;
      else h += `<p class="ann-plan-note">The Free live period starts at your first successful publication. Nothing was charged.</p>`;
      return h;
    }
    if (canAccept()) {
      h += planCard();
      h += `<label class="ann-plan-agree"><input type="checkbox" data-plan="agree"${agreed ? " checked" : ""}${busy || loading ? " disabled" : ""}><span>I accept the Free plan terms (version ${esc(offer().terms_version)}) listed above.</span></label>`;
    } else {
      if (offerValid() && !isOwner()) h += planCard();
      const msg = r.reason === "available" ? "The Free plan offer could not be verified, so it cannot be started." : (REASONS[r.reason] || "The Free plan cannot be started for this store right now.");
      if (!isOwner() && r.reason === "available") h += `<p class="ann-plan-note">Only the store owner can choose a plan. Ask the owner to continue.</p>`;
      else h += `<p class="ann-plan-callout" role="status">${esc(msg)} No changes were made.</p>`;
    }
    h += `<p class="ann-plan-later">Paid plans will be offered here later. Nothing paid can be bought today.</p>`;
    return h;
  }
  function draw() {
    if (!dlg) return;
    const a = document.activeElement, keep = dlg.contains(a) ? a.dataset?.plan || a.dataset?.a : null;
    const showStart = canAccept() && !response.subscription;
    const name = (() => { try { return getStoreName?.() || ""; } catch { return ""; } })();
    dlg.innerHTML = `<div class="ann-plan-head"><div><p class="ann-plan-kicker">Step: choose a plan</p><h2 id="ann-plan-title">Choose a plan${name ? ` for ${esc(name)}` : ""}</h2></div>
      <button type="button" class="ann-plan-x" data-a="close" aria-label="Close plan selection"${busy ? " disabled" : ""}>&times;</button></div>
      <div class="ann-plan-body" aria-busy="${loading || busy}">${body()}</div>
      <div class="ann-plan-foot">
        ${busy ? `<p class="ann-plan-state" role="status">Starting your Free plan. Please wait.</p>` : loading && response ? `<p class="ann-plan-state" role="status">Refreshing plan details.</p>` : `<p class="ann-plan-state"></p>`}
        <div class="ann-plan-btns">
        ${!response && !loading || (error && !busy) ? `<button type="button" class="ann-btn alt" data-a="retry"${loading ? " disabled" : ""}>${response ? "Refresh" : "Try again"}</button>` : ""}
        <button type="button" class="ann-btn alt" data-a="close"${busy ? " disabled" : ""}>${accepted ? "Continue" : "Close without choosing"}</button>
        ${showStart ? `<button type="button" class="ann-btn" data-a="accept" data-plan="accept"${!agreed || busy || loading ? " disabled" : ""}>${busy ? "Starting..." : "Start Free plan"}</button>` : ""}
        </div></div>`;
    if (keep) { const el = dlg.querySelector(`[data-plan="${keep}"],[data-a="${keep}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); else if (document.activeElement === document.body) dlg.focus(); }
    else if (document.activeElement === document.body || !dlg.contains(document.activeElement)) dlg.focus({ preventScroll: true });
  }

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "ann-plan-dialog"; dlg.setAttribute("aria-labelledby", "ann-plan-title"); dlg.setAttribute("aria-modal", "true"); dlg.tabIndex = -1;
    dlg.addEventListener("cancel", e => { e.preventDefault(); if (!busy) close(); });
    dlg.addEventListener("mousedown", e => { if (e.target === dlg && !busy) close(); });
    dlg.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const n = [...dlg.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
      if (!n.length) { e.preventDefault(); dlg.focus(); return; }
      const f = n[0], l = n[n.length - 1], c = document.activeElement;
      if (e.shiftKey && (c === f || c === dlg)) { e.preventDefault(); l.focus(); }
      else if (!e.shiftKey && c === l) { e.preventDefault(); f.focus(); }
    });
    dlg.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === "close") close(); else if (a === "retry") void load(); else if (a === "accept") void accept();
    });
    dlg.addEventListener("change", e => {
      if (e.target.dataset?.plan !== "agree" || busy) return;
      agreed = e.target.checked; emit(); draw();
    });
    document.body.appendChild(dlg);
  }

  function open() {
    if (dlg) { void load(); return; }
    opener = document.activeElement; agreed = false; accepted = false; note = ""; error = ""; response = null; opened = true;
    build(); dlg.dataset.motion = reduced() ? "none" : "ok";
    draw(); dlg.showModal(); emit();
    void load();
  }
  function close() {
    if (busy || !dlg) return;
    seq++; ctl?.abort(); ctl = null; loading = false;
    if (dlg.open) dlg.close();
    dlg.remove(); dlg = null; opened = false; agreed = false; note = "";
    const o = opener; opener = null;
    try { if (o?.isConnected) o.focus?.(); } catch { /* focus */ }
    emit();
  }

  return {
    load, open, close,
    getState: () => ({ loading, busy, error, response, opened }),
    hasUnsavedChanges: () => busy || (opened && agreed),
  };
}
