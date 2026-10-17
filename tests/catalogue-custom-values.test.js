import test from "node:test";
import assert from "node:assert/strict";
import { cleanCustomValue, insertValue, submitCustomValue, variantValuesUrl } from "../src/public/catalogue-custom-values.js";

const option = () => ({ id: 5, name: "Shade", values: [{ id: 1, value: "Rose" }] });
const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test("url swap and validation", () => {
  assert.equal(variantValuesUrl("/api/stores/3/ann/reference"), "/api/stores/3/catalogue/variant-values");
  assert.ok(cleanCustomValue("<b>x").error);
  assert.ok(cleanCustomValue("a\nb").error);
  assert.ok(cleanCustomValue("x".repeat(201)).error);
  assert.equal(cleanCustomValue("  Teal ").value, "Teal");
});
test("inserts value once", () => {
  const cat = { options: [option()] };
  insertValue(cat, 5, { id: 9, value: "Teal" }); insertValue(cat, 5, { id: 9, value: "Teal" });
  assert.deepEqual(cat.options[0].values.map(v => v.id), [1, 9]);
});
test("existing value reused without request", async () => {
  let called = false;
  const r = await submitCustomValue({ fetcher: () => { called = true; }, url: "/u", productTypeId: 1, optionId: 5, text: "rose", scopeKey: "a", currentScopeKey: () => "a", option: option() });
  assert.equal(r.status, "reused"); assert.equal(called, false);
});
test("stale response ignored", async () => {
  let now = "a";
  const r = await submitCustomValue({ fetcher: async () => { now = "b"; return reply(200, { value: { id: 9, value: "Teal" }, created: true })(); }, url: "/u", productTypeId: 1, optionId: 5, text: "Teal", scopeKey: "a", currentScopeKey: () => now, option: option() });
  assert.equal(r.status, "stale");
});
test("failure keeps friendly message", async () => {
  const r = await submitCustomValue({ fetcher: reply(409, { error: "Already exists" }), url: "/u", productTypeId: 1, optionId: 5, text: "Teal", scopeKey: "a", currentScopeKey: () => "a", option: option() });
  assert.deepEqual(r, { status: "error", message: "Already exists" });
  const n = await submitCustomValue({ fetcher: async () => { throw new Error("x"); }, url: "/u", productTypeId: 1, optionId: 5, text: "Teal", scopeKey: "a", currentScopeKey: () => "a", option: option() });
  assert.equal(n.status, "error");
});
test("success returns added", async () => {
  const r = await submitCustomValue({ fetcher: reply(200, { value: { id: 9, value: "Teal" }, created: true }), url: "/u", productTypeId: 1, optionId: 5, text: "Teal", scopeKey: "a", currentScopeKey: () => "a", option: option() });
  assert.equal(r.status, "added"); assert.equal(r.value.id, 9);
});

import { applyCustomResult, isReadOnlyScope } from "../src/public/catalogue-custom-values.js";
const ok = { status: "added", value: { id: 9, value: "Teal" } };
const mk = (name, req) => ({ name, values: [], draft: "", pending: true, req });
test("late success only touches originating axis", () => {
  const a = mk("Shade", 1), b = mk("Shade", 2);
  const out = applyCustomResult({ axes: [b, a], axis: a, token: 1, name: "Shade", result: ok, text: "Teal" });
  assert.equal(out.selected, true); assert.deepEqual(a.values, ["Teal"]); assert.deepEqual(b.values, []);
});
test("removed or renamed axis ignored", () => {
  const a = mk("Shade", 1), b = mk("Shade", 2);
  assert.equal(applyCustomResult({ axes: [b], axis: a, token: 1, name: "Shade", result: ok, text: "Teal" }).live, false);
  a.name = "Size"; a.req = 0;
  assert.equal(applyCustomResult({ axes: [a], axis: a, token: 1, name: "Shade", result: ok, text: "Teal" }).live, false);
  assert.deepEqual(a.values, []);
});
test("newer input is kept", () => {
  const a = mk("Shade", 1); a.draft = "Teal blue";
  applyCustomResult({ axes: [a], axis: a, token: 1, name: "Shade", result: ok, text: "Teal" });
  assert.equal(a.draft, "Teal blue");
});
test("read only detection", () => {
  const fs = { closest: sel => sel.includes("fieldset[disabled]") ? {} : null };
  assert.equal(isReadOnlyScope({ closest: fs.closest }), true);
  assert.equal(isReadOnlyScope({ closest: () => null }), false);
  assert.equal(isReadOnlyScope({ dataset: { readonly: "true" }, closest: () => null }), true);
});
