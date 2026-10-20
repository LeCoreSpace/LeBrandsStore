// Store-only runtime. Never imports a provider or sends events without consent.
export function checkoutEventAllowed(page,cart,fired=false){
  return page==="checkout"&&!fired&&Array.isArray(cart?.items)&&cart.items.length>0;
}
export function validPurchasePayload(data,receiptId,storeId){
  return !!data&&data.event_id===receiptId&&/^[a-f0-9-]{36}$/.test(data.event_id)&&
    typeof data.transaction_id==="string"&&data.transaction_id.startsWith(`${storeId}:`)&&data.transaction_id.length>storeId.length+1&&
    data.currency==="INR"&&["value","google_value","tax","shipping"].every(key=>Number.isFinite(data[key])&&data[key]>=0)&&
    Array.isArray(data.items)&&data.items.length>0&&data.items.every(item=>typeof item.item_id==="string"&&item.item_id.length>0&&
      Number.isInteger(item.quantity)&&item.quantity>0&&Number.isFinite(item.price)&&item.price>=0);
}
export function eventPayloads(name,data={}){
  const items=(data.items||[]).filter(i=>i.item_id&&Number(i.quantity)>0).map(i=>({
    item_id:String(i.item_id),item_name:String(i.item_name||"Product").slice(0,180),quantity:Number(i.quantity),
    ...(Number.isFinite(i.price)?{price:i.price}:{}),...(i.item_category?{item_category:String(i.item_category).slice(0,100)}:{})
  }));
  const metaNames={page_view:"PageView",view_item:"ViewContent",add_to_cart:"AddToCart",begin_checkout:"InitiateCheckout",add_payment_info:"AddPaymentInfo",purchase:"Purchase",search:"Search"};
  const meta=metaNames[name]?{name:metaNames[name],data:{
    ...(items.length?{content_type:"product",content_ids:items.map(i=>i.item_id),contents:items.map(i=>({id:i.item_id,quantity:i.quantity})),num_items:items.reduce((n,i)=>n+i.quantity,0)}:{}),
    ...(Number.isFinite(data.value)?{value:data.value,currency:"INR"}:{}),
    ...(name==="search"?{search_string:String(data.search_term||"").slice(0,80)}:{})
  },...(data.event_id?{id:data.event_id}:{})}:null;
  const google={...(items.length?{items}:{}),...(Number.isFinite(data.google_value??data.value)?{value:data.google_value??data.value,currency:"INR"}:{}),
    ...(name==="purchase"?{transaction_id:data.transaction_id,tax:data.tax,shipping:data.shipping,payment_type:data.payment_method}:{}),
    ...(name==="search"?{search_term:String(data.search_term||"").slice(0,80)}:{})};
  return{meta,google};
}
export function safePageLocation(location,ads=false){
  if(/^\/(?:orders\/[a-f0-9]{64}|checkout\/complete\/[a-f0-9-]{36})/.test(location.pathname))return`${location.origin}/checkout/complete`;
  const clean=new URL(`${location.origin}${location.pathname}`),source=new URLSearchParams(location.search||"");
  for(const key of["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id",...(ads?["gclid","gbraid","wbraid","fbclid"]:[])]){
    const value=source.get(key)||"";
    if(value.length<=400&&/^[\p{L}\p{N}\p{M}_.~ +\-]+$/u.test(value))clean.searchParams.set(key,value);
  }
  return clean.href;
}
if(typeof document!=="undefined"){
  const node=document.getElementById("store-marketing-config");
  if(node)boot(JSON.parse(node.textContent));
}
function boot(config){
  const s=config.settings,denied={ad_storage:"denied",analytics_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"};
  const gpc=navigator.globalPrivacyControl===true,dnt=navigator.doNotTrack==="1";
  const privateReceipt=/^\/orders\/[a-f0-9]{64}$/.test(location.pathname);
  const initialFbclid=new URL(location.href).searchParams.get("fbclid");
  const initialSearch=new URL(location.href).searchParams.get("q")||"";
  const debug=new URL(location.href).searchParams.has("gtm_debug");
  const domReady=document.readyState==="complete"?Promise.resolve():new Promise(resolve=>document.addEventListener("DOMContentLoaded",resolve,{once:true}));
  let consent=config.consent?{analytics:config.consent.analytics&&!dnt,ads:config.consent.ads&&!gpc&&!dnt}:null;
  let readyMeta=false,readyGoogle=false,loading=null,currentCart=null,checkoutStarted=false,pageViewed=false,productViewed=false,purchaseRunning=false,searchViewed=false;
  let consentUpdating=false;
  let checkoutPending=false;
  const allowed=()=>({analytics:!consentUpdating&&s.google_enabled&&consent?.analytics===true,ads:!consentUpdating&&consent?.ads===true});
  const request=async(path,body)=>{
    const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Your choices could not be saved. Please try again.");return data;
  };
  function script(src){
    return new Promise(resolve=>{
      const el=document.createElement("script");el.async=true;el.src=src;
      const timer=setTimeout(()=>resolve(false),10000);
      el.onload=()=>{clearTimeout(timer);resolve(true);};el.onerror=()=>{clearTimeout(timer);resolve(false);};document.head.append(el);
    });
  }
  function consentState(){
    const a=allowed();return{analytics_storage:a.analytics?"granted":"denied",ad_storage:a.ads?"granted":"denied",ad_user_data:a.ads?"granted":"denied",ad_personalization:a.ads?"granted":"denied"};
  }
  async function load(){
    if(privateReceipt)return; // The server exchanges this URL for an HttpOnly receipt cookie first.
    if(loading)return loading;
    loading=(async()=>{
      await domReady;
      const a=allowed(),jobs=[];
      // Do not expose arbitrary URL queries/fragments to vendor SDKs.
      if(location.search||location.hash){
        const clean=new URL(safePageLocation(location,a.ads));
        if(/^\/checkout\/complete\//.test(location.pathname))clean.pathname=location.pathname;
        history.replaceState(history.state,"",clean.pathname+clean.search);
      }
      if(s.meta_enabled&&a.ads){
        if(!window.fbq){const f=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments);};f.queue=[];f.loaded=true;f.version="2.0";f.push=f;window.fbq=f;window._fbq=f;}
        window.fbq("consent","grant");window.fbq("set","autoConfig",false,s.meta_pixel_id);
        window.fbq("init",s.meta_pixel_id);
        const fbclid=initialFbclid;
        if(fbclid&&/^[A-Za-z0-9_-]{10,400}$/.test(fbclid)&&!document.cookie.split(";").some(v=>v.trim().startsWith("_fbc=")))
          document.cookie=`_fbc=fb.1.${Date.now()}.${fbclid}; Path=/; Max-Age=7776000; Secure; SameSite=Lax`;
        jobs.push(script("https://connect.facebook.net/en_US/fbevents.js").then(ok=>{readyMeta=ok;}));
      }
      if(s.google_enabled&&(a.analytics||(a.ads&&s.google_ads_id))){
        window.dataLayer=window.dataLayer||[];
        window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
        window.gtag("consent","default",denied);
        window.gtag("consent","update",consentState());window.gtag("js",new Date());
        const opts={send_page_view:false,cookie_domain:location.hostname,cookie_prefix:`lb_${config.store_id.replace(/-/g,"")}`,
          cookie_flags:"SameSite=Lax;Secure",allow_google_signals:false,allow_ad_personalization_signals:false,...(debug?{debug_mode:true}:{})};
        if(a.analytics)window.gtag("config",s.ga4_measurement_id,opts);
        if(a.ads&&s.google_ads_id)window.gtag("config",s.google_ads_id,{...opts,allow_enhanced_conversions:s.google_enhanced_conversions});
        const tag=a.analytics?s.ga4_measurement_id:s.google_ads_id;
        jobs.push(script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tag)}`).then(ok=>{readyGoogle=ok;}));
      }
      await Promise.all(jobs);
    })();return loading;
  }
  async function track(name,data={}){
    if(name==="cart_ready"){currentCart=data;if(document.querySelector("[data-commerce-config]")?.dataset.page==="checkout")await beginCheckout();return false;}
    let a=allowed();if(!a.analytics&&!a.ads)return false;
    await load();
    a=allowed();if(!a.analytics&&!a.ads)return false;
    const payload=eventPayloads(name,data);let dispatched=false;
    if(s.meta_enabled&&a.ads&&readyMeta&&payload.meta){
      window.fbq("track",payload.meta.name,payload.meta.data,...(payload.meta.id?[{eventID:payload.meta.id}]:[]));dispatched=true;
    }
    if(s.google_enabled&&readyGoogle){
      if(a.analytics){
        window.gtag("event",name,{...payload.google,send_to:s.ga4_measurement_id,
          page_location:safePageLocation(location,a.ads),page_referrer:safeReferrer()});
        dispatched=true;
      }
      const label={purchase:s.google_label_purchase,add_to_cart:s.google_label_add_to_cart,begin_checkout:s.google_label_begin_checkout}[name];
      if(a.ads&&s.google_ads_id&&label){
        if(name==="purchase"&&s.google_enhanced_conversions&&data.user_data)window.gtag("set","user_data",data.user_data);
        window.gtag("event","conversion",{send_to:`${s.google_ads_id}/${label}`,value:data.value,currency:"INR",
          ...(name==="purchase"?{transaction_id:data.transaction_id}:{})});
        if(name==="purchase"&&s.google_enhanced_conversions)window.gtag("set","user_data",null);
        dispatched=true;
      }
    }
    return dispatched;
  }
  // Commerce may report validated carts/additions, not claim a purchase.
  window.lebrandsTrack=(name,data)=>["cart_ready","add_to_cart"].includes(name)?track(name,data).catch(()=>false):Promise.resolve(false);
  const buffered=window.lebrandsTrackingQueue||[];
  delete window.lebrandsTrackingQueue;
  for(const[name,data]of buffered)window.lebrandsTrack(name,data);
  function safeReferrer(){try{const u=new URL(document.referrer);return`${u.origin}${/^\/orders\/[a-f0-9]{64}/.test(u.pathname)?"/checkout/complete":u.pathname}`;}catch{return"";}}
  async function beginCheckout(){
    if(checkoutPending||!checkoutEventAllowed(document.querySelector("[data-commerce-config]")?.dataset.page,currentCart,checkoutStarted))return;
    checkoutPending=true;
    try{if(await track("begin_checkout",currentCart))checkoutStarted=true;}finally{checkoutPending=false;}
  }
  async function purchase(){
    const receiptId=/^\/checkout\/complete\/([a-f0-9-]{36})$/.exec(location.pathname)?.[1];
    if(!receiptId||purchaseRunning||!allowed().ads&&!allowed().analytics)return;
    purchaseRunning=true;
    try{
      await load();if(!readyMeta&&!readyGoogle)return;
      const data=await request("/api/marketing/purchase",{receipt_id:receiptId});
      if(!validPurchasePayload(data,receiptId,config.store_id))return;
      const key=`lebrands:purchase:${config.store_id}:${data.event_id}`;
      const perform=async()=>{
        try{if(localStorage.getItem(key))return;}catch{}
        if(await track("purchase",data)){
          try{localStorage.setItem(key,"1");}catch{}
          await request("/api/marketing/purchase-ack",{receipt_id:receiptId,event_id:data.event_id});
        }
      };
      if(navigator.locks)await navigator.locks.request(key,perform);else await perform();
    }catch{/* Blocked measurement must never block an order receipt. */}
    finally{purchaseRunning=false;}
  }
  async function initial(){
    if(!allowed().analytics&&!allowed().ads)return;
    if(privateReceipt){location.reload();return;}
    if(!pageViewed)pageViewed=await track("page_view");
    if(config.product&&!productViewed){
      const p=config.product;
      productViewed=await track("view_item",{items:[p],...(Number.isFinite(p.price)?{value:p.price}:{})});
    }
    if(!searchViewed&&document.querySelector("[data-catalog]")&&/^[^@:/]{2,80}$/.test(initialSearch)&&!/\d{7,}/.test(initialSearch))
      searchViewed=await track("search",{search_term:initialSearch});
    await beginCheckout();await purchase();
  }
  const prefs=document.createElement("div");prefs.className="store-privacy";
  prefs.innerHTML=`<button type="button" class="store-privacy-open" aria-expanded="false">Privacy choices</button><section class="store-privacy-panel" role="dialog" aria-label="Your privacy choices" hidden>
    <h2>Your privacy choices</h2><p>Essential storage keeps your bag and checkout working. You can choose whether to allow optional measurement and advertising.</p>
    <label><input type="checkbox" name="analytics"> Analytics <small>Helps this brand understand visits and shopping activity.</small></label>
    <label><input type="checkbox" name="ads"> Marketing <small>Helps this brand measure advertising and show relevant ads.</small></label>
    ${gpc||dnt?'<p>Your browser has asked not to be tracked. We respect that choice.</p>':""}
    <p class="store-privacy-reload" hidden>Changing these choices refreshes this page. Your bag is kept, but any checkout details entered here will need to be entered again.</p>
    <p role="status" data-privacy-status></p><div><button type="button" data-privacy="all">Accept all</button><button type="button" data-privacy="save">Save choices</button><button type="button" data-privacy="none">Reject optional</button></div>
    <a href="/policies/privacy">Read this store’s privacy policy</a></section>`;
  document.body.append(prefs);
  const panel=prefs.querySelector("section"),open=prefs.querySelector(".store-privacy-open"),status=prefs.querySelector("[data-privacy-status]");
  const analytics=prefs.querySelector('[name="analytics"]'),ads=prefs.querySelector('[name="ads"]');
  analytics.checked=!!consent?.analytics;ads.checked=!!consent?.ads;
  analytics.disabled=dnt||!s.google_enabled;ads.disabled=dnt||gpc||(!s.meta_enabled&&!s.google_ads_id);
  const toggle=shown=>{panel.hidden=!shown;open.setAttribute("aria-expanded",String(shown));};
  open.onclick=()=>{toggle(panel.hidden);};
  panel.hidden=!!consent;open.setAttribute("aria-expanded",String(!panel.hidden));
  for(const field of[analytics,ads])field.onchange=()=>{prefs.querySelector(".store-privacy-reload").hidden=!(loading&&((!analytics.checked&&consent?.analytics)||(!ads.checked&&consent?.ads)));};
  prefs.addEventListener("click",async e=>{
    const button=e.target.closest("[data-privacy]");if(!button)return;
    const mode=button.dataset.privacy,choice={analytics:mode==="all"?true:mode==="none"?false:analytics.checked,ads:mode==="all"?true:mode==="none"?false:ads.checked,gpc,dnt};
    // Rejecting after tags were loaded needs a clean page, not cookieless pings.
    const next={analytics:choice.analytics&&!analytics.disabled,ads:choice.ads&&!ads.disabled};
    const reload=!!loading&&(!!consent?.analytics!==next.analytics||!!consent?.ads!==next.ads);
    if(reload&&document.querySelector("#checkout-form")&&!prefs.dataset.confirmReload){
      prefs.querySelector(".store-privacy-reload").hidden=false;prefs.dataset.confirmReload="1";
      status.textContent="Choose the same action again to save and refresh. Any entered checkout details will be cleared.";return;
    }
    const buttons=[...prefs.querySelectorAll("[data-privacy]")];buttons.forEach(b=>b.disabled=true);status.textContent="Saving your choices…";
    consentUpdating=true;
    if((consent?.analytics&&!next.analytics)||(consent?.ads&&!next.ads)){
      consent={analytics:!!consent?.analytics&&next.analytics,ads:!!consent?.ads&&next.ads};
      window.fbq?.("consent","revoke");window.gtag?.("consent","update",denied);
    }
    try{
      consent=await request("/api/marketing/consent",{...next,gpc,dnt});
      consentUpdating=false;
      analytics.checked=consent.analytics;ads.checked=consent.ads;
      if(reload){window.fbq?.("consent","revoke");window.gtag?.("consent","update",denied);location.reload();return;}
      status.textContent="Your privacy choices have been saved.";toggle(false);
      // Initial denial did not load any SDKs; a later grant can start them.
      await initial();
    }catch(error){status.textContent=error.message;}
    finally{consentUpdating=false;buttons.forEach(b=>b.disabled=false);}
  });
  // Enforce browser privacy signals in the ledger before sending server events.
  if((gpc&&config.consent?.ads)||(dnt&&(config.consent?.ads||config.consent?.analytics)))
    request("/api/marketing/consent",{analytics:!!consent?.analytics,ads:!!consent?.ads,gpc,dnt}).then(initial).catch(()=>{});
  else initial().catch(()=>{});
}
