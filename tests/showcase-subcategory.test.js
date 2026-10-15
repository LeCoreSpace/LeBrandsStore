import test from "node:test";
import assert from "node:assert/strict";
import { SHOWCASE_MEDIA, SHOWCASE_PACKS, resolveShowcasePack } from "../src/public/aura-showcase-assets.js";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { SHOWCASE_STYLES } from "../src/public/aura-showcase.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { projectAnnPreview } from "../src/public/ann-projection.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { seedDesignMedia } from "../src/store/ann-design.js";

const source = () => ({ store: { name: "Example" }, settings: {},
  products: [], collections: [], layouts: {}, policies: [], reviews: [] });

test("all 25 subcategory/style combinations share complete coordinated content and stable navigation", () => {
  const original = source(), before = structuredClone(original);
  const base = stylePreviewData(original, { showcase: true });
  for (const [key, pack] of Object.entries(SHOWCASE_PACKS)) {
    const sub = TAXONOMY.subcategories.find(s => s.category_id === pack.category_id && s.slug === pack.slug);
    assert.ok(sub);
    let catalogue;
    const titles = new Set(), compositions = new Set();
    for (const style of SHOWCASE_STYLES) {
      const cfg = annPreviewConfiguration({ category_id: sub.category_id, subcategory_id: sub.id, style_preset: style });
      const { data } = projectAnnPreview(base, cfg);
      assert.equal(resolveShowcasePack(data).key, key);
      assert.equal(resolveShowcasePack(data).exact, true);
      assert.equal(data.products.length, 5);
      const contents = { products: data.products, collections: data.collections };
      if (catalogue) assert.deepEqual(contents, catalogue);
      else catalogue = structuredClone(contents);
      const media = seedDesignMedia(style, data);
      assert.equal(media.hero.url, SHOWCASE_MEDIA[key].hero.url);
      assert.equal(media.lifestyle.url, SHOWCASE_MEDIA[key].lifestyle.url);
      assert.equal(media.collection0.url, SHOWCASE_MEDIA[key].collections.c01.url);
      const html = renderStylePreview(data, cfg.theme);
      assert.ok(html.includes(media.hero.url));
      assert.ok(html.includes(media.lifestyle.url));
      assert.ok(html.includes(media.collection0.url));
      assert.ok(html.includes(`data-showcase="${style}"`));
      assert.doesNotMatch(html, /<script\b/);
      titles.add(data.layouts.home.find(s => s.type === "hero").settings.title);
      compositions.add((html.match(/<section\b/g) || []).length);
      for (const page of ["collection", "product", "cart", "checkout", "about", "contact"]) {
        const pageHtml = renderStylePreview(data, cfg.theme, { page, productId: data.products[0].id });
        assert.match(pageHtml, /noindex, nofollow/);
        assert.ok(pageHtml.includes(`data-style="${style}"`));
      }
    }
    assert.ok(titles.size >= 4, "style voice changes without changing product facts");
    assert.ok(compositions.size >= 3, "styles keep distinct compositions");
  }
  assert.deepEqual(original, before);
});

test("unavailable subcategories use a stable, honest fallback, never the selected visual style", () => {
  const base = stylePreviewData(source(), { showcase: true });
  const keys = SHOWCASE_STYLES.map(style => resolveShowcasePack(projectAnnPreview(base,
    annPreviewConfiguration({ category_id: 2, subcategory_id: 22, style_preset: style })).data));
  assert.ok(keys.every(p => p.key === "boutique" && !p.exact));
  assert.equal(resolveShowcasePack({ showcase_niche: { category_id: 1, slug: "skincare" } }).exact, false);
  assert.equal(resolveShowcasePack({ settings: { category: "beauty-and-personal-care", subcategory: "skincare" } }).key, "boutique");
  assert.equal(seedDesignMedia("vintage").hero.url, SHOWCASE_MEDIA.vintage.hero.url, "legacy designs retain their reset image");
});
