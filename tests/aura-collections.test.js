import test from "node:test";
import assert from "node:assert/strict";
import { renderAura } from "../src/public/aura.js";
const products = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, title: `Kurta ${i}`, price_paise: 100, images: [] }));
const collections = [{ id: "c1", title: "Summer", slug: "summer", description: "Light cotton.", product_ids: ["p1", "p2"], related_ids: ["c2"], faq: [{ question: "Fit?", answer: "<p>True to size.</p>" }] }, { id: "c2", title: "Winter", slug: "winter", product_ids: ["p3"] }];
const sec = (type, settings = {}) => ({ id: type, type, settings, blocks: [] });
test("collection page resolves the selected entity", () => {
  const layouts = { collection: [sec("collection-heading"), sec("product-grid"), sec("collection-pagination", { page_size: "12" }), sec("faq"), sec("related-collections")] };
  const html = renderAura({ store: {}, settings: {}, products, collections, layouts }, { page: "collection", collectionId: "c1" });
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.ok(html.includes("Light cotton.") && html.includes("True to size.") && html.includes('href="/collections/winter"'));
  assert.equal((html.match(/class="au-card"/g) || []).length, 2);
  assert.ok(!html.includes("data-catalog-pagination"));
});
test("pagination only renders when needed and home links real collections", () => {
  const layouts = { collection: [sec("product-grid"), sec("collection-pagination", { page_size: "12" })], home: [sec("featured-collection", { title: "Shop" })] };
  const all = renderAura({ store: {}, settings: {}, products, layouts }, { page: "collection" });
  assert.ok(all.includes("data-catalog-pagination") && all.includes('data-page-size="12"'));
  assert.equal((all.match(/class="au-card"/g) || []).length, 30);
  const home = renderAura({ store: {}, settings: {}, products, collections, layouts }, { page: "home" });
  assert.ok(home.includes('href="/collections/summer"'));
});
test("product content wins over shared text", () => {
  const layouts = { product: [{ ...sec("material-care", { body: "<p>Shared</p>" }) }, sec("product-details")] };
  const html = renderAura({ store: {}, settings: {}, products: [{ ...products[0], content: { materials_care: "<p>Own cotton</p>" } }], layouts }, { page: "product", productId: "p0" });
  assert.ok(html.includes("Own cotton") && !html.includes("Shared"));
});
test("explicit blank product content clears the shared fallback", () => {
  const layouts = { product: [sec("material-care", { body: "<p>Shared</p>" }), sec("product-details")] };
  const html = renderAura({ store: {}, settings: {}, products: [{ ...products[0], content: { materials_care: "" } }], layouts }, { page: "product", productId: "p0" });
  assert.ok(!html.includes("Shared"));
});
test("cart recommendations use real in-stock products only when enabled", () => {
  const layouts = { cart: [{ id: "commerce", type: "commerce", settings: {}, blocks: [] }] };
  const data = { store: {}, settings: {}, products: [{ ...products[0], stock: 0 }, products[1]], layouts };
  const on = renderAura({ ...data, aura_skeleton_enabled: true }, { page: "cart", commerce: true });
  assert.ok(on.includes('data-rec-id="p1"') && !on.includes('data-rec-id="p0"'));
  assert.ok(!renderAura(data, { page: "cart", commerce: true }).includes("data-cart-recs"));
});
