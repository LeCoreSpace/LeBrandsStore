import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderAnnBuilder } from "../src/ui/ann-builder.js";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const data = { store: { store_id: id, name: "Example" }, role: "owner",
  settings: { brand_name: "Example", category: "fashion", subcategory: "mens-clothing" },
  products: [], collections: [], layouts: {}, policies: [], reviews: [] };
mock.module("../src/store/repository.js", { namedExports: { loadDraft: async () => structuredClone(data) } });
const { handleBuilderRoutes } = await import("../src/store/builder-routes.js");
function database({ ready = true, role = "owner" } = {}) {
  const state = { writes: 0, preference: null };
  const tx = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes("SELECT role")) return [{ role }];
    if (sql.includes("to_regclass")) return [{ ready }];
    if (sql.includes("FROM public.aura_library_categories")) return [{ category_id: "1", name: "Fashion", slug: "fashion-and-apparel" }];
    if (sql.includes("FROM public.aura_library_subcategories")) return [{ category_id: "1", subcategory_id: "1", name: "Mens Clothing", slug: "mens-clothing" }];
    if (sql.includes("FROM public.ann_builder_sessions")) return [];
    if (sql.includes("settings::text")) return [{ settings_json: JSON.stringify(data.settings) }];
    if (sql.includes("INSERT INTO public.store_setup")) { state.writes++; state.preference = values[1]; return []; }
    throw new Error("Unexpected fixture query");
  };
  return { state, withMemberStore: async (store, hash, fn) => {
    assert.equal(store, id); assert.equal(hash, "a".repeat(64)); return fn(tx);
  } };
}
const get = (tail = "", method = "GET") => new Request(`https://app.lebrands.store/stores/${id}/build${tail}`, { method });
const post = () => new Request(get(), { method: "POST", headers: { origin: "https://app.lebrands.store" },
  body: new URLSearchParams({ mode: "ann" }) });

test("Ann chooser is enabled only with ready database and preference selection preserves content", async () => {
  const db = database(), user = { id: owner };
  const page = await handleBuilderRoutes(get(), {}, db, user, "a".repeat(64));
  assert.match(await page.text(), /name="mode" value="ann"/);
  assert.equal(db.state.writes, 0);
  const selected = await handleBuilderRoutes(post(), {}, db, user, "a".repeat(64));
  assert.equal(selected.status, 303);
  assert.equal(selected.headers.get("location"), `/stores/${id}/build/ann`);
  assert.deepEqual(db.state, { writes: 1, preference: "ann" });
});
test("Ann route renders saved-planning interface without writes, supports HEAD and reader membership", async () => {
  for (const role of ["owner", "editor"]) {
    const db = database({ role }), user = { id: owner };
    const response = await handleBuilderRoutes(get("/ann"), {}, db, user, "a".repeat(64));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /id="ann-app"/);
    assert.match(html, /sandbox="allow-same-origin"/);
    assert.match(html, new RegExp(`"canWrite":${role === "owner"}`));
    assert.doesNotMatch(html, new RegExp("a".repeat(64)));
    assert.equal(db.state.writes, 0);
    const head = await handleBuilderRoutes(get("/ann", "HEAD"), {}, db, user, "a".repeat(64));
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    if (role === "editor") assert.equal((await handleBuilderRoutes(post(), {}, db, user, "a".repeat(64))).status, 403);
  }
});
test("Ann missing migration offers Standard Builder and rejects preference writes", async () => {
  const db = database({ ready: false }), user = { id: owner };
  const html = await (await handleBuilderRoutes(get("/ann"), {}, db, user, "a".repeat(64))).text();
  assert.match(html, /Standard Builder/);
  assert.match(html, /Stage 3 migration/);
  assert.doesNotMatch(html, /name="mode" value="ann"/);
  assert.equal((await handleBuilderRoutes(post(), {}, db, user, "a".repeat(64))).status, 503);
  assert.equal(db.state.writes, 0);
});
test("Ann boot escaping, non-scripted iframe and production asset delivery boundaries", async () => {
  const html = renderAnnBuilder({ ...data, settings: { description: "</script><script>alert(1)</script>" } });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
  assert.match(html, /data-preview-mode="showcase" aria-pressed="true">Fashion showcase/);
  assert.match(html, /data-preview-mode="store" aria-pressed="false">Your store/);
  assert.doesNotMatch(html, /sandbox="[^"]*allow-scripts/);
  const worker = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  for (const file of ["ann-builder.js", "ann-builder.css", "ann-projection.js"]) assert.ok(worker.includes(`"${file}"`));
  assert.doesNotMatch(worker, /ann-preview-fixture|__ann-builder-preview|PGlite/);
});
test("Ann empty-valued button attributes dispatch saves, navigation and conflict recovery", async () => {
  const client = await readFile(new URL("../src/public/ann-builder.js", import.meta.url), "utf8");
  for (const action of ["back", "continue", "save", "reload", "overwrite", "retryAttrs"]) {
    assert.ok(action in { [action]: "" });
    assert.ok(client.includes(`"${action}" in d`));
    assert.ok(!client.includes(`if (d.${action})`));
  }
  assert.doesNotMatch(client, /readOnly \|\| !isDirty\(\)/);
});
