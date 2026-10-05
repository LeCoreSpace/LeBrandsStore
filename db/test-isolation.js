import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  clearPgEnvironment, formatDatabaseError, printConnectionTarget, validateSupabaseUrl,
} from "./connection.js";
import { assertCleanupPermission, cleanupFixtures, setupFixtures } from "./isolation-fixtures.js";
import { accountIsolationChecks } from "./account-isolation.js";

clearPgEnvironment();
let admin;
let app;
let cleanupAllowed = false;
let fixtures;
const results = new Map();
const probeName = `rls_test_probe_${randomUUID().replaceAll("-", "")}`;
const secrets = () => [process.env.SUPABASE_DB_URL, process.env.SUPABASE_APP_DB_URL];

function record(name, passed, reason) {
  results.set(name, passed);
  console.info(`${passed ? "PASS" : "FAIL"} ${name}: ${reason}`);
}

async function check(name, fn, reason) {
  try {
    await fn();
    record(name, true, reason);
  } catch (error) {
    record(name, false, formatDatabaseError(error, secrets()));
  }
}

// Even unexpectedly successful mutations/DDL must NEVER commit.
async function appTransaction(storeId, fn, { commit = false } = {}) {
  const rollback = new Error("Intentional test rollback");
  let result;
  try {
    await app.begin(async (tx) => {
      const [role] = await tx`SELECT current_user AS name`;
      assert.equal(role.name, "lebrands_app", "APP must connect as lebrands_app.");
      if (storeId) await tx`SELECT set_config('app.store_id', ${storeId}, true)`;
      result = await fn(tx);
      if (!commit) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

async function denied(storeId, fn) {
  try {
    await appTransaction(storeId, fn);
  } catch (error) {
    assert.equal(error.code, "42501", "Must fail for insufficient privilege/RLS, not an unrelated SQL error.");
    return;
  }
  assert.fail("Operation was allowed; its transaction was rolled back.");
}

async function visibleFixture(store) {
  await appTransaction(store.storeId, async (tx) => {
    for (const [table, expected] of [
      ["products", store.productIds], ["customers", [store.customerId]],
      ["orders", [store.orderId]], ["order_items", [store.itemId]],
    ]) {
      const rows = await tx`SELECT id, store_id FROM public.${tx(table)}`;
      assert.ok(rows.length === expected.length &&
        rows.every((row) => row.store_id === store.storeId && expected.includes(row.id)),
      `Expected only this store's fixture rows in ${table}.`);
    }
  });
}

async function snapshotBProduct() {
  // Explicit ADMIN exception requested for verifying the cross-store probes.
  const rows = await admin`
    SELECT row_to_json(p)::text AS snapshot FROM public.products p
    WHERE store_id = ${fixtures.b.storeId} AND id = ${fixtures.b.productIds[1]}
  `;
  assert.equal(rows.length, 1, "Store B's unreferenced fixture product must exist.");
  return rows[0].snapshot;
}

const checks = [
  ...accountIsolationChecks(() => fixtures, appTransaction, denied),
  ...["products", "customers", "orders"].map((table) => ({
    name: `a.${table}`,
    reason: "No context exposes zero rows or a permission denial.",
    fn: async () => {
      try {
        await appTransaction(null, async (tx) => {
          const rows = await tx`SELECT id FROM public.${tx(table)}`;
          assert.equal(rows.length, 0, "Missing store context must not expose rows.");
        });
      } catch (error) {
        if (error.code !== "42501") throw error;
      }
    },
  })),
  { name: "b", reason: "A sees exactly its 2 products, 1 customer, 1 order and 1 item.",
    fn: () => visibleFixture(fixtures.a) },
  { name: "c", reason: "B sees exactly its 2 products, 1 customer, 1 order and 1 item.",
    fn: () => visibleFixture(fixtures.b) },
  { name: "d", reason: "A cannot insert a product into B.",
    fn: () => denied(fixtures.a.storeId, (tx) => tx`
      INSERT INTO public.products (store_id, title, slug, price_paise)
      VALUES (${fixtures.b.storeId}, 'rls-test-cross-insert', ${probeName}, 10000)
    `) },
  ...["UPDATE", "DELETE"].map((operation) => ({
    name: `e.${operation.toLowerCase()}`,
    reason: `${operation} affects zero B rows; ADMIN confirms the product is unchanged.`,
    fn: async () => {
      const before = await snapshotBProduct();
      let probeError;
      try {
        await appTransaction(fixtures.a.storeId, async (tx) => {
          const rows = operation === "UPDATE"
            ? await tx`UPDATE public.products SET title = 'rls-test-forbidden'
                WHERE store_id = ${fixtures.b.storeId} AND id = ${fixtures.b.productIds[1]}
                RETURNING id`
            : await tx`DELETE FROM public.products
                WHERE store_id = ${fixtures.b.storeId} AND id = ${fixtures.b.productIds[1]}
                RETURNING id`;
          assert.equal(rows.length, 0, "Cross-store mutation must affect zero rows.");
        });
      } catch (error) { probeError = error; }
      // Run verification even when the APP probe fails; every probe rolls back.
      assert.ok(await snapshotBProduct() === before, "B's complete product row changed.");
      if (probeError) throw probeError;
    },
  })),
  { name: "f", reason: "A cannot move its own unreferenced product to B.",
    fn: () => denied(fixtures.a.storeId, (tx) => tx`
      UPDATE public.products SET store_id = ${fixtures.b.storeId}, slug = ${probeName}
      WHERE store_id = ${fixtures.a.storeId} AND id = ${fixtures.a.productIds[1]}
    `) },
  { name: "g", reason: "Transaction-local context resets on the same APP backend.",
    fn: async () => {
      const previous = await appTransaction(fixtures.a.storeId, async (tx) => {
        const [row] = await tx`
          SELECT current_setting('app.store_id', true) AS context, pg_backend_pid() AS pid
        `;
        assert.equal(row.context, fixtures.a.storeId);
        return row.pid;
      }, { commit: true }); // Read-only probe tests the normal committed-request path.
      await appTransaction(null, async (tx) => {
        const [row] = await tx`
          SELECT current_setting('app.store_id', true) AS context, pg_backend_pid() AS pid
        `;
        assert.equal(row.pid, previous, "Use a Supabase session pooler; the APP backend changed.");
        assert.ok(row.context === null || row.context === "", "Store context leaked across transactions.");
      });
    } },
  ...[
    ["live", "rls-test-a.lebrands.store"], ["draft", "rls-test-draft.lebrands.store"],
    ["unknown", "nope.lebrands.store"],
  ].map(([kind, hostname]) => ({
    name: `h.${kind}`,
    reason: kind === "live" ? "Resolver returns only live store A." : `Resolver returns no ${kind} store.`,
    fn: () => appTransaction(null, async (tx) => {
      const rows = await tx`SELECT * FROM public.resolve_store(${hostname})`;
      if (kind === "live") {
        assert.ok(rows.length === 1 && rows[0].store_id === fixtures.a.storeId &&
          rows[0].subdomain === "rls-test-a" && rows[0].status === "live",
        "Resolver did not return exactly live fixture store A.");
      } else assert.equal(rows.length, 0, "Resolver must return no rows.");
    }),
  })),
  ...[
    ["alter", `ALTER TABLE public.products ADD COLUMN "${probeName}" integer`],
    ["drop", "DROP TABLE public.products"],
    ["disable-rls", "ALTER TABLE public.products DISABLE ROW LEVEL SECURITY"],
    ["set-role", "SET ROLE postgres"],
    ["create", `CREATE TABLE public."${probeName}" (id integer)`],
  ].map(([name, sql]) => ({
    name: `i.${name}`, reason: "Rejected with SQLSTATE 42501; any unexpected success is rolled back.",
    // SQL comes only from fixed statements and a locally generated UUID identifier.
    fn: () => denied(fixtures.a.storeId, (tx) => tx.unsafe(sql)),
  })),
];

try {
  const adminTarget = validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  const appTarget = validateSupabaseUrl(process.env.SUPABASE_APP_DB_URL, "SUPABASE_APP_DB_URL");
  printConnectionTarget(adminTarget);
  printConnectionTarget(appTarget);
  const adminUrl = new URL(process.env.SUPABASE_DB_URL);
  const appUrl = new URL(process.env.SUPABASE_APP_DB_URL);
  assert.ok(adminTarget.hostname === appTarget.hostname && adminTarget.port === appTarget.port &&
    adminUrl.pathname === appUrl.pathname &&
    adminTarget.username.split(".").slice(1).join(".") === appTarget.username.split(".").slice(1).join("."),
  "ADMIN and APP must target the same Supabase project/session-pooler database.");
  admin = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  app = postgres(process.env.SUPABASE_APP_DB_URL, { ssl: "require", max: 1 });
  await assertCleanupPermission(admin);
  const [lock] = await admin`SELECT pg_try_advisory_lock(714097281003::bigint) AS acquired`;
  assert.ok(lock.acquired, "Another isolation test is running; refusing concurrent fixture cleanup.");
  cleanupAllowed = true;
  await cleanupFixtures(admin);
  await appTransaction(null, async (tx) => {
    const [role] = await tx`
      SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
      FROM pg_catalog.pg_roles WHERE rolname = current_user
    `;
    assert.ok(role && !Object.values(role).some(Boolean), "APP must not have privileged role attributes.");
  });
  fixtures = await setupFixtures(admin);
  record("setup", true, "Created only marked rls-test fixtures; cleanup permission verified.");
  for (const entry of checks) await check(entry.name, entry.fn, entry.reason);
} catch (error) {
  record("setup", false, formatDatabaseError(error, secrets()));
} finally {
  for (const entry of checks) {
    if (!results.has(entry.name)) record(entry.name, false, "Not run because setup failed.");
  }
  if (cleanupAllowed) {
    await check("cleanup", () => cleanupFixtures(admin), "All marked fixture data removed in dependency order.");
  } else {
    record("cleanup", true, "No fixture writes were permitted; cleanup not required.");
  }
  for (const [name, client] of [["ADMIN", admin], ["APP", app]]) {
    if (client) {
      try { await client.end({ timeout: 5 }); }
      catch (error) { record(`close.${name}`, false, formatDatabaseError(error, secrets())); }
    }
  }
  const passed = [...results.values()].filter(Boolean).length;
  const failed = results.size - passed;
  console.info(`Summary: ${passed} PASS, ${failed} FAIL.`);
  if (failed) process.exitCode = 1;
}