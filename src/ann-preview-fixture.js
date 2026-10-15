// Node development middleware only. Never imported by the production Worker.
// An isolated in-memory PostgreSQL instance; no credentials or live store data.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { renderAnnBuilder } from "./ui/ann-builder.js";
import { handleAnnRoutes } from "./store/ann-routes.js";
import { annReference, annSessionResponse, loadAnnSession } from "./store/ann-repository.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { DEFAULT_SETTINGS, loadDraft } from "./store/repository.js";
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
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.schema_migrations(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),filename text NOT NULL UNIQUE,
        checksum text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`);
    for (const file of ["0001_init.sql","0002_rls.sql","0003_accounts.sql","0004_password_pepper.sql","0005_store_wizard.sql","0006_cod_checkout.sql","0007_brand_dashboard.sql","0008_invoice_lockdown.sql","0009_required_gstin.sql","0010_store_pages.sql"]) {
      await pg.exec(await preparePageMigration(file, await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8")));
    }
    for (const file of ["0012_aura_skeleton_sections.sql","0015_aura_starter_library.sql","0016_ann_foundation.sql"]) {
      await pg.exec(await preparePageMigration(file, await readFile(new URL(`../db/staged/${file}`, import.meta.url), "utf8")));
    }
    await pg.exec(`
      INSERT INTO brands(id,name,legal_name) VALUES('${storeId}','Example Studio','Example Studio');
      INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES('${storeId}','${storeId}','ann-test-store','Example Studio');
      INSERT INTO users(id,name,email) VALUES('${ownerId}','Example owner','owner@example.invalid'),('${editorId}','Example editor','editor@example.invalid');
      INSERT INTO store_members(store_id,user_id,role) VALUES('${storeId}','${ownerId}','owner'),('${storeId}','${editorId}','editor');
      INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${"a".repeat(64)}','${ownerId}',now()+interval '1 day'),('${"b".repeat(64)}','${editorId}',now()+interval '1 day');`);
    await pg.query("INSERT INTO store_setup(store_id,settings) VALUES($1,$2) ON CONFLICT(store_id) DO UPDATE SET settings=EXCLUDED.settings", [storeId, JSON.stringify(fixtureData.settings)]);
    return pg;
  } catch (error) { await pg.close(); throw error; }
}
const getDatabase = () => database ||= setupAnnFixtureDatabase().catch(error => { database = null; throw error; });
export function annFixtureAdapter(pg) {
  return { withMemberStore: async (id, hash, fn) => {
    if (id !== storeId || !["a".repeat(64), "b".repeat(64)].includes(hash))
      throw Object.assign(new Error("Fixture access denied"), { status: 403 });
    return pg.transaction(async trx => {
      await trx.exec("SET LOCAL ROLE lebrands_app");
      const access = await trx.query("SELECT public.authorize_store_session($1,$2) AS allowed", [hash, storeId]);
      if (!access.rows[0]?.allowed) throw Object.assign(new Error("Fixture access denied"), { status: 403 });
      await trx.query("SELECT set_config('app.store_id',$1,true)", [storeId]);
      await trx.query("SELECT store_id FROM public.stores WHERE store_id=$1 FOR UPDATE", [storeId]);
      const tx = async (strings, ...values) => (await trx.query(
        strings.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""), values)).rows;
      tx.json = value => JSON.stringify(value);
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
    const pg = await getDatabase(), db = annFixtureAdapter(pg);
    const readonly = url.searchParams.get("readonly") === "1" || url.pathname.includes("/read-only-api/");
    const user = { id: readonly ? editorId : ownerId, name: "Example member", email: "member@example.invalid" };
    const hash = (readonly ? "b" : "a").repeat(64);
    let response;
    if (url.pathname === prefix && ["GET", "HEAD"].includes(req.method)) {
      const options = await db.withMemberStore(storeId, hash, async tx => ({
        reference: await annReference(tx),
        sessionResponse: await annSessionResponse(tx, storeId, await loadAnnSession(tx, storeId)),
        draft: await loadDraft(tx, storeId),
        apiRoot: prefix + (readonly ? "/read-only-api" : "/api"), readOnly: readonly,
      }));
      response = new Response(req.method === "HEAD" ? null : renderAnnBuilder(
        { ...options.draft, role: readonly ? "editor" : "owner" }, user, options),
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } else {
      const match = url.pathname.match(/^\/__ann-builder-preview\/(?:api|read-only-api)\/(reference|session|application)$/);
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
