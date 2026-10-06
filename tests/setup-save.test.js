import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { handleStoreRoutes } from "../src/store/routes.js";
import { loadDraft, saveProduct } from "../src/store/repository.js";
import { settingsPatch } from "../src/store/input.js";
import { setupFieldNames, storeFailureDetails } from "../src/store/diagnostics.js";

const ID = "11111111-1111-4111-8111-111111111111";
const LOGO = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
function database() {
  const state = {
    queries: [], settings: {}, completed: [], step: 1, logo: null,
    store: { store_id: ID, name: "Test Brand", subdomain: "test-brand", status: "draft" },
    products: [{ id: PRODUCT, title: "", description: "", tags: ['cotton, linen', 'size "small"', "back\\slash"], price_paise: 0 }],
  };
  const jsonValue = (value) => {
    assert.equal(typeof value?.json, "string", "Array/JSON writes must use the JSON boundary, not unregistered native array types");
    return JSON.parse(value.json);
  };
  const tx = async (strings, ...values) => {
    const query = strings.join("?"); state.queries.push({ query, values });
    if (query.includes("FROM public.stores")) return [state.store];
    if (query.includes("FROM public.store_setup")) return [{
      settings: state.settings, logo_media_id: state.logo, step: state.step,
      // Mirrors postgres({fetch_types:false}): integer[] is an unparsed string
      // unless the query selects JSON instead.
      completed: query.includes("to_json(completed)") ? [...state.completed] : `{${state.completed.join(",")}}`,
    }];
    if (query.includes("FROM public.products")) return state.products.map((p) => ({
      ...p, tags: query.includes("to_json(tags)") ? [...p.tags] : '{"cotton, linen","size \\"small\\"","back\\\\slash"}',
    }));
    if (query.includes("FROM public.product_media") || query.includes("FROM public.policy_pages")) return [];
    if (query.includes("FROM public.media")) return [{
      id: LOGO, object_key: `stores/${ID}/${LOGO}.png`, upload_type: "logo",
    }];
    if (query.includes("SET name =")) state.store.name = values[0];
    if (query.includes("SET settings =")) Object.assign(state.settings, jsonValue(values[0]));
    if (query.includes("SET logo_media_id =")) state.logo = values[0];
    if (query.includes("SET step =")) {
      assert.match(query, /ARRAY\(SELECT jsonb_array_elements_text\(\?\)::integer\)/);
      state.step = values[0]; state.completed = jsonValue(values[1]);
    }
    if (query.includes("UPDATE public.products SET")) {
      assert.match(query, /tags = ARRAY\(SELECT jsonb_array_elements_text\(\?\)\)/);
      state.products[0].tags = jsonValue(values[4]);
    }
    return [];
  };
  tx.json = (value) => ({ json: JSON.stringify(value) });
  return { state, tx, withMemberStore: async (id, tokenHash, fn) => {
    assert.equal(id, ID); assert.equal(tokenHash, "a".repeat(64)); return fn(tx);
  } };
}
async function patch(db, settings, progress) {
  return handleStoreRoutes(new Request(`https://app.lebrands.store/api/stores/${ID}/setup`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings, ...(progress ? { progress } : {}) }),
  }), {}, db, { id: PRODUCT, name: "Test Owner" }, "a".repeat(64));
}

test("real driver with fetch_types:false has no native array parsers, but parses JSON", async () => {
  const sql = postgres({ fetch_types: false });
  try {
    assert.equal(sql.options.parsers[1007], undefined); // integer[]
    assert.equal(sql.options.parsers[1009], undefined); // text[]
    assert.deepEqual(sql.options.parsers[114]("[1,2]"), [1, 2]);
    assert.throws(() => ("{}").filter(() => true), /filter is not a function/);
  } finally { await sql.end(); } // No query, socket or database connection.
});
test("Step 1 PATCH saves realistic Indian fields, multiline address and same-store logo", async () => {
  const db = database();
  const settings = {
    brand_name: "Test Brand", subdomain: "test-brand", logo_media_id: LOGO,
    tagline: "Made in India", description: "Thoughtfully made everyday products from a small independent Indian brand.",
    legal_name: "Test Products Private Limited", address: "12 Test Road\nChennai, Tamil Nadu 600001",
    gstin: "33ABCDE1234F1Z5", support_phone: "+91 9000000000",
    support_email: "support@example.invalid", category: "beauty",
  };
  const response = await patch(db, settings, { step: 1, completed: [1] });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.settings.address, settings.address);
  assert.equal(body.settings.gstin, settings.gstin);
  assert.equal(body.settings.logo_media_id, LOGO);
  assert.deepEqual(body.progress.completed, [1]);
  assert.deepEqual(body.products[0].tags, db.state.products[0].tags);
});
test("empty and partial drafts save without requiring publish completeness", async () => {
  const db = database();
  const blanks = { brand_name: "", subdomain: "", tagline: "", description: "", legal_name: "",
    address: "", support_email: "", support_phone: "", gstin: "", category: "", logo_media_id: null };
  let response = await patch(db, blanks, { step: 1, completed: [] });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).progress.completed, []);
  response = await patch(db, { address: "First line\nSecond line", description: "Draft" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).settings.support_email, "");
});
test("invalid GSTIN, email, phone and category produce field errors before any setup write", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const [field, value] of [
    ["gstin", "33ABLCSO39OL1Z1"], ["support_email", "not-an-email"],
    ["support_phone", "+91 invalid"], ["category", "invalid"],
  ]) {
    const db = database();
    const response = await patch(db, { [field]: value });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(typeof body.errors[field], "string");
    assert.ok(!body.error.includes("temporarily unavailable"));
    assert.equal(db.state.queries.length, 0);
  }
  assert.equal(settingsPatch({ gstin: "33abcde1234f1z5" }).gstin, "33ABCDE1234F1Z5");
});
test("product tag arrays cross the JSON boundary on both reads and writes", async () => {
  const db = database();
  await saveProduct(db.tx, ID, PRODUCT, { description: "Draft update" });
  assert.deepEqual((await loadDraft(db.tx, ID)).products[0].tags, ['cotton, linen', 'size "small"', "back\\slash"]);
});
test("database diagnostics include SQLSTATE and names, never raw values or SQL context", () => {
  const sensitive = "private@example.invalid +91-9000000000 33ABCDE1234F1Z5\nPrivate Address token-value";
  const details = storeFailureDetails({
    code: "23514", constraint_name: "store_setup_check", table_name: "store_setup",
    column_name: "settings", routine: "ExecConstraints",
    message: `Rejected ${sensitive}`, detail: sensitive, query: sensitive, parameters: [sensitive],
    where: `PL/pgSQL function public.test_setup(text) line 4 at SQL statement\n${sensitive}`,
  }, { method: "PATCH" }, setupFieldNames({ settings: { gstin: sensitive, address: sensitive, [sensitive]: sensitive }, progress: { step: 1 } }));
  assert.equal(details.sqlstate, "23514");
  assert.equal(details.constraint, "store_setup_check");
  assert.equal(details.table, "store_setup");
  assert.equal(details.function, "public.test_setup");
  assert.deepEqual(details.fields, ["[unknown setting]", "address", "gstin", "progress.step"]);
  assert.equal(details.message, "A database check constraint rejected the row.");
  assert.ok(!JSON.stringify(details).includes(sensitive));
  assert.ok(!JSON.stringify(details).includes("private@example"));
  assert.ok(!JSON.stringify(details).includes("token-value"));
});
test("PATCH database failure logs safe diagnostics and input SQLSTATEs return 400, not service errors", async (context) => {
  const logs = [];
  context.mock.method(console, "error", (...args) => logs.push(args));
  for (const code of ["23502", "23514", "22P02", "22001", "42501"]) {
    const db = database();
    db.withMemberStore = async (id, hash, fn) => fn(Object.assign(async () => {
      throw Object.assign(new Error("sensitive@example.invalid must not be logged"), {
        code, table_name: "store_setup", constraint_name: "store_setup_check",
      });
    }, { json: db.tx.json }));
    const response = await patch(db, { address: "Draft address" });
    assert.equal(response.status, code === "42501" ? 503 : 400);
    const details = logs.at(-1)[1];
    assert.equal(details.sqlstate, code);
    assert.deepEqual(details.fields, ["address"]);
  }
  assert.ok(!JSON.stringify(logs).includes("sensitive@example.invalid"));
});
test("editing a rejected setting removes only its stale inline error and retains the draft", () => {
  const source = readFileSync(new URL("../src/public/wizard.js", import.meta.url), "utf8");
  const definition = source.match(/^function changedSetting\(field,value\)\{[\s\S]*?^\}/m)?.[0];
  assert.ok(definition);
  const settings = {}, removed = [];
  const context = {
    formErrors: { gstin: "Invalid GSTIN", support_email: "Invalid email" },
    revision: 1, fieldRevision: new Map(), currentSettings: () => settings,
    queueSave: () => {}, schedulePreview: () => {},
    document: { querySelectorAll: () => ["gstin", "support_email"].map((field) => ({
      dataset: { error: field }, remove: () => removed.push(field),
    })) },
  };
  runInNewContext(`${definition}\nchangedSetting("gstin","33ABCDE1234F1Z5");`, context);
  assert.deepEqual(removed, ["gstin"]);
  assert.equal(context.formErrors.gstin, undefined);
  assert.equal(context.formErrors.support_email, "Invalid email");
  assert.equal(settings.gstin, "33ABCDE1234F1Z5");
  assert.equal(context.fieldRevision.get("gstin"), 2);
});
