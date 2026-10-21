import {confirmCatalogueAction as appConfirm} from "./catalogue-confirm.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/;
const when = v => { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); };
export const domainStatusLabel = status => ({
  active:"Active",pending:"Setting up",failed:"Needs attention",disabled:"Removed"
})[status] || "Setting up";

export function sslCertificateStatus(status) {
  if (status === "active") return {state:"ready",label:"Ready",detail:"Your SSL certificate is ready for secure visits."};
  if (["initializing","pending","pending_validation","pending_issuance","pending_deployment"].includes(status))
    return {state:"progress",label:"In progress",detail:"Your SSL certificate is being prepared. If the verification record is saved, you do not need to add it again."};
  if (["validation_timed_out","issuance_timed_out","deployment_timed_out","certificate_authority_error","validation_failed","failed","expired","deleted","pending_deletion"].includes(status))
    return {state:"attention",label:"Needs attention",detail:"Your SSL certificate is not ready. Check your saved verification records and contact support if this continues."};
  return {state:"unknown",label:"Not confirmed",detail:"Select Check connection to get the latest SSL certificate status."};
}

export function oauthCallbackNotice(result,provider={}){
  if(result==="connected")return provider.verified&&provider.auth_type==="oauth"?
    "Your Razorpay account is connected.":"";
  if(result==="cancelled")return "Authorisation was cancelled. Your existing integration is unchanged.";
  if(result==="failed")return "We could not connect your Razorpay account. Check the account details below and try again.";
  return "";
}
export function razorpayPaymentNotice(provider){
  if(provider.runtime_ready)return {ok:true,text:"Online payments are on. Customers can now pay through Razorpay."};
  if(provider.mode==="test")return {ok:false,text:"Your Razorpay account is connected for testing. Connect your live account to accept customer payments."};
  if(provider.mode!=="live")return {ok:false,text:"Your Razorpay account is connected. Check the account setup before accepting online payments."};
  if(!provider.webhook_verified)return {ok:false,text:"Your Razorpay account is connected. We’re waiting for Razorpay to confirm payment updates before you can turn on online payments."};
  return {ok:true,text:"Your Razorpay account is connected and payment updates are working. Online payments are currently off."};
}
export function launchSavedMessage(fields,state={}){
  if(fields.action==="activate"){
    if(fields.provider==="razorpay")return fields.enabled?
      (state.providers?.razorpay?.runtime_ready?"Online payments are on. Customers can now pay through Razorpay.":"Your payment settings have been saved. Check the connection status above before taking payments."):
      "Online payments are off. Customers cannot pay through Razorpay.";
    return fields.enabled?"Your shipping settings have been saved. Check the shipping status below.":"Automatic shipping is off.";
  }
  return ({
    choose:"Your preferences have been saved.","razorpay-connect":"Your Razorpay account is connected. Turn on online payments when you are ready.",
    "shiprocket-connect":"Your Shiprocket account is connected.","shipping-settings":"Your shipping preferences have been saved.",
    "domain-add":"Your domain has been added. Follow the setup instructions below.",
    "domain-check":"Connection checked. The current status is shown here.",
    "domain-activate":"Your custom domain is now active.","domain-remove":"Your custom domain has been removed from this store.",
    disconnect:"The integration has been disconnected.","refresh-provider":"Your shipping details have been updated.",
    "retry-job":"Your request has been submitted. Check its latest status below."
  })[fields.action]||"Your changes have been saved.";
}
export function attachAnnLaunch({ api, readOnly, onSaved, onDone, onStep, settingsMode = false }) {
  let state = null, loading = false, loadError = "", busy = "", stale = false;
  const msgs = {}, open = { 1: true, 2: false, 3: false };
  let prefs = null, prefsDirty = false;
  const providerOpen={razorpay:settingsMode,shiprocket:settingsMode};
  let focusedStep=null, customOnly=false;
  const skipped=new Set();
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
  const domVerified = () => { const d = state?.domain, p = state?.platform; return !!d && d.hostname_status === "active" && d.ssl_status === "active" && d.cname_verified === true && !!p?.domain_activation_available; };
  const domLive = () => state?.domain?.status === "active";
  const domainPaymentRequired = () => state?.payment_domain_confirmation_required ??
    Boolean(state?.providers?.razorpay?.verified || state?.providers?.razorpay?.runtime_ready);

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
      msgs[key] = { ok: true, text: launchSavedMessage(fields,result) };
      try { onSaved?.(result); } catch { /* host error */ }
    } catch (e) { msgs[key] = { text: e.message }; }
    finally {
      busy = ""; draw();
      if (fields.action === "domain-check" || fields.action === "domain-activate") {
        const result = slot()?.querySelector("[data-ln-domain-result]");
        result?.focus({ preventScroll: true });
        result?.scrollIntoView({ block: "nearest" });
      }
    }
  }
  async function oauth(action){
    if(!canEdit()||busy||!storeId)return;
    const replacing=action==="start"&&state?.providers?.razorpay?.verified;
    if(replacing&&!await appConfirm("Existing orders keep their payment records. Online checkout will stay off after authorisation until you enable it again.",{title:"Replace the Razorpay integration?",confirmLabel:"Replace integration"}))return;
    busy="oauth";msgs.oauth=null;draw();
    try{
      const response=await fetch(`${api.replace(/\/ann$/,"/integrations/razorpay")}/${action}`,{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({confirm:true,...(replacing?{replace_existing:true}:{})})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Razorpay authorisation could not be completed.");
      if(action==="start"){
        const target=new URL(result.authorize_url);
        if(target.origin!=="https://auth.razorpay.com"||target.pathname!=="/authorize")throw new Error("Invalid authorisation destination.");
        window.location.assign(target.href);return;
      }
      const updated=await request("GET");
      if(!updated.res.ok)throw new Error("Your change was saved. Reload this page to refresh its status.");
      take(updated.result);
      msgs.oauth={ok:!result.revocation_pending,text:result.revocation_pending?
        "Online payments are off, but Razorpay has not confirmed the disconnection. Try again or remove LeBrands.Store from your connected apps in Razorpay.":
        action==="disconnect"?"Your Razorpay account has been disconnected.":"Your Razorpay account connection has been refreshed."};
    }catch(e){msgs.oauth={text:e.message||"Razorpay authorisation is temporarily unavailable."};}
    finally{busy="";draw();}
  }

  const off = x => !canEdit() || !!busy || loading || !!x;
  const dis = x => off(x) ? " disabled" : "";
  const msg = k => msgs[k] ? `<p class="${msgs[k].ok ? "ann-callout ann-success" : "ann-error"}" role="${msgs[k].ok ? "status" : "alert"}">${esc(msgs[k].text)}</p>` : "";
  const inp = (k, label, t = "text") => `<label class="ann-field">${esc(label)}<input data-ln="${k}" type="${t}" autocomplete="${t === "password" ? "new-password" : "off"}" autocapitalize="none" spellcheck="false"${dis()}></label>`;
  const num = (k, label) => `<label class="ann-field">${esc(label)}<input data-ln="${k}" type="text" inputmode="decimal" autocomplete="off"${dis()}></label>`;
  function opts(group, items) {
    return `<div class="ann-chips stack" role="group" aria-label="${esc(group)}">${items.map(([val, t, d]) => {
      const unavailable=group==="address" && val==="custom" && !state?.platform?.domains_available && !state?.domain;
      const description=unavailable?"Own website addresses are not available yet. Your included address still works.":d;
      return `<button type="button" class="ann-chip ann-launch-option" data-pref="${group}" data-v="${val}" aria-pressed="${prefs[group] === val || (group!=="address" && prefs[group]==="both")}"${unavailable?' aria-disabled="true"':""}${dis(unavailable)}><strong>${esc(t)}</strong><span>${esc(description)}</span></button>`;
    }).join("")}</div>`;
  }
  function step(n, title, status, body) {
    if(settingsMode) return focusedStep===n?body:"";
    if(focusedStep) return focusedStep===n?`<section class="ann-launch-step" data-step="${n}">${body}</section>`:"";
    if(n===1 && !state?.domain) status="Included address ready";
    return `<details class="ann-review-step ann-launch-step" data-step="${n}"${open[n] ? " open" : ""}><summary>${n}. ${esc(title)} <span class="ann-launch-st">${esc(status)}</span></summary>${body}</details>`;
  }
  function providerPanel(provider,title,body,active,verified){
    if(settingsMode)return `<section class="ann-integration-provider" data-ln-provider="${provider}" aria-label="${esc(title)}"><div class="ann-integration-provider-heading"><span class="ann-note">Connection status</span><span class="ann-integration-status" role="status" data-status="${active?"active":verified?"verified":"unverified"}">${active?"Active":verified?"Verified, not active":"Not connected"}</span></div>${body}</section>`;
    return `<details class="ann-provider-setup" data-ln-provider="${provider}"${providerOpen[provider]?" open":""}><summary>${esc(title)}${active?" · active":""}</summary>${body}</details>`;
  }
  const saveRow = next => `${msg("choose")}<div class="ann-actions ann-launch-actions"><button type="button" class="ann-btn alt sm" data-ln-a="choose"${dis(!prefsDirty)}>${busy === "choose" ? "Saving" : "Save choices"}</button>${settingsMode ? "" : `<button type="button" class="ann-btn sm" data-ln-a="next" data-next="${next}"${dis()}>${prefsDirty?"Save and continue":next===2?(customOnly?"Continue to review":"Continue to payments"):next===3?"Continue to delivery":"Review my store"}</button>`}</div><p class="ann-note">Choices saved here do not activate services.</p>`;
  function advance(next) {
    const move=()=>{
      if(focusedStep&&onStep){skipped.delete(focusedStep);onStep(next);return;}
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
    const head = settingsMode ? "" : focusedStep?`<button type="button" class="ann-link" data-ln-a="skip"${busy?" disabled":""}>Set up later</button>`:`<h2>Launch setup</h2><p class="ann-note">Start now, or come back later.</p>`;
    if (loading && !state) return `${head}<div class="ann-skel" aria-busy="true"><i></i><i></i><i></i></div>`;
    if (!state) return `${head}${loadError ? `<p class="ann-error" role="alert">${esc(loadError)}</p>` : ""}<button type="button" class="ann-btn" data-ln-a="load">${loadError ? "Try again" : "Load launch setup"}</button>`;
    const s = state, p = s.providers || {}, d = s.domain, plat = s.platform || {};
    const rzp = p.razorpay || {}, shp = p.shiprocket || {};
    const own = canEdit() ? "" : `<p class="ann-callout">Only the store owner can change these settings.</p>`;

    // Step 1: store address and domain
    const addr = opts("address", [["included", "Use the address that comes with your store", "Nothing to set up."], ["custom", "Use my own domain", "For example www.yourbrand.com. Add it below, then update the records where you manage your domain."]]);
    const diagList = Array.isArray(plat.diagnostics) ? plat.diagnostics : [];
    const diag = diagList.some(x => !x.complete) ? `<p class="ann-note">Your store connection still needs our attention. Your included address keeps working. Contact support if this continues.</p>` : "";
    let dom;
    if (!d) {
      dom = plat.domains_available
        ? `${diag}<p class="ann-note">Enter a website address such as www.yourbrand.com or shop.yourbrand.com. Addresses without www or another name at the start are not supported yet.</p>${inp("host", "Website address")}${msg("dom")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="dadd"${dis(!hostOk())}>Add domain</button></div>`
        : `<p class="ann-callout ann-success" role="status">Your included address${s.included_address?` (${esc(s.included_address)})`:""} is ready to use. Connecting your own website address is not available yet. Your store can keep using its included address.</p>`;
    } else {
      const live = domLive();
      const ready = domVerified();
      const ssl = sslCertificateStatus(d.ssl_status);
      const openStore = live && HOST.test(d.hostname) ? `<a class="ann-btn sm" href="https://${esc(d.hostname)}/" target="_blank" rel="noopener noreferrer">Open store<span class="ann-sr-only"> at ${esc(d.hostname)} (opens in a new tab)</span></a>` : "";
      const forwarding = live && HOST.test(d.hostname) && d.hostname.startsWith("www.")
        ? `<section aria-label="Optional address forwarding"><h4>Next: make your address work without www (optional)</h4><p class="ann-note">Your connected address is <strong>${esc(d.hostname)}</strong>. If <strong>${esc(d.hostname.slice(4))}</strong> still opens a parked or welcome page, set up forwarding where you bought your domain.</p><ol class="ann-note"><li>Open your domain provider’s website and find Domain forwarding or Forward domain.</li><li>Forward <strong>${esc(d.hostname.slice(4))}</strong> to <strong>https://${esc(d.hostname)}/</strong>.</li><li>Choose Permanent if asked, leave masking off, then save. Changes may take time to appear.</li></ol><p class="ann-note">Leave email records and the verification records you added unchanged. If your provider does not offer forwarding, ask their support to help. This step is separate from connecting your www address here.</p></section>` : "";
      const records = d.dns_records || [];
      const neededRecords = live || ready ? [] : records.filter(r => r.type === "CNAME" ? !d.cname_verified : d.hostname_status !== "active" || d.ssl_status !== "active");
      const recordTable = rows => `<div class="ann-dns-table" role="table" aria-label="Required domain records"><div class="ann-dns-row ann-dns-head" role="row"><span role="columnheader">Type</span><span role="columnheader">Name</span><span role="columnheader">Value</span></div>${rows.map(r => `<div class="ann-dns-row" role="row"><b role="cell">${esc(r.type)}</b><span role="cell"><code>${esc(r.name)}</code><button type="button" class="ann-dns-copy" data-ln-copy="${esc(r.name)}" aria-label="Copy record name">Copy</button></span><span role="cell"><code>${esc(r.value)}</code><button type="button" class="ann-dns-copy" data-ln-copy="${esc(r.value)}" aria-label="Copy record value">Copy</button></span></div>`).join("")}</div>`;
      const nextStep = live ? "Customers can now use this address to visit your store."
        : !plat.domain_activation_available ? "We are preparing your store connection. Your included address keeps working. Check again later or contact support if this continues."
        : ssl.state === "attention" ? "Next: check the verification records above or contact support for help with your SSL certificate."
        : !d.cname_verified ? "Next: update the website record shown above, then check the connection."
        : d.hostname_status !== "active" || d.ssl_status !== "active" ? neededRecords.length ? "Next: add the verification record above if you have not already. If it is saved, wait for the secure connection to finish, then check again." : "Your website address is connected. We are preparing the secure connection. Wait a little, then check again."
        : domainPaymentRequired() && !ack ? "Next: confirm that Razorpay has approved this website address, then activate it."
        : "Everything is ready. Activate this address to start using it for your store.";
      const dns = neededRecords.length ? `<h4>${d.cname_verified ? "Add your verification record" : "Update your domain records"}</h4><p class="ann-note">Open DNS or Manage records where you bought your domain. Add the records below, then select Check connection.</p>${recordTable(neededRecords)}` : "";
      const help = records.length ? `<details class="ann-domain-record-help"><summary>Need help with domain records?</summary><p class="ann-note"><strong>Already have a record with the same name, such as www?</strong> Edit that existing record instead of adding a second one. For a CNAME, replace its Value or Points to with the value below. This changes where that website address opens. If the existing record has a different type, check with your domain provider before replacing it.</p><p class="ann-note">Leave email records and records for other names unchanged. Add any missing TXT records shown below. Some providers ask for only the name before your domain, such as www or _acme-challenge.www; others accept the full name. Check that your domain is not added twice.</p><h4>All saved records</h4>${recordTable(records)}</details>` : "";
      const dnsStatus=`<ul class="ann-note" aria-label="Connection progress"><li>Website address: <strong>${d.cname_verified ? "Connected" : "Waiting for your record"}</strong></li><li>Ownership: <strong>${d.hostname_status === "active" ? "Confirmed" : "Waiting for verification"}</strong></li><li>SSL certificate: <strong class="ann-ssl-indicator" data-state="${ssl.state}"><i aria-hidden="true"></i>${ssl.label}</strong></li></ul><p class="ann-note">${esc(ssl.detail)}${d.checked_at ? ` Last checked: ${esc(when(d.checked_at))}.` : ""} Select Check connection to refresh this status.</p>`;
      const paymentAck = !live && ready && domainPaymentRequired() ? `<p class="ann-note" id="ann-domain-payment-help">Before using ${esc(d.hostname)} for online payments, add this address to the approved websites in your Razorpay account and complete any approval Razorpay requests. This does not turn payments on or reconnect your account.</p><label class="ann-check"><input type="checkbox" data-ln-ack="dom" aria-describedby="ann-domain-payment-help"${ack ? " checked" : ""}${dis()}><span>Razorpay has approved this website address for online payments.</span></label>` : "";
      dom = `<section aria-label="Domain connection"><p><strong>${esc(d.hostname)}</strong> <span class="ann-launch-st">${esc(domainStatusLabel(d.status))}${d.primary ? ", main address" : ""}</span></p>${dns}${paymentAck}<div class="ann-actions">${openStore}<button type="button" class="ann-btn alt sm" data-ln-a="dchk"${dis()}>${busy === "dom" ? "Checking" : "Check connection"}</button>${live || !ready ? "" : `<button type="button" class="ann-btn sm" data-ln-a="dact"${dis(domainPaymentRequired() && !ack)}>Activate domain</button>`}</div><div data-ln-domain-result tabindex="-1" aria-label="Current connection status"><h4>Current status</h4>${msg("dom")}${dnsStatus}<p class="${live ? "ann-callout ann-success" : "ann-note"}" role="status">${esc(nextStep)}</p></div></section>${forwarding}${help}<details><summary>Remove this address</summary><p class="ann-note">Your included store address will keep working. Nothing is deleted at your domain provider.</p><button type="button" class="ann-btn alt sm" data-ln-a="drem"${dis(confirmRemove)}>Remove</button></details>${confirmRemove ? `<div class="ann-conflict" role="alertdialog"><p>Remove ${esc(d.hostname)}? Your store will stop using this address. Nothing is deleted at your domain or payment provider.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="drem-yes"${dis()}>Yes, remove</button><button type="button" class="ann-btn alt sm" data-ln-a="drem-no">Keep domain</button></div></div>` : ""}`;
    }
    const s1 = `${own}${customOnly ? `<p class="ann-note">Your included store address keeps working.</p>` : addr}${dom}${settingsMode && customOnly ? "" : saveRow(2)}`;

    // Step 2: payments
    const pay = `<p class="ann-note">Choose one or both.</p>${opts("payments", [["cod", "Cash on Delivery", "Customers pay when their order arrives."], ["razorpay", "Razorpay", "Customers pay online. Connect below or finish later."]])}`;
    const execOff = s.execution_available === false;
    const execNote = execOff ? `<p class="ann-note">This service cannot be turned on yet. Please contact the platform team for help. Your current settings are unchanged.</p>` : "";
    const rzOn = !!rzp.runtime_ready, rzLive = rzp.mode === "live";
    const rzNeeds = [!rzLive && "Connect your live Razorpay account to accept payments from customers.", !rzp.webhook_verified && "We’re waiting for Razorpay to confirm payment updates for your store."].filter(Boolean);
    const paymentNotice=razorpayPaymentNotice(rzp);
    const rzVerified = `<p class="ann-callout${paymentNotice.ok?" ann-success":""}" role="status">${esc(paymentNotice.text)}</p>`
      + (rzOn ? "" : `<p class="ann-note">${rzp.auth_type==="oauth"?"LeBrands.Store receives payment updates automatically. Use Reload status to check for updates.":`To finish: in your Razorpay dashboard add this webhook URL${rzp.webhook_url ? ` <code>${esc(rzp.webhook_url)}</code>` : " (not provided yet)"} with the events payment.captured, order.paid, payment.failed and refund.processed, using the webhook secret you saved here. Then send a signed test webhook from Razorpay and reload status. Your stored secrets are never shown again.`}</p>${rzNeeds.map(n => `<p class="ann-note">${esc(n)}</p>`).join("")}${execNote}<label class="ann-check"><input type="checkbox" data-ln-ack="pay"${ackPay ? " checked" : ""}${dis()}><span>Razorpay has approved my KYC and this domain for live payments.</span></label>`)
      + `${msgs["act-rz"]?.ok?"":msg("act-rz")}<div class="ann-actions">${rzOn ? `<button type="button" class="ann-btn sm" data-ln-a="pay-off"${dis(execOff)}>${busy === "act-rz" ? "Saving" : "Turn off online payments"}</button>` : `<button type="button" class="ann-btn sm" data-ln-a="pay-on"${dis(execOff || !!rzNeeds.length || !ackPay)}>${busy === "act-rz" ? "Saving" : "Turn on online payments"}</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="razorpay"${dis(!!confirmDisc)}>Disconnect</button></div>`;
    const oauthReady=!!plat.razorpay_oauth_available;
    const oauthResult=new URLSearchParams(globalThis.location?.search||"").get("oauth");
    const oauthNotice=oauthCallbackNotice(oauthResult,rzp);
    const oauthBlock=`${oauthNotice?`<p class="${oauthResult==="failed"?"ann-error":oauthResult==="connected"?"ann-callout ann-success":"ann-callout"}" role="${oauthResult==="failed"?"alert":"status"}">${esc(oauthNotice)}</p>`:""}<p class="ann-note">Connect your Razorpay account securely without sharing your password with LeBrands.Store.</p>
      ${rzp.auth_type==="oauth"&&rzp.account_id?`<p class="ann-note">Account <strong>${esc(rzp.account_id)}</strong>${rzp.mode?` · ${esc(rzp.mode)} mode`:""}${rzp.token_expires_at?` · Authorisation expires ${esc(when(rzp.token_expires_at))}`:""}</p>`:""}
      ${rzp.refresh_attention?'<p class="ann-error" role="alert">Razorpay needs a fresh authorisation. Reconnect your account.</p>':""}
      <div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="oauth-start"${dis(!oauthReady)}>${busy==="oauth"?"Please wait":rzp.auth_type==="oauth"?"Reconnect to Razorpay":"Connect to Razorpay"}</button>
      ${rzp.auth_type==="oauth"&&rzp.verified?`<button type="button" class="ann-btn alt sm" data-ln-a="oauth-refresh"${dis(!oauthReady)}>Refresh authorisation</button>`:""}
      ${rzp.revocation_pending?`<button type="button" class="ann-btn alt sm" data-ln-a="oauth-disconnect"${dis(!oauthReady)}>Retry disconnection</button>`:""}</div>
      ${oauthReady?"":'<p class="ann-note">Secure authorisation is unavailable in this environment. Existing API-key integrations continue to work.</p>'}${msg("oauth")}`;
    const rzBlock = `${settingsMode?"":"<h3>Razorpay</h3>"}${oauthBlock}${settingsMode&&rzp.verified&&rzp.auth_type==="api_key"?'<p class="ann-note">Your existing API-key connection is preserved. Authorising through Razorpay will ask before replacing it.</p>':""}` + (rzp.verified
      ? rzVerified
      : settingsMode?"":`<details><summary>Use API keys instead</summary><p class="ann-note">Enter your merchant Razorpay key ID and key secret. Also create a webhook secret in Razorpay so signed payment events can be checked. We verify the keys before storing them encrypted; they are not displayed again.</p>${inp("rz.key_id", "Key ID")}${inp("rz.key_secret", "Key secret", "password")}${inp("rz.webhook_secret", "Webhook secret", "password")}${msg("rz")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="rz"${dis(!v("rz.key_id") || !draftVals["rz.key_secret"] || !draftVals["rz.webhook_secret"])}>${busy === "rz" ? "Checking" : "Verify and save Razorpay"}</button></div></details>`);
    const rzPanel=settingsMode||prefs.payments==="razorpay"||prefs.payments==="both"||rzp.verified?providerPanel("razorpay","Razorpay integration",rzBlock,rzOn,rzp.verified):"";
    const s2 = `${own}${settingsMode?rzPanel:pay+rzPanel}${msg("disc-razorpay")}${confirmDisc === "razorpay" ? discBox() : ""}${!settingsMode&&checkoutHref ? `<p class="ann-note">Enable COD in <a href="${esc(checkoutHref)}">checkout settings</a> before opening.</p>` : ""}${settingsMode?"":saveRow(3)}`;

    // Step 3: delivery
    const del = `<p class="ann-note">Choose one or both. Add manual tracking from Orders.</p>${opts("delivery", [["manual", "I'll add tracking myself", "Use your courier and add its tracking number in Orders."], ["shiprocket", "Shiprocket", "Connect your account for automatic shipping."]])}`;
    const srOn = !!shp.runtime_ready, locs = shp.pickup_locations || [], cfg = shp.shipping;
    const picked = locs.some(l => l.name === draftVals["ship.pickup"]);
    const srForm = `<h3>Package and limits</h3><p class="ann-note">Weight and size describe one parcel that must hold up to the max units. They are not worked out per product. Make sure your package fits that many items. The provider can adjust final charges.${cfg ? "" : " Nothing is saved yet."}${cfg && !picked ? " The saved pickup location is not in your account list. Choose one again." : ""}</p>${locs.length ? `<label class="ann-field">Pickup location<select data-ln="ship.pickup"${dis()}><option value="">Choose a pickup location</option>${locs.map(l => `<option value="${esc(l.name)}">${esc(l.name)} (${esc(l.pincode)})</option>`).join("")}</select></label>` : `<p class="ann-note">No pickup locations were found in your Shiprocket account. Add one there, then reload status.</p>`}<div class="ann-launch-grid">${num("ship.weight", "Weight (kg)")}${num("ship.length", "Length (cm)")}${num("ship.breadth", "Breadth (cm)")}${num("ship.height", "Height (cm)")}${num("ship.units", "Max units per shipment")}${num("ship.freight", "Max freight (INR)")}</div><label class="ann-check"><input type="checkbox" data-ln-ack="auto"${shipAuto ? " checked" : ""}${dis()}><span>Ask the courier to schedule pickup automatically when a shipment is booked.</span></label>${msg("ship-save")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="ship-save"${dis(!locs.length || !!shipPayload().error)}>${busy === "ship-save" ? "Saving" : "Save shipping settings"}</button></div><p class="ann-note">Saving these settings does not turn on automatic shipping.</p>`;
    const srAuto = `<h3>Automatic booking</h3><p class="ann-note">Automatic shipping: <strong>${srOn ? "active" : "off"}</strong>.${cfg ? "" : " Save shipping settings first."}</p>${srOn ? "" : `${execNote}<label class="ann-check"><input type="checkbox" data-ln-ack="ship"${ackShip ? " checked" : ""}${dis()}><span>I understand automatic booking can incur Shiprocket charges to my account, up to the limits above.</span></label>`}${msg("act-sr")}<div class="ann-actions">${srOn ? `<button type="button" class="ann-btn sm" data-ln-a="ship-off"${dis(execOff)}>Turn off automatic shipping</button>` : `<button type="button" class="ann-btn sm" data-ln-a="ship-on"${dis(execOff || !cfg || !ackShip || shipDirty)}>${busy === "act-sr" ? "Saving" : "Turn on automatic shipping"}</button>`}<button type="button" class="ann-btn alt sm" data-ln-a="refresh"${dis()}>Refresh pickup locations</button><button type="button" class="ann-btn alt sm" data-ln-a="disc" data-p="shiprocket"${dis(!!confirmDisc)}>Disconnect</button></div>`;
    const jobs = Array.isArray(s.jobs) ? s.jobs : [];
    const jobsHtml = jobs.length ? `<h3>Shipping jobs</h3><ul class="ann-launch-jobs">${jobs.map(j => `<li><div><b>${esc(j.order_number)}</b> ${esc(j.kind)} <span class="ann-launch-st">${j.status === "attention" ? "needs attention" : j.status === "done" ? "done" : esc(j.status)}</span>${when(j.updated_at) ? ` <small>${esc(when(j.updated_at))}</small>` : ""}${j.last_error ? `<p class="ann-note">${esc(j.last_error)}</p>` : ""}${msg("job-" + j.id)}</div>${j.status === "attention" ? `<label class="ann-check"><input type="checkbox" data-ln-ack="abs" data-id="${esc(j.id)}"${absence[j.id] ? " checked" : ""}${dis()}><span>Only if unsure: I checked the provider and no booking, AWB, pickup or refund exists, so another attempt is allowed. This may incur charges.</span></label><button type="button" class="ann-btn alt sm" data-ln-a="job" data-id="${esc(j.id)}"${dis()}>${busy === "job-" + j.id ? "Retrying" : "Retry"}</button>` : ""}</li>`).join("")}</ul>` : "";
    const srBlock = `<h3>Shiprocket</h3>` + (shp.verified
      ? `<p class="ann-callout ann-success" role="status">Your Shiprocket account is connected.${shp.pickup_count != null ? ` ${esc(shp.pickup_count)} pickup location${shp.pickup_count===1?" is":"s are"} available.` : ""}</p>${srForm}${srAuto}${jobsHtml}`
      : `<p class="ann-note">Create a separate API user in Shiprocket Settings → API. Enter its email and password, not your main account login. We verify the account and pickup locations before storing the credentials encrypted.</p>${inp("sr.email", "API user email", "email")}${inp("sr.password", "API user password", "password")}${msg("sr")}<div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="sr"${dis(!v("sr.email") || !draftVals["sr.password"])}>${busy === "sr" ? "Checking" : "Verify and save Shiprocket"}</button></div>`);
    const srPanel=settingsMode||prefs.delivery==="shiprocket"||prefs.delivery==="both"||shp.verified?providerPanel("shiprocket","Shiprocket integration",srBlock,srOn,shp.verified):"";
    const s3 = `${own}${settingsMode?srPanel+del:del+srPanel}${msg("disc-shiprocket")}${confirmDisc === "shiprocket" ? discBox() : ""}${saveRow(4)}`;

    function discBox() { return `<div class="ann-conflict" role="alertdialog"><p>Disconnect ${esc(confirmDisc)}? Its saved credentials are removed.</p><div class="ann-actions"><button type="button" class="ann-btn sm" data-ln-a="disc-yes"${dis()}>Yes, disconnect</button><button type="button" class="ann-btn alt sm" data-ln-a="disc-no">Keep connected</button></div></div>`; }

    return `${head}${stale || loadError ? `<div class="ann-conflict" role="alert"><p>${esc(loadError || "Status was refreshed. Your entries are kept.")}</p></div>` : ""}${step(1, "Where should customers find your store?", d ? `${d.hostname}: ${domainStatusLabel(d.status)}` : prefs.address === "custom" ? "own domain chosen" : "included address", s1)}${step(2, "How would you like to get paid?", prefs.payments==="both"?"COD + Razorpay":prefs.payments==="razorpay"?"Razorpay":"Cash on Delivery", s2)}${step(3, "How will you send your orders?", prefs.delivery==="both"?"Manual tracking + Shiprocket":prefs.delivery==="shiprocket"?"Shiprocket":"Manual tracking", s3)}${settingsMode && customOnly ? "" : `<div class="ann-actions"><button type="button" class="ann-btn alt sm" data-ln-a="reload"${busy || loading ? " disabled" : ""}>Reload status</button></div>`}`;
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
  async function reload() {
    if (busy || loading) return;
    if (hasCreds() && !await appConfirm("Refreshing status keeps what you typed.",{title:"Refresh integration status?",confirmLabel:"Refresh status"})) return;
    void load();
  }
  const clear = ks => ks.forEach(k => { draftVals[k] = ""; });
  document.addEventListener("click", e => {
    const n = slot(); if (!n || !n.contains(e.target)) return;
    const copy=e.target.closest("button[data-ln-copy]");
    if(copy?.dataset?.lnCopy !== undefined){
      e.preventDefault();
      if(!canEdit())return;
      if(!navigator.clipboard?.writeText){copy.textContent="Select the text to copy";return;}
      navigator.clipboard.writeText(copy.dataset.lnCopy).then(()=>{
        copy.textContent="Copied";setTimeout(()=>{if(copy.isConnected)copy.textContent="Copy";},1800);
      }).catch(()=>{copy.textContent="Select the text to copy";});
      return;
    }
    const b = e.target.closest("button[data-ln-a],button[data-pref]"); if (!b) return;
    e.preventDefault();
    if (b.disabled) return;
    if (b.dataset.pref) {
      const unavailable=b.dataset.pref==="address" && b.dataset.v==="custom" && !state?.platform?.domains_available && !state?.domain;
      if (canEdit() && !busy && !loading && !unavailable) {
        const group=b.dataset.pref,value=b.dataset.v;
        const choices=group==="payments"?["cod","razorpay"]:group==="delivery"?["manual","shiprocket"]:["included","custom"];
        if(!choices.includes(value))return;
        const current=prefs[group];
        // Keep at least one option; adding a second retains the first.
        prefs[group]=group==="address"?value:current==="both"?choices.find(x=>x!==value):current===value?current:"both";
        prefsDirty=JSON.stringify(prefs)!==JSON.stringify(state.preferences);draw();
      }
      return;
    }
    const a = b.dataset.lnA, id = state?.domain?.id;
    if (a === "load") void load();
    else if (a === "reload") reload();
    else if(a==="skip"&&focusedStep&&!busy&&onStep) {
      const group=({1:"address",2:"payments",3:"delivery"})[focusedStep];
      if(prefs&&state){prefs[group]=state.preferences[group];prefsDirty=JSON.stringify(prefs)!==JSON.stringify(state.preferences);}
      skipped.add(focusedStep);onStep(focusedStep+1);
    }
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
    else if (a === "oauth-start") void oauth("start");
    else if (a === "oauth-refresh") void oauth("refresh");
    else if (a === "oauth-disconnect") void oauth("disconnect");
    else if (a === "disc-yes") { const pr = confirmDisc; confirmDisc = ""; if(pr==="razorpay"&&state?.providers?.razorpay?.auth_type==="oauth")void oauth("disconnect");else if (pr) void act("disc-" + pr, { action: "disconnect", provider: pr }); }
    else if (a === "dadd") { if (hostOk()) void act("dom", { action: "domain-add", hostname: v("host").toLowerCase() }, () => clear(["host"])); }
    else if (a === "dchk" && id) void act("dom", { action: "domain-check", id });
    else if (a === "dact" && id && (!domainPaymentRequired() || ack) && domVerified() && !domLive()) void act("dom", { action: "domain-activate", id, provider_domain_confirmed: domainPaymentRequired() && ack }, () => { ack = false; });
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
    if(t?.dataset?.lnProvider&&slot()?.contains(t))providerOpen[t.dataset.lnProvider]=t.open;
  }, true);
  document.addEventListener("submit", e => { if (slot()?.contains(e.target)) e.preventDefault(); });

  return {
    mount(n, opts = {}) { if (!slot()) return; focusedStep=[1,2,3].includes(n)?n:null; customOnly=focusedStep===1&&opts.customDomainOnly===true; if (!state && !loading && !loadError) void load(); else draw(); },
    summary(n) {
      if(skipped.has(n))return "Left unchanged. I'll set this up later.";
      if(!state)return "";
      if(n===1)return state.domain?`${state.domain.hostname}: ${domainStatusLabel(state.domain.status)}`:"Included store address; no custom domain connected.";
      if(n===2)return `${state.preferences.payments==="both"?"Cash on Delivery + Razorpay":state.preferences.payments==="razorpay"?"Razorpay":"Cash on Delivery"}${state.preferences.payments!=="cod"?(state.providers?.razorpay?.runtime_ready?" · online payments active":" · online setup pending"):" · enable in checkout settings"}`;
      return `${state.preferences.delivery==="both"?"Manual tracking + Shiprocket":state.preferences.delivery==="shiprocket"?"Shiprocket":"Manual tracking"}${state.preferences.delivery!=="manual"?(state.providers?.shiprocket?.runtime_ready?" · automatic shipping active":" · partner setup pending"):" · add tracking in Orders"}`;
    },
    hasUnsavedChanges: () => !!busy || prefsDirty || shipDirty || hasCreds(),
  };
}
