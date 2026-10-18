// Operator-run only. Never import into the Worker or run automatically.
import postgres from "postgres";
import {clearPgEnvironment,validateSupabaseUrl,logDatabaseFailure} from "./connection.js";

const args=process.argv.slice(2).filter(v=>v!=="--");
const [action,userId]=args;
if(args.length!==2||!["grant","revoke"].includes(action)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId||"")){
  console.error("Usage: node db/admin-business-reviewer.js grant|revoke <existing-account-uuid>");
  process.exit(1);
}
clearPgEnvironment();
let sql;
try {
  validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
  await sql.begin(async tx=>{
    const [role]=await tx`SELECT current_user AS role,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user`;
    if(role?.role!=="postgres"||!role.rolbypassrls)throw new Error("Administrative postgres access required.");
    const [schema]=await tx`SELECT to_regclass('public.platform_business_reviewers') AS definition`;
    if(!schema?.definition)throw new Error("Apply the business document review migration first.");
    const [account]=await tx`SELECT id FROM public.users WHERE id=${userId}`;
    if(!account)throw new Error("Account not found.");
    if(action==="grant")
      await tx`INSERT INTO public.platform_business_reviewers(user_id,active) VALUES(${userId},true) ON CONFLICT(user_id) DO UPDATE SET active=true`;
    else await tx`UPDATE public.platform_business_reviewers SET active=false WHERE user_id=${userId}`;
  });
  console.log(action==="grant"?"Platform business reviewer access granted. No business submission was approved.":"Platform business reviewer access revoked.");
}catch(error){
  logDatabaseFailure("Business reviewer access change failed",error,process.env.SUPABASE_DB_URL);
  process.exitCode=1;
}finally{if(sql)await sql.end({timeout:5});}
