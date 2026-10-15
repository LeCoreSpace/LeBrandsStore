import test from "node:test";
import assert from "node:assert/strict";
import { SHOWCASE_MEDIA, SHOWCASE_MEDIA_PREFIX } from "../src/public/aura-showcase-assets.js";
import { showcaseCatalogue } from "../src/public/aura-showcase.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { styleDemonstration } from "../src/public/style-demo-copy.js";
import { styleSettings } from "../src/public/aura-styles.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { projectAnnPreview } from "../src/public/ann-projection.js";

const fixture = () => ({
  store: { store_id: "11111111-1111-4111-8111-111111111111", name: "Example Studio" },
  settings: { brand_name: "Example Studio", category: "fashion", subcategory: "mens-clothing" },
  products: [], collections: [], layouts: {}, policies: [], reviews: [],
});

test("five complete content packs can be reused without changing the comparison catalogue", () => {
  const source = fixture(), before = structuredClone(source);
  const base = stylePreviewData(source, { showcase: true });
  const original = structuredClone(base), seen = new Set(), sectionCounts = new Set();
  for (const style of Object.keys(SHOWCASE_MEDIA)) {
    const catalogue = showcaseCatalogue(style);
    assert.equal(catalogue.products.length, 5);
    assert.equal(catalogue.collections.length, 2);
    const ids = new Set(catalogue.products.map(p => p.id));
    assert.equal(ids.size, 5);
    assert.ok(catalogue.products.every(p => p.price_paise > 0 && p.demo === true));
    for (const collection of catalogue.collections) {
      assert.ok(collection.product_ids.length > 0);
      assert.ok(collection.product_ids.every(id => ids.has(id)));
    }
    const projected = styleDemonstration(base, style);
    const html = renderStylePreview(projected, styleSettings(style));
    assert.match(html, new RegExp(`data-showcase="${style}"`));
    assert.ok(html.includes(SHOWCASE_MEDIA.editorial.hero.url));
    assert.ok(html.includes("illustrative"));
    sectionCounts.add((html.match(/<section\b/g) || []).length);
    for (const product of projected.products) {
      assert.ok(product.images[0].url.startsWith(`${SHOWCASE_MEDIA_PREFIX}editorial/`));
      seen.add(product.images[0].url);
    }
  }
  assert.equal(seen.size, 5);
  assert.ok(sectionCounts.size >= 3, "styles vary their composition and section counts");
  assert.deepEqual(base, original);
  assert.deepEqual(source, before);
});

test("all 35 showcase pages remain script-free, read-only and use matching product navigation", () => {
  const base = stylePreviewData(fixture(), { showcase: true });
  for (const style of Object.keys(SHOWCASE_MEDIA)) {
    const data = styleDemonstration(base, style), settings = styleSettings(style);
    for (const page of ["home", "collection", "product", "cart", "checkout", "about", "contact"]) {
      const html = renderStylePreview(data, settings, { page, productId: data.products[2].id });
      assert.match(html, new RegExp(`data-page="${page}"`));
      assert.match(html, /noindex, nofollow/);
      assert.doesNotMatch(html, /<script\b/i);
      assert.match(html, /Nothing is saved, ordered or published/);
      if (page === "product") {
        assert.ok(html.includes(data.products[2].title));
        assert.match(html, /au-buy/);
        assert.match(html, /data-gallery-image/);
      }
      if (page === "checkout" || page === "contact") assert.match(html, /<fieldset disabled/);
    }
  }
});

test("showcase rendering escapes custom copy and never replaces a real catalogue", () => {
  const base = stylePreviewData(fixture(), { showcase: true });
  const config = annPreviewConfiguration({
    style_preset: "boutique", tagline: '<img src=x onerror="bad()">', description: "Custom preview story",
    product_ideas: [{ key: "personal", collection_key: "daily", name: "My own sample title", description: "Edited by the merchant" }],
    collections: [{ key: "daily", name: "A custom grouping" }],
  });
  const data = projectAnnPreview(base, config).data;
  const html = renderStylePreview(data, config.theme, { page: "home" });
  assert.ok(html.includes("My own sample title"));
  assert.ok(html.includes("A custom grouping"));
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  const actual = { ...fixture(), products: [{ id: "actual", title: "Real product", status: "active", price_paise: 99900, images: [] }] };
  const before = structuredClone(actual), real = stylePreviewData(actual);
  assert.equal(real.style_demo, false);
  assert.equal(styleDemonstration(real, "vintage"), real);
  assert.doesNotMatch(renderStylePreview(real, styleSettings("vintage")), /data-showcase=/);
  assert.deepEqual(actual, before);
});

test("showcase controls change font, palette, accessible accent and optional content", () => {
  const base = stylePreviewData(fixture(), { showcase: true });
  const config = annPreviewConfiguration({
    style_preset: "boutique", category_id: 4, subcategory_id: 61,
    color_preset: "midnight", font_preset: "classic", accent_color: "#f5ebdc", button_style: "pill",
    section_options: { home: ["faq"] },
  });
  const data = projectAnnPreview(base, config).data;
  const html = renderStylePreview(data, config.theme);
  assert.ok(html.includes('data-font="classic"'));
  assert.ok(html.includes('data-preset="midnight"'));
  assert.ok(html.includes('--disp:"Aura Classic"'));
  assert.ok(html.includes("--paper:#12151d"));
  assert.ok(html.includes("--acc:#f5ebdc"));
  assert.ok(html.includes("border-radius:999px"));
  assert.deepEqual(data.showcase_options.home, ["faq"]);
  const selected = renderStylePreview({ ...data, layouts: { ...data.layouts, home: [
    ...data.layouts.home.filter(s => s.type !== "faq"),
    { type: "faq", settings: { title: "Sample questions" }, blocks: [{ settings: { question: "A unique optional question?", answer: "A specific sample answer." } }] },
  ] } }, config.theme);
  assert.ok(selected.includes("A unique optional question?"));
  const removed = renderStylePreview({ ...data, showcase_options: { home: [] } }, config.theme);
  assert.ok(!removed.includes("A unique optional question?"));
});
