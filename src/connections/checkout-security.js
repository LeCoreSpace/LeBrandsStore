import {sealCredentials,openCredentials} from "./providers.js";

const failure=()=>Object.assign(new Error("We could not finish your store’s checkout security setup. Your included address keeps working. Please contact support."),{status:503,checkoutSecurity:true});
const storageKey=env=>{
  if(typeof env.CHECKOUT_SECURITY_ENCRYPTION_KEY!=="string"||env.CHECKOUT_SECURITY_ENCRYPTION_KEY.length<32)throw failure();
  return env.CHECKOUT_SECURITY_ENCRYPTION_KEY;
};
const accountId=/^[a-f0-9]{32}$/i;
const siteKey=/^[A-Za-z0-9_-]{10,64}$/;
const ownerName=id=>`LeBrands checkout ${id}`;
const covered=(hostname,domains)=>Array.isArray(domains)&&domains.some(d=>typeof d==="string"&&(hostname===d||hostname.endsWith(`.${d}`)));
async function api(env,path,options,fetcher){
  if(!env.CLOUDFLARE_API_TOKEN)throw failure();
  let response,body;
  try{
    response=await fetcher(`https://api.cloudflare.com/client/v4${path}`,{
      ...options,headers:{authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,"content-type":"application/json"},
      redirect:"manual",signal:AbortSignal.timeout(12000)});
    body=await response.json();
  }catch{throw failure();}
  if(!response.ok||body.success!==true)throw failure();
  return body;
}
async function schema(tx){
  const [r]=await tx`SELECT to_regclass('public.store_checkout_security') IS NOT NULL AS ready`;
  if(!r?.ready)throw failure();
}
// Called only after tenant/owner/revision, real DNS, SSL and platform checks.
// The caller's store lock serializes widget creation/reconfiguration.
export async function ensureCheckoutSecurity(tx,storeId,hostname,env,fetcher=fetch){
  const encryptionKey=storageKey(env);
  await schema(tx);
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  const [owned]=await tx`SELECT id FROM public.domains WHERE store_id=${storeId} AND hostname=${hostname} AND status<>'disabled'`;
  if(!owned)throw failure();
  const zone=(await api(env,`/zones/${env.CLOUDFLARE_ZONE_ID}`,{method:"GET"},fetcher)).result;
  if(!accountId.test(zone?.account?.id))throw failure();
  const root=`/accounts/${zone.account.id}/challenges/widgets`;
  const [saved]=await tx`SELECT site_key FROM public.store_checkout_security WHERE store_id=${storeId}`;
  let widget;
  if(saved){
    if(!siteKey.test(saved.site_key))throw failure();
    widget=(await api(env,`${root}/${saved.site_key}`,{method:"GET"},fetcher)).result;
  }else{
    // Recover a remote create that succeeded before a local transaction failed.
    // Never adopt another store's widget or a shared platform widget.
    for(let page=1;page<=100;page++){
      const listing=await api(env,`${root}?page=${page}&per_page=100`,{method:"GET"},fetcher);
      if(!Array.isArray(listing.result))throw failure();
      const matches=listing.result.filter(w=>w.name===ownerName(storeId));
      if(matches.length>1)throw failure();
      if(matches[0]){
        if(!siteKey.test(matches[0].sitekey))throw failure();
        widget=(await api(env,`${root}/${matches[0].sitekey}`,{method:"GET"},fetcher)).result;
        break;
      }
      if(listing.result.length<100||page>=(listing.result_info?.total_pages||Infinity))break;
      if(page===100)throw failure();
    }
  }
  const active=await tx`SELECT hostname FROM public.domains WHERE store_id=${storeId} AND status='active'`;
  const domains=[...new Set([...active.map(r=>r.hostname),hostname])].sort();
  if(domains.length>10)throw failure();
  if(widget && (widget.name!==ownerName(storeId)||widget.mode!=="managed"))throw failure();
  if(!widget){
    widget=(await api(env,root,{method:"POST",body:JSON.stringify({
      name:ownerName(storeId),domains,mode:"managed",clearance_level:"no_clearance"})},fetcher)).result;
  }else if(!covered(hostname,widget.domains)||domains.some(d=>!covered(d,widget.domains))){
    widget=(await api(env,`${root}/${widget.sitekey}`,{method:"PUT",body:JSON.stringify({
      name:widget.name,domains,mode:widget.mode,clearance_level:widget.clearance_level,
      bot_fight_mode:widget.bot_fight_mode,ephemeral_id:widget.ephemeral_id,offlabel:widget.offlabel})},fetcher)).result;
  }
  if(!widget||widget.mode!=="managed"||widget.name!==ownerName(storeId)||!siteKey.test(widget.sitekey)||typeof widget.secret!=="string"||widget.secret.length<10||
      !domains.every(d=>covered(d,widget.domains)))throw failure();
  const checked=(await api(env,`${root}/${widget.sitekey}`,{method:"GET"},fetcher)).result;
  if(checked?.mode!=="managed"||checked.name!==ownerName(storeId)||checked.sitekey!==widget.sitekey||checked.secret!==widget.secret||
      !domains.every(d=>covered(d,checked.domains)))throw failure();
  const ciphertext=await sealCredentials(encryptionKey,storeId,"checkout-turnstile",{site_key:widget.sitekey,secret:widget.secret});
  await tx`INSERT INTO public.store_checkout_security(store_id,site_key,credentials_ciphertext,hostnames)
    VALUES(${storeId},${widget.sitekey},${ciphertext},${JSON.stringify(domains)}::text::jsonb)
    ON CONFLICT(store_id) DO UPDATE SET site_key=EXCLUDED.site_key,credentials_ciphertext=EXCLUDED.credentials_ciphertext,
      hostnames=EXCLUDED.hostnames,checked_at=now()`;
  return {status:"ready",checked_at:new Date().toISOString()};
}
// Included platform hosts retain the established platform widget. Custom
// checkout never silently falls back to a widget that cannot cover its host.
export async function checkoutSecurityEnvironment(db,store,request,env){
  const host=new URL(request.url).hostname;
  if(host.endsWith(".lebrands.store"))return env;
  let stage="read";
  try{
  const row=await db.withStore(store.store_id,async tx=>{
    const [r]=await tx`SELECT site_key,credentials_ciphertext,hostnames::text FROM public.store_checkout_security WHERE store_id=${store.store_id}`;
    return r;
  });
  stage="hostname";
  if(!row||!JSON.parse(row.hostnames).includes(host))throw failure();
  stage="decrypt";
  const credentials=await openCredentials(storageKey(env),store.store_id,"checkout-turnstile",row.credentials_ciphertext);
  stage="key-match";
  if(credentials.site_key!==row.site_key||typeof credentials.secret!=="string")throw failure();
  return {...env,TURNSTILE_SITE_KEY:credentials.site_key,TURNSTILE_SECRET_KEY:credentials.secret};
  }catch(error){
    console.error(`CHECKOUT_SECURITY_STAGE ${stage} ${/^[0-9A-Z]{5}$/.test(error?.code||"")?error.code:"CONFIGURATION"}`);
    throw Object.assign(new Error("This store’s checkout is temporarily unavailable. Your bag is kept. Please try again shortly."),{status:503});
  }
}
