import{readJson}from"../store/input.js";
import{marketingAvailable,readMarketing}from"./service.js";
import{publicMarketing,hasMarketing,purchasePayload,contactHashes,marketingError}from"./rules.js";
import{readConsent,saveConsent,purchaseContext,cookieValue}from"./consent.js";
import{sha256}from"../auth/passwords.js";
import{SECURITY_HEADERS}from"../auth/security.js";
import{ipHash}from"../auth/security.js";
import{consumeIpLimit}from"../checkout/repository.js";
const safeJson=v=>JSON.stringify(v).replace(/[<>&\u2028\u2029]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`);
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const privateHeaders={...SECURITY_HEADERS,"cache-control":"no-store","content-type":"application/json; charset=utf-8","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
export function marketingCsp(csp,settings){
  const google=settings.google_enabled?" https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://www.google.com https://www.google.co.in https://www.googleadservices.com https://googleads.g.doubleclick.net https://td.doubleclick.net":"";
  const meta=settings.meta_enabled?" https://connect.facebook.net https://www.facebook.com":"";
  return(csp||"").replace(/script-src ([^;]+)/,(_,v)=>`script-src ${v}${settings.meta_enabled?" https://connect.facebook.net":""}${settings.google_enabled?" https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com":""}`)
    .replace(/connect-src ([^;]+)/,(_,v)=>`connect-src ${v}${google}${meta}`)
    .replace(/img-src ([^;]+)/,(_,v)=>`img-src ${v}${google}${meta}`)
    .replace(/frame-src ([^;]+)/,(_,v)=>`frame-src ${v}${settings.google_enabled?" https://www.googletagmanager.com https://googleads.g.doubleclick.net https://td.doubleclick.net":""}`);
}
export function injectMarketing(html,settings,{storeId,revision,consent,customDomain=false,product=null}){
  settings=publicMarketing(settings);
  if(!hasMarketing(settings))return html;
  const config={store_id:storeId,revision,settings,product,consent:consent?{analytics:consent.analytics,ads:consent.ads}:null};
  const tags=[
    customDomain&&settings.meta_enabled&&settings.meta_domain_verification?`<meta name="facebook-domain-verification" content="${esc(settings.meta_domain_verification)}">`:"",
    settings.google_enabled&&settings.google_site_verification?`<meta name="google-site-verification" content="${esc(settings.google_site_verification)}">`:"",
    '<link rel="stylesheet" href="/assets/store-tracking.css">',
    `<script type="application/json" id="store-marketing-config">${safeJson(config)}</script>`,
    '<script type="module" src="/assets/store-tracking.js"></script>'
  ].join("");
  return html.replace("</head>",`${tags}</head>`);
}
export async function withStoreMarketing(request,db,store,env,serve){
  // Native Preview and design/editor fixtures must never send real brand events.
  if(env.PREVIEW_LIVE_DATABASE==="enabled")return serve(db);
  const id=store.store_id,url=new URL(request.url);
  const cleanReceipt=/^\/checkout\/complete\/([a-f0-9-]{36})$/.exec(url.pathname)?.[1];
  const receiptCookie=publicId=>{
    if(!/^[a-f0-9-]{36}$/.test(publicId||""))return null;
    const stored=cookieValue(request,`__Host-lb-order-${publicId}`).split(":");
    return stored[0]===id&&/^[a-f0-9]{64}$/.test(stored[1]||"")?stored[1]:null;
  };
  const internalRequest=()=>{
    if(!cleanReceipt)return request;
    const token=receiptCookie(cleanReceipt);if(!token)return null;
    const internal=new URL(request.url);internal.pathname=`/orders/${token}`;internal.search="";
    return new Request(internal,request);
  };
  const plainServe=()=>{
    const req=internalRequest();
    return req?serve(db,req):new Response("Open the original order link in your confirmation email to view this order.",{status:404,headers:{...SECURITY_HEADERS,"cache-control":"no-store"}});
  };
  const row=await db.withStore(id,async tx=>await marketingAvailable(tx)?readMarketing(tx,id):null);
  const api=url.pathname.startsWith("/api/marketing/");
  if(!row||!hasMarketing(row))return api?new Response('{"error":"Marketing tracking is not enabled."}',{status:404,headers:privateHeaders}):plainServe();
  let attempted=false,originalResponse;
  try{
    const consent=await readConsent(request,db,id,row,env);
    const receipt=/^\/orders\/([a-f0-9]{64})$/.exec(url.pathname);
    if(receipt&&request.method==="GET"&&(consent?.analytics||consent?.ads)){
      const hash=await sha256(`${id}:${receipt[1]}`);
      const[o]=await db.withStore(id,tx=>tx`SELECT tracking_event_id FROM public.orders WHERE store_id=${id} AND confirmation_hash=${hash}`);
      if(o)return new Response(null,{status:303,headers:{...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer",
        location:`/checkout/complete/${o.tracking_event_id}`,
        "set-cookie":`__Host-lb-order-${o.tracking_event_id}=${id}:${receipt[1]}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=172800`}});
    }
    if(api){
      if(request.method!=="POST")throw marketingError("Method not allowed.",405);
      if(request.headers.get("origin")!==url.origin)throw marketingError("Open this store and try again.",403);
      const body=await readJson(request);
      if(url.pathname==="/api/marketing/consent"){
        const hash=await ipHash(request,env.SESSION_SECRET);
        if(!await db.withStore(id,tx=>consumeIpLimit(tx,id,hash,"marketing")))
          throw marketingError("Please wait a minute before changing your privacy choices again.",429);
        const result=await saveConsent(request,db,id,row,body,env);
        return new Response(JSON.stringify(result.consent),{headers:{...privateHeaders,"set-cookie":result.cookie}});
      }
      if(!["/api/marketing/purchase","/api/marketing/purchase-ack"].includes(url.pathname))throw marketingError("Not found.",404);
      if(Object.keys(body).some(k=>!["receipt_token","receipt_id","event_id"].includes(k)))throw marketingError("Order not found.",404);
      const receiptToken=receiptCookie(body.receipt_id);
      if(!body.receipt_token&&receiptToken)body.receipt_token=receiptToken;
      const ack=url.pathname.endsWith("-ack"),result=await purchaseContext(request,db,id,row,consent,body,ack);
      let response=null;
      if(result){
        response=ack?result:purchasePayload(result.order,result.items);
        if(!ack&&row.google_enabled&&row.google_enhanced_conversions&&consent.ads)
          response.user_data=result.order.tracking_user_data?.google||{};
      }
      return new Response(JSON.stringify(response),{headers:privateHeaders});
    }
    let scoped=db;
    const serveRequest=internalRequest();
    if(!serveRequest)return plainServe();
    if(url.pathname==="/api/checkout/order"&&request.method==="POST"&&consent&&(consent.ads||consent.analytics)){
      const body=await readJson(request.clone());
      const needContact=consent.ads&&((row.meta_enabled&&row.meta_capi_token_encrypted)||(row.google_enabled&&row.google_enhanced_conversions));
      const context={visitor_id:consent.visitor_id,source_url:`${url.origin}/checkout`,
        ...(needContact?{user_data:await contactHashes(body.contact?.email,body.contact?.phone)}:{}),
        ...(consent.ads&&row.meta_enabled&&row.meta_capi_token_encrypted?{
          fbp:/^fb\.\d+\.\d{10,16}\.[A-Za-z0-9_-]{1,150}$/.test(cookieValue(request,"_fbp"))?cookieValue(request,"_fbp"):null,
          fbc:/^fb\.\d+\.\d{10,16}\.[A-Za-z0-9_-]{1,400}$/.test(cookieValue(request,"_fbc"))?cookieValue(request,"_fbc"):null,
          ip:request.headers.get("cf-connecting-ip")||null,ua:request.headers.get("user-agent")?.slice(0,1024)||null
        }:{})};
      scoped={...db,withStore:(storeId,fn)=>db.withStore(storeId,async tx=>{
        if(storeId!==id)throw marketingError("Store not found.",404);
        await tx`SELECT set_config('app.marketing_context',${JSON.stringify(context)},true)`;
        return fn(tx);
      })};
    }
    attempted=true;
    const viewContext={};
    const response=await serve(scoped,serveRequest,viewContext);
    originalResponse=response;
    if(!response||request.method!=="GET"||response.status!==200||!response.headers.get("content-type")?.includes("text/html"))return response;
    if(url.pathname.endsWith("/invoice"))return response;
    const headers=new Headers(response.headers);
    headers.set("cache-control","no-store");
    headers.set("content-security-policy",marketingCsp(headers.get("content-security-policy"),row));
    const customDomain=!url.hostname.endsWith(".lebrands.store")&&url.hostname!=="lebrands.store";
    return new Response(injectMarketing(await response.clone().text(),publicMarketing(row),{storeId:id,revision:row.revision,consent,customDomain,product:viewContext.product}),{
      status:response.status,headers
    });
  }catch(e){
    if(api)return new Response(JSON.stringify({error:e.status?e.message:"Privacy settings are temporarily unavailable."}),{status:e.status||503,headers:privateHeaders});
    // Optional marketing must not stop a shopper from ordering. Never log payloads.
    console.error("Marketing tracking unavailable",{code:"MARKETING_CONTEXT_FAILED"});
    if(attempted){if(originalResponse)return originalResponse;throw e;}
    return plainServe();
  }
}
