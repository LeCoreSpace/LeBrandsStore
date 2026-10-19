import {commerceError} from "../public/commerce-rules.js";
import {sha256} from "../auth/passwords.js";
import {sendResend} from "../email/service.js";
import {renderEmail} from "../email/templates.js";
import {emailPreferencesUrl} from "../email/preferences.js";

const encoder=new TextEncoder();
const hex=bytes=>[...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
const bytes=hex=>Uint8Array.from(hex.match(/../g)||[],v=>parseInt(v,16));
const fail=(message,status=400)=>{throw commerceError(message,undefined,status);};
export function checkoutEmail(value){
  if(typeof value!=="string")fail("Enter your email address.");
  const email=value.trim().toLowerCase();
  if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail("Enter a valid email address.");
  return email;
}
async function key(env){
  if(typeof env.SESSION_SECRET!=="string"||env.SESSION_SECRET.length<32)fail("Email verification is temporarily unavailable.",503);
  return crypto.subtle.importKey("raw",encoder.encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
const sign=async(env,text)=>hex(new Uint8Array(await crypto.subtle.sign("HMAC",await key(env),encoder.encode(text))));
const verify=async(env,text,hash)=>/^[a-f0-9]{64}$/.test(hash||"")&&crypto.subtle.verify("HMAC",await key(env),bytes(hash),encoder.encode(text));
const codeMessage=(id,email,code)=>`checkout-code:v1:${id}:${email}:${code}`;
function otp(){
  const n=new Uint32Array(1);do{crypto.getRandomValues(n);}while(n[0]>=4294000000);
  return String(n[0]%1000000).padStart(6,"0");
}
async function ready(tx){
  const [row]=await tx`SELECT to_regclass('public.checkout_email_challenges') IS NOT NULL AS enabled`;
  if(!row?.enabled)fail("Checkout email verification needs the database update. Please contact the store.",503);
}
export async function startCheckoutEmail(db,store,env,email,{sendEmail=sendResend}={}){
  email=checkoutEmail(email);
  const id=crypto.randomUUID(),code=otp(),emailHash=await sha256(email);
  const codeHash=await sign(env,codeMessage(id,email,code));
  await db.withStore(store.store_id,async tx=>{
    await ready(tx);
    await tx`SELECT store_id FROM public.stores WHERE store_id=${store.store_id} FOR UPDATE`;
    const [count]=await tx`SELECT count(*)::int total,
      count(*) FILTER(WHERE email_hash=${emailHash} AND created_at>now()-interval '15 minutes')::int recent,
      count(*) FILTER(WHERE email_hash=${emailHash} AND created_at>now()-interval '60 seconds')::int cooldown
      FROM public.checkout_email_challenges WHERE store_id=${store.store_id} AND created_at>now()-interval '1 hour'`;
    if(count.cooldown)fail("Wait 60 seconds before requesting another code.",429);
    if(count.recent>=3||count.total>=200)fail("Too many verification requests. Please try again later.",429);
    // Bounded retention; no OTP/email content is kept in this table.
    await tx`DELETE FROM public.checkout_email_challenges WHERE store_id=${store.store_id} AND created_at<now()-interval '1 day'`;
    await tx`UPDATE public.checkout_email_challenges SET consumed_at=now()
      WHERE store_id=${store.store_id} AND email_hash=${emailHash} AND consumed_at IS NULL`;
    await tx`INSERT INTO public.checkout_email_challenges(id,store_id,email_hash,code_hash)
      VALUES(${id},${store.store_id},${emailHash},${codeHash})`;
  });
  try{
    const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:[email],
      ...renderEmail("checkout_verification",{brand_name:store.name,verification_code:code,
        preferences_url:await emailPreferencesUrl(env,email)})};
    await sendEmail(env,message,`checkout-email-${id}`);
    await db.withStore(store.store_id,tx=>tx`UPDATE public.checkout_email_challenges SET delivered=true
      WHERE store_id=${store.store_id} AND id=${id}`);
  }catch{
    await db.withStore(store.store_id,tx=>tx`UPDATE public.checkout_email_challenges SET consumed_at=now()
      WHERE store_id=${store.store_id} AND id=${id}`);
    fail("We could not send the verification email. Please wait a minute and try again.",503);
  }
  return{challenge_id:id,expires_in:600,resend_after:60};
}
export async function completeCheckoutEmail(db,storeId,env,{email,challenge_id,code}){
  email=checkoutEmail(email);
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(challenge_id||"")||!/^\d{6}$/.test(code||""))fail("Enter the six-digit code from your email.");
  const emailHash=await sha256(email);
  const result=await db.withStore(storeId,async tx=>{
    await ready(tx);
    const [row]=await tx`SELECT *,expires_at>now() AS valid FROM public.checkout_email_challenges
      WHERE store_id=${storeId} AND id=${challenge_id} AND email_hash=${emailHash} FOR UPDATE`;
    if(!row||!row.valid||row.consumed_at||!row.delivered||row.attempts>=5)return{ok:false};
    await tx`UPDATE public.checkout_email_challenges SET attempts=attempts+1 WHERE store_id=${storeId} AND id=${challenge_id}`;
    if(!await verify(env,codeMessage(challenge_id,email,code),row.code_hash))return{ok:false};
    await tx`UPDATE public.checkout_email_challenges SET consumed_at=now() WHERE store_id=${storeId} AND id=${challenge_id}`;
    return{ok:true};
  });
  // Fail outside the transaction so failed attempts cannot roll back.
  if(!result.ok)fail("The code is incorrect, expired or already used. Request a new code if needed.");
  const payload={v:1,store:storeId,email,exp:Math.floor(Date.now()/1000)+1800,nonce:crypto.randomUUID()};
  const encoded=btoa(String.fromCharCode(...encoder.encode(JSON.stringify(payload))));
  return{email,token:`${encoded}.${await sign(env,`checkout-proof:v1:${encoded}`)}`,expires_at:payload.exp*1000};
}
export async function requireCheckoutEmail(env,storeId,email,token){
  email=checkoutEmail(email);
  if(typeof token!=="string"||token.length>1800)fail("Verify your email before placing your order.",403);
  const [encoded,signature,extra]=token.split(".");
  if(extra||!await verify(env,`checkout-proof:v1:${encoded}`,signature))fail("Verify your email before placing your order.",403);
  let proof;try{proof=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));}catch{fail("Verify your email again.",403);}
  if(proof.v!==1||proof.store!==storeId||proof.email!==email||!Number.isFinite(proof.exp)||proof.exp<=Date.now()/1000)
    fail("Your email verification has expired or changed. Verify your email again.",403);
  return proof;
}
