import postgres from "postgres";
import { clearPgEnvironment, logDatabaseFailure, printConnectionTarget, validateSupabaseUrl } from "./connection.js";

clearPgEnvironment();
try {
  printConnectionTarget(validateSupabaseUrl(process.env.SUPABASE_DB_URL));
} catch (error) {
  logDatabaseFailure("Seed configuration failed", error, process.env.SUPABASE_DB_URL);
  process.exit(1);
}

let sql;

try {
  sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(714097281002::bigint)`;
    const [role] = await tx`
      SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user
    `;
    if (!role || (!role.rolsuper && !role.rolbypassrls)) {
      throw Object.assign(new Error("Seed using the administrative SUPABASE_DB_URL, not lebrands_app."), {
        code: "INVALID_ADMINISTRATIVE_ROLE",
      });
    }
    const [brand] = await tx`
      INSERT INTO public.brands (external_brand_id, name, legal_name)
      VALUES ('lebrands-store-testbrand', 'Test Brand', 'Test Brand')
      ON CONFLICT (external_brand_id) DO UPDATE SET external_brand_id = EXCLUDED.external_brand_id
      RETURNING id
    `;
    // Never take over a testbrand subdomain belonging to a different business.
    const [store] = await tx`
      INSERT INTO public.stores (brand_id, subdomain, name, status)
      VALUES (${brand.id}, 'testbrand', 'Test Brand', 'live')
      ON CONFLICT (subdomain) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
      WHERE public.stores.brand_id = EXCLUDED.brand_id
      RETURNING store_id
    `;
    if (!store) {
      throw Object.assign(new Error("testbrand belongs to a different brand; seed refused."), {
        code: "SEED_SUBDOMAIN_CONFLICT",
      });
    }
    console.info("Prepared Test Brand live store.");
  });
  console.info("Seed committed successfully.");
} catch (error) {
  logDatabaseFailure("Seed failed", error, process.env.SUPABASE_DB_URL);
  process.exitCode = 1;
} finally {
  if (sql) {
    await sql.end({ timeout: 5 }).catch((error) => {
      logDatabaseFailure("Database connection cleanup failed", error, process.env.SUPABASE_DB_URL);
      process.exitCode = 1;
    });
  }
}