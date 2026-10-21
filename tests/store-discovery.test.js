import test from "node:test";
import assert from "node:assert/strict";
import { storeCanonicalOrigin, storeDiscoveryPages, serveStoreDiscovery } from "../src/store/discovery.js";
import { serveStorefront } from "../src/store/live.js";
import { renderAura } from "../src/public/aura.js";

const storeId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const fixture = (name = "example") => ({
  store: { store_id: storeId, subdomain: name, name: `Brand ${name}`, status: "live" },
  settings: { brand_name: `Brand ${name}`, description: "Carefully made products.", support_email: "support@example.test" },
  products: [{ id: productId, slug: "daily-serum", title: "Daily serum", status: "active", stock: 0, price_paise: 10000, images: [] }],
  collections: [{ id: "c1", slug: "skin-care", title: "Skin care" }],
  policies: [{ kind: "privacy", title: "Privacy", body: "Published privacy terms." }, { kind: "shipping", title: "Shipping", body: "" }],
});
const request = (path, method = "GET") => new Request(`https://example.lebrands.store${path}`, { method });

test("discovery lists only real public routes from the tenant's publication", async () => {
  const data = fixture();
  data.products.push({ id: "hidden", slug: "private-draft", status: "draft" }, { id: "retired", slug: "retired", status: "archived" });
  data.collections.push({ slug: "skin-care", title: "Duplicate" }, { slug: "../../account", title: "Bad path" });
  data.policies.push({ kind: "admin", body: "Not a public policy." });
  const paths = storeDiscoveryPages(data).map(page => page.path);
  assert.deepEqual(paths, ["/", "/collections/all", "/pages/about", "/pages/contact", "/collections/skin-care", "/products/daily-serum", "/policies/privacy"]);
  const response = serveStoreDiscovery(request("/sitemap.xml"), data, storeCanonicalOrigin(data));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  assert.match(text, /https:\/\/example\.lebrands\.store\/products\/daily-serum/);
  assert.doesNotMatch(text, /draft|retired|shipping|admin|lastmod|checkout|account/);
  // Sold-out published products remain discoverable; this is not an inventory filter.
  assert.ok(text.includes("/products/daily-serum"));
});

test("canonical hosts prefer active primary-domain evidence, never request-host input", () => {
  const data = fixture();
  assert.equal(storeCanonicalOrigin(data), "https://example.lebrands.store");
  assert.equal(storeCanonicalOrigin(data, "WWW.Brand.test"), "https://www.brand.test");
  for (const invalid of ["evil.test/path", "evil.test:443", "https://evil.test", "127.0.0.1", "bad..test", "bad-.test", "evil.test\nX-Header: injected"]) {
    assert.equal(storeCanonicalOrigin(data, invalid), "https://example.lebrands.store", invalid);
  }
  assert.equal(storeCanonicalOrigin({ store: { subdomain: "../invalid" } }), "");
});

test("robots and llms use the same canonical store origin and avoid private data", async () => {
  const data = fixture();
  data.store.owner_email = "private-owner@example.test";
  data.settings.brand_name = "Brand [not a link](https://bad.test)";
  const robots = await serveStoreDiscovery(request("/robots.txt"), data, "https://brand.test").text();
  assert.match(robots, /Sitemap: https:\/\/brand\.test\/sitemap\.xml/);
  for (const path of ["/cart", "/checkout", "/orders", "/track", "/account", "/api/", "/__"]) {
    assert.ok(robots.includes(`Disallow: ${path}`));
  }
  const guide = await serveStoreDiscovery(request("/llms.txt"), data, "https://brand.test").text();
  assert.ok(guide.includes("[Daily serum](https://brand.test/products/daily-serum)"));
  assert.ok(guide.includes("Brand \\[not a link\\]\\(https://bad.test\\)"));
  assert.doesNotMatch(guide, /private-owner|example\.lebrands\.store|shipping/);
  assert.match(guide, /not a guarantee/);
  const alias = serveStoreDiscovery(request("/llm.txt"), data, "https://brand.test");
  assert.equal(alias.status, 404);
  assert.equal(alias.headers.get("location"), null);
});

test("HEAD, unsupported methods, unpublished and suspended stores fail safely", async () => {
  for (const path of ["/sitemap.xml", "/robots.txt", "/llms.txt"]) {
    const head = serveStoreDiscovery(request(path, "HEAD"), fixture(), "https://brand.test");
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const post = serveStoreDiscovery(request(path, "POST"), fixture(), "https://brand.test");
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    assert.equal(serveStoreDiscovery(request(path), null, "").status, 404);
    const data = fixture();
    data.store.status = "suspended";
    assert.equal(serveStoreDiscovery(request(path), data, "https://brand.test").status, 404);
  }
});

test("large catalogues use sitemap indexes and bounded shards without invented dates", async () => {
  const data = fixture();
  data.products = Array.from({ length: 50001 }, (_, i) => ({ id: `p-${i}`, slug: `item-${i}`, title: `Item ${i}` }));
  const index = await serveStoreDiscovery(request("/sitemap.xml"), data, "https://brand.test").text();
  assert.match(index, /<sitemapindex/);
  assert.match(index, /\/sitemaps\/3\.xml/);
  const first = await serveStoreDiscovery(request("/sitemaps/1.xml"), data, "https://brand.test").text();
  assert.equal((first.match(/<url>/g) || []).length, 20000);
  const second = await serveStoreDiscovery(request("/sitemaps/2.xml"), data, "https://brand.test").text();
  assert.ok((second.match(/<url>/g) || []).length > 0);
  assert.equal(serveStoreDiscovery(request("/sitemaps/4.xml"), data, "https://brand.test").status, 404);
  const guide = await serveStoreDiscovery(request("/llms.txt"), data, "https://brand.test").text();
  assert.equal((guide.match(/\/products\/item-/g) || []).length, 20);
});

test("all four existing-store fixtures work without republishing, including legacy product URLs", async () => {
  for (const [index, name] of ["first", "second", "third", "fourth"].entries()) {
    const data = fixture(name);
    data.store.store_id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`;
    data.products[0].id = `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`;
    delete data.products[0].slug;
    const origin = `https://${name}.brand.test`;
    const calls = [];
    const db = { withStore: async (id, fn) => {
      assert.equal(id, data.store.store_id);
      return fn(async (parts) => {
        const query = parts.join("?");
        calls.push(query);
        if (query.includes("SELECT p.snapshot")) {
          assert.match(query, /d\.store_id=p\.store_id/);
          assert.match(query, /d\.status='active' AND d\.is_primary=true/);
          return [{ snapshot: data, canonical_hostname: `${name}.brand.test` }];
        }
        if (query.includes("pages_enabled")) return [{ pages_enabled: false }];
        if (query.includes("to_regclass('public.store_blog_publications')")) return [{ available: false }];
        throw Error("Discovery must not read mutable catalogue or draft data");
      });
    } };
    const response = await serveStorefront(new Request(`https://${name}.lebrands.store/sitemap.xml`), db, data.store);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes(`${origin}/products/${data.products[0].id}`));
    assert.ok(!text.includes("example.lebrands.store"));
    assert.ok(calls.every(query => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(query)));
  }
});

test("an unpublished legacy store gets a real discovery 404, not its fallback landing", async () => {
  const data = fixture();
  let reads = 0;
  const db = { withStore: async (_id, fn) => { reads++; return fn(async () => []); } };
  const response = await serveStorefront(request("/sitemap.xml"), db, data.store);
  assert.equal(response.status, 404);
  assert.equal(reads, 1);
  const post = await serveStorefront(request("/robots.txt", "POST"), db, data.store);
  assert.equal(post.status, 405);
  assert.equal(reads, 1, "unsupported crawler methods must not access the database");
});

test("store HTML canonical and Open Graph URLs agree with its discovery origin", () => {
  const data = fixture();
  for (const [page, path] of [["home", "/"], ["product", "/products/daily-serum"], ["collection", "/collections/all"], ["faq", "/pages/faq"]]) {
    const html = renderAura(data, { page, productId, canonicalOrigin: "https://brand.test", commerce: true });
    assert.ok(html.includes(`<link rel="canonical" href="https://brand.test${path}">`));
    assert.ok(html.includes(`<meta property="og:url" content="https://brand.test${path}">`));
  }
  for (const page of ["404", "cart", "checkout"]) {
    const html = renderAura(data, { page, canonicalOrigin: "https://brand.test", commerce: true });
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"/);
  }
});
