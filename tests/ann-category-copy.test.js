import test from "node:test";
import assert from "node:assert/strict";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { projectAnnPreview } from "../src/public/ann-projection.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { annCategoryContext } from "../src/public/ann-category-copy.js";

const source = () => ({
  store: { name: "Example", store_id: "11111111-1111-4111-8111-111111111111" },
  settings: { brand_name: "Example", category: "fashion", subcategory: "mens-clothing",
    tagline: "Made for you", description: "A fun way to style your daily living." },
  products: [], collections: [], layouts: {}, policies: [], reviews: [],
});
test("Skincare changes all five showcase styles without changing shared photos or merchant content", () => {
  const original = source(), before = structuredClone(original);
  const demo = stylePreviewData(original, { showcase: true });
  for (const style of ["editorial", "boutique", "architectural", "minimal", "vintage"]) {
    const config = annPreviewConfiguration({ category_id: 2, subcategory_id: 21, style_preset: style,
      tagline: original.settings.tagline, description: original.settings.description });
    const { data } = projectAnnPreview(demo, config);
    const hero = data.layouts.home.find(s => s.type === "hero").settings;
    assert.notEqual(hero.title, original.settings.tagline);
    assert.match(hero.description, /skincare/i);
    assert.doesNotMatch(hero.description, /wardrobe|shirt|daily living/i);
    assert.equal(data.products[0].title, "Daily cleanser");
    assert.equal(data.collections[0].title, "Cleanse & prepare");
    assert.deepEqual(data.products.map(p => p.images), demo.products.map(p => p.images));
    assert.deepEqual(data.products.map(p => p.price_paise), demo.products.map(p => p.price_paise));
    const html = renderStylePreview(data, config.theme, { page: "home" });
    assert.ok(html.includes(hero.title));
    assert.ok(html.includes("skincare"));
    const collection = renderStylePreview(data, config.theme, { page: "collection" });
    assert.doesNotMatch(collection, /THE WARDROBE EDIT|the way you dress/);
    assert.equal(data.layouts.product.find(s => s.type === "material-care").settings.title, "Ingredients & storage");
    assert.equal(data.layouts.product.find(s => s.type === "size-guide").blocks.length, 0);
  }
  assert.deepEqual(original, before);
});

test("every product taxonomy combination has relevant starter text, with no cross-category subcategory match", () => {
  const demo = stylePreviewData(source(), { showcase: true });
  for (const sub of TAXONOMY.subcategories) {
    const config = annPreviewConfiguration({ category_id: sub.category_id, subcategory_id: sub.id, style_preset: "minimal" });
    assert.equal(annCategoryContext(config).topic, sub.name.trim());
    const { data } = projectAnnPreview(demo, config);
    if (sub.slug !== "mens-clothing") {
      const hero = data.layouts.home.find(s => s.type === "hero").settings;
      assert.ok(hero.title.includes(sub.name.trim()), `${sub.name} title is specific to the selection`);
      assert.ok(hero.description.toLowerCase().includes(sub.name.trim().toLowerCase()));
    }
  }
  assert.equal(annCategoryContext({ category_id: 1, subcategory_id: 21 }).subcategory, undefined);
});

test("custom Ann copy and planned products survive category starter projection; actual catalogues are untouched", () => {
  const demo = stylePreviewData(source(), { showcase: true });
  const cfg = annPreviewConfiguration({ category_id: 2, subcategory_id: 21, style_preset: "vintage",
    tagline: "Your own care ritual", description: "The real brand story entered in Ann.",
    collections: [{ key: "daily", name: "My routine" }],
    product_ideas: [{ key: "cleanser", collection_key: "daily", name: "My cleanser", description: "My verified copy." }],
  });
  const { data } = projectAnnPreview(demo, cfg);
  const hero = data.layouts.home.find(s => s.type === "hero").settings;
  assert.equal(hero.title, cfg.brand.tagline);
  assert.equal(hero.description, cfg.brand.description);
  assert.equal(data.products[0].title, "My cleanser");
  assert.equal(data.products[0].description, "My verified copy.");
  assert.equal(data.collections[0].title, "My routine");
  const actual = { ...source(), style_demo: false, products: [{ id: "real", title: "Real merchant product", price_paise: 1000 }] };
  assert.equal(projectAnnPreview(actual, annPreviewConfiguration({ category_id: 2, subcategory_id: 21 })).data.products[0].title, "Real merchant product");
});
