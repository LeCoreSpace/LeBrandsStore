import { aiError } from "../ai/input.js";
import {sha256,randomToken} from "../auth/passwords.js";
import {renderEmail} from "./templates.js";
import {platformDeliveryKey} from "./tokens.js";
import {emailPreferencesUrl} from "./preferences.js";
const escape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
export async function sendResend(env,message,idempotency) {
  if(!env.RESEND_API_KEY)throw aiError("Email delivery is not configured.",503);
  const response=await fetch("https://api.resend.com/emails",{method:"POST",
    headers:{"content-type":"application/json",authorization:`Bearer ${env.RESEND_API_KEY}`,"Idempotency-Key":idempotency},
    body:JSON.stringify(message),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw aiError("Email delivery is temporarily unavailable.",503);
  const result=await response.json();
  if(typeof result.id!=="string")throw aiError("Email delivery could not be confirmed.",503);
  return result.id;
}
export async function sendVerification(env,db,email,token,storeId,sessionHash){
  const url=`https://app.lebrands.store/verify-email?token=${encodeURIComponent(token)}`;
  const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:[email],...renderEmail("verification",{action_url:url,preferences_url:await emailPreferencesUrl(env,email)})};
  const[ready]=await db.account(tx=>tx`SELECT to_regprocedure('public.email_enqueue_verification(text,text,jsonb,text)') IS NOT NULL AS enabled`);
  if(ready?.enabled){
    const tokenHash=await sha256(token),delivery=await platformDeliveryKey(env,tokenHash);
    const[row]=await db.account(tx=>tx`SELECT public.email_enqueue_verification(${sessionHash},${tokenHash},${tx.json(message)},${delivery}) AS id`);
    await env.AI_BUILD_QUEUE.send({type:"platform-email",id:row.id,delivery_key:delivery});
    return row.id;
  }
  return sendResend(env,message,`verification-${storeId}-${token.slice(0,24)}`);
}
