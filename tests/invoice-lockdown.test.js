import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardDb,STORE,ORDER,USER } from "./helpers/dashboard-db.js";
import { issueInvoice } from "../src/dashboard/repository.js";

const migration = readFileSync(new URL("../db/migrations/0008_invoice_lockdown.sql",import.meta.url),"utf8");
test("invoice lockdown grants SELECT only and replaces ALL policies with tenant SELECT policies", () => {
  assert.match(migration,/REVOKE ALL ON TABLE public\.invoices, public\.invoice_sequences FROM PUBLIC, lebrands_app/);
  assert.match(migration,/GRANT SELECT ON TABLE public\.invoices, public\.invoice_sequences TO lebrands_app/);
  assert.ok(!/GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|ALL).*TABLE/i.test(migration));
  for (const table of ["invoices","invoice_sequences"]) {
    assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
    assert.ok(migration.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`));
    assert.ok(migration.includes(`DROP POLICY tenant_isolation ON public.${table};`));
    assert.ok(migration.includes(`CREATE POLICY tenant_isolation ON public.${table} FOR SELECT TO lebrands_app`));
  }
});
test("invoice definers are postgres-owned, explicitly tenant checked and not public/API-role executable", () => {
  for (const name of ["issue_invoice","cancel_invoice"]) {
    const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
    const end = migration.indexOf("END $$;",start);
    const body = migration.slice(start,end);
    assert.match(body,/SECURITY DEFINER SET search_path = pg_catalog, public/);
    assert.match(body,/NULLIF\(current_setting\('app\.store_id',true\),''\)::uuid/);
    assert.match(body,/v_store_id IS NULL/);
    assert.match(body,/WHERE o\.store_id = v_store_id AND o\.id = p_order_id FOR UPDATE/);
    assert.match(body,/ERRCODE = 'insufficient_privilege'/);
    assert.ok(migration.includes(`ALTER FUNCTION public.${name}(uuid) OWNER TO postgres;`));
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION public.${name}(uuid) FROM PUBLIC;`));
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${name}(uuid) TO lebrands_app;`));
  }
  assert.match(migration,/WHERE rolname IN \('anon','authenticated','service_role'\)/);
});
test("database issuance retains IST April financial years, prefix and non-truncating number padding", () => {
  assert.match(migration,/extract\(year FROM v_now AT TIME ZONE 'Asia\/Kolkata'\)/);
  assert.match(migration,/extract\(month FROM v_now AT TIME ZONE 'Asia\/Kolkata'\) < 4/);
  assert.match(migration,/upper\(left\(regexp_replace[\s\S]*?,12\)/);
  assert.match(migration,/,'STO'\)/);
  assert.match(migration,/lpad\(v_last::text,greatest\(4,length\(v_last::text\)\),'0'\)/);
  assert.match(migration,/jsonb_build_object\('supplier',v_supplier,'customer',v_order\.shipping_address,'items',v_items/);
  assert.match(migration,/FOR UPDATE;[\s\S]*?UPDATE public\.invoice_sequences[\s\S]*?INSERT INTO public\.invoices/);
});
test("invoice update/delete and counter guards use insufficient_privilege, not check_violation", () => {
  const guards = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_issued_invoice()"));
  assert.match(guards,/TG_OP = 'DELETE'/);
  assert.match(guards,/CREATE TRIGGER invoice_delete_lockdown BEFORE DELETE ON public\.invoices/);
  assert.match(guards,/Issued invoice content is immutable' USING ERRCODE = 'insufficient_privilege'/);
  assert.match(guards,/Invoice counters cannot be reset, moved or skip numbers' USING ERRCODE = 'insufficient_privilege'/);
  assert.ok(!guards.includes("ERRCODE = 'check_violation'"));
});
test("Worker invoice mutations call protected functions and never write the financial tables directly", () => {
  const worker = readFileSync(new URL("../src/dashboard/repository.js",import.meta.url),"utf8");
  assert.match(worker,/SELECT \* FROM public\.issue_invoice\(/);
  assert.match(worker,/SELECT \* FROM public\.cancel_invoice\(/);
  assert.ok(!/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+public\.(?:invoices|invoice_sequences)\b/i.test(worker));
});
test("function-boundary model refuses missing context and another store's order with 42501", async () => {
  const db = dashboardDb(), other = "90000000-0000-4000-8000-000000000003";
  db.state.orders.push({...db.state.orders[0],id:other,store_id:"90000000-0000-4000-8000-000000000001"});
  await assert.rejects(db.transaction((tx) => tx`SELECT * FROM public.issue_invoice(${other})`),{code:"42501"});
  await assert.rejects(db.transaction((tx) => tx`SELECT * FROM public.cancel_invoice(${other})`),{code:"42501"});
  db.state.contextStore = null;
  await assert.rejects(db.transaction((tx) => tx`SELECT * FROM public.issue_invoice(${ORDER})`),{code:"42501"});
  assert.equal(db.state.invoices.length,0);
});
test("function-boundary model keeps APP direct invoice/counter writes forbidden with 42501", async () => {
  const db = dashboardDb();
  await assert.rejects(db.transaction((tx) => tx`INSERT INTO public.invoices(store_id) VALUES (${STORE})`),{code:"42501"});
  await assert.rejects(db.transaction((tx) => tx`UPDATE public.invoices SET status = 'cancelled' WHERE store_id = ${STORE}`),{code:"42501"});
  await assert.rejects(db.transaction((tx) => tx`DELETE FROM public.invoices WHERE store_id = ${STORE}`),{code:"42501"});
  await assert.rejects(db.transaction((tx) => tx`TRUNCATE public.invoice_sequences`),{code:"42501"});
  await assert.rejects(db.transaction((tx) => tx`UPDATE public.invoice_sequences SET last_number = 0 WHERE store_id = ${STORE}`),{code:"42501"});
});
test("Worker reports permission/business errors safely and cancelled issuance stays idempotent", async () => {
  const db = dashboardDb();db.state.orders[0].status = "shipped";
  const first = await db.transaction((tx) => issueInvoice(tx,STORE,ORDER,USER));
  db.state.orders[0].status = "rto";
  const [cancelled] = await db.transaction((tx) => tx`SELECT * FROM public.cancel_invoice(${ORDER})`);
  const same = await db.transaction((tx) => issueInvoice(tx,STORE,ORDER,USER));
  assert.equal(same.id,first.id);assert.equal(same.status,"cancelled");
  assert.equal(cancelled.credit_note_number,"STORE/CN/2026-27/0001");
  const [again] = await db.transaction((tx) => tx`SELECT * FROM public.cancel_invoice(${ORDER})`);
  assert.equal(again.changed,false);
  assert.equal(db.state.sequences[`${STORE}:2026-27`].last_number,1);
  db.state.contextStore = null;
  await assert.rejects(db.transaction((tx) => issueInvoice(tx,STORE,ORDER,USER)),{status:403});
  const pending = dashboardDb();
  await assert.rejects(pending.transaction((tx) => issueInvoice(tx,STORE,ORDER,USER)),{status:409});
  assert.equal(pending.state.invoices.length,0);
});
