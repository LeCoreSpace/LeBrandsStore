const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/;
const when = v => { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); };

export function attachAnnLaunch({ api, readOnly, onSaved }) {
  let state = null, loading = false, loadError = "", busy = "", stale = false;
  const msgs = {}, open = { 1: true, 2: false, 3: false };
  let prefs = null, prefsDirty = false;
  // Drafts live only in memory. Values are applied to inputs as DOM properties, never written into HTML.
  const draftVals = { host: "", "rz.key_id": "", "rz.key_secret": "", "rz.webhook_secret": "", "sr.email": "", "sr.password": "" };
  let ack = false, confirmDisc = "", confirmRemove = false;
  const slot = () => document.querySelector("#ann-launch-slot");
  const storeId = (String(api).match(/\/api\/stores\/([^/]+)\/ann/) || [])[1];
  const checkoutHref = storeId ? `/stores/${encodeURIComponent(storeId)}/settings/checkout` : "";
  const canEdit = () => !readOnly && !!state?.can_edit;
  const hasCreds = () => Object.values(draftVals).some(Boolean);
  const v = k => draftVals[k].trim();
  const hostOk = () => HOST.test(v("host").toLowerCase());
  const domVerified = () => { const d = state?.domain, p = state?.platform; return !!d && d.hostname_status === "active" && d.ssl_status === "active" && !!p?.domain_activation_available; };
  const domLive = () => state?.domain?.status === "active";

  async function request(method, body) {
    const res = await fetch(`${api}/launch`, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await res.json().catch(() => ({}));
    return { res, result };
  }
  function take(r) { state = r; if (!prefsDirty) prefs = { ...r.preferences }; }
  async function load() {
    if (loading) return;
    loading = true; loadError = ""; draw();
    try {
      const { res, result } = await request("GET");
      if (!res.ok) throw new Error(result.error || "Could not load launch setup.");
      take(result); stale = false;
    } catch (e) { loadError = e.message; }
    finally { loading = false; draw(); }
  }
  async function act(key, fields, onOk) {
    if (!canEdit() || busy || loading || !state) return;
    busy = key; msgs[key] = null; draw();
    try {
      const { res, result } = await request("PATCH", { expected_revision: state.revision, confirm: true, ...fields });
      if (res.status === 409) {
        stale = true;
        try { const g = await request("GET"); if (g.res.ok) take(g.result); } catch { /* keep old */ }
        throw new Error(result.error || "Setup changed elsewhere. Status was refreshed and your entries are kept. Nothing was saved.");
      }
      if (!res.ok) throw new Error([result.error || "Could not save. Your entries are kept.", ...Object.values(result.errors || {})].join(" "));
      take(result); stale = false;
      onOk?.();
      msgs[key] = { ok: true, text: "Saved." };
      try { onSaved?.(result); } catch { /* host error */ }
    } catch (e) { msgs[key] = { text: e.message }; }
    finally { busy = ""; draw(); }
  }

  const off = x => !canEdit() || !!busy || loading || !!x;
  const dis = x => off(x) ? " disabled" : "";
  const msg = k => msgs[k] ? `<p class="${msgs[k].ok ? "ann-callout" : "ann-error"}" role="${msgs[k].ok ? "status" : "alert"}">${esc(msgs[k].text)}</p>` : "";
  const inp = (k, label, t = "text") => `<label class="ann-field">${esc(label)}<input data-ln="${k}" type="${t}" autocomplete="${t === "password" ? "new-password" : "off"}" autocapitalize="none" spellcheck="false"${dis()}></label>`;
  function opts(group, items) {
    return `<div class="ann-chips stack" role="group" aria-label="${esc(group)}">${items.map(([val, t, d]) => `<button type="button" class="ann-chip" data-pref="${group}" data-v="${val}" aria-pressed="${prefs[group] === val}"${dis()}><strong>${esc(t)}</strong><span>${esc(d)}</span></button>`).join("")}</div>`;
  }
  function step(n, title, status, body) {
    return `<details class="ann-review-step ann-launch-step" data-step="${n}"${open[n] ? " open" : ""}><summary>${n}. ${esc(title)} <span class="ann-launch-st">${esc(status)}</span></summary>${body}</details>`;
  }
  const saveRow = () => `${msg("choose")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="choose"${dis(!prefsDirty)}>${busy === "choose" ? "Saving" : "Save my choices"}</button></div><p class="ann-note">Saving choices records your preferences only. It does not turn on online checkout or automatic shipping.</p>`;

  function html() {
    const head = `<h2>Launch setup</h2><p class="ann-note">Every step is optional. You can skip all of this and come back later.</p>`;
    if (loading && !state) return `${head}<div class="ann-skel" aria-busy="true"><i></i><i></i><i></i></div>`;
    if (!state) return `${head}${loadError ? `<p class="ann-error" role="alert">${esc(loadError)}</p>` : ""}<button type="button" class="ann-btn" data-ln-a="load">${loadError ? "Try again" : "Load launch setup"}</button>`;
    const s = state, p = s.providers || {}, d = s.domain, plat = s.platform || {};
    const rzp = p.razorpay || {}, shp = p.shiprocket || {};
    const own = canEdit() ? "" : `<p class="ann-callout">Only the store owner can change these settings.</p>`;

    // Step 1: store address and domain
    const addr = opts("address", [["included", "Use the address that comes with your store", "Nothing to set up."], ["custom", "Use my own domain", "For example www.yourbrand.com. Add it below and point your DNS records at it."]]);
    let dom;
    if (!d) {
      dom = plat.domains_available
        ? `<p class="ann-note">Enter a subdomain such as www.yourbrand.com. Bare domains like yourbrand.com are not supported.</p>${inp("host", "Domain")}${msg("dom")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="dadd"${dis(!hostOk())}>Add domain</button></div>`
        : `<p class="ann-note">Custom domains are not available yet. Your store keeps its included address.</p>`;
    } else {
      const live = domLive();
      const notes = [];
      if (!plat.domains_available) notes.push("Domain setup is not available on this platform right now. You can still check the status below.");
      if (!live && !domVerified()) notes.push(plat.domain_activation_available ? "Activation unlocks once the hostname and SSL are both active." : "Activation is not available on this platform right now.");
      dom = `<p><strong>${esc(d.hostname)}</strong> <span class="ann-launch-st">${esc(d.status)}${d.primary ? ", primary" : ""}</span></p><p class="ann-note">Hostname: ${esc(d.hostname_status)}. SSL: ${esc(d.ssl_status)}.</p>${(d.dns_records || []).length ? `<ul class="ann-launch-dns">${d.dns_records.map(r => `<li><b>${esc(r.type)}</b> ${esc(r.name)} <code>${esc(r.value)}</code></li>`).join("")}</ul>` : ""}${notes.map(n => `<p class="ann-note">${esc(n)}</p>`).join("")}${live ? `<p class="ann-callout">This domain is active.</p>` : `<label class="ann-check"><input type="checkbox" data-ln-ack${ack ? " checked" : ""}${dis()}><span>If I use an online payment provider, I have approved this domain there.</span></label>`}${msg("dom")}${confirmRemove ? `<div class="ann-conflict" role="alertdialog"><p>Remove ${esc(d.hostname)}? This turns off the route for your store only. Nothing is deleted at your domain host or payment provider.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="drem-yes"${dis()}>Yes, remove</button><button type="button" class="ann-btn alt sm" data-ln-a="drem-no">Keep domain</button></div></div>` : ""}<div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="dchk"${dis()}>Check status</button>${live ? "" : `<button type="button" class="ann-btn sm" data-ln-a="dact"${dis(!domVerified() || !ack)}>Activate</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="drem"${dis(confirmRemove)}>Remove</button></div>`;
    }
    const s1 = `${own}${addr}${dom}${saveRow()}`;

    // Step 2: payments
    const pay = opts("payments", [["cod", "Cash on delivery", "Available once you enable it in checkout settings."], ["razorpay", "Online payments with Razorpay", "Optional. Verify your account below."]]);
    const rzTime = when(rzp.checked_at);
    const rzBlock = `<h3>Razorpay</h3>` + (rzp.verified
      ? `<p class="ann-callout">Account verified${rzp.mode ? ` (${esc(rzp.mode)} mode)` : ""}${rzTime ? `, checked ${esc(rzTime)}` : ""}. ${rzp.runtime_ready ? "" : "Online checkout is not enabled yet."}</p><div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="razorpay"${dis(!!confirmDisc)}>Disconnect</button></div>`
      : `<p class="ann-note">Paste keys from your Razorpay dashboard. They are sent once and are never kept in this page after saving.</p>${inp("rz.key_id", "Key ID")}${inp("rz.key_secret", "Key secret", "password")}${inp("rz.webhook_secret", "Webhook secret", "password")}${msg("rz")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="rz"${dis(!v("rz.key_id") || !draftVals["rz.key_secret"] || !draftVals["rz.webhook_secret"])}>${busy === "rz" ? "Checking" : "Verify account"}</button></div>`);
    const s2 = `${own}${pay}${rzBlock}${msg("disc-razorpay")}${confirmDisc === "razorpay" ? discBox() : ""}${checkoutHref ? `<p class="ann-note">Turn cash on delivery on in <a href="${esc(checkoutHref)}">checkout settings</a>.</p>` : ""}${saveRow()}`;

    // Step 3: delivery
    const del = opts("delivery", [["manual", "I ship orders myself", "Your real readiness may still need delivery charges set in checkout settings."], ["shiprocket", "Shiprocket", "Optional. Verify your account below."]]);
    const srTime = when(shp.checked_at);
    const srBlock = `<h3>Shiprocket</h3>` + (shp.verified
      ? `<p class="ann-callout">Account verified${shp.pickup_count != null ? `, ${esc(shp.pickup_count)} pickup location(s)` : ""}${srTime ? `, checked ${esc(srTime)}` : ""}. ${shp.runtime_ready ? "" : "Automatic shipping is not enabled yet."}</p><div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="shiprocket"${dis(!!confirmDisc)}>Disconnect</button></div>`
      : `<p class="ann-note">Use an API user email and password, not your main Shiprocket login.</p>${inp("sr.email", "API user email", "email")}${inp("sr.password", "API user password", "password")}${msg("sr")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="sr"${dis(!v("sr.email") || !draftVals["sr.password"])}>${busy === "sr" ? "Checking" : "Verify account"}</button></div>`);
    const s3 = `${own}${del}${srBlock}${confirmDisc === "shiprocket" ? discBox() : ""}${saveRow()}`;

    function discBox() { return `<div class="ann-conflict" role="alertdialog"><p>Disconnect ${esc(confirmDisc)}? Its saved credentials are removed.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="disc-yes"${dis()}>Yes, disconnect</button><button type="button" class="ann-btn alt sm" data-ln-a="disc-no">Keep connected</button></div></div>`; }

    return `${head}${stale || loadError ? `<div class="ann-conflict" role="alert"><p>${esc(loadError || "Status was refreshed. Your entries are kept.")}</p></div>` : ""}${step(1, "Where should customers find your store?", d ? `${d.hostname}: ${d.status}` : prefs.address === "custom" ? "own domain chosen" : "included address", s1)}${step(2, "How would you like to get paid?", `${prefs.payments === "razorpay" ? "Razorpay" : "Cash on delivery"}${rzp.verified ? ", account verified" : ""}`, s2)}${step(3, "How will you send your orders?", `${prefs.delivery === "shiprocket" ? "Shiprocket" : "Manual shipping"}${shp.verified ? ", account verified" : ""}`, s3)}<div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="reload"${busy || loading ? " disabled" : ""}>Reload status</button></div>`;
  }

  // Button enabled states that depend on typed drafts, updated without redrawing.
  function sync() {
    const n = slot(); if (!n) return;
    const set = (a, bad) => { const b = n.querySelector(`[data-ln-a="${a}"]`); if (b) b.disabled = off(bad); };
    set("dadd", !hostOk());
    set("rz", !v("rz.key_id") || !draftVals["rz.key_secret"] || !draftVals["rz.webhook_secret"]);
    set("sr", !v("sr.email") || !draftVals["sr.password"]);
  }
  function draw() {
    const n = slot(); if (!n) return;
    const a = document.activeElement, k = n.contains(a) ? a.dataset?.ln : null;
    const sel = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    const top = n.scrollTop;
    n.innerHTML = html();
    n.querySelectorAll("input[data-ln]").forEach(el => { el.value = draftVals[el.dataset.ln] ?? ""; });
    if (k) { const el = n.querySelector(`[data-ln="${k}"]`); if (el && !el.disabled) { el.focus({ preventScroll: true }); try { if (sel) el.setSelectionRange(...sel); } catch { /* not text */ } } }
    n.scrollTop = top;
  }
  function reload() {
    if (busy || loading) return;
    if (hasCreds() && !window.confirm("Reloading refreshes status and keeps what you typed. Continue?")) return;
    void load();
  }
  const clear = ks => ks.forEach(k => { draftVals[k] = ""; });
  document.addEventListener("click", e => {
    const n = slot(); if (!n || !n.contains(e.target)) return;
    const b = e.target.closest("button[data-ln-a],button[data-pref]"); if (!b) return;
    e.preventDefault();
    if (b.disabled) return;
    if (b.dataset.pref) { if (canEdit() && !busy && !loading) { prefs[b.dataset.pref] = b.dataset.v; prefsDirty = true; draw(); } return; }
    const a = b.dataset.lnA, id = state?.domain?.id;
    if (a === "load") void load();
    else if (a === "reload") reload();
    else if (!canEdit()) return;
    else if (a === "choose") void act("choose", { action: "choose", preferences: { ...prefs } }, () => { prefsDirty = false; prefs = { ...state.preferences }; });
    else if (a === "rz") { if (v("rz.key_id") && draftVals["rz.key_secret"] && draftVals["rz.webhook_secret"]) void act("rz", { action: "razorpay-connect", credentials: { key_id: v("rz.key_id"), key_secret: draftVals["rz.key_secret"], webhook_secret: draftVals["rz.webhook_secret"] } }, () => clear(["rz.key_id", "rz.key_secret", "rz.webhook_secret"])); }
    else if (a === "sr") { if (v("sr.email") && draftVals["sr.password"]) void act("sr", { action: "shiprocket-connect", credentials: { email: v("sr.email"), password: draftVals["sr.password"] } }, () => clear(["sr.email", "sr.password"])); }
    else if (a === "disc") { confirmDisc = b.dataset.p; draw(); }
    else if (a === "disc-no") { confirmDisc = ""; draw(); }
    else if (a === "disc-yes") { const pr = confirmDisc; confirmDisc = ""; if (pr) void act("disc-" + pr, { action: "disconnect", provider: pr }); }
    else if (a === "dadd") { if (hostOk()) void act("dom", { action: "domain-add", hostname: v("host").toLowerCase() }, () => clear(["host"])); }
    else if (a === "dchk" && id) void act("dom", { action: "domain-check", id });
    else if (a === "dact" && id && ack && domVerified() && !domLive()) void act("dom", { action: "domain-activate", id, provider_domain_confirmed: true }, () => { ack = false; });
    else if (a === "drem") { confirmRemove = true; draw(); }
    else if (a === "drem-no") { confirmRemove = false; draw(); }
    else if (a === "drem-yes" && id) { confirmRemove = false; void act("dom", { action: "domain-remove", id }, () => { ack = false; }); }
  });
  document.addEventListener("input", e => {
    const t = e.target, k = t.dataset?.ln; if (!k || !(k in draftVals) || !slot()?.contains(t)) return;
    draftVals[k] = t.value;
    sync();
  });
  document.addEventListener("change", e => {
    const t = e.target; if (!slot()?.contains(t) || !("lnAck" in t.dataset)) return;
    ack = t.checked; draw();
  });
  document.addEventListener("toggle", e => {
    const t = e.target; if (t?.dataset?.step && slot()?.contains(t)) open[t.dataset.step] = t.open;
  }, true);
  document.addEventListener("submit", e => { if (slot()?.contains(e.target)) e.preventDefault(); });

  return {
    mount() { if (!slot()) return; if (!state && !loading && !loadError) void load(); else draw(); },
    hasUnsavedChanges: () => !!busy || prefsDirty || hasCreds(),
  };
}
