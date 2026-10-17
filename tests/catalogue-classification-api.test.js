import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { seedCataloguePreviewReferences } from "../src/catalogue-preview-references.js";
import { handleStoreRoutes } from "../src/store/routes.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { validateClassification } from "../src/public/catalogue-classification-model.js";

const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token = "a".repeat(64);
const user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const origin = "https://accounts.lebrands.store";
test("classification boundary rejects ambiguous, forged and oversized choices", () => {
  const selection = { category_id: 1, subcategory_id: 2, product_type_id: 1, expected_revision: 0, options: [], descriptors: [] };
  assert.deepEqual(validateClassification(selection), selection);
  for (const patch of [{ product_type_id: "1" }, { expected_revision: -1 }, { extra: true },
    { descriptors: [{ descriptor_id: 1, number_value: Infinity }] },
    { descriptors: [{ descriptor_id: 1, boolean_value: "false" }] },
    { options: [{ option_id: 1, value_ids: [1, 1] }] },
    { options: [1, 2, 3, 4].map(option_id => ({ option_id, value_ids: [1] })) }]) {
    assert.throws(() => validateClassification({ ...selection, ...patch }), { status: 400 });
  }
  assert.deepEqual(validateClassification({ ...selection, descriptors: [{ descriptor_id: 1, boolean_value: false }] }).descriptors[0], { descriptor_id: 1, boolean_value: false });
});

test("shared authenticated API: approved choices, atomic SKU persistence, revisions, retirement and deletion", async t => {
  const pg = await setupAnnFixtureDatabase({ sampleCatalogue: true, catalogueApi: true }).catch(error => {
    throw new Error(`Catalogue fixture SQL failed: ${error.code} ${error.message}; position ${error.position}`);
  });
  try {
    const db = annFixtureAdapter(pg);
    const refs = await seedCataloguePreviewReferences(pg);
    const request = (path, body, method) => new Request(`${origin}/api/stores/${store}/${path}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: { origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const call = async (path, body, method) => {
      const response = await handleStoreRoutes(request(path, body, method), {}, db, user, token);
      return { status: response.status, body: await response.json() };
    };
    await t.test("reference list exposes approved applicable types, values and all descriptor types only", async () => {
      const response = await handleAnnRoutes(request(`ann/reference?catalogue=1&subcategory_id=2&product_type_id=${refs.type}`), {}, db, user, token);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.catalogue.product_types.length, 1);
      assert.equal(body.catalogue.product_type.id, refs.type);
      assert.deepEqual(body.catalogue.options, refs.options);
      assert.equal(body.catalogue.descriptors.length, 5);
      const wrong = await handleAnnRoutes(request(`ann/reference?catalogue=1&subcategory_id=21&product_type_id=${refs.type}`), {}, db, user, token);
      assert.equal((await wrong.json()).catalogue.product_type, null);
      const malformed = await handleAnnRoutes(request("ann/reference?catalogue=1&product_type_id=-1"), {}, db, user, token);
      assert.equal(malformed.status, 400);
    });
    const classification = {
      category_id: 1, subcategory_id: 2, product_type_id: refs.type, expected_revision: 0,
      options: refs.options.map(o => ({ option_id: o.id, value_ids: o.values.map(v => v.id) })),
      descriptors: [
        { descriptor_id: refs.descriptors[0].id, value_ids: [refs.descriptors[0].values[0].id] },
        { descriptor_id: refs.descriptors[1].id, value_ids: refs.descriptors[1].values.map(v => v.id) },
        { descriptor_id: refs.descriptors[2].id, text_value: "Wash gently" },
        { descriptor_id: refs.descriptors[3].id, number_value: 250 },
        { descriptor_id: refs.descriptors[4].id, boolean_value: false },
      ],
    };
    const axes = refs.options.map(o => ({ name: o.name, values: o.values.map(v => v.value) }));
    const payload = {
      title: "A considered dress", description: "A lightweight dress with a relaxed silhouette for everyday wear.",
      slug: "considered-dress", sku: "DRESS-BASE", price_paise: 150000, hsn_code: "6204", gst_rate: 5,
      catalogue: { vendor: "Example", category: "Wrong supplied name", subcategory: "Wrong supplied label", axes, seo_title: "A considered dress", seo_description: "Everyday comfort." },
      classification,
      variants: axes[0].values.flatMap((size, i) => axes[1].values.map((colour, j) => ({ values: [size, colour], sku: `DRESS-${i}-${j}`, stock: 1 + i * 2 + j, price_paise: null }))),
    };
    let product;
    await t.test("creation and reload preserve reference IDs, ordered values, descriptors, SKU identities and stock", async () => {
      const saved = await call("products", payload);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      product = saved.body.products.find(p => p.id === saved.body.saved_product_id);
      assert.equal(product.catalogue.category, "Fashion & Apparel");
      assert.equal(product.catalogue.subcategory, "Womens Clothing");
      assert.equal(product.stock, 10);
      assert.equal(product.classification.expected_revision, 1);
      assert.deepEqual(product.classification.options, classification.options);
      assert.deepEqual(product.classification.descriptors, classification.descriptors);
      assert.equal(product.gst_rate, 5);
      assert.equal((await pg.query("SELECT count(*)::int n FROM product_variant_option_values WHERE product_id=$1", [product.id])).rows[0].n, 8);
      const loaded = await call("setup");
      assert.deepEqual(loaded.body.products.find(p => p.id === product.id).classification, product.classification);
    });
    if (!product) return;
    await t.test("edits keep SKU IDs, update descriptors and reject stale classification saves atomically", async () => {
      const next = structuredClone(product.classification);
      next.descriptors[2].text_value = "Cold hand wash";
      const saved = await call(`products/${product.id}`, { catalogue: product.catalogue, classification: next, variants: product.variants }, "PATCH");
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const edited = saved.body.products.find(p => p.id === product.id);
      assert.deepEqual(edited.variants.map(v => v.id), product.variants.map(v => v.id));
      assert.equal(edited.classification.expected_revision, 2);
      const stale = await call(`products/${product.id}`, { title: "Must roll back", catalogue: product.catalogue, classification: next }, "PATCH");
      assert.equal(stale.status, 409);
      assert.equal((await call("setup")).body.products.find(p => p.id === product.id).title, "A considered dress");
      product = edited;
    });
    await t.test("missing required details and foreign values cannot create partially saved products", async () => {
      const bad = structuredClone(payload);
      bad.slug = "rejected-dress"; bad.sku = "REJECTED";
      bad.classification.descriptors = [];
      const response = await call("products", bad);
      assert.equal(response.status, 400);
      assert.equal((await pg.query("SELECT count(*)::int n FROM products WHERE slug='rejected-dress'")).rows[0].n, 0);
      bad.classification = structuredClone(classification);
      bad.classification.options[0].value_ids = [refs.options[1].values[0].id];
      assert.equal((await call("products", bad)).status, 400);
    });
    await t.test("private functions reject wrong tokens and cannot commit incomplete prepared SKU links", async () => {
      await assert.rejects(() => db.withMemberStore(store, token, tx => tx`SELECT public.catalogue_write_product(${store},${product.id},${"b".repeat(64)},${2},${JSON.stringify(product.classification)}::text::jsonb,'prepare')`), e => e.code === "42501");
      await assert.rejects(() => db.withMemberStore(store, token, tx => tx`SELECT public.catalogue_write_product(${store},${product.id},${token},${2},${JSON.stringify(product.classification)}::text::jsonb,'prepare')`), e => e.code === "23514");
      assert.equal((await pg.query("SELECT count(*)::int n FROM product_variant_option_values WHERE product_id=$1", [product.id])).rows[0].n, 8);
    });
    await t.test("a single-version product can clear its classification without changing its SKU or stock", async () => {
      const draft=structuredClone(payload);
      draft.slug="single-classified";draft.sku="SINGLE-CLASSIFIED";draft.stock=5;draft.variants=[];
      draft.catalogue.axes=[];draft.classification.options=[];
      const created=await call("products",draft);
      assert.equal(created.status,200,JSON.stringify(created.body));
      const single=created.body.products.find(p=>p.id===created.body.saved_product_id);
      const cleared=await call(`products/${single.id}`,{classification:{clear:true,expected_revision:1},catalogue:single.catalogue,variants:[]},"PATCH");
      assert.equal(cleared.status,200,JSON.stringify(cleared.body));
      const result=cleared.body.products.find(p=>p.id===single.id);
      assert.equal(result.classification,null);
      assert.equal(result.catalogue_revision,2);
      assert.equal(result.sku,"SINGLE-CLASSIFIED");assert.equal(result.stock,5);
      assert.equal((await pg.query("SELECT count(*)::int n FROM product_descriptor_values WHERE product_id=$1",[single.id])).rows[0].n,0);
    });
    await t.test("retired saved selections remain unchanged and editable for price/stock, but unavailable for new products", async () => {
      await pg.query("UPDATE catalogue_product_types SET is_active=false WHERE id=$1", [refs.type]);
      const response = await handleAnnRoutes(request("ann/reference?catalogue=1&subcategory_id=2"), {}, db, user, token);
      assert.equal((await response.json()).catalogue.product_types.length, 0);
      const saved = await call(`products/${product.id}`, { catalogue: product.catalogue, classification: product.classification, variants: product.variants, price_paise: 160000 }, "PATCH");
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      product = saved.body.products.find(p => p.id === product.id);
      assert.equal(product.price_paise, 160000);
      assert.equal(product.classification.expected_revision, 3);
      const wrong = structuredClone(payload); wrong.slug = "retired-new"; wrong.sku = "RETIRED";
      assert.equal((await call("products", wrong)).status, 400);
    });
    await t.test("classified products without orders can be deleted without leaving selection rows", async () => {
      const response = await call(`products/${product.id}`, undefined, "DELETE");
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal((await pg.query("SELECT count(*)::int n FROM product_descriptor_values WHERE product_id=$1", [product.id])).rows[0].n, 0);
      assert.equal((await pg.query("SELECT count(*)::int n FROM products WHERE id=$1", [product.id])).rows[0].n, 0);
    });
  } finally { await pg.close(); }
});
