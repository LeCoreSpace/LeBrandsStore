import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_STORE_ID = "22222222-2222-4222-8222-222222222222";
const env = { HYPERDRIVE: { connectionString: "postgres://mock.invalid/test" } };
let state;

function fakePostgres(connectionString, options) {
  state.clients.push({ connectionString, options });
  function queryClient(transactionContext = null) {
    return async (strings, ...values) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim();
      state.queries.push({ query, values, transactionContext });
      if (query.includes("current_user")) return [{ database_role: state.role }];
      if (query.includes("resolve_store")) {
        if (state.error) throw state.error;
        const store = state.stores.get(values[0]);
        return store ? [store] : [];
      }
      if (query.includes("set_config")) {
        assert.ok(transactionContext, "Tenant context must be inside a transaction");
        transactionContext.storeId = values[0];
        return [];
      }
      if (query.includes("store_publications")) return state.publication ? [{ snapshot: state.publication }] : [];
      if (query.includes("authorize_store_session")) return [{ allowed: state.allowed !== false }];
      return [{ store_id: transactionContext?.storeId ?? null }];
    };
  }
  const sql = queryClient();
  sql.begin = async (fn) => {
    state.begins++;
    const context = { storeId: null };
    try {
      const result = await fn(queryClient(context));
      state.commits++;
      return result;
    } catch (error) {
      state.rollbacks++;
      throw error;
    }
  };
  sql.end = async () => { state.closes++; };
  return sql;
}

mock.module("postgres", { defaultExport: fakePostgres });
const { createDb } = await import("../src/db.js");
const { default: worker } = await import("../src/index.js");
const { RESERVED_SUBDOMAINS } = await import("../src/reserved.js");

beforeEach(() => {
  state = {
    role: "lebrands_app",
    stores: new Map([
      ["testbrand.lebrands.store", { store_id: STORE_ID, subdomain: "testbrand", name: "Test Brand", status: "live" }],
      ["www.custom.example", { store_id: STORE_ID, subdomain: "testbrand", name: "Test Brand", status: "live" }],
    ]),
    clients: [],
    queries: [],
    begins: 0,
    commits: 0,
    rollbacks: 0,
    closes: 0,
    error: null,
  };
});
afterEach(() => mock.restoreAll());

test("homepage renders without a database and www permanently redirects preserving the path", async () => {
  const response = await worker.fetch(new Request("https://lebrands.store/"), {});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Make your online brand/);
  const www = await worker.fetch(new Request("https://www.lebrands.store/terms?from=footer"), {});
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("location"), "https://lebrands.store/terms?from=footer");
  assert.equal(state.clients.length, 0);
});

test("reserved and malformed platform subdomains are 404 without database lookup", async () => {
  const hosts = RESERVED_SUBDOMAINS.filter((sub) => !["www", "app", "media"].includes(sub)).map((sub) => `${sub}.lebrands.store`);
  hosts.push("ab.lebrands.store", "-bad.lebrands.store", "bad-.lebrands.store",
    "bad_name.lebrands.store", "a.b.lebrands.store", `${"a".repeat(31)}.lebrands.store`);
  for (const host of hosts) {
    const response = await worker.fetch(new Request(`https://${host}/`), env);
    assert.equal(response.status, 404, host);
    assert.match(await response.text(), /Store not found/);
  }
  assert.equal(state.clients.length, 0);
});

test("tenant hostname and custom domain render a database store name", async () => {
  for (const host of ["testbrand.lebrands.store", "www.custom.example"]) {
    const response = await worker.fetch(new Request(`https://${host}/any-path`), env);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /<h1>Test Brand<\/h1>/);
    assert.match(body, /This store is coming soon/);
  }
  assert.equal(state.closes, 2);
  assert.deepEqual(state.queries.filter((q) => q.query.includes("resolve_store")).map((q) => q.values),
    [["testbrand.lebrands.store"], ["www.custom.example"]]);
});

test("unknown stores and inactive stores are 404", async () => {
  state.stores.set("paused.lebrands.store", { name: "Paused", status: "paused" });
  state.stores.set("draft.lebrands.store", { name: "Draft", status: "draft" });
  for (const host of ["unknown.lebrands.store", "unknown.example", "paused.lebrands.store", "draft.lebrands.store"]) {
    const response = await worker.fetch(new Request(`https://${host}/`), env);
    assert.equal(response.status, 404);
  }
});

test("store names are escaped in titles and headings", async () => {
  state.stores.set("unsafe.lebrands.store", { store_id: STORE_ID, subdomain: "unsafe", name: '<script>alert("x")</script>&', status: "live" });
  const response = await worker.fetch(new Request("https://unsafe.lebrands.store/"), env);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!body.includes("<script>"));
  assert.ok(body.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;"));
});

test("published stores use the shared Aura snapshot and unknown products are branded 404", async () => {
  state.publication = {
    store: { store_id: STORE_ID, subdomain: "testbrand", name: "Test Brand", status: "live" },
    settings: { brand_name: "Test Brand", description: "A considered collection of everyday essentials.", tagline: "Made with care.", subdomain: "testbrand" },
    products: [], policies: [],
  };
  const home = await worker.fetch(new Request("https://testbrand.lebrands.store/"), env);
  assert.equal(home.status, 200); assert.match(await home.text(), /aura-hero/);
  const missing = await worker.fetch(new Request(`https://testbrand.lebrands.store/products/${SECOND_STORE_ID}`), env);
  assert.equal(missing.status, 404); assert.match(await missing.text(), /This page isn/);
});

test("member transactions authorize the session before setting tenant context and deny outsiders", async () => {
  const db = createDb(env);
  await db.withMemberStore(STORE_ID, "a".repeat(64), async () => {});
  const authorize = state.queries.findIndex((q) => q.query.includes("authorize_store_session"));
  const context = state.queries.findIndex((q) => q.query.includes("set_config"));
  assert.ok(authorize >= 0 && context > authorize);
  assert.deepEqual(state.queries[authorize].values, ["a".repeat(64), STORE_ID]);
  state.queries = []; state.allowed = false;
  await assert.rejects(db.withMemberStore(SECOND_STORE_ID, "a".repeat(64), () => assert.fail("Unauthorized callback")), { status: 403 });
  assert.ok(!state.queries.some((q) => q.query.includes("set_config")));
  assert.equal(state.rollbacks, 1);
  await db.close();
});

test("database failures return 503 and log only a diagnostic code", async () => {
  const logger = mock.method(console, "error", () => {});
  state.error = Object.assign(new Error("sensitive connection details"), { code: "08006" });
  const response = await worker.fetch(new Request("https://testbrand.lebrands.store/"), env);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /Store temporarily unavailable/);
  assert.ok(!body.includes("sensitive"));
  assert.ok(!JSON.stringify(logger.mock.calls).includes("sensitive"));
  assert.equal(state.closes, 1);
});

test("missing Hyperdrive binding fails closed with 503", async () => {
  mock.method(console, "error", () => {});
  const response = await worker.fetch(new Request("https://testbrand.lebrands.store/"), {});
  assert.equal(response.status, 503);
  assert.equal(state.clients.length, 0);
});

test("Worker never permits an administrative connection role", async () => {
  mock.method(console, "error", () => {});
  state.role = "postgres";
  const response = await worker.fetch(new Request("https://testbrand.lebrands.store/"), env);
  assert.equal(response.status, 503);
  assert.equal(state.queries.filter((q) => q.query.includes("resolve_store")).length, 0);
});

test("request cleanup is registered with waitUntil", async () => {
  const pending = [];
  await worker.fetch(new Request("https://testbrand.lebrands.store/"), env, {
    waitUntil(promise) { pending.push(promise); },
  });
  await Promise.all(pending);
  assert.equal(pending.length, 1);
  assert.equal(state.closes, 1);
});

test("driver options disable type fetching and keep the connection pool small", async () => {
  const db = createDb(env);
  assert.equal(state.clients[0].options.fetch_types, false);
  assert.equal(state.clients[0].options.max, 2);
  assert.equal(state.clients[0].connectionString, env.HYPERDRIVE.connectionString);
  await db.close();
});

test("withStore sets transaction-local context and passes the transaction client", async () => {
  const db = createDb(env);
  const result = await db.withStore(STORE_ID, async (tx) => tx`SELECT store_id FROM public.products`);
  assert.deepEqual(result, [{ store_id: STORE_ID }]);
  const setting = state.queries.find((q) => q.query.includes("set_config"));
  assert.match(setting.query, /set_config\('app.store_id', \?, true\)/);
  assert.deepEqual(setting.values, [STORE_ID]);
  assert.ok(setting.transactionContext);
  assert.equal(state.begins, 1);
  assert.equal(state.commits, 1);
  await db.close();
});

test("successive transactions do not share tenant context", async () => {
  const db = createDb(env);
  for (const storeId of [STORE_ID, SECOND_STORE_ID]) {
    const [row] = await db.withStore(storeId, (tx) => tx`SELECT store_id FROM public.products`);
    assert.equal(row.store_id, storeId);
  }
  const contexts = state.queries.filter((q) => q.query.includes("set_config")).map((q) => q.transactionContext);
  assert.notEqual(contexts[0], contexts[1]);
  await db.close();
});

test("callback failure rolls back and the next transaction starts clean", async () => {
  const db = createDb(env);
  await assert.rejects(db.withStore(STORE_ID, () => { throw new Error("Callback failed"); }), /Callback failed/);
  assert.equal(state.rollbacks, 1);
  const [row] = await db.withStore(SECOND_STORE_ID, (tx) => tx`SELECT store_id FROM public.products`);
  assert.equal(row.store_id, SECOND_STORE_ID);
  await db.close();
});

test("invalid UUID and missing callback are rejected before a transaction starts", async () => {
  const db = createDb(env);
  await assert.rejects(db.withStore("invalid", () => {}), /UUID/);
  await assert.rejects(db.withStore(STORE_ID, null), /function/);
  assert.equal(state.begins, 0);
  await db.close();
});