import {sha256} from "../auth/passwords.js";
import {escapeHtml as esc} from "../ui/layout.js";
import {readForm} from "../auth/security.js";

export const OPTIONAL_EMAIL_TYPES = new Set(["shipped","delivered"]);
const scopeValid = value => value==="platform" || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const encode = value => btoa(value).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const decode = value => atob(value.replaceAll("-","+").replaceAll("_","/"));
async function key(env,usage){
  if(!env.SESSION_SECRET)throw new Error("Email preference signing is not configured.");
  return crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,[usage]);
}
export async function emailPreferencesUrl(env,recipient,storeId=null){
  const scope=String(storeId||"platform").toLowerCase();
  if(!scopeValid(scope)||!String(recipient||"").includes("@"))throw new Error("Invalid email preference recipient.");
  const recipient_hash=await sha256(String(recipient).trim().toLowerCase());
  // This capability can only change optional notifications, never expose an
  // address/order or disable essential messages. It deliberately does not expire.
  const payload=encode(JSON.stringify({v:1,scope,recipient_hash}));
  const bytes=await crypto.subtle.sign("HMAC",await key(env,"sign"),new TextEncoder().encode(`email-preferences-v1:${payload}`));
  const token=`${payload}.${encode(String.fromCharCode(...new Uint8Array(bytes)))}`;
  return `https://app.lebrands.store/email-preferences?token=${token}`;
}
export async function verifyPreferencesToken(env,token){
  try{
    if(typeof token!=="string"||token.length>700||!/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(token))return null;
    const [payload,signature]=token.split(".");
    const valid=await crypto.subtle.verify("HMAC",await key(env,"verify"),
      Uint8Array.from(decode(signature),char=>char.charCodeAt(0)),new TextEncoder().encode(`email-preferences-v1:${payload}`));
    if(!valid)return null;
    const data=JSON.parse(decode(payload));
    return data.v===1&&scopeValid(data.scope)&&/^[a-f0-9]{64}$/.test(data.recipient_hash)?data:null;
  }catch{return null;}
}
export async function preferencesEnabled(tx){
  const [row]=await tx`SELECT to_regprocedure('public.email_notification_preference_get(text,text)') IS NOT NULL AS enabled`;
  return row?.enabled===true;
}
export async function optionalUpdatesAllowed(db,scope,recipient){
  return db.account(async tx=>{
    if(!await preferencesEnabled(tx))return true;
    const hash=await sha256(String(recipient).trim().toLowerCase());
    const [row]=await tx`SELECT public.email_notification_preference_get(${scope},${hash}) AS enabled`;
    return row?.enabled===true;
  });
}
function page(content,status=200){
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences | LeBrands.Store</title><style>body{margin:0;background:#f5f3ef;color:#202725;font:16px/1.6 Arial,sans-serif}main{max-width:560px;margin:9vh auto;padding:36px;background:white;border-top:5px solid #702440;box-shadow:0 8px 40px #2027250b}h1{font-size:30px;line-height:1.2}a{color:#702440}button{padding:14px 22px;background:#702440;color:white;border:0;border-radius:6px;font-size:16px;cursor:pointer}label{display:block;padding:20px 0}input{margin-right:8px}small{display:block;color:#59625c;margin:22px 0}header{font-weight:bold;color:#702440}@media(max-width:600px){main{margin:20px 12px;padding:24px}}</style></head><body><main><header>LeBrands.Store</header>${content}</main></body></html>`,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
}
export async function handleEmailPreferences(request,env,db){
  if(!["GET","HEAD","POST"].includes(request.method))return page("<h1>Method not allowed</h1>",405);
  const url=new URL(request.url);
  let form=null;
  if(request.method==="POST"){
    if(Number(request.headers.get("content-length"))>4096)return page("<h1>Request too large</h1>",413);
    try{form=await readForm(request);if(form.toString().length>4096)return page("<h1>Request too large</h1>",413);}catch{return page("<h1>Invalid request</h1>",400);}
  }
  const token=form?.get("token")||url.searchParams.get("token")||"";
  const capability=await verifyPreferencesToken(env,token);
  if(!capability)return page("<h1>This preference link is not valid</h1><p>Open the link from your most recent email. No preferences have changed.</p>",400);
  const ready=await db.account(preferencesEnabled);
  if(!ready)return page("<h1>Email preferences are not available yet</h1><p>No preferences have changed. Please contact the sender for help.</p>",503);
  const {scope,recipient_hash}=capability;
  const enabled=await db.account(async tx=>{
    if(request.method==="POST"){
      const allow=form.get("List-Unsubscribe")==="One-Click"?false:form.get("optional_updates")==="on";
      await tx`SELECT public.email_notification_preference_set(${scope},${recipient_hash},${allow})`;
      return allow;
    }
    const [row]=await tx`SELECT public.email_notification_preference_get(${scope},${recipient_hash}) AS enabled`;
    return row?.enabled===true;
  });
  const response=page(`<h1>Email preferences</h1>${request.method==="POST"?`<p role="status">${enabled?"Optional delivery updates are enabled.":"You are unsubscribed from optional delivery updates."}</p>`:""}<p>These preferences apply to ${scope==="platform"?"your LeBrands.Store account":"the store that sent this email"}. They do not change preferences for other stores.</p><form method="post" action="/email-preferences"><input type="hidden" name="token" value="${esc(token)}"><label><input type="checkbox" name="optional_updates" ${enabled?"checked":""}>Optional shipping and delivery updates</label><button type="submit">Save preferences</button></form><small>Essential order confirmations, payments, refunds and account-security messages remain enabled. These emails contain no marketing. No promotional email subscription is created by this page.</small>`);
  return request.method==="HEAD"?new Response(null,{status:response.status,headers:response.headers}):response;
}
