// In-memory PostgreSQL only: never reads environment variables or opens sockets.
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { preparePageMigration } from "../../db/page-schema-migration.js";

export async function preAuraDatabase() {
  const pg = new PGlite();
  try {
    // This is the migration runner's prerequisite, referenced already by 0002.
    await pg.exec(`CREATE TABLE public.schema_migrations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename text NOT NULL UNIQUE,
      checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now());
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`);
    const directory = new URL("../../db/migrations/", import.meta.url);
    for (const filename of (await readdir(directory)).filter(f => /^000[1-9]_.*\.sql$/.test(f)).sort()) {
      await pg.exec(await readFile(new URL(filename, directory), "utf8"));
      await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'isolated-test')", [filename]);
    }
    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}

export async function applyAura(pg) {
  const filename = "0010_store_pages.sql";
  const source = await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), "utf8");
  await pg.exec("BEGIN");
  try {
    await pg.exec(await preparePageMigration(filename, source));
    await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'isolated-test')", [filename]);
    await pg.exec("COMMIT");
  } catch (error) {
    await pg.exec("ROLLBACK");
    throw error;
  }
}

export async function schemaSnapshot(pg) {
  const queries = {
    relations: `SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','S')
      ORDER BY c.relname`,
    columns: `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text AS acl,
      pg_get_expr(d.adbin,d.adrelid) AS default_value
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relkind IN('r','p','v','m')
        AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    constraints: `SELECT c.relname,k.conname,k.contype,k.convalidated,
      pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k
      JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,k.conname`,
    indexes: `SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' ORDER BY tablename,indexname`,
    functions: `SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.provolatile,
      pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,
      p.proconfig,pg_get_functiondef(p.oid) AS definition FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      ORDER BY signature`,
    triggers: `SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
      FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
    namespaces: `SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS acl
      FROM pg_namespace WHERE nspname='public'`,
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,
      rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname`,
    defaultPrivileges: `SELECT pg_get_userbyid(defaclrole) AS owner,
      COALESCE(n.nspname,'') AS namespace,defaclobjtype,defaclacl::text AS acl
      FROM pg_default_acl a LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace
      ORDER BY owner,namespace,defaclobjtype`,
  };
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([key, sql]) =>
    [key, (await pg.query(sql)).rows])));
}

export async function legacyDataSnapshot(pg) {
  const { rows } = await pg.query(`SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename NOT IN('store_pages','store_page_versions')
    ORDER BY tablename`);
  const data = {};
  for (const { tablename } of rows) {
    // Names come only from PostgreSQL's catalog, never user input.
    const name = `"${tablename.replaceAll('"', '""')}"`;
    data[tablename] = (await pg.query(`SELECT to_jsonb(t)-'renditions' AS row
      FROM public.${name} t ORDER BY (to_jsonb(t)-'renditions')::text`)).rows;
  }
  return data;
}

export function sqlTag(pg) {
  const tx = async (strings, ...values) => {
    let statement = strings[0];
    values.forEach((_, i) => { statement += `$${i + 1}${strings[i + 1]}`; });
    return (await pg.query(statement, values)).rows;
  };
  tx.json = value => JSON.stringify(value);
  return tx;
}

export async function asLegacyApp(pg, storeId, accountHash, work) {
  await pg.exec("BEGIN; SET LOCAL ROLE lebrands_app;");
  try {
    await pg.query("SELECT set_config('app.account_session_hash',$1,true)", [accountHash]);
    if (storeId) await pg.query("SELECT set_config('app.store_id',$1,true)", [storeId]);
    const result = await work(sqlTag(pg));
    await pg.exec("COMMIT");
    return result;
  } catch (error) {
    await pg.exec("ROLLBACK");
    throw error;
  }
}
