import test from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/public/catalogue-model.js";
import { toModelRows, hasLegacyVariants } from "../src/public/catalogue-form.js";

const axes = [{ name: "Size", values: ["S", "M"] }];
test("controller rows validate: undefined id allowed, UI flags never leak", () => {
  const rows = model.reconcileVariants(axes, [], "TOTE").map(r => ({ ...r, id: undefined, isNew: true }));
  assert.throws(() => model.validateVariants(rows, { axes }));
  const clean = model.validateVariants(toModelRows(rows), { axes });
  assert.equal(clean.length, 2);
  assert.ok(clean.every(r => !("isNew" in r) && !("id" in r)));
});
test("legacy rows that do not match axes are detected, compatible rows are not", () => {
  const legacy = [{ values: ["XL"], sku: "A", stock: 1, price_paise: null }];
  assert.equal(hasLegacyVariants(model, [], legacy), true);
  assert.equal(hasLegacyVariants(model, axes, model.reconcileVariants(axes, [], "T")), false);
  assert.equal(hasLegacyVariants(model, [], []), false);
});
