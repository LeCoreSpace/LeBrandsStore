import test from "node:test";
import assert from "node:assert/strict";
import { renderAura } from "../src/public/aura.js";
import { bagControl, BAG_CSS } from "../src/public/aura-sections.js";
import { STYLE_IDS } from "../src/public/aura-styles.js";

const storeId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const fixture = style => ({
  store: { store_id: storeId, name: "Example Store", subdomain: "example", status: "live" },
  settings: {
    brand_name: "Example Store",
    ...(style ? { ann_design: { version: 1, style, copy: {}, media: {} } } : {}),
  },
  products: [{ id: productId, slug: "cotton-top", title: "Cotton top", price_paise: 12000, stock: 3, images: [] }],
  policies: [], collections: [],
});

test("every theme and shopping page has the shared icon-led bag and live count hook", () => {
  for (const style of [null, ...STYLE_IDS]) {
    for (const page of ["home", "collection", "product", "cart", "checkout"]) {
      const html = renderAura(fixture(style), { page, productId, commerce: true });
      const buttons = html.match(/<button\b[^>]*data-cart-open[^>]*>[\s\S]*?<\/button>/g);
      assert.ok(buttons?.length, `${style || "regular"}/${page}`);
      for (const button of buttons) {
        assert.match(button, /class="lb-bag /);
        assert.match(button, /<svg class="lb-bag-icon"[^>]*aria-hidden="true"/);
        assert.match(button, /<span class="lb-bag-count" data-cart-count>0<\/span>/);
        assert.match(button, /Open bag, items:/);
      }
      assert.ok(html.includes(BAG_CSS));
    }
  }
});

test("read-only bags stay disabled and accessible labels are escaped", () => {
  const disabled = bagControl({ disabled: true });
  assert.match(disabled, / disabled aria-disabled="true"/);
  assert.match(disabled, /Bag preview, shopping disabled, items:/);
  const readonly = renderAura(fixture(null), { page: "home", readOnly: true, commerce: false });
  assert.match(readonly, /class="lb-bag au-bag au-icon-button" data-cart-open disabled aria-disabled="true"/);
  assert.doesNotMatch(bagControl({ label: '<img src=x onerror="alert(1)">' }), /<img/);
});

test("bag styling keeps touch targets, visible focus and expanding numeric badges", () => {
  assert.match(BAG_CSS, /min-width:44px;min-height:44px/);
  assert.match(BAG_CSS, /focus-visible/);
  assert.match(BAG_CSS, /font-variant-numeric:tabular-nums/);
  assert.match(BAG_CSS, /min-width:18px/);
  const badgeDeclarations = BAG_CSS.match(/\.lb-bag-count\{([^}]+)\}/)[1].split(";");
  assert.equal(badgeDeclarations.some(rule => /^\s*width:/.test(rule)), false);
});
