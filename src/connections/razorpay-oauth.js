import {sealCredentials,openCredentials} from "./providers.js";
import {sha256,randomToken} from "../auth/passwords.js";
import {SECURITY_HEADERS,isValidOrigin} from "../auth/security.js";
import {readJson} from "../store/input.js";
import {audit} from "../dashboard/repository.js";
import {inspectRazorpayPayment,diagnosticPaymentId} from "./razorpay-diagnostics.js";

export const OAUTH_CALLBACK="/integrations/razorpay/callback";
export const OAUTH_WEBHOOK="/webhooks/razorpay/oauth";
const UUID="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const route=new RegExp(`^/api/stores/(${UUID})/integrations/razorpay/(start|disconnect|refresh|inspect-payment)$`,"i");
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const parse=v=>typeof v==="string"?JSON.parse(v):v||{};
const key=env=>env.INTEGRATION_ENCRYPTION_KEY||env.SESSION_SECRET;
export function oauthConfig(env){
  const mode=env.RAZORPAY_OAUTH_MODE;
  if(!["test","live"].includes(mode)||!env.RAZORPAY_OAUTH_CLIENT_ID||!env.RAZORPAY_OAUTH_CLIENT_SECRET)
    fail("Razorpay authorisation is not configured for this environment.",503);
  const uri=env.RAZORPAY_OAUTH_REDIRECT_URI||`https://app.lebrands.store${OAUTH_CALLBACK}`;
  let u;try{u=new URL(uri);}catch{fail("Razorpay callback configuration is invalid.",503);}
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!==OAUTH_CALLBACK)
    fail("Razorpay callback configuration is invalid.",503);
  return {mode,client_id:env.RAZORPAY_OAUTH_CLIENT_ID,client_secret:env.RAZORPAY_OAUTH_CLIENT_SECRET,redirect_uri:u.href};
}
export function oauthAvailable(env){try{oauthConfig(env);return true;}catch{return false;}}
export const isRazorpayOAuthRoute=path=>path===OAUTH_CALLBACK||route.test(path);
async function provider(path,body,fetcher=fetch){
  let response;
  try{response=await fetcher(`https://auth.razorpay.com/${path}`,{method:"POST",redirect:"manual",
    signal:AbortSignal.timeout(12000),headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
  catch{fail("Razorpay could not confirm the request. Your existing integration is unchanged; start authorisation again.",502);}
  if(!response.ok)fail("Razorpay did not accept the authorisation. Reconnect your account.",response.status===429?429:502);
  try{return await response.json();}catch{fail("Razorpay returned an unreadable authorisation response.",502);}
}
export function tokenCredentials(body,cfg,previous=null){
  if(!body||typeof body!=="object")fail("Razorpay returned an unreadable token response.",502);
  const account=body.razorpay_account_id||previous?.account_id,ttl=Number(body.expires_in);
  if(body.token_type!=="Bearer"||!/^acc_[A-Za-z0-9]{5,80}$/.test(account||"")||
    !new RegExp(`^rzp_${cfg.mode}_oauth_[A-Za-z0-9]{5,100}$`).test(body.public_token||"")||
    ![body.access_token,body.refresh_token].every(x=>typeof x==="string"&&x.length>=16&&x.length<=16000&&!/\s/.test(x))||
    !Number.isFinite(ttl)||ttl<60||ttl>366*86400||previous&&account!==previous.account_id)
    fail("Razorpay returned inconsistent account or mode information.",502);
  return {auth_type:"oauth",mode:cfg.mode,client_id:cfg.client_id,account_id:account,
    public_token:body.public_token,access_token:body.access_token,refresh_token:body.refresh_token,
    expires_at:Date.now()+ttl*1000};
}
async function row(tx,id){
  return (await tx`SELECT status,credentials_ciphertext,metadata::text FROM public.integrations
    WHERE store_id=${id} AND provider='razorpay' FOR UPDATE`)[0];
}
async function owner(tx,id,userId){
  const [m]=await tx`SELECT role FROM public.store_members WHERE store_id=${id} AND user_id=${userId}`;
  if(m?.role!=="owner")fail("Only the store owner can manage Razorpay authorisation.",403);
}
export async function beginOAuth(tx,id,userId,sessionHash,env,replace=false){
  await owner(tx,id,userId);const cfg=oauthConfig(env),saved=await row(tx,id),meta=parse(saved?.metadata);
  if(meta.revocation_pending)fail("Finish disconnecting the previous authorisation before reconnecting.");
  if(saved?.status==="connected"&&!replace)fail("Confirm replacing the current Razorpay integration first.");
  if(saved?.status==="connected"&&meta.mode==="live"&&cfg.mode==="test")
    fail("A test authorisation cannot replace a live payment integration.");
  await sealCredentials(key(env),id,"razorpay",{});
  const state=`${id}.${randomToken()}`;
  const pending={hash:await sha256(state),session_hash:sessionHash,expires_at:Date.now()+10*60000,
    base:await sha256(saved?.credentials_ciphertext||""),mode:cfg.mode,client_id:cfg.client_id,
    redirect_uri:cfg.redirect_uri,status:"pending"};
  await tx`INSERT INTO public.integrations(store_id,provider,status,credentials_ciphertext,metadata)
    VALUES(${id},'razorpay','disconnected','',${JSON.stringify({oauth_pending:pending})}::text::jsonb)
    ON CONFLICT(store_id,provider) DO UPDATE SET metadata=public.integrations.metadata||
      ${JSON.stringify({oauth_pending:pending})}::text::jsonb,updated_at=now()`;
  await audit(tx,id,userId,"integration.oauth_started","store",id,{provider:"razorpay",mode:cfg.mode});
  const url=new URL("https://auth.razorpay.com/authorize");
  for(const [k,v] of Object.entries({client_id:cfg.client_id,response_type:"code",redirect_uri:cfg.redirect_uri,scope:"read_write",state}))url.searchParams.set(k,v);
  return {authorize_url:url.href};
}
export async function consumeOAuth(tx,id,userId,sessionHash,state,env){
  await owner(tx,id,userId);const cfg=oauthConfig(env),saved=await row(tx,id),meta=parse(saved?.metadata),p=meta.oauth_pending;
  if(!p||p.status!=="pending"||p.expires_at<Date.now()||p.hash!==await sha256(state)||
    p.session_hash!==sessionHash||p.client_id!==cfg.client_id||p.mode!==cfg.mode||p.redirect_uri!==cfg.redirect_uri||
    p.base!==await sha256(saved?.credentials_ciphertext||""))fail("This authorisation expired or was already used. Start again.");
  p.status="exchanging";
  await tx`UPDATE public.integrations SET metadata=${JSON.stringify(meta)}::text::jsonb,updated_at=now()
    WHERE store_id=${id} AND provider='razorpay'`;
  return p;
}
export async function completeOAuth(tx,id,userId,p,credentials,env){
  await owner(tx,id,userId);const saved=await row(tx,id),meta=parse(saved?.metadata),current=meta.oauth_pending;
  if(!current||current.status!=="exchanging"||current.hash!==p.hash||current.expires_at<Date.now()||
    current.base!==await sha256(saved?.credentials_ciphertext||""))fail("The integration changed during authorisation. Start again.");
  const ciphertext=await sealCredentials(key(env),id,"razorpay",credentials);
  const next={auth_type:"oauth",account_id:credentials.account_id,mode:credentials.mode,token_expires_at:credentials.expires_at,credentials_verified:true,
    webhook_verified:false,enabled:false,runtime_ready:false,checked_at:new Date().toISOString()};
  await tx`UPDATE public.integrations SET status='connected',credentials_ciphertext=${ciphertext},
    metadata=${JSON.stringify(next)}::text::jsonb,updated_at=now() WHERE store_id=${id} AND provider='razorpay'`;
  // Authorisation is never consent to activate payments, even when replacing
  // an older account. Existing orders retain their credential snapshots.
  await tx`INSERT INTO public.store_launch_setup(store_id) VALUES(${id}) ON CONFLICT(store_id) DO NOTHING`;
  await tx`UPDATE public.store_launch_setup SET preferences=jsonb_set(preferences,'{payments}','"cod"'::jsonb),
    revision=revision+1,updated_at=now() WHERE store_id=${id}`;
  await audit(tx,id,userId,"integration.oauth_connected","store",id,{provider:"razorpay",mode:credentials.mode});
}
export async function refreshOAuth(tx,id,credentials,env,fetcher=fetch){
  if(credentials.auth_type!=="oauth")return credentials;
  const cfg=oauthConfig(env);
  if(credentials.client_id!==cfg.client_id||credentials.mode!==cfg.mode)fail("Reconnect Razorpay in the correct environment.");
  const saved=await row(tx,id),meta=parse(saved?.metadata);
  let current=credentials;
  if(saved?.status==="connected"&&meta.auth_type==="oauth"&&meta.account_id===credentials.account_id){
    const candidate=await openCredentials(key(env),id,"razorpay",saved.credentials_ciphertext);
    if(candidate.client_id===credentials.client_id&&candidate.mode===credentials.mode&&candidate.account_id===credentials.account_id)current=candidate;
  }
  if(current.expires_at>Date.now()+60000)return current;
  // Never rotate a single-use refresh token inside an order/refund transaction:
  // a later financial rollback would otherwise discard the new token.
  fail("Refresh Razorpay authorisation in payment settings before continuing.");
}
export async function rotateOAuth(db,id,env,fetcher=fetch){
  const cfg=oauthConfig(env),lease=crypto.randomUUID();
  const claimed=await db.withStore(id,async tx=>{
    await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
    const saved=await row(tx,id),meta=parse(saved?.metadata);
    if(saved?.status!=="connected"||meta.auth_type!=="oauth")fail("Reconnect Razorpay first.");
    if(meta.oauth_refresh_attention)fail("Razorpay needs a fresh authorisation. Reconnect your account.");
    if(meta.oauth_refresh?.expires_at>Date.now())fail("Authorisation is already being refreshed. Try again shortly.");
    const c=await openCredentials(key(env),id,"razorpay",saved.credentials_ciphertext);
    if(c.client_id!==cfg.client_id||c.mode!==cfg.mode)fail("Reconnect in the correct environment.");
    meta.oauth_refresh={id:lease,expires_at:Date.now()+60000};
    await tx`UPDATE public.integrations SET metadata=${JSON.stringify(meta)}::text::jsonb,updated_at=now()
      WHERE store_id=${id} AND provider='razorpay'`;
    return c;
  });
  try{
    const next=tokenCredentials(await provider("token",{client_id:cfg.client_id,client_secret:cfg.client_secret,
      grant_type:"refresh_token",refresh_token:claimed.refresh_token},fetcher),cfg,claimed);
    await db.withStore(id,async tx=>{
      await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
      const saved=await row(tx,id),meta=parse(saved?.metadata);
      if(saved?.status!=="connected"||meta.oauth_refresh?.id!==lease)fail("The Razorpay integration changed during refresh.");
      const c=await openCredentials(key(env),id,"razorpay",saved.credentials_ciphertext);
      if(c.refresh_token!==claimed.refresh_token)fail("Authorisation changed during refresh.");
      delete meta.oauth_refresh;meta.token_expires_at=next.expires_at;
      await tx`UPDATE public.integrations SET credentials_ciphertext=${await sealCredentials(key(env),id,"razorpay",next)},
        metadata=${JSON.stringify(meta)}::text::jsonb,updated_at=now() WHERE store_id=${id} AND provider='razorpay'`;
    });
    return {refreshed:true};
  }catch(e){
    await db.withStore(id,async tx=>{
      const saved=await row(tx,id),meta=parse(saved?.metadata);
      if(meta.oauth_refresh?.id!==lease)return;
      delete meta.oauth_refresh;meta.oauth_refresh_attention=true;
      await tx`UPDATE public.integrations SET metadata=${JSON.stringify(meta)}::text::jsonb,updated_at=now()
        WHERE store_id=${id} AND provider='razorpay'`;
    });
    throw e;
  }
}
export function oauthSignatureSecret(credentials,env){
  if(credentials.auth_type!=="oauth")return credentials.key_secret;
  const cfg=oauthConfig(env);
  if(cfg.client_id!==credentials.client_id||cfg.mode!==credentials.mode)fail("Payment authorisation does not match this environment.");
  return cfg.client_secret;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...SECURITY_HEADERS,"content-type":"application/json","cache-control":"private, no-store"}});
const back=(id,result)=>new Response(null,{status:303,headers:{...SECURITY_HEADERS,
  "referrer-policy":"no-referrer",location:`/stores/${id}/settings?connection=payments&oauth=${result}`}});
export async function handleRazorpayOAuth(request,env,db,user,sessionHash,{fetcher=fetch}={}){
  const url=new URL(request.url),m=url.pathname.match(route);
  if(!user||user.must_change_password)return json({error:"Sign in to manage Razorpay."},401);
  if(m){
    if(request.method!=="POST")return json({error:"Method not allowed."},405);
    if(!isValidOrigin(request))return json({error:"This request did not come from the account website."},403);
    const id=m[1];
    try{
      const body=await readJson(request);
      if(m[2]==="inspect-payment"){
        if(!body||body.confirm!==true||Object.keys(body).some(k=>!["confirm","payment_id"].includes(k)))
          return json({error:"Provide a payment ID for the read-only check."},400);
        const paymentId=diagnosticPaymentId(body.payment_id),cfg=oauthConfig(env);
        return json(await db.withMemberStore(id,sessionHash,async tx=>{
          await owner(tx,id,user.id);
          return inspectRazorpayPayment(tx,id,env,cfg,paymentId,fetcher);
        }));
      }
      if(!body||body.confirm!==true||Object.keys(body).some(k=>!["confirm","replace_existing"].includes(k))||
        body.replace_existing!==undefined&&typeof body.replace_existing!=="boolean")return json({error:"Confirm this integration change."},400);
      if(m[2]==="start")return json(await db.withMemberStore(id,sessionHash,tx=>beginOAuth(tx,id,user.id,sessionHash,env,body.replace_existing===true)));
      if(m[2]==="refresh"){
        await db.withMemberStore(id,sessionHash,tx=>owner(tx,id,user.id));
        return json(await rotateOAuth(db,id,env,fetcher));
      }
      const credentials=await db.withMemberStore(id,sessionHash,async tx=>{
        await owner(tx,id,user.id);const saved=await row(tx,id),meta=parse(saved?.metadata);
        if(meta.auth_type!=="oauth")fail("Use the existing integration controls for this account.");
        const c=saved.credentials_ciphertext?await openCredentials(key(env),id,"razorpay",saved.credentials_ciphertext):null;
        delete meta.oauth_pending;Object.assign(meta,{enabled:false,runtime_ready:false,revocation_pending:Boolean(c)});
        await tx`UPDATE public.integrations SET status='disconnected',metadata=${JSON.stringify(meta)}::text::jsonb,
          updated_at=now() WHERE store_id=${id} AND provider='razorpay'`;
        await tx`UPDATE public.store_launch_setup SET preferences=jsonb_set(preferences,'{payments}','"cod"'::jsonb),
          revision=revision+1,updated_at=now() WHERE store_id=${id}`;
        await audit(tx,id,user.id,"integration.oauth_disconnected","store",id,{provider:"razorpay"});
        return c;
      });
      let revoked=!credentials;
      if(credentials){
        try{const cfg=oauthConfig(env);
          if(cfg.client_id!==credentials.client_id||cfg.mode!==credentials.mode)fail("Wrong authorisation environment.");
          await provider("revoke",{client_id:cfg.client_id,client_secret:cfg.client_secret,
            token_type_hint:"access_token",token:credentials.access_token},fetcher);revoked=true;
        }catch{/* Local disable is already committed; retry remains visible. */}
      }
      if(revoked)await db.withMemberStore(id,sessionHash,async tx=>{
        const saved=await row(tx,id),meta=parse(saved?.metadata);
        if(saved?.status!=="disconnected"||!meta.revocation_pending)return;
        const c=await openCredentials(key(env),id,"razorpay",saved.credentials_ciphertext);
        if(c.access_token!==credentials?.access_token)return;
        meta.revocation_pending=false;
        await tx`UPDATE public.integrations SET credentials_ciphertext='',metadata=${JSON.stringify(meta)}::text::jsonb,
          updated_at=now() WHERE store_id=${id} AND provider='razorpay'`;
      });
      return json({disconnected:true,revocation_pending:!revoked});
    }catch(e){return json({error:e.status?e.message:"Razorpay authorisation is temporarily unavailable."},e.status||503);}
  }
  if(url.pathname!==OAUTH_CALLBACK||request.method!=="GET")return json({error:"Method not allowed."},405);
  const state=url.searchParams.get("state")||"",match=state.match(new RegExp(`^(${UUID})\\.[A-Za-z0-9_-]{30,128}$`,"i"));
  if(!match)return json({error:"Invalid Razorpay authorisation state. Start again from your dashboard."},400);
  const id=match[1];
  let issued=null;
  try{
    // Commit nonce consumption before an external request; a failed exchange
    // cannot roll it back and allow an authorisation-code replay.
    const pending=await db.withMemberStore(id,sessionHash,tx=>consumeOAuth(tx,id,user.id,sessionHash,state,env));
    if(url.searchParams.has("error"))return back(id,"cancelled");
    const code=url.searchParams.get("code");
    if(!code||code.length>16000||/[\u0000-\u0020]/.test(code))return back(id,"failed");
    const cfg=oauthConfig(env);
    const credentials=issued=tokenCredentials(await provider("token",{...cfg,grant_type:"authorization_code",code},fetcher),cfg);
    await db.withMemberStore(id,sessionHash,tx=>completeOAuth(tx,id,user.id,pending,credentials,env));
    issued=null;
    return back(id,"connected");
  }catch{
    if(issued)try{
      const cfg=oauthConfig(env);
      await provider("revoke",{client_id:cfg.client_id,client_secret:cfg.client_secret,
        token_type_hint:"access_token",token:issued.access_token},fetcher);
    }catch{/* Never expose orphaned tokens; reconnect remains explicit. */}
    return back(id,"failed");
  }
}
