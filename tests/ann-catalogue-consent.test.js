import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { attachAnnDesign } from "../src/public/ann-design-ui.js";

const source = await readFile(new URL("../src/public/ann-builder.js", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ saved = true, readOnly = false } = {}) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  const events = new Map(), requests = [], activations = [];
  let confirmed = 0, mode = "showcase";
  const el = { innerHTML: "", setAttribute() {}, scrollIntoView() {},
    querySelector: () => null, addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { activeElement: null, createElement: () => el };
  const design = { version: 1, style: "editorial", media_pack: "editorial",
    plan: { style_preset: "editorial" }, copy: {}, media: {} };
  globalThis.fetch = async (url, opts) => {
    requests.push(opts);
    return new Response(JSON.stringify({
      expected_draft: "2026-10-16T10:00:00.000001Z",
      design: saved || opts.method === "POST" ? design : null, images: [],
    }), { status: 200 });
  };
  const ui = attachAnnDesign({
    api: "/fixture", root: "/fixture", readOnly,
    mount: { parentNode: { insertBefore() {} } }, say() {},
    getAnswers: () => ({ style_preset: "editorial" }),
    getPreviewMode: () => mode,
    onActivated: data => activations.push(data),
    onCatalogueConfirmed: () => { confirmed++; mode = "store"; },
  });
  const change = (dataset, checked) => events.get("change")({ target: { dataset, checked } });
  const click = action => events.get("click")({ target: { closest: () => ({ dataset: { designAct: action } }) } });
  return { el, ui, requests, activations, change, click, get confirmed() { return confirmed; },
    close() { Object.assign(globalThis, previous); } };
}

test("saved Ann designs load without automatically consenting to merchant catalogue preview", async () => {
  const h = harness();
  try {
    await tick();
    assert.deepEqual(h.activations, [{ restored: true }]);
    assert.match(h.el.innerHTML, /Your saved Editorial design/);
    assert.match(h.el.innerHTML, /sample products/);
    h.ui.requestCatalogue();
    assert.match(h.el.innerHTML, /Ready to see your own products/);
    h.click("catalogue");
    assert.equal(h.confirmed, 0, "a button event cannot bypass the unchecked consent");
    h.change({ designCatalogueAck: "" }, true);
    h.click("catalogue");
    assert.equal(h.confirmed, 1);
    assert.equal(h.requests.length, 1, "preview confirmation never writes catalogue, draft or publications");
  } finally { h.close(); }
});

test("declining merchant catalogue keeps samples and requires fresh consent next time", async () => {
  const h = harness();
  try {
    await tick();
    h.ui.requestCatalogue();
    h.change({ designCatalogueAck: "" }, true);
    h.click("samples");
    assert.equal(h.confirmed, 0);
    h.ui.requestCatalogue();
    h.click("catalogue");
    assert.equal(h.confirmed, 0);
    assert.equal(h.requests.length, 1);
  } finally { h.close(); }
});

test("adopting a design requires separate explicit catalogue consent, not just replacement consent", async () => {
  const h = harness({ saved: false });
  try {
    await tick();
    h.change({ designAck: "" }, true);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 1);
    h.change({ designCatalogueAck: "" }, true);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].method, "POST");
    assert.deepEqual(h.activations, [{ restored: false, useOwnProducts: true }]);
  } finally { h.close(); }
});

test("read-only Ann participants cannot adopt designs even if consent events are simulated", async () => {
  const h = harness({ saved: false, readOnly: true });
  try {
    await tick();
    h.change({ designAck: "" }, true);
    h.change({ designCatalogueAck: "" }, true);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 1);
  } finally { h.close(); }
});

test("every Ann visit resets old browser preferences to samples and automatic callbacks cannot bypass consent", () => {
  assert.doesNotMatch(source, /sessionStorage\.getItem\(previewModeKey\)/);
  assert.match(source, /let previewMode = "showcase"/);
  const code = source.slice(source.indexOf("function setPreviewMode("), source.indexOf("function rememberScroll("));
  const context = vm.createContext({
    previewMode: "showcase", ownProductsConfirmed: false, pendingCatalogueAction: null,
    previewSource: { products: [{ id: "merchant-product" }] }, productId: "old", collectionId: "old",
    rememberScroll() {}, say() {}, base: null, asked: 0,
    designUI: { requestCatalogue() { context.asked++; } },
    stylePreviewData: (data, options) => ({ ...data, ...options }),
  });
  vm.runInContext(code, context);
  vm.runInContext('setPreviewMode("store")', context);
  assert.equal(context.previewMode, "showcase");
  vm.runInContext("requestOwnProducts()", context);
  assert.equal(context.asked, 1);
  assert.equal(context.previewMode, "showcase");
  vm.runInContext('ownProductsConfirmed = true; requestOwnProducts()', context);
  assert.equal(context.previewMode, "store");
  assert.equal(context.previewSource.products[0].id, "merchant-product");
});
