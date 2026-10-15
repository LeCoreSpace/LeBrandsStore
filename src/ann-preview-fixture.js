// Node development middleware only. Never imported by the production Worker.
// An isolated in-memory PostgreSQL instance; no credentials or live store data.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { renderAnnBuilder } from "./ui/ann-builder.js";
import { handleAnnRoutes } from "./store/ann-routes.js";
import { annReference, annSessionResponse, loadAnnSession } from "./store/ann-repository.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { TAXONOMY } from "./public/aura-taxonomy-data.js";
import { DEFAULT_SETTINGS } from "./store/repository.js";
import { APP_ORIGIN } from "./auth/security.js";

const storeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const editorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const prefix = "/__ann-builder-preview";
const fixtureData = {
  store: { store_id: storeId, name: "Example Studio", subdomain: "example-studio" },
  settings: { ...DEFAULT_SETTINGS, brand_name: "Example Studio", category: "fashion", subcategory: "mens-clothing" },
  products: [], collections: [], layouts: {}, policies: [], reviews: [],
  aura_skeleton_enabled: true, aura_starter_enabled: true, role: "owner",
};
let database;
export async function setupAnnFixtureDatabase() {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8"));
    await pg.exec(`CREATE ROLE lebrands_app;
      ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;
      CREATE TABLE sessions(token_hash text,user_id uuid,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE store_setup(store_id uuid PRIMARY KEY,settings jsonb);
      CREATE TABLE aura_library_categories(category_id bigint PRIMARY KEY,name text,slug text,is_active boolean DEFAULT true);
      CREATE TABLE aura_library_subcategories(subcategory_id bigint PRIMARY KEY,category_id bigint,name text,slug text,is_active boolean DEFAULT true);
      INSERT INTO brands(id,name,legal_name) VALUES('${storeId}','Example Studio','Example Studio');
      INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES('${storeId}','${storeId}','ann-test-store','Example Studio');
      INSERT INTO users(id,name,email) VALUES('${ownerId}','Example owner','owner@example.invalid'),('${editorId}','Example editor','editor@example.invalid');
      INSERT INTO store_members(store_id,user_id,role) VALUES('${storeId}','${ownerId}','owner'),('${storeId}','${editorId}','editor');
      INSERT INTO sessions VALUES('${"a".repeat(64)}','${ownerId}',NULL,now()+interval '1 day'),('${"b".repeat(64)}','${editorId}',NULL,now()+interval '1 day');
      CREATE FUNCTION public.authorize_store_session(text,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT EXISTS(SELECT 1 FROM public.sessions s JOIN public.store_members m ON m.user_id=s.user_id
          WHERE s.token_hash=$1 AND m.store_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()) $$;
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT ON store_members,store_setup,aura_library_categories,aura_library_subcategories TO lebrands_app;`);
    await pg.query("INSERT INTO store_setup VALUES($1,$2)", [storeId, JSON.stringify(fixtureData.settings)]);
    for (const category of TAXONOMY.categories) {
      await pg.query("INSERT INTO aura_library_categories(category_id,name,slug) VALUES($1,$2,$3)",
        [category.id, category.name, category.slug]);
    }
    for (const sub of TAXONOMY.subcategories)
      await pg.query("INSERT INTO aura_library_subcategories(subcategory_id,category_id,name,slug) VALUES($1,$2,$3,$4)",
        [sub.id, sub.category_id, sub.name, sub.slug]);
    await pg.exec(await preparePageMigration("0016_ann_foundation.sql",
      await readFile(new URL("../db/staged/0016_ann_foundation.sql", import.meta.url), "utf8")));
    return pg;
  } catch (error) { await pg.close(); throw error; }
}
const getDatabase = () => database ||= setupAnnFixtureDatabase().catch(error => { database = null; throw error; });
function adapter(pg) {
  return { withMemberStore: async (id, hash, fn) => {
    if (id !== storeId || !["a".repeat(64), "b".repeat(64)].includes(hash))
      throw Object.assign(new Error("Fixture access denied"), { status: 403 });
    return pg.transaction(async trx => {
      await trx.exec("SET LOCAL ROLE lebrands_app");
      await trx.query("SELECT set_config('app.store_id',$1,true)", [storeId]);
      const tx = async (strings, ...values) => (await trx.query(
        strings.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""), values)).rows;
      return fn(tx);
    });
  }};
}
export async function annPreviewFixture(req, res, previewOrigin) {
  const host = req.headers.host || "localhost";
  const origin = `${/^localhost|^127\./.test(host) ? "http" : "https"}://${host}`;
  const url = new URL(req.url || "/", previewOrigin || origin);
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
  try {
    const pg = await getDatabase(), db = adapter(pg);
    const readonly = url.searchParams.get("readonly") === "1" || url.pathname.includes("/read-only-api/");
    const user = { id: readonly ? editorId : ownerId, name: "Example member", email: "member@example.invalid" };
    const hash = (readonly ? "b" : "a").repeat(64);
    let response;
    if (url.pathname === prefix && ["GET", "HEAD"].includes(req.method)) {
      const options = await db.withMemberStore(storeId, hash, async tx => ({
        reference: await annReference(tx),
        sessionResponse: await annSessionResponse(tx, storeId, await loadAnnSession(tx, storeId)),
        apiRoot: prefix + (readonly ? "/read-only-api" : "/api"), readOnly: readonly,
      }));
      response = new Response(req.method === "HEAD" ? null : renderAnnBuilder(
        { ...structuredClone(fixtureData), role: readonly ? "editor" : "owner" }, user, options),
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } else {
      const match = url.pathname.match(/^\/__ann-builder-preview\/(?:api|read-only-api)\/(reference|session)$/);
      if (!match) response = new Response("Not found", { status: 404 });
      else {
        url.pathname = `/api/stores/${storeId}/ann/${match[1]}`;
        const headers = new Headers(req.headers);
        // The production handler requires its account origin. Translate only
        // the explicitly configured same-origin development request.
        if (headers.get("origin") === url.origin) headers.set("origin", APP_ORIGIN);
        const init = { method: req.method, headers };
        if (!["GET", "HEAD"].includes(req.method)) Object.assign(init, { body: Readable.toWeb(req), duplex: "half" });
        response = await handleAnnRoutes(new Request(url, init), {}, db, user, hash);
      }
    }
    res.statusCode = response.status;
    for (const [key, value] of response.headers) res.setHeader(key, value);
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) {
    // This fixture has no credentials or live connections. Report only its
    // local failure message, never a Request, environment or SQL payload.
    console.error("Isolated Ann fixture:", error.code || "fixture_error", error.message);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end('{"error":"The isolated Ann preview fixture could not start."}');
  }
  return true;
}
