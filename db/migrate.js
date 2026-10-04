import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
import { clearPgEnvironment, logDatabaseFailure, printConnectionTarget, validateSupabaseUrl } from "./connection.js";

clearPgEnvironment();
try {
  printConnectionTarget(validateSupabaseUrl(process.env.SUPABASE_DB_URL));
} catch (error) {
  logDatabaseFailure("Migration configuration failed", error, process.env.SUPABASE_DB_URL);
  process.exit(1);
}

class MigrationConfigurationError extends Error {}
let sql;

try {
  sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  const directory = new URL("./migrations/", import.meta.url);
  const filenames = (await readdir(directory))
    .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();
  if (!filenames.length) throw new MigrationConfigurationError("No migration files found.");

  await sql.begin(async (tx) => {
    // Serialize concurrent runners; all pending files are applied atomically.
    await tx`SELECT pg_advisory_xact_lock(714097281001::bigint)`;
    const [role] = await tx`
      SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user
    `;
    if (!role || (!role.rolsuper && !role.rolbypassrls)) {
      throw new MigrationConfigurationError("SUPABASE_DB_URL must use an administrative role with BYPASSRLS, not lebrands_app.");
    }
    await tx`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        filename text NOT NULL UNIQUE,
        checksum text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await tx`REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC`;

    for (const filename of filenames) {
      const source = await readFile(new URL(filename, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const [applied] = await tx`
        SELECT checksum FROM public.schema_migrations WHERE filename = ${filename}
      `;
      if (applied) {
        if (applied.checksum !== checksum) {
          throw new MigrationConfigurationError(`Applied migration was changed: ${filename}. Add a new migration instead.`);
        }
        console.info(`Already applied: ${filename}`);
        continue;
      }
      // Simple protocol supports an entire SQL migration, including DO blocks.
      await tx.unsafe(source).simple();
      await tx`
        INSERT INTO public.schema_migrations (filename, checksum) VALUES (${filename}, ${checksum})
      `;
      console.info(`Prepared migration: ${filename}`);
    }
  });
  console.info("Migrations committed successfully.");
} catch (error) {
  logDatabaseFailure("Migration failed", error, process.env.SUPABASE_DB_URL);
  process.exitCode = 1;
} finally {
  if (sql) {
    await sql.end({ timeout: 5 }).catch((error) => {
      logDatabaseFailure("Database connection cleanup failed", error, process.env.SUPABASE_DB_URL);
      process.exitCode = 1;
    });
  }
}