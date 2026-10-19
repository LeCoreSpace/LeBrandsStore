import test from "node:test";
import assert from "node:assert/strict";
import { renderAura, storefrontIcon } from "../src/public/aura.js";
import { STYLE_IDS } from "../src/public/aura-styles.js";
import { productHref } from "../src/public/commerce-options.js";
import { serveStorefront } from "../src/store/live.js";

const id = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const logo = `https://media.lebrands.store/stores/${id}/33333333-3333-4333-8333-333333333333.webp`;
const fixture = style => ({
  store: { store_id: id, subdomain: "example", name: "Example Store", status: "live" },
  settings: {
    brand_name: "Example Store", subdomain: "example", logo_url: logo,
    ann_design: { version: 1, style, copy: {}, media: {} },
  },
  products: [{ id: productId, slug: "my-unique-womens-top", title: "My unique womens top",
    description: "A cotton top.", status: "active", price_paise: 129900, stock: 3, images: [] }],
  policies: [], collections: [],
});
const db = data => ({ withStore: async (_, fn) => fn(async (parts) => {
  const query = parts.join("?");
  return query.includes("SELECT p.snapshot") ? [{ snapshot: data }] : [{ enabled: false }];
}) });

test("all saved themes use the shared live product structure and merchant favicon", () => {
  for (const style of STYLE_IDS) {
    const data = fixture(style);
    const product = renderAura(data, { page: "product", productId, commerce: true });
    assert.match(product, /sc-prod-live/, style);
    assert.match(product, /sc-buybox/, style);
    assert.match(product, new RegExp(`data-add-product="${productId}"`), style);
    for (const page of ["product", "cart", "checkout"]) {
      const html = renderAura(data, { page, productId, commerce: true });
      assert.ok(html.includes(`<link rel="icon" href="${logo}">`), `${style}/${page}`);
      assert.match(html, /commerce\.css/, `${style}/${page}`);
      assert.ok(html.includes(`class="sc sc-${style}"`), `${style}/${page} must keep merchant theme framing`);
      if(page==="checkout"){
        assert.match(html,/id="checkout-form"/,style);
        assert.match(html,/data-commerce-config/,style);
        assert.equal((html.match(/<main\b/g)||[]).length,1,style);
      }
    }
    const collection = renderAura(data, { page: "collection", commerce: true });
    assert.match(collection, /href="\/products\/my-unique-womens-top"/, style);
    assert.doesNotMatch(collection, new RegExp(`href="/products/${productId}"`), style);
  }
});

test("public links use saved slugs, remain stable after title edits and reject unsafe slugs", () => {
  const product = fixture(STYLE_IDS[0]).products[0];
  assert.equal(productHref(product), "/products/my-unique-womens-top");
  assert.equal(productHref({ ...product, title: "Renamed product" }), productHref(product));
  assert.equal(productHref({ ...product, slug: '"><script>' }), `/products/${productId}`);
  assert.equal(productHref({ id: productId }), `/products/${productId}`);
});

test("legacy product IDs redirect to the published slug and preserve attribution queries", async () => {
  const data = fixture(STYLE_IDS[0]), database = db(data);
  const response = await serveStorefront(new Request(`https://example.lebrands.store/products/${productId}?utm_source=mall`), database, data.store);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/products/my-unique-womens-top?utm_source=mall");
  const canonical = await serveStorefront(new Request("https://example.lebrands.store/products/my-unique-womens-top"), database, data.store);
  assert.equal(canonical.status, 200);
  assert.match(await canonical.text(), /My unique womens top/);
  const missing = await serveStorefront(new Request("https://example.lebrands.store/products/not-a-product"), database, data.store);
  assert.equal(missing.status, 404);
});

test("merchant favicon routes use only approved logo hosts, with a safe monogram fallback", async () => {
  const data = fixture(STYLE_IDS[0]);
  assert.equal(storefrontIcon({ann_design:{media:{logo:{url:logo}}}}).href,logo);
  let response = await serveStorefront(new Request("https://example.lebrands.store/favicon.ico"), db(data), data.store);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), logo);
  data.settings.logo_url = "https://attacker.invalid/logo.svg";
  data.settings.brand_name = '<script>alert("x")</script>';
  response = await serveStorefront(new Request("https://example.lebrands.store/favicon.svg"), db(data), data.store);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg/);
  const svg = await response.text();
  assert.doesNotMatch(svg, /<script|attacker\.invalid/);
  assert.match(svg, /&lt;S/);
  assert.match(storefrontIcon(data.settings).href, /^\/favicon.svg\?v=/);
  const head = await serveStorefront(new Request("https://example.lebrands.store/favicon.svg", { method: "HEAD" }), db(data), data.store);
  assert.equal(await head.text(), "");
});
