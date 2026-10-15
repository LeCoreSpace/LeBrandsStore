import test from "node:test";
import assert from "node:assert/strict";
import { projectAnnPreview, diffAnswers, changeCategory, initialAnswers, planProblems, annAnsweredStages } from "../src/public/ann-projection.js";
import { styleDemonstration } from "../src/public/style-demo-copy.js";

const base = () => ({
  store: { name: "Old" }, settings: { brand_name: "Old" }, style_demo: false,
  products: [{ id: "p1", title: "Real", price_paise: 9900, images: [], collection_ids: [] }],
  collections: [{ id: "c1", title: "Real set", product_ids: ["p1"], cover_url: "/img/example.webp" }],
  layouts: { home: [{ id: "a", type: "hero", settings: {} }, { id: "b", type: "faq" }] },
});
test("Ann visual progress counts real answer data, not visiting Review", () => {
  const ref = { categories: [{ category_id: 1 }], subcategories: [{ category_id: 1, subcategory_id: 2 }] };
  assert.equal(annAnsweredStages({ current_step: "review" }, ref).size, 0);
  assert.equal(annAnsweredStages({ category_id: 1 }, ref).size, 0);
  assert.equal(annAnsweredStages({ category_id: 1, subcategory_id: 99 }, ref).size, 0);
  const answers = {
    category_id: 1, subcategory_id: 2, style_preset: "vintage",
    color_preset: "white", accent_color: "#6b1735", button_style: "rounded", font_preset: "serif",
    collections: [{ key: "one", name: "Shirts" }, { key: "two", name: "Layers" }],
    product_ideas: [{ collection_key: "one", name: "Linen shirt" }],
    store_name: "Example", description: "A fictional wardrobe for tests.",
  };
  const before = structuredClone(answers);
  const areas = annAnsweredStages(answers, ref);
  assert.equal(areas.size, 6);
  assert.ok(!areas.has("products"));
  assert.ok(!areas.has("review"), "planning progress is not publication readiness");
  assert.deepEqual(answers, before);
  answers.product_ideas.push({ collection_key: "two", name: "Overshirt" });
  assert.equal(annAnsweredStages(answers, ref).size, 7);
});
test("Ann projection never mutates the source", () => {
  const b = base(), copy = structuredClone(b);
  projectAnnPreview(b, { brand: { store_name: "Kora" }, collections: [{ key: "new", name: "New" }], product_ideas: [{ key: "x", collection_key: "new", name: "Idea" }], section_options: { home: [] } });
  assert.deepEqual(b, copy);
});
test("Ann plan appears in clone and sections toggle without losing images", () => {
  const { data } = projectAnnPreview(base(), { brand: { store_name: "Kora" }, collections: [{ key: "new", name: "New" }], product_ideas: [{ key: "x", collection_key: "new", name: "Idea", description: "D" }], section_options: { home: [] } });
  assert.equal(data.store.name, "Kora");
  assert.equal(data.collections.at(-1).title, "New");
  assert.equal(data.collections.at(-1).cover_url, "/img/example.webp");
  assert.equal(data.products.at(-1).description, "D");
  assert.deepEqual(data.layouts.home.map(s => s.type), ["hero"]);
});
test("Ann enabling unavailable section is reported", () => {
  const { unavailable } = projectAnnPreview(base(), { section_options: { home: ["faq", "craft"] } });
  assert.deepEqual(unavailable, ["home:craft"]);
});
test("Ann diff, category change and plain-text registration prefill", () => {
  assert.deepEqual(diffAnswers({ tagline: "a", style_preset: "minimal" }, { style_preset: "minimal" }), { tagline: null });
  const { answers, cleared } = changeCategory({ category_id: 1, subcategory_id: 2, product_ideas: [{ key: "a", name: "n", description: "keep", attributes: [{ attribute_id: 1, value_ids: [1] }] }] }, 3);
  assert.equal(answers.subcategory_id, undefined); assert.equal(cleared.attributes, 1);
  assert.equal(answers.product_ideas[0].description, "keep");
  const ref = { categories: [{ category_id: 4, slug: "fashion" }], subcategories: [{ subcategory_id: 9, category_id: 4, slug: "mens" }] };
  assert.deepEqual(initialAnswers({ category: "fashion", subcategory: "mens", tagline: "t", description: "<p>Natural &amp; thoughtful.</p>" }, { name: "S" }, ref), { store_name: "S", tagline: "t", description: "Natural & thoughtful.", category_id: 4, subcategory_id: 9 });
  assert.equal(planProblems({ collections: [{ key: "a", name: "" }] }).length, 1);
  assert.deepEqual(initialAnswers({ category: "fashion", subcategory: "mens-clothing" }, {}, {
    categories: [{ category_id: 1, slug: "fashion-and-apparel" }],
    subcategories: [{ subcategory_id: 1, category_id: 1, slug: "mens-clothing" }],
  }), { category_id: 1, subcategory_id: 1 });
});
test("Ann brand copy and selected attributes reach the preview without another style-copy overwrite", () => {
  const source = base(); source.style_demo = true;
  const { data } = projectAnnPreview(source, {
    theme: { style_preset: "vintage" },
    brand: { tagline: "Own words", description: "Own story" },
    collections: [{ key: "new", name: "New" }],
    product_ideas: [{ key: "idea", name: "My shirt", collection_key: "new", attributes: [{ attribute_id: 7, value_ids: [8] }] }],
    section_options: { home: ["faq"] },
  }, { attributes: [{ id: 7, name: "Material", values: [{ id: 8, value: "Cotton" }] }] });
  assert.equal(styleDemonstration(data, "vintage").layouts.home[0].settings.title, "Own words");
  assert.equal(data.layouts.home[0].settings.description, "Own story");
  assert.deepEqual(data.products[0].content.features, [{ label: "Material", value: "Cotton" }]);
  assert.equal(data.layouts.home[1].hidden, false);
});
