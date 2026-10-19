import {renderAccount} from "../ui/accounts.js";
import {escapeHtml,layout,accountHeader,footer} from "../ui/layout.js";
import {readForm,normalizeEmail,SECURITY_HEADERS,ipHash} from "../auth/security.js";
import {sha256,randomToken,hashPassword,validatePassword} from "../auth/passwords.js";
import {signedEmailToken,verifyEmailToken,platformDeliveryKey} from "./tokens.js";
import {renderEmail} from "./templates.js";
import {emailPreferencesUrl} from "./preferences.js";
import {emailsEnabled} from "./worker.js";
const html=(body,status=200)=>new Response(layout({title:"Account | LeBrands.Store",noindex:true,body:`${accountHeader()}<main style="max-width:560px;margin:80px auto;padding:24px;font:16px Arial;line-height:1.7">${body}</main>${footer()}`}),
 {status,headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
const redirect=path=>new Response(null,{status:303,headers:{...SECURITY_HEADERS,location:path,"cache-control":"no-store"}});
export {html as emailAccountDocument};
export const isEmailAccountPath=path=>["/forgot-password","/reset-password","/invite"].includes(path);
export async function handleEmailAccount(request,env,db,user,sessionHash){
 const url=new URL(request.url),path=url.pathname;
 if(!await db.account(emailsEnabled)){
  return new Response(renderAccount("forgot-password",{user}),{headers:{...SECURITY_HEADERS,"content-type":"text/html"}});
 }
 if(path==="/forgot-password"){
  if(request.method==="GET"||request.method==="HEAD")return html(`<h1 style="font-size:28px">Reset your password</h1><p>We will email a single-use password reset link.</p><form method="post"><label>Email address<input style="display:block;padding:14px;margin:12px 0;width:100%;box-sizing:border-box" type="email" name="email" maxlength="254" required autocomplete="email"></label><button type="submit">Send reset link</button></form>`);
  if(request.method!=="POST")return html("<p>Method not allowed.</p>",405);
  const form=await readForm(request),email=normalizeEmail(form.get("email"));
  const rateKey=await ipHash(request,env.SESSION_SECRET);
  const[rate]=await db.account(tx=>tx`SELECT public.email_reset_allowed(${rateKey}) AS allowed`);
  if(email&&env.AI_BUILD_QUEUE&&rate.allowed){
   try{
    const token=await signedEmailToken(env,"reset",1800),delivery=await platformDeliveryKey(env,await sha256(token));
   const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:[email],...renderEmail("reset",{action_url:`https://app.lebrands.store/reset-password?token=${encodeURIComponent(token)}`,preferences_url:await emailPreferencesUrl(env,email)})};
   const[row]=await db.account(async tx=>tx`SELECT public.email_issue_reset(${email},${await sha256(token)},${tx.json(message)},${delivery}) AS id`);
   if(row?.id)await env.AI_BUILD_QUEUE.send({type:"platform-email",id:row.id,delivery_key:delivery});
   }catch{/* Identical response for known, unknown, throttled and temporarily unavailable accounts. */}
  }
  return html("<h1 style=\"font-size:28px\">Check your email</h1><p>If an account exists for that email, a reset link has been requested. The link expires in 30 minutes.</p>");
 }
 const form=request.method==="POST"?await readForm(request):null,token=String(form?.get("token")||url.searchParams.get("token")||"");
 const purpose=path==="/invite"?"invite":"reset";
 if(!await verifyEmailToken(env,token,purpose))return html("<h1 style=\"font-size:28px\">This link is invalid or expired</h1><p>Request a new link to continue.</p>",400);
 if(request.method==="GET"||request.method==="HEAD"){
  return html(`<h1 style="font-size:28px">${purpose==="invite"?"Join your store team":"Choose a new password"}</h1>${purpose==="invite"&&!user?'<p>Sign in using the invited email address, then reopen this invitation.</p><a href="/login">Sign in</a>':
   `<form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}">${purpose==="reset"?'<label>New password<input type="password" name="password" minlength="10" maxlength="128" required autocomplete="new-password" style="display:block;margin:12px 0;padding:14px;width:100%;box-sizing:border-box"></label><label>Confirm password<input type="password" name="confirm" required autocomplete="new-password" style="display:block;margin:12px 0;padding:14px;width:100%;box-sizing:border-box"></label>':""}<button type="submit">${purpose==="invite"?"Accept invitation":"Save new password"}</button></form>`}`);
 }
 if(request.method!=="POST")return html("<p>Method not allowed.</p>",405);
 const tokenHash=await sha256(token);
 if(purpose==="invite"){
  if(!user||!sessionHash)return html('<p>Sign in with the invited email address and reopen this link.</p><a href="/login">Sign in</a>',401);
  const[row]=await db.account(tx=>tx`SELECT public.email_accept_invite(${tokenHash},${sessionHash}) AS id`);
  return redirect(`/stores/${row.id}`);
 }
 const password=String(form.get("password")||""),error=validatePassword(password);
 if(error||password!==form.get("confirm"))return html(`<p>${escapeHtml(error||"The passwords do not match.")}</p><p>Reopen the reset link to try again.</p>`,400);
 const record=await hashPassword(password,env);
 const[row]=await db.account(tx=>tx`SELECT public.email_complete_reset(${tokenHash},${record.password_hash},${record.password_algo},${record.password_iterations},${record.password_salt}) AS changed`);
 if(!row?.changed)return html("<p>This reset link has already been used or has expired.</p>",400);
 return html('<h1 style="font-size:28px">Password changed</h1><p>Previous sessions have been signed out.</p><a href="/login">Sign in with your new password</a>');
}
