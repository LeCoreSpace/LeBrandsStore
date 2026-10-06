// Read-only external Supabase audit. Never emits URLs, GSTIN/PAN or addresses.
import postgres from "postgres";
import { validateSupabaseUrl,clearPgEnvironment } from "./connection.js";
import { businessGSTINErrors } from "../src/public/commerce-rules.js";
clearPgEnvironment();
let sql;
try {
  validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  sql = postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1,connect_timeout:15});
  const stores = await sql.begin("read only",async tx => {
    const rows = await tx`SELECT s.name,s.subdomain,p.snapshot->'settings' AS settings
      FROM public.stores s LEFT JOIN public.store_publications p ON p.store_id = s.store_id
      WHERE s.status = 'live' ORDER BY s.subdomain`;
    return rows.map(row => {
      const errors = businessGSTINErrors(row.settings || {});
      return {name:row.name,subdomain:row.subdomain,valid:Object.keys(errors).length === 0,errors};
    });
  });
  console.log(JSON.stringify({live_stores:stores.length,valid:stores.filter(s=>s.valid).length,stores},null,2));
} catch (error) {
  console.error(JSON.stringify({audit_failed:true,code:/^[0-9A-Z]{5}$/.test(error.code || "")?error.code:"AUDIT_UNAVAILABLE"}));
  process.exitCode = 1;
} finally {if (sql) await sql.end({timeout:3});}
