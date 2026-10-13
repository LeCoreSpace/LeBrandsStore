test("mobile buy bar respects read-only previews and sold-out stock", () => {
  const live = renderAura({ ...data, products: [{ id: "22222222-2222-4222-8222-222222222222", title: "Actual product", price_paise: 10000, stock: 0, images: [] }] },
    { page: "product", productId: "22222222-2222-4222-8222-222222222222", commerce: true });
  assert.match(live, /au-sticky-buy/);
  assert.match(live, /disabled aria-disabled="true">Sold out/);
  assert.doesNotMatch(live, /Checkout opening soon/);
});
import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_SCHEMAS, AURA_SKELETON_TYPES } from "../src/public/sections/index.js";
import { defaultPageLayouts, validateLayout } from "../src/public/aura-layout.js";
import { starterLayouts, mergeStarter, isLegacyDefault } from "../src/public/aura-skeleton.js";
import { renderAura } from "../src/public/aura.js";
import * as S from "../src/public/editor-state.js";

const id = "11111111-1111-4111-8111-111111111111", p1 = "22222222-2222-4222-8222-222222222222", p2 = "33333333-3333-4333-8333-333333333333";
const data = { store: { store_id: id, name: "Maison Test", subdomain: "m" }, settings: { brand_name: "Maison Test", tagline: "Slow things", description: "Made by hand", color_preset: "ivory", font_preset: "serif", accent_color: "#214a3d", support_email: "hi@example.invalid" },
  products: [{ id: p1, title: "Bowl", price_paise: 12000, sku: "BWL-1", stock: 3, images: [], collection_ids: ["c1"] }, { id: p2, title: "Cup", price_paise: 8000, stock: 0, images: [] }], collections: [{ id: "c1", title: "Ceramics" }], policies: [{ kind: "shipping", body: "Ships in 3 days" }] };
const ctx = { storeId: id };

test("new schema ids are exported and legacy defaults remain untouched", () => {
  assert.equal(AURA_SKELETON_TYPES.length, 14);
  for (const t of AURA_SKELETON_TYPES) assert.ok(SECTION_SCHEMAS[t]);
  const legacy = defaultPageLayouts(data);
  assert.deepEqual(legacy.home.map(i => i.type), ["announcement", "header", "hero", "statement", "featured-collection", "lookbook", "founder", "craft", "reviews", "trust", "footer"]);
  assert.ok(!legacy.product.some(i => AURA_SKELETON_TYPES.includes(i.type)));
});
test("starter layouts validate, are ordered, and optional sections are disabled without content", () => {
  const starter = starterLayouts(data);
  for (const page of Object.keys(starter)) validateLayout(page, starter[page], ctx);
  const types = page => starter[page].map(i => i.type);
  assert.deepEqual(types("home").slice(2, 9), ["hero", "featured-collection", "featured-products", "statement", "spotlight", "lookbook", "craft"]);
  assert.deepEqual(types("product").slice(1, 3), ["product-details", "shipping-info"]);
  assert.equal(starter.product.find(i => i.type === "faq").settings.enabled, false);
  assert.equal(starter.home.find(i => i.type === "reviews").settings.enabled, false);
  assert.equal(starter.product.find(i => i.type === "shipping-info").settings.enabled, true);
  assert.deepEqual(types("checkout"), ["header", "commerce", "trust", "footer"]);
});
test("merge keeps custom content and order, and legacy detection is exact", () => {
  const legacy = defaultPageLayouts(data);
  assert.ok(isLegacyDefault(legacy.home, "home", data));
  const custom = structuredClone(legacy.home); custom[2].settings.title = "Mine";
  custom.splice(4, 0, { id: "mine-press", type: "press", settings: { enabled: true, kicker: "", title: "Seen in" }, blocks: [] });
  assert.ok(!isLegacyDefault(custom, "home", data));
  const merged = mergeStarter(custom, "home", data);
  assert.equal(merged.find(i => i.type === "hero").settings.title, "Mine");
  const press = merged.findIndex(i => i.id === "mine-press");
  assert.ok(press > merged.findIndex(i => i.type === "hero"));
  validateLayout("home", merged, ctx);
  assert.equal(JSON.stringify(custom).includes("Mine"), true);
});
test("renderers use real data only", () => {
  const layouts = starterLayouts(data);
  const fill = (page, type, patch, blocks) => { const s = layouts[page].find(i => i.type === type); Object.assign(s.settings, { enabled: true }, patch); if (blocks) s.blocks = blocks.map((b, i) => ({ id: `b${i}`, type: "item", settings: b })); };
  fill("product", "faq", {}, [{ question: "Dishwasher safe?", answer: "<p>Hand wash.</p>" }]);
  fill("product", "product-specs", {}, [{ label: "Width", value: "12 cm" }]);
  fill("product", "size-guide", {}, [{ size: "S", measurement: "10 cm" }]);
  const html = renderAura({ ...data, layouts }, { page: "product", productId: p1 });
  for (const t of ["Dishwasher safe?", "12 cm", "BWL-1", "<table", "Cup", "/policies/shipping"]) assert.ok(html.includes(t), t);
  const grid = renderAura({ ...data, layouts: { ...layouts, collection: layouts.collection } }, { page: "collection" });
  assert.ok(grid.includes("data-catalog-stock") && grid.includes("data-catalog-collection"));
  const emptyFaq = renderAura({ ...data, layouts: starterLayouts(data) }, { page: "home" });
  assert.ok(!emptyFaq.includes("au-faq"));
  assert.ok(!/[\u2014\u2013]/.test(html));
  assert.ok(renderAura({ ...data, layouts }, { page: "cart" }).includes("Your bag"));
});
test("catalog is gated by the skeleton flag", () => {
  const layout = defaultPageLayouts(data).product;
  assert.ok(!S.addableTypes("product", layout).some(i => AURA_SKELETON_TYPES.includes(i.id)));
  assert.ok(S.addableTypes("product", layout, true).some(i => i.id === "faq"));
  assert.deepEqual(S.addableTypes("cart", defaultPageLayouts(data).cart), []);
  assert.ok(S.addableTypes("cart", defaultPageLayouts(data).cart, true).some(i => i.id === "trust"));
});
import { uniqueId } from "../src/public/aura-skeleton.js";
test("merge ids stay unique and within 64 characters", () => {
  const long = "a".repeat(64);
  const ids = new Set([long, `${"a".repeat(62)}-2`]);
  const next = uniqueId(long, ids);
  assert.ok(next.length <= 64 && !ids.has(next));
  const layout = defaultPageLayouts(data).home;
  const clash = [...structuredClone(layout), { id: "default-faq", type: "press", settings: { enabled: true, kicker: "", title: "x" }, blocks: [] }];
  const merged = mergeStarter(clash, "home", data);
  assert.equal(new Set(merged.map(i => i.id)).size, merged.length);
  validateLayout("home", merged, ctx);
});
test("related products limit uses string select values", () => {
  assert.deepEqual(SECTION_SCHEMAS["related-products"].fields.limit.values, ["3", "4", "6"]);
  assert.equal(SECTION_SCHEMAS["related-products"].defaults.limit, "4");
});
test("starter proposals never autosave and save only when forced", () => {
  const base = { proposed: new Set(["home"]), inflight: new Set(), conflicts: new Set(), dirty: true, invalid: "" };
  assert.equal(S.mayAutosave("home", base), false);
  assert.equal(S.mayAutosave("home", base, true), true);
  assert.equal(S.mayAutosave("home", { ...base, invalid: "bad" }, true), false);
  assert.equal(S.mayAutosave("product", base), true);
});
test("starter has no gallery by default", () => {
  assert.ok(!starterLayouts(data).home.some(i => i.type === "gallery"));
});
test("editor skeleton shows every required group, live hides empties", () => {
  const layouts = starterLayouts(data);
  const home = renderAura({ ...data, layouts }, { page: "home", editorSkeleton: true });
  for (const t of ["Featured products", "Brand statement", "Product spotlight", "Lookbook", "Materials and craft", "Founder story", "Reviews", "FAQ"]) assert.ok(home.includes(`<h2>${t}</h2>`), t);
  const col = renderAura({ ...data, layouts }, { page: "collection", editorSkeleton: true });
  for (const t of ["Collection heading", "Pagination", "Collection description"]) assert.ok(col.includes(t), t);
  assert.equal((col.match(/data-catalog-sort/g) || []).length, 1);
  const cart = renderAura({ ...data, layouts }, { page: "cart", commerce: true, readOnly: true, editorSkeleton: true });
  for (const t of ["Cart items", "Optional extras", "Recommendations", "Summary", "Checkout"]) assert.ok(cart.includes(`<h2>${t}</h2>`), t);
  const out = renderAura({ ...data, layouts }, { page: "checkout", commerce: true, readOnly: true, editorSkeleton: true });
  for (const t of ["Contact", "Address", "Shipping", "Payment", "Place order"]) assert.ok(out.includes(`<h2>${t}</h2>`), t);
  assert.ok(!/au-cskel[\s\S]*<form/.test(out.split("</section>")[0] + out.split("au-cskel")[1].split("</section>")[0]));
  const live = renderAura({ ...data, layouts }, { page: "collection" });
  assert.ok(!live.includes("au-skel") && !live.includes("Pagination"));
  assert.ok(!/[\u2014\u2013]/.test(home + col + cart + out));
});
test("save decisions never claim success when blocked and background saves skip pristine proposals", () => {
  const mk = (over = {}) => ({ proposed: new Set(), inflight: new Set(), conflicts: new Set(), dirty: true, invalid: "", ...over });
  assert.equal(S.saveDecision("home", mk({ conflicts: new Set(["home"]), proposed: new Set(["home"]) }), true), "blocked");
  assert.equal(S.saveDecision("home", mk({ inflight: new Set(["home"]) }), true), "blocked");
  assert.equal(S.saveDecision("home", mk({ invalid: "bad" }), true), "blocked");
  assert.equal(S.saveDecision("home", mk({ proposed: new Set(["home"]) }), true), "save");
  assert.equal(S.saveDecision("home", mk({ proposed: new Set(["home"]) }), false), "skip");
  assert.equal(S.saveDecision("home", mk({ dirty: false }), true), "clean");
  // Switching pages with four pristine proposals and one real edit writes only the edited page.
  const keys = ["home", "collection", "product", "cart", "checkout"], proposed = new Set(["collection", "product", "cart", "checkout"]);
  assert.deepEqual(S.saveTargets(keys, () => mk({ proposed })), ["home"]);
  assert.deepEqual(S.saveTargets(keys, () => mk({ proposed, dirty: false })), []);
});
test("background save loop does not pass the array index as force", async () => {
  const src = await (await import("node:fs/promises")).readFile(new URL("../src/public/editor.js", import.meta.url), "utf8");
  assert.ok(!/EDIT_PAGES\.map\(savePage\)/.test(src));
});
