import {registerLeaveGuard} from "./catalogue-confirm.js";
const root = document.querySelector("[data-mi-root]");
if (root) init();

function init() {
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  let state = JSON.parse(document.getElementById("marketing-integrations-data").textContent || "{}");
  const base = `/api/stores/${encodeURIComponent(state.store_id)}/marketing-integrations`;
  const form = $("[data-form]"), banner = $("[data-banner]"), saveBtn = $("[data-save]"), testBtn = $("[data-test-meta]");
  const tokenIn = $("[data-token]"), removeIn = $("[data-remove-token]");
  const live = $("[data-live]");
  const fields = $$("[data-field]");
  const bools = ["meta_enabled", "google_enabled", "google_enhanced_conversions"];
  let saving = false, testing = false, conflict = false;
  const el = (k) => root.querySelector(`[data-field="${k}"]`);
  const err = (k) => root.querySelector(`[data-error="${k}"]`);

  function fill() {
    for (const f of fields) {
      const k = f.dataset.field;
      if (bools.includes(k)) f.checked = state.settings[k] === true; else f.value = state.settings[k] || "";
    }
    tokenIn.value = ""; removeIn.checked = false;
    clearErrors(); refresh();
  }
  function draft() {
    const s = {};
    for (const f of fields) { const k = f.dataset.field; s[k] = bools.includes(k) ? f.checked : f.value.trim(); }
    return s;
  }
  function isDirty() {
    const d = draft();
    return Object.keys(d).some((k) => d[k] !== (bools.includes(k) ? state.settings[k] === true : state.settings[k] || "")) || tokenIn.value !== "" || removeIn.checked;
  }
  function clearErrors() { $$("[data-error]").forEach((e) => { e.hidden = true; e.textContent = ""; }); $$("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid")); }
  function setErr(k, msg) {
    const e = err(k); if (!e) return false;
    e.textContent = msg; e.hidden = false;
    const i = k === "meta_capi_token" ? tokenIn : el(k); if (i) i.setAttribute("aria-invalid", "true");
    return true;
  }
  function show(kind, msg, action) {
    banner.hidden = false; banner.dataset.kind = kind; banner.textContent = "";
    const t = document.createElement("span"); t.textContent = msg; banner.append(t);
    if (action) { const b = document.createElement("button"); b.type = "button"; b.className = "lb-button lb-button-small lb-button-outline"; b.textContent = action.label; b.addEventListener("click", action.run); banner.append(b); }
    banner.setAttribute("role", kind === "error" ? "alert" : "status");
  }
  const hide = () => { banner.hidden = true; };

  function validate(d) {
    const e = {};
    const meta = (k, re, msg) => { if (d[k] && !re.test(d[k])) e[k] = msg; };
    meta("meta_pixel_id", /^\d{15,16}$/, "Pixel ID must be 15 or 16 digits.");
    meta("ga4_measurement_id", /^G-[A-Za-z0-9]+$/, "Use the format G- followed by letters and numbers.");
    meta("google_ads_id", /^AW-\d+$/, "Use the format AW- followed by digits.");
    if (d.meta_enabled && !d.meta_pixel_id) e.meta_pixel_id = "Enter a Pixel ID to enable Meta.";
    if (d.google_enabled && !d.ga4_measurement_id) e.ga4_measurement_id = "Enter a GA4 Measurement ID to enable Google.";
    if (d.google_enhanced_conversions) {
      if (!d.google_ads_id) e.google_ads_id = e.google_ads_id || "Enhanced conversions need a Google Ads ID.";
      if (!d.google_label_purchase) e.google_label_purchase = "Enhanced conversions need a purchase conversion label.";
    }
    if (removeIn.checked && tokenIn.value) e.meta_capi_token = "Enter a new token or remove the saved one, not both.";
    return e;
  }

  function statusOf(prefix) {
    const s = state.settings;
    const ok = prefix === "meta" ? /^\d{15,16}$/.test(s.meta_pixel_id) : /^G-[A-Za-z0-9]+$/.test(s.ga4_measurement_id);
    if (!s[prefix + "_enabled"]) return ["off", "Not enabled"];
    return ok ? ["ok", "Configured"] : ["warn", "Needs an ID"];
  }
  function testReason() {
    const s = state.settings;
    if (!state.can_edit) return "Only owners and admins can send tests.";
    if (!s.meta_enabled) return "Save with Meta enabled first.";
    if (!state.meta_token_hint) return "Save an access token first.";
    if (!s.meta_test_event_code) return "Save a test event code first.";
    return "";
  }
  function refresh() {
    for (const p of ["meta", "google"]) { const [tone, label] = statusOf(p); const b = root.querySelector(`[data-status-for="${p}"]`); b.dataset.tone = tone; b.textContent = label; }
    const ro = !state.can_edit;
    $("[data-readonly]").hidden = !ro;
    fields.forEach((f) => (f.disabled = ro)); tokenIn.disabled = ro; removeIn.disabled = ro;
    saveBtn.hidden = ro; const dirty = isDirty();
    $("[data-dirty]").hidden = !dirty || ro; $("[data-discard]").hidden = !dirty || ro;
    $("[data-token-hint]").textContent = state.meta_token_hint ? `Saved token ending in ${state.meta_token_hint}. The token is never shown again.` : "No token saved. Needed for server events.";
    $("[data-remove-wrap]").hidden = !state.meta_token_hint || ro;
    const d = draft(); $("[data-primary-warning]").hidden = !(d.google_label_purchase && d.ga4_measurement_id);
    const why = testReason(); testBtn.disabled = !!why || testing || saving;
    $("[data-test-why]").textContent = why;
    saveBtn.disabled = saving; saveBtn.textContent = saving ? "Saving..." : "Save settings";
    testBtn.textContent = testing ? "Sending..." : "Send test server event";
    form.setAttribute("aria-busy", saving ? "true" : "false");
  }

  async function api(path, opts) {
    const res = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, ...opts });
    let body = {}; try { body = await res.json(); } catch {}
    return { res, body };
  }
  function adopt(b) {
    state = { ...state, settings: b.settings || state.settings, can_edit: b.can_edit === true, revision: b.revision, meta_token_hint: b.meta_token_hint || "", storefront_url: b.storefront_url ?? null };
    const sf = $("[data-storefront]");
    if (state.storefront_url) {
      sf.textContent = "Tags load on "; const a = document.createElement("a"); a.className = "lb-inline-link"; a.target = "_blank"; a.rel = "noopener";
      try { a.href = new URL(state.storefront_url).href; } catch { a.href = "#"; } a.textContent = state.storefront_url;
      sf.append(a, " once saved and enabled.");
    } else sf.textContent = "Your storefront is not live yet. Settings can be saved now and tags start loading when the store goes live.";
  }
  async function reload() {
    show("info", "Loading the latest settings...");
    try {
      const { res, body } = await api(base, { method: "GET" });
      if (!res.ok) throw new Error(body.error || "Could not load settings.");
      adopt(body); conflict = false; fill(); show("success", "Latest settings loaded. Your earlier edits were discarded.");
    } catch (x) { show("error", x.message || "Could not load settings.", { label: "Try again", run: reload }); }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (saving || !state.can_edit) return;
    clearErrors(); hide();
    const d = draft(), v = validate(d);
    if (Object.keys(v).length) {
      Object.entries(v).forEach(([k, m]) => setErr(k, m));
      show("error", "Fix the highlighted fields and save again.");
      const first = root.querySelector('[aria-invalid="true"]'); if (first) { const det = first.closest("details"); if (det) det.open = true; first.focus(); }
      return;
    }
    const payload = { settings: d, expected_revision: state.revision };
    if (tokenIn.value.trim()) payload.meta_capi_token = tokenIn.value.trim();
    if (removeIn.checked) payload.remove_meta_capi_token = true;
    saving = true; refresh();
    try {
      const { res, body } = await api(base, { method: "POST", body: JSON.stringify(payload) });
      if (res.status === 409) {
        conflict = true;
        show("error", body.error || "These settings were changed by someone else. Your edits are still here and were not saved.", { label: "Discard my edits and reload", run: reload });
      } else if (!res.ok) {
        const fe = body.fields || {}; let placed = false;
        for (const [k, m] of Object.entries(fe)) { if (setErr(k, String(m))) { placed = true; const det = (el(k) || tokenIn).closest("details"); if (det) det.open = true; } }
        show("error", body.error || "Settings could not be saved.", { label: "Try again", run: () => form.requestSubmit() });
        if (placed) { const f = root.querySelector('[aria-invalid="true"]'); if (f) f.focus(); }
      } else {
        adopt(body); fill(); show("success", "Settings saved. They are Configured, not yet verified by Meta or Google."); live.textContent = "Settings saved.";
      }
    } catch { show("error", "Network problem. Your edits are kept.", { label: "Try again", run: () => form.requestSubmit() }); }
    saving = false; refresh();
  });

  testBtn.addEventListener("click", async () => {
    const out = $("[data-test-result]"); out.hidden = true;
    if (testReason() || testing) return;
    testing = true; refresh();
    let kind = "error", msg = "The test could not be sent.";
    try {
      const { res, body } = await api(base + "/test-meta", { method: "POST", body: "{}" });
      if (res.ok) { kind = body.warning || body.status === "warning" ? "warn" : "success"; msg = body.message || body.warning || "Test event sent. Check Test events in Events Manager."; }
      else msg = body.error || body.message || msg;
    } catch { msg = "Network problem. Try the test again."; }
    out.dataset.kind = kind; out.textContent = msg; out.hidden = false;
    testing = false; refresh();
  });

  root.querySelector("[data-discard]").addEventListener("click", () => { fill(); hide(); });
  form.addEventListener("input", refresh); form.addEventListener("change", refresh);
  registerLeaveGuard(()=>isDirty()||saving||testing);
  fill();
}
