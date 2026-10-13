import test from "node:test";
import assert from "node:assert/strict";
import { catalogPage, normalisePageSize } from "../src/public/catalog-page.js";
const items = Array.from({ length: 30 }, (_, i) => ({ title: `Kurta ${i}`, price: (i % 7) * 100, available: i % 2 === 0, index: i, collections: i < 10 ? ["a"] : [] }));
test("pagination slices and clamps", () => {
  assert.equal(catalogPage(items, { pageSize: 12 }).pages, 3);
  assert.equal(catalogPage(items, { pageSize: 12, page: 3 }).visible.length, 6);
  assert.equal(catalogPage(items, { pageSize: 12, page: 99 }).page, 3);
  assert.equal(catalogPage(items).visible.length, 30);
  assert.equal(normalisePageSize("7"), 24);
});
test("filters and sorts before paging", () => {
  assert.equal(catalogPage(items, { collection: "a" }).total, 10);
  assert.equal(catalogPage(items, { stockOnly: true }).total, 15);
  const r = catalogPage(items, { sort: "price-desc", pageSize: 12 });
  assert.ok(r.visible[0].price >= r.visible[1].price);
  assert.equal(catalogPage(items, { q: "kurta 2" }).total, 11);
});
