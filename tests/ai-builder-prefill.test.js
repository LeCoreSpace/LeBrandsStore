import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {blankProduct, existingProductBrief, prefillBrief} from "../src/public/ai-builder-prefill.js";
import {productContent} from "../src/ai/plan.js";

const draft = () => ({
  store: {name: "Example brand"},
  settings: {brand_name: "Test studio", tagline: "Thoughtful everyday", category: "Clothing",
    description: "Everyday clothing made with thoughtful attention to comfort.",
    business_city: "Jaipur", accent_color: "#214a3d", logo_media_id: "logo",
    support_email: "support@example.invalid", support_phone: "+919000000000", address: "Registered business address",
    legal_name: "Legal name", gstin: "private-tax-id", business_state: "08"},
  media: [{id: "logo", type: "logo"}, {id: "photo", type: "image"}, {id: "ai", type: "image", ai_generated: true}],
  products: [{id: "product", status: "active", title: "Cotton shirt", description: "Comfortable everyday cotton.",
    price_paise: 149900, compare_at_paise: 179900, gst_rate: 12, hsn_code: "6109", stock: null,
    images: [{id: "photo"}, {id: "ai"}, {id: "unowned"}],
    content: {features: [{label: "Fit", value: "Relaxed"}], materials_care: "<p>Wash <strong>cold</strong>.</p>",
      size_guide: [{size: "M", measurement: "40 cm"}], how_to_use: [{title: "Wear", text: "Every day."}]}}],
});

test("prefills only known brand/business facts, not account identity or inferred claims", () => {
  const result = prefillBrief(draft());
  assert.equal(result.brand.name, "Test studio");
  assert.equal(result.brand.sells, draft().settings.description);
  assert.equal(result.brand.city, "Jaipur");
  assert.equal(result.brand.logo_id, "logo");
  assert.equal(result.brand.colours, "#214a3d");
  assert.equal(result.selling.contact_email, "support@example.invalid");
  assert.equal(result.selling.phone, "+919000000000");
  assert.equal(result.selling.address, "Registered business address");
  for (const key of ["subcategory", "audience", "founder_story", "vibe", "year_started"]) assert.equal(result.brand[key], "");
  assert.equal(result.selling.whatsapp, "");
  assert.equal(result.selling.returns_conditions, "");
  assert.equal(result.brand.gstin, undefined);
  assert.equal(result.brand.legal_name, undefined);
});

test("reuses actual product facts, real photos and existing legacy GST without enabling AI images", () => {
  const p = existingProductBrief(draft().products[0], draft().media);
  assert.equal(p.price, "1499");
  assert.equal(p.compare, "1799");
  assert.equal(p.description, "Comfortable everyday cotton.");
  assert.equal(p.gst_rate, 12);
  assert.equal(p.stock, "");
  assert.equal(p.locked, true);
  assert.deepEqual(p.photo_ids, ["photo"]);
  assert.equal(p.care, "Wash cold.");
  assert.equal(p.features, "Fit: Relaxed");
  assert.equal(p.sizes, "M: 40 cm");
  assert.equal(p.how_to_use, "Wear: Every day.");
  assert.equal(p.ai_images, 0);
  assert.equal(productContent({description: p.description, features: ["Relaxed fit"], material: "", care: "",
    size_chart: [], how_to_use: ""}, {}).description_features, "Comfortable everyday cotton.\nRelaxed fit");
});

test("keeps existing answers and intentionally cleared fields across reloads", () => {
  const saved = {brand: {name: "Merchant title", tagline: "", colours: ""}, selling: {cod: false, phone: ""},
    products: [{...blankProduct(), name: "Merchant product"}],
    _prefill_touched: ["b.tagline", "b.colours", "s.phone"], confirmed: true};
  const result = prefillBrief(draft(), saved);
  assert.equal(result.brand.name, "Merchant title");
  assert.equal(result.brand.tagline, "");
  assert.equal(result.brand.colours, "");
  assert.equal(result.selling.phone, "");
  assert.equal(result.selling.cod, false);
  assert.equal(result.products[0].name, "Merchant product");
  assert.equal(result.confirmed, true);
  assert.equal(result.brand.category, "Clothing");
});

test("upgrades an old untouched empty brief but keeps selected/removed product lists", () => {
  assert.equal(prefillBrief(draft(), {brand: {name: ""}, products: [blankProduct()]}).products[0].id, "product");
  assert.deepEqual(prefillBrief(draft(), {brand: {}, products: [], _prefill_touched: ["products"]}).products, []);
  const result = prefillBrief(draft(), {brand: {}, products: [{id: "product", name: "My edited name", price: "1499"}]});
  assert.equal(result.products[0].description, "Comfortable everyday cotton.");
  assert.equal(result.products[0].name, "My edited name");
});

test("uses up to five non-archived products and never mutates source draft", () => {
  const d = draft(), before = JSON.stringify(d);
  prefillBrief(d).products[0].name = "Changed";
  assert.equal(JSON.stringify(d), before);
  d.products = [{...d.products[0], status: "archived"}, ...Array.from({length: 7}, (_, i) => ({...d.products[0], id: `p${i}`}))];
  assert.deepEqual(prefillBrief(d).products.map(p => p.id), ["p0", "p1", "p2", "p3", "p4"]);
  assert.equal(prefillBrief().products.length, 1);
});

test("missing or generated logos are not selected; rich text becomes plain facts", () => {
  const d = draft();
  d.media[0].ai_generated = true;
  d.settings.description = "<p>Useful &amp; simple</p><script>inventFacts()</script>";
  assert.equal(prefillBrief(d).brand.logo_id, "");
  assert.equal(prefillBrief(d).brand.sells, "Useful & simple");
});

test("actual builder startup renders prefill and persists merchant clearing on reload", async () => {
  const source = (await readFile(new URL("../src/public/ai-builder.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "");
  const storage = new Map(), handlers = {}, root = {dataset: {}, innerHTML: "",
    addEventListener: (type, handler) => { handlers[type] = handler; }, querySelectorAll: () => []};
  const boot = {store_id: "fictional-store", draft: draft(), fixture: true, available: true, verified: true,
    provider_ready: true, image_ready: true, remaining_builds: 1};
  const context = {blankProduct, existingProductBrief, prefillBrief, prepareAuraPhoto: () => {},
    document: {querySelector: () => root, getElementById: () => ({textContent: JSON.stringify(boot)}), activeElement: null},
    localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
    clearTimeout, setTimeout};
  vm.runInNewContext(source + "\nglobalThis.result=S.brief; globalThis.payload=toBrief();", context);
  assert.match(root.innerHTML, /value="Test studio"/);
  assert.match(root.innerHTML, /Thoughtful everyday/);
  assert.equal(context.payload.products[0].description, "Comfortable everyday cotton.");
  handlers.input({target: {dataset: {f: "b.tagline"}, type: "text", tagName: "INPUT", value: ""}});
  const reloaded = {...context};
  vm.runInNewContext(source + "\nglobalThis.result=S.brief;", reloaded);
  assert.equal(reloaded.result.brand.tagline, "");
  assert.equal(JSON.parse(storage.get("aib-brief-fictional-store")).brand.tagline, "");
  assert.ok(JSON.parse(storage.get("aib-brief-fictional-store"))._prefill_touched.includes("b.tagline"));
  vm.runInNewContext(`
    globalThis.costs=[costInr(0),costInr(0.01),costInr(20),costInr(0.0012)];
    S.job={status:"failed",cursor:0,total_steps:51,error:"Test failure",usage:{images:0,cost_usd:0.01}};
    globalThis.usageView=jobView();
    S.job=null;S.step=3;
    globalThis.confirmView=formView();
    S.info.remaining_builds=0;
    globalThis.limitView=gates();
  `, reloaded);
  assert.deepEqual(Array.from(reloaded.costs),["₹0.00","₹0.96","₹1,915.60","₹0.11"]);
  assert.match(reloaded.usageView,/estimated cost ₹0\.96/);
  assert.match(reloaded.usageView,/12 October 2026/);
  assert.match(reloaded.confirmView,/approximately ₹1,915\.60/);
  assert.match(String(reloaded.limitView),/approximately ₹1,915\.60/);
  assert.doesNotMatch(reloaded.usageView+reloaded.confirmView+reloaded.limitView,/\bUSD\b/);
});
