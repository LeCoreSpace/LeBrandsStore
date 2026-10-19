// Operator-run only. Never imported by the Worker. Credentials come from Secrets.
import postgres from "postgres";
import {randomUUID} from "node:crypto";
import {clearPgEnvironment,validateSupabaseUrl,logDatabaseFailure} from "./connection.js";
import {assertPasswordPepper,hashPassword,validatePassword} from "../src/auth/passwords.js";

const [action,...extra]=process.argv.slice(2).filter(v=>v!=="--");
if(extra.length||!["create","reset-password","revoke"].includes(action)){
 console.error("Usage: node db/admin-platform-access.js create|reset-password|revoke");
 process.exit(1);
}
clearPgEnvironment();
let sql;
try{
 const username=String(process.env.PLATFORM_ADMIN_USERNAME||"").trim().toLowerCase();
 if(!/^[a-z][a-z0-9_.-]{2,39}$/.test(username))throw new Error("Set PLATFORM_ADMIN_USERNAME in Secrets: 3-40 characters, starting with a letter.");
 let record;
 if(action!=="revoke"){
  const error=validatePassword(process.env.PLATFORM_ADMIN_PASSWORD);
  if(error)throw new Error(`Set PLATFORM_ADMIN_PASSWORD in Secrets. ${error}`);
  await assertPasswordPepper(process.env);
  record=await hashPassword(process.env.PLATFORM_ADMIN_PASSWORD,process.env);
 }
 validateSupabaseUrl(process.env.SUPABASE_DB_URL);
 sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
 await sql.begin(async tx=>{
  const [role]=await tx`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if(!role||(!role.rolsuper&&!role.rolbypassrls))throw new Error("Administrative BYPASSRLS connection required.");
  const [schema]=await tx`SELECT to_regclass('public.platform_administrators') AS definition`;
  if(!schema?.definition)throw new Error("Apply --staged-platform-admin before provisioning credentials.");
  await tx`SELECT pg_advisory_xact_lock(hashtextextended('platform-admin:'||${username},0))`;
  const [existing]=await tx`SELECT user_id FROM public.platform_administrators WHERE username=${username} FOR UPDATE`;
  if(action==="create"){
   if(existing)throw new Error("This administrator already exists. Use reset-password instead.");
   const id=randomUUID(),email=`platform-${id}@lebrands.invalid`;
   await tx`INSERT INTO public.users(id,name,email,password_hash,password_algo,password_iterations,password_salt,must_change_password)
    VALUES(${id},'Platform administrator',${email},${record.password_hash},${record.password_algo},${record.password_iterations},${record.password_salt},false)`;
   await tx`INSERT INTO public.platform_administrators(user_id,username) VALUES(${id},${username})`;
   await tx`INSERT INTO public.platform_business_reviewers(user_id,active) VALUES(${id},true)`;
  }else{
   if(!existing)throw new Error("Administrator not found.");
   if(action==="revoke"){
    await tx`UPDATE public.platform_administrators SET active=false WHERE user_id=${existing.user_id}`;
    await tx`UPDATE public.platform_business_reviewers SET active=false WHERE user_id=${existing.user_id}`;
   }else{
    await tx`UPDATE public.users SET password_hash=${record.password_hash},password_algo=${record.password_algo},
     password_iterations=${record.password_iterations},password_salt=${record.password_salt},must_change_password=false,updated_at=now() WHERE id=${existing.user_id}`;
    await tx`UPDATE public.platform_administrators SET active=true WHERE user_id=${existing.user_id}`;
    await tx`UPDATE public.platform_business_reviewers SET active=true WHERE user_id=${existing.user_id}`;
   }
   await tx`UPDATE public.sessions SET revoked_at=now() WHERE user_id=${existing.user_id} AND revoked_at IS NULL`;
  }
 });
 console.log(action==="create"?"Platform administrator created. Sign in at https://app.lebrands.store/admin/login with the username and password in your Secrets.":action==="revoke"?"Platform administrator access revoked and all sessions ended.":"Platform administrator password updated and all previous sessions ended.");
}catch(error){
 logDatabaseFailure("Platform administrator provisioning failed",error,process.env.SUPABASE_DB_URL);
 process.exitCode=1;
}finally{if(sql)await sql.end({timeout:5});}
