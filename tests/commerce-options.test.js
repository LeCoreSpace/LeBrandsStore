test("all saved Ann styles expose one unselected variant picker for the requested product", async()=>{
  const {STYLE_IDS}=await import("../src/public/aura-styles.js");
  const {renderAura}=await import("../src/public/aura.js");
  for(const style of STYLE_IDS){
    const html=renderAura({store:{name:"Fixture"},settings:{ann_design:{version:1,style,copy:{},media:{}}},
      products:[{...p,status:"active",title:"Fixture variant product",description:"A synthetic product.",images:[],content:{}}]},
      {page:"product",productId:p.id,commerce:true});
    assert.equal(html.split("data-product-options").length-1,1,style);
    assert.match(html,/Choose options/,style);
  }
});
test("browser SKU module is registered in the Worker's explicit asset routing",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
  assert.match(source,/"commerce-options\.js"/);
});
import test from "node:test";
import assert from "node:assert/strict";
import { cartKey, normaliseCart, resolveSelection, valueStatus, hasOptions, renderOptionBuy, safeJson, matchIssue } from "../src/public/commerce-options.js";
import { SECTION_RENDERERS } from "../src/public/aura-sections.js";
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const p = { id: "p1", title: "Tee", price_paise: 10000, catalogue: { axes: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Red", "Blue"] }] },
  variants: [{ id: A, values: ["S", "Red"], sku: "T-S-R", stock: 3, price_paise: 12000 }, { id: B, values: ["M", "Red"], sku: "T-M-R", stock: 0, price_paise: null }, { id: C, values: ["M", "Blue"], sku: "T-M-B", stock: null, price_paise: null }] };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
test("cart identity keeps SKUs separate and legacy carts", () => {
  const c = normaliseCart([{ product_id: "p1", quantity: 1 }, { product_id: "p1", product_option_id: A, quantity: 2 }, { product_id: "p1", product_option_id: B.toUpperCase(), quantity: 1 }, { product_id: "p1", product_option_id: A, quantity: 1 }, { product_id: "p1", product_option_id: "bad", quantity: 1 }]);
  assert.equal(c.length, 3); assert.equal(c[1].quantity, 3); assert.equal(cartKey(c[0]), "p1|");
});
test("issue matching by option", () => { assert.equal(matchIssue([{ product_id: "p1", product_option_id: A, message: "x" }], { product_id: "p1", product_option_id: B }), undefined); });
test("selection states and price override", () => {
  assert.equal(resolveSelection(p, {}).state, "incomplete");
  assert.equal(resolveSelection(p, { Size: "S" }).state, "incomplete");
  assert.equal(resolveSelection(p, { Size: "S", Colour: "Blue" }).state, "missing");
  assert.equal(resolveSelection(p, { Size: "M", Colour: "Red" }).state, "soldout");
  const ok = resolveSelection(p, { Size: "S", Colour: "Red" }); assert.equal(ok.price_paise, 12000); assert.equal(ok.max, 3);
  const f = resolveSelection(p, { Size: "M", Colour: "Blue" }); assert.equal(f.price_paise, 10000); assert.equal(f.max, 99);
  assert.equal(valueStatus(p, { Colour: "Blue" }, "Size", "S"), "unavailable");
  assert.equal(valueStatus(p, { Colour: "Red" }, "Size", "M"), "soldout");
});
test("selector renders unselected and disabled; escapes json", () => {
  const html = renderOptionBuy({ ...p, title: "<x>", id: "p1" }, { esc, money: String });
  assert.ok(!/ checked/.test(html)); assert.match(html, /data-needs-option disabled/); assert.ok(!html.includes("<x>"));
  assert.ok(!safeJson({ a: "</script>" }).includes("<"));
});
const ctx = (extra = {}) => ({ product: p, products: [p], layout: [], data: {}, settings: {}, brand: "B", renderDescription: (s) => s, options: { page: "product", commerce: true, productId: "p1", ...extra } });
test("standard layout: selector + sticky gated; read-only has none", () => {
  const html = SECTION_RENDERERS["product-details"]({ id: "s" }, ctx());
  assert.equal((html.match(/data-needs-option/g) || []).length, 2); assert.match(html, /data-product-options/);
  assert.ok(!SECTION_RENDERERS["product-details"]({ id: "s" }, ctx({ readOnly: true })).includes("data-product-options"));
  assert.equal(hasOptions({ ...p, demo: true }), false);
});
