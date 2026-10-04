import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL must be set in Replit Secrets before running the seed.");
  process.exit(1);
}

let sql;

try {
  sql = postgres(databaseUrl, { max: 1, fetch_types: false, prepare: false, connect_timeout: 10 });
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(714097281002::bigint)`;
    const [role] = await tx`
      SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user
    `;
    if (!role || (!role.rolsuper && !role.rolbypassrls)) {
      throw Object.assign(new Error("Seed using the administrative DATABASE_URL, not lebrands_app."), {
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
  console.error(`Seed failed; transaction rolled back (${error.code ?? "unknown"}).`);
  process.exitCode = 1;
} finally {
  if (sql) {
    await sql.end({ timeout: 5 }).catch(() => {
      console.error("Database connection cleanup failed.");
      process.exitCode = 1;
    });
  }
}