import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attributeFor, findReference, referenceAxesAllowed, initCatalogueReference } from "../src/public/catalogue-reference.js";
import { renderCatalogueOrganisation } from "../src/ui/catalogue-forms.js";
import { initCatalogueForm, ensureProductSku } from "../src/public/catalogue-form.js";
import * as model from "../src/public/catalogue-model.js";

const attributes = [
  { id: 1, name: "Size", values: [{ id: 11, value: "Small" }, { id: 12, value: "Large" }] },
  { id: 2, name: "Capacity", values: [{ id: 13, value: "10,000 mAh" }] },
];
test("exact reference names and values are used, including commas", () => {
  assert.equal(attributeFor(attributes, "Size"), attributes[0]);
  assert.equal(attributeFor(attributes, "size"), undefined);
  assert.equal(referenceAxesAllowed([{ name: "Size", values: ["S"] }], attributes), false);
  assert.equal(referenceAxesAllowed([{ name: "Size", values: ["Small"] }], attributes), true);
  const axes = [{ name: "Capacity", values: ["10,000 mAh"] }];
  assert.equal(referenceAxesAllowed(axes, attributes), true);
  assert.deepEqual(model.variantCombinations(axes), [["10,000 mAh"]]);
});
test("saved custom values are preserved, not silently applied to a new subcategory", () => {
  const saved = [{ name: "Old size", values: ["Custom"] }];
  assert.equal(referenceAxesAllowed(saved, attributes, saved), true);
  assert.equal(referenceAxesAllowed(saved, attributes, saved, true), false);
  assert.equal(referenceAxesAllowed([{ name: "Old size", values: ["Invented"] }], attributes, saved), false);
});
test("subcategory lookup uses its own ID, never its category ID", () => {
  const rows = [{ subcategory_id: 11, category_id: 1, name: "Clothing", slug: "clothing" }];
  assert.equal(findReference(rows, "1"), undefined);
  assert.equal(findReference(rows, "11"), rows[0]);
  assert.equal(findReference(rows, "clothing"), rows[0]);
});
test("reference loading discards a stale response after subcategory changes", async () => {
  const element = value => ({ value, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } });
  const category = element("Fashion"), subcategory = element("First"), retry = element("");
  const nodes = { '[name="catalogue_category"]': category, '[name="catalogue_subcategory"]': subcategory, "[data-reference-retry]": retry, "[data-reference-status]": {} };
  const releases = new Map(), states = [];
  const body = { categories: [{ category_id: 1, name: "Fashion" }], subcategories: [{ category_id: 1, subcategory_id: 11, name: "First" }, { category_id: 1, subcategory_id: 12, name: "Second" }] };
  initCatalogueReference({ querySelector: selector => nodes[selector] }, {
    url: "/reference", onChange: state => states.push(state),
    fetcher: async url => url === "/reference" ? { ok: true, json: async () => body }
      : new Promise(resolve => releases.set(new URL(url, "https://example.invalid").searchParams.get("subcategory_id"), resolve)),
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick();
  subcategory.value = "Second"; subcategory.listeners.change();
  const response = name => ({ ok: true, json: async () => ({ attributes: [{ name, values: [{ value: name }] }] }) });
  releases.get("12")(response("Second only"));
  await tick();
  releases.get("11")(response("Wrong stale option"));
  await tick();
  assert.equal(states.at(-1).status, "ready");
  assert.equal(states.at(-1).attributes[0].name, "Second only");
  assert.ok(!states.some(s => s.attributes.some(a => a.name === "Wrong stale option")));
});
test("product organisation has real category/subcategory selectors and a retry", () => {
  const html = renderCatalogueOrganisation({ enabled: true, product: { catalogue: { category: "<saved>", subcategory: "Legacy" } } });
  assert.match(html, /<select name="catalogue_category">/);
  assert.match(html, /<select name="catalogue_subcategory">/);
  assert.match(html, /&lt;saved&gt;/);
  assert.match(html, /data-reference-retry/);
});
test("disabled catalogue forms remain usable without a controller", () => {
  assert.equal(initCatalogueForm({ querySelector: () => null }, { model }), null);
});
test("a product SKU is generated once, shown in the input, and saved SKUs are never replaced", () => {
  const input = { value: "" }, scope = { querySelector: () => input };
  let calls = 0;
  const generate = () => { calls++; return "LB-AUTO"; };
  assert.equal(ensureProductSku(scope, generate), "LB-AUTO");
  assert.equal(input.value, "LB-AUTO");
  assert.equal(ensureProductSku(scope, generate), "LB-AUTO");
  input.value = "MERCHANT-SAVED-SKU";
  assert.equal(ensureProductSku(scope, generate), "MERCHANT-SAVED-SKU");
  assert.equal(calls, 1);
  assert.match(model.createProductSku(), /^LB-[A-F0-9]{16}$/);
  assert.notEqual(model.createProductSku(), model.createProductSku());
});
test("the shared dashboard controller loads Ann's source; no comma-based free typing", async () => {
  const controller = await readFile("src/public/catalogue-form.js", "utf8");
  const dashboard = await readFile("src/public/dashboard.js", "utf8");
  assert.match(controller, /data-axis-choice/);
  assert.doesNotMatch(controller, /parseValues|data-axis-values/);
  assert.match(dashboard, /referenceUrl: `\$\{api\}\/ann\/reference`/);
  const ann = await readFile("src/public/ann-builder.js", "utf8");
  assert.doesNotMatch(ann, /<input[^>]*data-attr=/);
});
