import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";

const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const token = "a".repeat(64);
const endpoint = `https://app.lebrands.store/api/stores/${store}/ann/session`;
const request = (method, body) => new Request(endpoint, {
  method, headers: { origin: "https://app.lebrands.store", "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test("Ann progress survives actual postgres.js JSON serialization on create, update and reload", async t => {
  const pg = await setupAnnFixtureDatabase();
  // Lazy client only: use the installed production driver's serializer, never
  // open a socket or use any database credential in this offline test.
  const driver = postgres({ host: "127.0.0.1", port: 1, max: 1, prepare: true, fetch_types: false });
  const serializeJson = driver.options.serializers[3802];
  const database = annFixtureAdapter(pg);
  const wireDb = legacy => ({ withMemberStore: (id, hash, fn) => database.withMemberStore(id, hash, tx => {
    const wireTx = async (strings, ...values) => {
      // PGlite normally receives raw parameters, which hides postgres.js's
      // type-inferred jsonb serialization. Model the actual wire values here.
      const parts = [...strings];
      if (legacy && parts.join("").includes("SELECT public.ann_save_session(")) parts[5] = parts[5].replace("::text::jsonb", "::jsonb");
      const bound = values.map((value, i) => /^\s*::jsonb\b/.test(parts[i + 1]) ? serializeJson(value) : value);
      return tx(parts, ...bound);
    };
    wireTx.json = tx.json;
    return fn(wireTx);
  }) });
  try {
    assert.equal(typeof serializeJson, "function");
    const before = (await pg.query("SELECT settings::text FROM store_setup")).rows;
    const answers = {
      style_preset: "creator-feed", category_id: 1, subcategory_id: 1,
      store_name: "Example Studio", collections: [{ key: "c1", name: "Everyday", description: "Daily favourites" }],
      product_ideas: [{ key: "p1", collection_key: "c1", name: "Cotton shirt", description: "A planning note only." }],
    };
    const input = { expected_revision: 0, current_step: "collections", answers };
    const log = t.mock.method(console, "error", () => {});
    const broken = await handleAnnRoutes(request("PATCH", input), {}, wireDb(true), user, token);
    assert.equal(broken.status, 503);
    assert.equal(log.mock.calls[0].arguments[1].code, "23514");
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM ann_builder_sessions")).rows[0].n, 0);
    const created = await handleAnnRoutes(request("PATCH", input), {}, wireDb(false), user, token);
    assert.equal(created.status, 200);
    assert.deepEqual((await created.json()).session.answers, answers);
    const updated = await handleAnnRoutes(request("PATCH", {
      expected_revision: 1, current_step: "story", answers: { description: "A new brand story." },
    }), {}, wireDb(false), user, token);
    assert.equal(updated.status, 200);
    const saved = (await updated.json()).session;
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.answers.collections, answers.collections);
    assert.deepEqual(saved.answers.product_ideas, answers.product_ideas);
    const fresh = await handleAnnRoutes(request("GET"), {}, wireDb(false), user, token);
    assert.deepEqual((await fresh.json()).session, saved);
    const stale = await handleAnnRoutes(request("PATCH", input), {}, wireDb(false), user, token);
    assert.equal(stale.status, 409);
    assert.deepEqual((await pg.query("SELECT settings::text FROM store_setup")).rows, before);
    assert.equal((await pg.query("SELECT jsonb_typeof(answers) AS kind FROM ann_builder_sessions")).rows[0].kind, "object");
  } finally {
    await driver.end({ timeout: 0 });
    await pg.close();
  }
});
