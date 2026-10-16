const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/;
const when = v => { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); };

export function attachAnnLaunch({ api, readOnly, onSaved, onDone }) {
  let state = null, loading = false, loadError = "", busy = "", stale = false;
  const msgs = {}, open = { 1: true, 2: false, 3: false };
  let prefs = null, prefsDirty = false;
  // Drafts live only in memory. Values are applied to inputs as DOM properties, never written into HTML.
  const draftVals = { host: "", "rz.key_id": "", "rz.key_secret": "", "rz.webhook_secret": "", "sr.email": "", "sr.password": "", "ship.pickup": "", "ship.weight": "", "ship.length": "", "ship.breadth": "", "ship.height": "", "ship.units": "", "ship.freight": "" };
  let shipAuto = false, refreshing = false; const absence = {};
  let shipDirty = false, ackPay = false, ackShip = false;
  let ack = false, confirmDisc = "", confirmRemove = false;
  const slot = () => document.querySelector("#ann-launch-slot");
  const storeId = (String(api).match(/\/api\/stores\/([^/]+)\/ann/) || [])[1];
  const checkoutHref = storeId ? `/stores/${encodeURIComponent(storeId)}/settings/checkout` : "";
  const canEdit = () => !readOnly && !!state?.can_edit;
  const hasCreds = () => Object.entries(draftVals).some(([k, x]) => !k.startsWith("ship.") && Boolean(x));
  function seedShip() {
    const sh = state?.providers?.shiprocket?.shipping; if (shipDirty || !sh) return;
    shipAuto = !!sh.auto_pickup;
    Object.assign(draftVals, { "ship.pickup": sh.pickup_location || "", "ship.weight": String(sh.weight_kg ?? ""), "ship.length": String(sh.length_cm ?? ""), "ship.breadth": String(sh.breadth_cm ?? ""), "ship.height": String(sh.height_cm ?? ""), "ship.units": String(sh.max_units ?? ""), "ship.freight": sh.max_freight_paise != null ? String(sh.max_freight_paise / 100) : "" });
  }
  function shipPayload() {
    const locs = state?.providers?.shiprocket?.pickup_locations || [];
    const loc = locs.find(l => l.name === draftVals["ship.pickup"]);
    if (!loc) return { error: "Choose a pickup location from your Shiprocket account." };
    const pos = k => { const t = draftVals[k].trim(), x = Number(t); return t && Number.isFinite(x) && x > 0 ? x : null; };
    const w = pos("ship.weight"), l = pos("ship.length"), b = pos("ship.breadth"), h = pos("ship.height"), u = Number(draftVals["ship.units"].trim());
    if (!w || !l || !b || !h) return { error: "Enter weight and package size as numbers above zero." };
    if (!draftVals["ship.units"].trim() || !Number.isInteger(u) || u < 1) return { error: "Maximum units must be a whole number of at least 1." };
    const fr = draftVals["ship.freight"].trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(fr) || Number(fr) <= 0) return { error: "Maximum freight must be an amount in rupees above zero, up to two decimals." };
    return { shipping: { pickup_location: loc.name, pickup_pincode: loc.pincode, weight_kg: w, length_cm: l, breadth_cm: b, height_cm: h, max_units: u, max_freight_paise: Math.round(Number(fr) * 100), auto_pickup: shipAuto } };
  }
  const v = k => draftVals[k].trim();
  const hostOk = () => HOST.test(v("host").toLowerCase());
  const domVerified = () => { const d = state?.domain, p = state?.platform; return !!d && d.hostname_status === "active" && d.ssl_status === "active" && !!p?.domain_activation_available; };
  const domLive = () => state?.domain?.status === "active";

  async function request(method, body) {
    const res = await fetch(`${api}/launch`, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await res.json().catch(() => ({}));
    return { res, result };
  }
  function take(r) { state = r; if (!prefsDirty) prefs = { ...r.preferences }; seedShip(); }
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
  const num = (k, label) => `<label class="ann-field">${esc(label)}<input data-ln="${k}" type="text" inputmode="decimal" autocomplete="off"${dis()}></label>`;
  function opts(group, items) {
    return `<div class="ann-chips stack" role="group" aria-label="${esc(group)}">${items.map(([val, t, d]) => {
      const unavailable=group==="address" && val==="custom" && !state?.platform?.domains_available && !state?.domain;
      const description=unavailable?"Not available yet. Platform domain setup is needed first.":d;
      return `<button type="button" class="ann-chip ann-launch-option" data-pref="${group}" data-v="${val}" aria-pressed="${prefs[group] === val}"${unavailable?' aria-disabled="true"':""}${dis(unavailable)}><strong>${esc(t)}</strong><span>${esc(description)}</span></button>`;
    }).join("")}</div>`;
  }
  function step(n, title, status, body) {
    if(n===1 && !state?.domain) status="Included address ready";
    return `<details class="ann-review-step ann-launch-step" data-step="${n}"${open[n] ? " open" : ""}><summary>${n}. ${esc(title)} <span class="ann-launch-st">${esc(status)}</span></summary>${body}</details>`;
  }
  const saveRow = next => `${msg("choose")}<div class="ann-actions ann-launch-actions"><button type="button" class="ann-btn alt sm" data-ln-a="choose"${dis(!prefsDirty)}>${busy === "choose" ? "Saving" : "Save my choices"}</button><button type="button" class="ann-btn sm" data-ln-a="next" data-next="${next}"${dis()}>${prefsDirty?"Save and continue":next===2?"Continue to payments":next===3?"Continue to delivery":"Return to store review"}</button></div><p class="ann-note">Saving choices does not activate a service. Use Continue to move on; you can keep these defaults.</p>`;
  function advance(next) {
    const move=()=>{
      if(next<=3) {
        open[next-1]=false;open[next]=true;
        setTimeout(()=>{
          const summary=slot()?.querySelector(`[data-step="${next}"] > summary`);
          summary?.focus({preventScroll:true});summary?.scrollIntoView({block:"nearest"});
        },0);
      } else {
        msgs.choose={ok:true,text:"Your preferences are ready. Review your store checks before publishing. This step does not activate services."};
        onDone?.();
      }
    };
    if(prefsDirty) void act("choose",{action:"choose",preferences:{...prefs}},()=>{
      prefsDirty=false;prefs={...state.preferences};move();
    });
    else {move();draw();}
  }

  function html() {
    const head = `<h2>Launch setup</h2><p class="ann-note">Every step is optional. You can skip all of this and come back later.</p>`;
    if (loading && !state) return `${head}<div class="ann-skel" aria-busy="true"><i></i><i></i><i></i></div>`;
    if (!state) return `${head}${loadError ? `<p class="ann-error" role="alert">${esc(loadError)}</p>` : ""}<button type="button" class="ann-btn" data-ln-a="load">${loadError ? "Try again" : "Load launch setup"}</button>`;
    const s = state, p = s.providers || {}, d = s.domain, plat = s.platform || {};
    const rzp = p.razorpay || {}, shp = p.shiprocket || {};
    const own = canEdit() ? "" : `<p class="ann-callout">Only the store owner can change these settings.</p>`;

    // Step 1: store address and domain
    const addr = opts("address", [["included", "Use the address that comes with your store", "Nothing to set up."], ["custom", "Use my own domain", "For example www.yourbrand.com. Add it below and point your DNS records at it."]]);
    const diagList = Array.isArray(plat.diagnostics) ? plat.diagnostics : [];
    const diag = diagList.length ? `<ul class="ann-launch-diag" aria-label="Platform readiness">${diagList.map(x => `<li>${esc(x.label)}: <b>${x.complete ? "ready" : "not ready"}</b></li>`).join("")}</ul>` : "";
    let dom;
    if (!d) {
      dom = plat.domains_available
        ? `${diag}<p class="ann-note">Enter a subdomain such as www.yourbrand.com. Bare domains like yourbrand.com are not supported.</p>${inp("host", "Domain")}${msg("dom")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="dadd"${dis(!hostOk())}>Add domain</button></div>`
        : `<p class="ann-callout" role="status">Your included address${s.included_address?` (${esc(s.included_address)})`:""} is ready to use. Custom domains need platform setup first. You can continue to payments now.</p>`;
    } else {
      const live = domLive();
      const notes = [];
      if (!plat.domains_available) notes.push("Domain setup is not available on this platform right now. You can still check the status below.");
      if (!live && !domVerified()) notes.push(plat.domain_activation_available ? "Activation unlocks once the hostname and SSL are both active." : "Activation is not available on this platform right now.");
      dom = `<p><strong>${esc(d.hostname)}</strong> <span class="ann-launch-st">${esc(d.status)}${d.primary ? ", primary" : ""}</span></p><p class="ann-note">Hostname: ${esc(d.hostname_status)}. SSL: ${esc(d.ssl_status)}.</p>${(d.dns_records || []).length ? `<ul class="ann-launch-dns">${d.dns_records.map(r => `<li><b>${esc(r.type)}</b> ${esc(r.name)} <code>${esc(r.value)}</code></li>`).join("")}</ul>` : ""}${notes.map(n => `<p class="ann-note">${esc(n)}</p>`).join("")}${diag}${live ? `<p class="ann-callout">This domain is active.</p>` : `<label class="ann-check"><input type="checkbox" data-ln-ack="dom"${ack ? " checked" : ""}${dis()}><span>If I use an online payment provider, I have approved this domain there.</span></label>`}${msg("dom")}${confirmRemove ? `<div class="ann-conflict" role="alertdialog"><p>Remove ${esc(d.hostname)}? This turns off the route for your store only. Nothing is deleted at your domain host or payment provider.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="drem-yes"${dis()}>Yes, remove</button><button type="button" class="ann-btn alt sm" data-ln-a="drem-no">Keep domain</button></div></div>` : ""}<div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="dchk"${dis()}>Check status</button>${live ? "" : `<button type="button" class="ann-btn sm" data-ln-a="dact"${dis(!domVerified() || !ack)}>Activate</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="drem"${dis(confirmRemove)}>Remove</button></div>`;
    }
    const s1 = `${own}${addr}${dom}${saveRow(2)}`;

    // Step 2: payments
    const pay = opts("payments", [["cod", "Cash on delivery", "Available once you enable it in checkout settings."], ["razorpay", "Online payments with Razorpay", "Optional. Verify your account below."]]);
    const rzTime = when(rzp.checked_at);
    const execOff = s.execution_available === false;
    const execNote = execOff ? `<p class="ann-note">Activation is unavailable until the platform database migration is applied. Ask the platform team. Nothing here has been turned on.</p>` : "";
    const rzOn = !!rzp.runtime_ready, rzLive = rzp.mode === "live";
    const rzNeeds = [!rzLive && "A live-mode key is required to take online payments.", !rzp.webhook_verified && "A signed webhook has not been verified yet."].filter(Boolean);
    const rzVerified = `<p class="ann-callout">Account verified${rzp.mode ? ` (${esc(rzp.mode)} mode)` : ""}${rzTime ? `, checked ${esc(rzTime)}` : ""}. Webhook: ${rzp.webhook_verified ? "verified" : "not verified yet"}. Online checkout: <strong>${rzOn ? "active" : "off"}</strong>.</p>`
      + (rzOn ? "" : `<p class="ann-note">To finish: in your Razorpay dashboard add this webhook URL${rzp.webhook_url ? ` <code>${esc(rzp.webhook_url)}</code>` : " (not provided yet)"} with the events payment.captured, order.paid, payment.failed and refund.processed, using the webhook secret you saved here. Then send a signed test webhook from Razorpay and reload status. Your stored secrets are never shown again.</p>${rzNeeds.map(n => `<p class="ann-note">${esc(n)}</p>`).join("")}${execNote}<label class="ann-check"><input type="checkbox" data-ln-ack="pay"${ackPay ? " checked" : ""}${dis()}><span>Razorpay has approved my KYC and this domain for live payments.</span></label>`)
      + `${msg("act-rz")}<div class="ann-actions">${rzOn ? `<button type="button" class="ann-btn sm" data-ln-a="pay-off"${dis(execOff)}>${busy === "act-rz" ? "Saving" : "Turn off online checkout"}</button>` : `<button type="button" class="ann-btn sm" data-ln-a="pay-on"${dis(execOff || !!rzNeeds.length || !ackPay)}>${busy === "act-rz" ? "Saving" : "Turn on online checkout"}</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="razorpay"${dis(!!confirmDisc)}>Disconnect</button></div>`;
    const rzBlock = `<h3>Razorpay</h3>` + (rzp.verified
      ? rzVerified
      : `<p class="ann-note">Paste keys from your Razorpay dashboard. They are sent once and are never kept in this page after saving.</p>${inp("rz.key_id", "Key ID")}${inp("rz.key_secret", "Key secret", "password")}${inp("rz.webhook_secret", "Webhook secret", "password")}${msg("rz")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="rz"${dis(!v("rz.key_id") || !draftVals["rz.key_secret"] || !draftVals["rz.webhook_secret"])}>${busy === "rz" ? "Checking" : "Verify account"}</button></div>`);
    const s2 = `${own}${pay}${rzBlock}${msg("disc-razorpay")}${confirmDisc === "razorpay" ? discBox() : ""}${checkoutHref ? `<p class="ann-note">Turn cash on delivery on in <a href="${esc(checkoutHref)}">checkout settings</a>.</p>` : ""}${saveRow(3)}`;

    // Step 3: delivery
    const del = opts("delivery", [["manual", "I ship orders myself", "Your real readiness may still need delivery charges set in checkout settings."], ["shiprocket", "Shiprocket", "Optional. Verify your account below."]]);
    const srTime = when(shp.checked_at);
    const srOn = !!shp.runtime_ready, locs = shp.pickup_locations || [], cfg = shp.shipping;
    const picked = locs.some(l => l.name === draftVals["ship.pickup"]);
    const srForm = `<h3>Package and limits</h3><p class="ann-note">Weight and size describe one parcel that must hold up to the max units. They are not worked out per product. Make sure your package fits that many items. The provider can adjust final charges.${cfg ? "" : " Nothing is saved yet."}${cfg && !picked ? " The saved pickup location is not in your account list. Choose one again." : ""}</p>${locs.length ? `<label class="ann-field">Pickup location<select data-ln="ship.pickup"${dis()}><option value="">Choose a pickup location</option>${locs.map(l => `<option value="${esc(l.name)}">${esc(l.name)} (${esc(l.pincode)})</option>`).join("")}</select></label>` : `<p class="ann-note">No pickup locations were found in your Shiprocket account. Add one there, then reload status.</p>`}<div class="ann-launch-grid">${num("ship.weight", "Weight (kg)")}${num("ship.length", "Length (cm)")}${num("ship.breadth", "Breadth (cm)")}${num("ship.height", "Height (cm)")}${num("ship.units", "Max units per shipment")}${num("ship.freight", "Max freight (INR)")}</div><label class="ann-check"><input type="checkbox" data-ln-ack="auto"${shipAuto ? " checked" : ""}${dis()}><span>Ask the courier to schedule pickup automatically when a shipment is booked.</span></label>${msg("ship-save")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="ship-save"${dis(!locs.length || !!shipPayload().error)}>${busy === "ship-save" ? "Saving" : "Save shipping settings"}</button></div><p class="ann-note">Saving these settings does not turn on automatic shipping.</p>`;
    const srAuto = `<h3>Automatic booking</h3><p class="ann-note">Automatic shipping: <strong>${srOn ? "active" : "off"}</strong>.${cfg ? "" : " Save shipping settings first."}</p>${srOn ? "" : `${execNote}<label class="ann-check"><input type="checkbox" data-ln-ack="ship"${ackShip ? " checked" : ""}${dis()}><span>I understand automatic booking can incur Shiprocket charges to my account, up to the limits above.</span></label>`}${msg("act-sr")}<div class="ann-actions">${srOn ? `<button type="button" class="ann-btn sm" data-ln-a="ship-off"${dis(execOff)}>Turn off automatic shipping</button>` : `<button type="button" class="ann-btn sm" data-ln-a="ship-on"${dis(execOff || !cfg || !ackShip || shipDirty)}>${busy === "act-sr" ? "Saving" : "Turn on automatic shipping"}</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="refresh"${dis()}>Refresh pickup locations</button><button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="shiprocket"${dis(!!confirmDisc)}>Disconnect</button></div>`;
    const jobs = Array.isArray(s.jobs) ? s.jobs : [];
    const jobsHtml = jobs.length ? `<h3>Shipping jobs</h3><ul class="ann-launch-jobs">${jobs.map(j => `<li><div><b>${esc(j.order_number)}</b> ${esc(j.kind)} <span class="ann-launch-st">${j.status === "attention" ? "needs attention" : j.status === "done" ? "done" : esc(j.status)}</span>${when(j.updated_at) ? ` <small>${esc(when(j.updated_at))}</small>` : ""}${j.last_error ? `<p class="ann-note">${esc(j.last_error)}</p>` : ""}${msg("job-" + j.id)}</div>${j.status === "attention" ? `<label class="ann-check"><input type="checkbox" data-ln-ack="abs" data-id="${esc(j.id)}"${absence[j.id] ? " checked" : ""}${dis()}><span>Only if unsure: I checked the provider and no booking, AWB, pickup or refund exists, so another attempt is allowed. This may incur charges.</span></label><button type="button" class="ann-btn alt sm" data-ln-a="job" data-id="${esc(j.id)}"${dis()}>${busy === "job-" + j.id ? "Retrying" : "Retry"}</button>` : ""}</li>`).join("")}</ul>` : "";
    const srBlock = `<h3>Shiprocket</h3>` + (shp.verified
      ? `<p class="ann-callout">Account verified${shp.pickup_count != null ? `, ${esc(shp.pickup_count)} pickup location(s)` : ""}${srTime ? `, checked ${esc(srTime)}` : ""}.</p>${srForm}${srAuto}${jobsHtml}`
      : `<p class="ann-note">Use an API user email and password, not your main Shiprocket login.</p>${inp("sr.email", "API user email", "email")}${inp("sr.password", "API user password", "password")}${msg("sr")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="sr"${dis(!v("sr.email") || !draftVals["sr.password"])}>${busy === "sr" ? "Checking" : "Verify account"}</button></div>`);
    const s3 = `${own}${del}${srBlock}${msg("disc-shiprocket")}${confirmDisc === "shiprocket" ? discBox() : ""}${saveRow(4)}`;

    function discBox() { return `<div class="ann-conflict" role="alertdialog"><p>Disconnect ${esc(confirmDisc)}? Its saved credentials are removed.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="disc-yes"${dis()}>Yes, disconnect</button><button type="button" class="ann-btn alt sm" data-ln-a="disc-no">Keep connected</button></div></div>`; }

    return `${head}${stale || loadError ? `<div class="ann-conflict" role="alert"><p>${esc(loadError || "Status was refreshed. Your entries are kept.")}</p></div>` : ""}${step(1, "Where should customers find your store?", d ? `${d.hostname}: ${d.status}` : prefs.address === "custom" ? "own domain chosen" : "included address", s1)}${step(2, "How would you like to get paid?", `${rzOn ? "online checkout active" : rzp.verified ? "Razorpay verified, not active" : prefs.payments === "razorpay" ? "Razorpay chosen, not set up" : "Cash on delivery"}`, s2)}${step(3, "How will you send your orders?", `${srOn ? "automatic shipping active" : shp.verified ? "Shiprocket verified, not active" : prefs.delivery === "shiprocket" ? "Shiprocket chosen, not set up" : "Manual shipping"}`, s3)}<div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="reload"${busy || loading ? " disabled" : ""}>Reload status</button></div>`;
  }

  // Button enabled states that depend on typed drafts, updated without redrawing.
  function sync() {
    const n = slot(); if (!n) return;
    const set = (a, bad) => { const b = n.querySelector(`[data-ln-a="${a}"]`); if (b) b.disabled = off(bad); };
    set("dadd", !hostOk());
    set("rz", !v("rz.key_id") || !draftVals["rz.key_secret"] || !draftVals["rz.webhook_secret"]);
    set("sr", !v("sr.email") || !draftVals["sr.password"]);
    set("ship-save", !!shipPayload().error);
  }
  function draw() {
    const n = slot(); if (!n) return;
    const a = document.activeElement, k = n.contains(a) ? a.dataset?.ln : null;
    const sel = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    const top = n.scrollTop;
    n.innerHTML = html();
    n.querySelectorAll("input[data-ln],select[data-ln]").forEach(el => { el.value = draftVals[el.dataset.ln] ?? ""; });
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
    if (b.dataset.pref) {
      const unavailable=b.dataset.pref==="address" && b.dataset.v==="custom" && !state?.platform?.domains_available && !state?.domain;
      if (canEdit() && !busy && !loading && !unavailable && prefs[b.dataset.pref]!==b.dataset.v) { prefs[b.dataset.pref] = b.dataset.v; prefsDirty = true; draw(); }
      return;
    }
    const a = b.dataset.lnA, id = state?.domain?.id;
    if (a === "load") void load();
    else if (a === "reload") reload();
    else if (!canEdit()) return;
    else if (a === "next" && [2,3,4].includes(Number(b.dataset.next))) advance(Number(b.dataset.next));
    else if (a === "choose") void act("choose", { action: "choose", preferences: { ...prefs } }, () => { prefsDirty = false; prefs = { ...state.preferences }; });
    else if (a === "rz") { if (v("rz.key_id") && draftVals["rz.key_secret"] && draftVals["rz.webhook_secret"]) void act("rz", { action: "razorpay-connect", credentials: { key_id: v("rz.key_id"), key_secret: draftVals["rz.key_secret"], webhook_secret: draftVals["rz.webhook_secret"] } }, () => clear(["rz.key_id", "rz.key_secret", "rz.webhook_secret"])); }
    else if (a === "sr") { if (v("sr.email") && draftVals["sr.password"]) void act("sr", { action: "shiprocket-connect", credentials: { email: v("sr.email"), password: draftVals["sr.password"] } }, () => clear(["sr.email", "sr.password"])); }
    else if (a === "pay-on") { if (ackPay && state?.execution_available !== false) void act("act-rz", { action: "activate", provider: "razorpay", enabled: true, provider_domain_confirmed: true }, () => { ackPay = false; }); }
    else if (a === "pay-off") void act("act-rz", { action: "activate", provider: "razorpay", enabled: false });
    else if (a === "ship-save") { const p = shipPayload(); if (p.error) { msgs["ship-save"] = { text: p.error }; draw(); } else void act("ship-save", { action: "shipping-settings", shipping: p.shipping }, () => { shipDirty = false; seedShip(); }); }
    else if (a === "ship-on") { if (ackShip && !shipDirty && state?.providers?.shiprocket?.shipping) void act("act-sr", { action: "activate", provider: "shiprocket", enabled: true, provider_domain_confirmed: true }, () => { ackShip = false; }); }
    else if (a === "ship-off") void act("act-sr", { action: "activate", provider: "shiprocket", enabled: false });
    else if (a === "job" && b.dataset.id) void act("job-" + b.dataset.id, { action: "retry-job", id: b.dataset.id, ...(absence[b.dataset.id] ? { provider_absence_confirmed: true } : {}) }, () => { delete absence[b.dataset.id]; });
    else if (a === "refresh") void act("act-sr", { action: "refresh-provider", provider: "shiprocket" });
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
    if (k.startsWith("ship.")) shipDirty = true;
    sync();
  });
  document.addEventListener("change", e => {
    const t = e.target; if (!slot()?.contains(t) || !("lnAck" in t.dataset)) return;
    const w = t.dataset.lnAck; if (w === "pay") ackPay = t.checked; else if (w === "ship") ackShip = t.checked; else if (w === "auto") { shipAuto = t.checked; shipDirty = true; } else if (w === "abs") { absence[t.dataset.id] = t.checked; } else ack = t.checked; draw();
  });
  document.addEventListener("toggle", e => {
    const t = e.target; if (t?.dataset?.step && slot()?.contains(t)) open[t.dataset.step] = t.open;
  }, true);
  document.addEventListener("submit", e => { if (slot()?.contains(e.target)) e.preventDefault(); });

  return {
    mount() { if (!slot()) return; if (!state && !loading && !loadError) void load(); else draw(); },
    hasUnsavedChanges: () => !!busy || prefsDirty || shipDirty || hasCreds(),
  };
}
