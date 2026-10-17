const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const CONNECTION_KINDS = Object.freeze({domain:1,payments:2,delivery:3});
export function connectionHref(storeId, kind) {
  return `/stores/${encodeURIComponent(storeId)}/settings?connection=${Object.hasOwn(CONNECTION_KINDS,kind) ? kind : "domain"}`;
}
export function essentialsMarkup(storeId, state, error = "") {
  const root = `/stores/${encodeURIComponent(storeId)}`;
  const rows = [
    ["Store address",`${state?.included_address || "Your included LeBrands address is available in Settings."}${state?.domain ? ` · Custom domain: ${state.domain.hostname} (${state.domain.status})` : " Your own domain is optional."}`,"domain","Manage address & domain"],
    ["Payments",state ? `${state.cod_enabled === true ? "Cash on Delivery is enabled." : "Cash on Delivery is available; enable it in checkout settings."} ${state.providers?.razorpay?.runtime_ready ? "Razorpay online payments are active." : "Online payments are not active."}` : "Cash on Delivery is available. Check Settings to see whether it is enabled.","payments","Payment settings"],
    ["Delivery",`Add courier and tracking details yourself in Order desk.${state?.providers?.shiprocket?.runtime_ready ? " Automatic Shiprocket shipping is active." : " A shipping partner is optional."}`,"delivery","Delivery settings"],
  ];
  return `<h2>Your store essentials</h2><p>Your included address and manual tracking are available without a partner. Online payments, automatic shipping and your own domain are optional.</p>${error ? `<p role="status">${esc(error)} <button type="button" class="ann-link" data-essentials-retry>Retry status</button></p>` : !state ? '<p role="status">Checking your current settings…</p>' : ""}<dl class="ann-summary">${rows.map(([name,text,kind,label])=>`<div><dt>${name}</dt><dd>${esc(text)}</dd><a class="ann-link" href="${connectionHref(storeId,kind)}">${label}</a></div>`).join("")}</dl><p class="ann-note">Opening Settings does not activate services. You can use COD and online payments together, and manual tracking alongside a shipping partner.</p><a class="ann-link" href="${root}/settings/checkout">Checkout & COD settings</a>`;
}
export function attachStoreEssentials({storeId, api}) {
  let state = null, error = "", loading = false;
  const slot = () => document.querySelector("#ann-essentials-slot");
  const draw = () => { if(slot()) slot().innerHTML = essentialsMarkup(storeId,state,error); };
  async function load() {
    if(loading) return;
    loading=true; error=""; draw();
    try {
      const res=await fetch(`${api}/launch`,{credentials:"same-origin"});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || "Current connection status could not be loaded.");
      state=data;
    } catch { error="Current status is unavailable. Check Settings before accepting orders."; }
    finally { loading=false;draw(); }
  }
  document.addEventListener("click",e=>{if(e.target.closest("[data-essentials-retry]")&&slot()?.contains(e.target))void load();});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&slot())void load();});
  return {mount(){ if(!slot())return;draw();if(!state&&!error&&!loading)void load(); }};
}
