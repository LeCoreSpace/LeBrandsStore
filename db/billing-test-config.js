// Explicit administrative opt-in. Never prints credentials or capabilities.
import postgres from "postgres";
import {createHash,webcrypto} from "node:crypto";
import {validateSupabaseUrl,clearPgEnvironment} from "./connection.js";
import {billingVerifier} from "../src/billing/razorpay.js";
globalThis.crypto??=webcrypto;
clearPgEnvironment();
let sql;
try{
 if(!["enable","disable"].includes(process.argv[2]))throw Error("Use: node db/billing-test-config.js enable|disable");
 const enable=process.argv[2]==="enable";
 if(enable&&(!/^rzp_test_[A-Za-z0-9]+$/.test(process.env.RAZORPAY_KEY_ID||"")||!process.env.RAZORPAY_KEY_SECRET))
  throw Error("Existing Razorpay test credentials are required. Live keys are rejected.");
 const digest=enable?createHash("sha256").update(await billingVerifier(process.env.SESSION_SECRET)).digest("hex"):null;
 validateSupabaseUrl(process.env.SUPABASE_DB_URL);
 sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
 await sql.begin(async tx=>{
  const [r]=await tx`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if(!r?.rolsuper&&!r?.rolbypassrls)throw Error("An administrative database role is required.");
  await tx`UPDATE public.billing_test_configuration SET enabled=${enable},verifier_sha256=${digest},configured_at=now() WHERE singleton`;
 });
 console.info(enable?"Platform test checkout enabled. Live charging remains unavailable.":"Platform test checkout disabled.");
}catch{console.error("Test billing configuration failed. Check the staged migration, administrative connection and required existing secrets.");process.exitCode=1;}
finally{await sql?.end({timeout:5});}
