// Operator-only. Do not run with the application's restricted connection.
import postgres from "postgres";
const [storeId,reason]=process.argv.slice(2);
if(!/^[a-f0-9-]{36}$/i.test(storeId||"")||!reason?.trim()||reason.length>300){
  console.error('Usage: node db/admin/grant-ai-build.js STORE_UUID "Support reason"');process.exit(1);
}
if(!process.env.SUPABASE_DB_URL){console.error("The administrative database connection is not configured.");process.exit(1);}
const sql=postgres(process.env.SUPABASE_DB_URL,{max:1,prepare:false,fetch_types:false});
try{
  await sql.begin(async tx=>{
    const[role]=await tx`SELECT rolbypassrls OR rolsuper AS allowed FROM pg_roles WHERE rolname=current_user`;
    if(!role?.allowed)throw new Error("Administrator role required.");
    const[store]=await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
    if(!store)throw new Error("Store not found.");
    await tx`INSERT INTO public.ai_build_allowances(store_id,extra_builds,reason)
      VALUES(${storeId},1,${reason}) ON CONFLICT(store_id) DO UPDATE
      SET extra_builds=public.ai_build_allowances.extra_builds+1,reason=EXCLUDED.reason,updated_at=now()`;
  });
  console.log("One extra AI build granted.");
}catch{console.error("Could not grant the build. Check the store, administrator role and migration prerequisites.");process.exitCode=1;}
finally{await sql.end();}
