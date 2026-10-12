import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { skeletonEnabled, savePage } from "../src/store/pages.js";
import { starterLayouts } from "../src/public/aura-skeleton.js";
import { defaultPageLayouts } from "../src/public/aura-layout.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import worker from "../src/index.js";
import { AURA_SKELETON_TYPES } from "../src/public/sections/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const data = { store: { store_id: id }, settings: {}, products: [], policies: [] };
test("Worker serves the editor skeleton module and every new section schema", async () => {
  const env = { ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) } };
  for (const path of ["aura-skeleton.js", ...AURA_SKELETON_TYPES.map(type => `sections/${type}.schema.js`)]) {
    const response = await worker.fetch(new Request(`https://lebrands.store/assets/${path}`), env, {});
    assert.equal(response.status, 200, path);
  }
});
test("old database keeps skeleton features disabled and rejects new types before writes", async () => {
  assert.equal(await skeletonEnabled(async () => [{ enabled: false }]), false);
  assert.equal(await skeletonEnabled(async () => [{ enabled: true }]), true);
  let writes = 0;
  await assert.rejects(savePage(async () => { writes++; }, id, "home", starterLayouts(data).home, 0, "token", data),
    error => error.status === 409 && /catalogue update/.test(error.message));
  assert.equal(writes, 0);
});
test("checkout save retains protected commerce and rejects arbitrary sections", async () => {
  const enabled = { ...data, aura_skeleton_enabled: true };
  const layout = defaultPageLayouts(data).checkout;
  const injected = defaultPageLayouts(data).home.find(s => s.type === "statement");
  layout.splice(2, 0, injected);
  await assert.rejects(savePage(async () => { throw new Error("Unexpected write"); }, id, "checkout", layout, 0, "token", enabled),
    error => /Section is not allowed|protected checkout/.test(error.message));
  const valid = starterLayouts(data).checkout;
  const tx = Object.assign(async () => [{ version: 1 }], { json: value => value });
  const row = await savePage(tx, id, "checkout", valid, 0, "token", enabled);
  assert.equal(row.version, 1);
});
test("staged section update expands immutable snapshots without backfill or permission widening", async () => {
  const file = "0012_aura_skeleton_sections.sql";
  const source = await readFile(new URL(`../db/staged/${file}`, import.meta.url), "utf8");
  const prepared = await preparePageMigration(file, source);
  assert.doesNotMatch(prepared, /__AURA_SKELETON_SCHEMAS_V1__/);
  assert.match(prepared, /"material-care"/);
  assert.match(prepared, /SECURITY INVOKER SET search_path = pg_catalog/);
  assert.match(prepared, /REVOKE ALL ON FUNCTION public\.aura_skeleton_available\(\) FROM PUBLIC/);
  assert.doesNotMatch(prepared, /\b(?:ALTER TABLE|CREATE TABLE|CREATE POLICY|CREATE TRIGGER)\b/i);
  assert.equal((prepared.match(/SECURITY DEFINER/g) || []).length, 1);
  assert.match(prepared, /SECURITY DEFINER SET search_path=pg_catalog,public/);
  assert.match(prepared, /NOT IN \('header','commerce','trust','footer'\)/);
  assert.match(prepared, /p_store IS DISTINCT FROM NULLIF\(current_setting\('app.store_id',true\)/);
  assert.equal((prepared.match(/GRANT EXECUTE/g) || []).length, 1);
});
