import test from "node:test";
import assert from "node:assert/strict";
import { renderAura } from "../src/public/aura.js";
import { STYLE_IDS } from "../src/public/aura-styles.js";

const ROWS = [
  { label: "Pack <b>size</b>", value: "0 ml" },
  { label: "Gluten free", value: "No" },
  { label: "Finish", value: "Matte, Satin" },
  { label: "XSS", value: `"><script>alert(1)</script>` },
];
const mk = (id, extra = {}) => ({ id, title: `P ${id}`, description: "A fine thing. Truly.", price_paise: 10000, status: "active", images: [], collection_ids: [],
  content: { features: [{ label: "Finish", value: "Manual finish" }, { label: "Origin", value: "Jaipur" }] }, ...extra });
const withRows = id => mk(id, { product_details: ROWS });
const store = (settings = {}, layouts, products) => ({ store: { name: "T", subdomain: "t" }, settings, layouts, products: products || [withRows("a"), mk("b", { content: {}, product_details: [{ label: "Secret", value: "OTHER" }] })], collections: [], policies: [] });
const page = (data, productId = "a") => renderAura(data, { page: "product", productId });
const count = (html, s) => html.split(s).length - 1;
const design = style => ({ version: 1, style, copy: {}, media: {} });
const layout = (specs) => ({ product: [{ id: "d", type: "product-details", settings: {} }, ...(specs ? [{ id: "s", type: "product-specs", settings: specs }] : [])] });
const checkRows = html => {
  assert.equal(count(html, "Pack &lt;b&gt;size&lt;/b&gt;"), 1);
  assert.ok(html.includes("0 ml") && html.includes("Matte, Satin") && /(>| )No</.test(html));
  assert.ok(!html.includes("<script>alert(1)"));
  assert.equal(count(html, "Manual finish"), 0, "descriptor wins over same-label feature");
  assert.ok(!html.includes("OTHER"));
};

test("ordinary layout: specs section owns rows once and keeps manual features", () => {
  const html = page(store({}, layout({})));
  checkRows(html);
  assert.ok(html.includes("Jaipur"));
  assert.equal(count(html, "data-product-details"), 0);
});
test("ordinary layout: disabled or missing specs show rows in main details once", () => {
  for (const l of [layout({ enabled: false }), layout(null)]) {
    const html = page(store({}, l));
    checkRows(html);
    assert.equal(count(html, "data-product-details"), 1);
  }
});
test("no descriptors: unchanged output", () => {
  const html = page(store({}, layout(null), [mk("a")]));
  assert.ok(!html.includes("data-product-details"));
  assert.ok(!html.includes("Manual finish"), "specs section absent");
  const specs = page(store({}, layout({}), [mk("a")]));
  assert.ok(specs.includes("Manual finish") && specs.includes("Jaipur"));
});
test("legacy snapshot rows and product-specs block fallback", () => {
  const p = mk("a", { content: {}, classification: { descriptors: [{ descriptor_id: 1, number_value: 0 }] }, classification_reference: { descriptors: [{ id: 1, name: "Weight", input_type: "number", unit: "g" }] } });
  assert.ok(page(store({}, layout({}), [p])).includes("<dt>Weight</dt><dd>0 g</dd>"));
});
test("every saved Ann style renders rows once, for the requested product only", () => {
  for (const style of STYLE_IDS) {
    const html = page(store({ ann_design: design(style) }));
    assert.equal(count(html, "Pack &lt;b&gt;size&lt;/b&gt;"), 1, style);
    assert.ok(html.includes("0 ml") && html.includes("Matte, Satin") && /(>| )No</.test(html), style);
    assert.ok(!html.includes("<script>alert(1)") && !html.includes("OTHER"), style);
    assert.ok(!html.includes("Manual finish"), style);
    const other = page(store({ ann_design: design(style) }), "b");
    assert.ok(!other.includes("0 ml") && other.includes("OTHER"), style);
  }
});
test("home and collection pages do not inject details", () => {
  for (const p of ["home", "collection"]) assert.ok(!renderAura(store({ ann_design: design("proof-detail") }), { page: p }).includes("0 ml"));
});
