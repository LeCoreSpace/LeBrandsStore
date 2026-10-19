import postgres from "postgres";
import {clearPgEnvironment,validateSupabaseUrl,printConnectionTarget,logDatabaseFailure} from "./connection.js";
import {transitionAccountStores} from "./account-store-transition.js";

clearPgEnvironment();let sql;
try{
 const args=process.argv.slice(2),options={apply:false,dates:{}};
 for(const arg of args){
  if(arg==="--apply")options.apply=true;
  else if(arg.startsWith("--draft="))options.draft=arg.slice(8);
  else if(arg.startsWith("--keep-live="))options.keep=arg.slice(12);
  else if(arg.startsWith("--first-publication=")){
   const value=arg.slice(20),separator=value.indexOf(":"),store=value.slice(0,separator),date=value.slice(separator+1);
   if(separator<1||!/^[a-z0-9-]{3,30}$/.test(store)||!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.now())
    throw new Error("Use --first-publication=subdomain:ISO-timestamp with an actual historical publication date.");
   options.dates[store]=date;
  }else throw new Error("Use --apply, --draft=subdomain, --keep-live=subdomain, or --first-publication=subdomain:ISO-timestamp.");
 }
 printConnectionTarget(validateSupabaseUrl(process.env.SUPABASE_DB_URL));
 sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
 const result=await sql.begin(async tx=>{
  if(!options.apply)await tx`SET TRANSACTION READ ONLY`;
  const [role]=await tx`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if(!role||(!role.rolsuper&&!role.rolbypassrls))throw new Error("Administrative connection required.");
  if(options.apply)await tx`SELECT pg_advisory_xact_lock(hashtextextended('account-store-transition',0))`;
  return transitionAccountStores(tx,options);
 });
 console.log(JSON.stringify({applied:options.apply,results:result}));
 if(result.some(row=>row.result==="requires_original_publication_date")){
  console.error("Some stores were left unchanged because their original publication date needs confirmation.");
 }
}catch(error){logDatabaseFailure("Account store transition failed",error,process.env.SUPABASE_DB_URL);process.exitCode=1;}
finally{if(sql)await sql.end({timeout:5});}
