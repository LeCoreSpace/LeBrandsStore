import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reviewedCatalogueSeed } from "../db/catalogue-reviewed-seed.js";
import { annReferenceSeed } from "../db/ann-reference-seed.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { migrationSelection } from "../db/migration-selection.js";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { catalogueReference } from "../src/store/catalogue-classification.js";
import { handleStoreRoutes } from "../src/store/routes.js";

const filename = "0022_catalogue_reviewed_references.sql";
const source = await readFile(new URL(`../db/staged/${filename}`, import.meta.url), "utf8");
const seed = await reviewedCatalogueSeed();
const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token = "a".repeat(64);
const user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const counts = {
  catalogue_subcategory_product_types: "approved_type_links",
  catalogue_variant_options: "options", catalogue_variant_option_values: "option_values",
  catalogue_product_type_options: "type_option_links", catalogue_product_type_option_values: "type_option_value_links",
  catalogue_descriptors: "descriptors", catalogue_descriptor_values: "descriptor_values",
  catalogue_product_type_descriptors: "type_descriptor_links",
};
test("reviewed import is deterministic, exact-valued and excludes unresolved roles", async () => {
  assert.equal((await reviewedCatalogueSeed()).sql, seed.sql);
  assert.equal(seed.summary.activated_product_types, 188);
  assert.equal(seed.summary.unresolved_role_assignments, 1335);
  assert.equal(seed.summary.types_without_membership, 1510);
  assert.equal(seed.payload.type_links.length, 313);
  assert.equal(new Set(seed.payload.type_links.map(m => `${m.subcategory_id}:${m.type_key}`)).size, 313);
  assert.equal(seed.payload.type_links.some(m => m.subcategory_id === 2), false, "Do not invent clothing membership.");
  for (const o of seed.payload.options) {
    assert.equal(new Set(o.items.map(v => v.label.toLowerCase())).size, o.items.length);
    assert.equal(new Set(o.items.map(v => v.key)).size, o.items.length);
  }
  for (const d of seed.payload.descriptors) {
    assert.equal(d.input_type, "multi_select");
    assert.equal(d.unit, null, "Do not infer typed units.");
  }
  const original = new Map((await annReferenceSeed()).values.map(v => [`source_value_${v.id}`,v.value]));
  for (const def of [...seed.payload.options,...seed.payload.descriptors]) {
    for (const value of def.items) assert.equal(value.label, original.get(value.key), "Every imported label must be an exact source value.");
  }
  assert.deepEqual(migrationSelection(["--staged-catalogue-references"]), { staged: true, filename, requires: "0021_catalogue_forms_api.sql" });
  assert.equal((await preparePageMigration(filename, source)).includes("__CATALOGUE_REVIEWED_REFERENCES_V1__"), false);
  await assert.rejects(preparePageMigration(filename, source + "__CATALOGUE_REVIEWED_REFERENCES_V1__"), /exactly once/);
});

test("real prerequisite DDL: populate, expose scoped choices, save and protect merchant data", async t => {
  const pg = await setupAnnFixtureDatabase({ catalogueApi: true, sampleCatalogue: true });
  try {
    const snapshot = async () => {
      const tables = ["products","product_options","product_media","media","collections","collection_products"];
      const result = {};
      for (const table of tables) result[table] = JSON.stringify((await pg.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows);
      return result;
    };
    const before = await snapshot();
    const sql = await preparePageMigration(filename, source);
    await pg.exec(`BEGIN;${sql}COMMIT;`).catch(e => { throw new Error(`Reference import SQL: ${e.code} ${e.message}; position ${e.position}`); });
    assert.deepEqual(await snapshot(), before, "Reference import must not modify any merchant records.");
    await t.test("all imported counts and review flags agree with the source manifest", async () => {
      for (const [table, count] of Object.entries(counts)) {
        assert.equal((await pg.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n, seed.summary[count], table);
        assert.equal((await pg.query(`SELECT count(*)::int n FROM public.${table} WHERE NOT is_active OR review_status<>'approved'`)).rows[0].n, 0, table);
      }
      assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types WHERE is_active")).rows[0].n, 188);
      assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types WHERE NOT is_active AND review_status='pending'")).rows[0].n, 1510);
      await assert.rejects(pg.exec(`BEGIN;${sql}COMMIT;`), /requires empty new masters/);
      await pg.exec("ROLLBACK");
      assert.deepEqual(await snapshot(), before);
    });
    const db = annFixtureAdapter(pg);
    await t.test("every mapped type returns exactly its allowed values to the shared form", async () => {
      await db.withMemberStore(store, token, async tx => {
        for (const mapping of seed.payload.type_links) {
          const [row] = await tx`SELECT id FROM catalogue_product_types WHERE type_key=${mapping.type_key}`;
          const ref = await catalogueReference(tx, mapping.subcategory_id, Number(row.id));
          assert.equal(ref.product_type?.type_key, mapping.type_key);
          const expectedOptions = seed.payload.option_links.filter(o => o.type_key === mapping.type_key);
          assert.equal(ref.options.length, expectedOptions.length);
          for (const link of expectedOptions) {
            const definition = seed.payload.options.find(o => o.key === link.option_key);
            const actual = ref.options.find(o => o.name === definition.name);
            assert.deepEqual(actual.values.map(v => v.value), link.value_keys.map(k => definition.items.find(v => v.key === k).label));
          }
          const expectedDescriptors = seed.payload.descriptor_links.filter(d => d.type_key === mapping.type_key);
          assert.equal(ref.descriptors.length, expectedDescriptors.length);
          assert.equal(new Set(ref.descriptors.map(d => d.name.toLowerCase())).size, ref.descriptors.length);
          for (const link of expectedDescriptors) {
            const definition = seed.payload.descriptors.find(d => d.key === link.descriptor_key);
            const actual = ref.descriptors.find(d => d.name === definition.name);
            assert.deepEqual(actual.values.map(v => v.value), definition.items.map(v => v.label));
          }
        }
        assert.equal((await catalogueReference(tx, 2, null)).product_types.length, 0);
        const [serum] = await tx`SELECT id FROM catalogue_product_types WHERE type_key='serum'`;
        const ref = await catalogueReference(tx, 21, Number(serum.id));
        assert.equal(ref.options.some(o => o.name === "Volume"), false, "Do not leak another type's volume values into skincare.");
        assert.equal((await catalogueReference(tx, 2, Number(serum.id))).product_type, null);
      });
    });
    await t.test("a product can save and reload using actual imported option and descriptor IDs", async () => {
      const sampleLink = seed.payload.option_links.find(o => seed.payload.descriptor_links.some(d => d.type_key === o.type_key));
      assert.ok(sampleLink);
      const mapping = seed.payload.type_links.find(m => m.type_key === sampleLink.type_key);
      const [row] = (await pg.query("SELECT id FROM catalogue_product_types WHERE type_key=$1", [mapping.type_key])).rows;
      const ref = await db.withMemberStore(store, token, tx => catalogueReference(tx, mapping.subcategory_id, Number(row.id)));
      const option = ref.options.find(o => o.values.length >= 2) || ref.options[0];
      const selected = option.values.slice(0,2);
      const body = {
        title:"Reviewed catalogue fixture",description:"A synthetic product used to verify imported reference choices.",
        price_paise:150000,sku:"REVIEWED-IMPORT",stock:10,hsn_code:"6204",gst_rate:5,
        catalogue:{vendor:"Fixture vendor",category:"",subcategory:"",axes:[{name:option.name,values:selected.map(v=>v.value)}],seo_title:"Imported fixture",seo_description:"Imported catalogue test"},
        classification:{category_id:seed.coverage.find(s=>s.subcategory_id===mapping.subcategory_id).category_id,
          subcategory_id:mapping.subcategory_id,product_type_id:Number(row.id),expected_revision:0,
          options:[{option_id:option.id,value_ids:selected.map(v=>v.id)}],
          descriptors:ref.descriptors.map(d=>({descriptor_id:d.id,value_ids:[d.values[0].id]}))},
        variants:selected.map((v,i)=>({values:[v.value],sku:`REVIEWED-${i}`,stock:i+1,price_paise:null})),
      };
      const req = new Request(`https://accounts.lebrands.store/api/stores/${store}/products`,{method:"POST",
        headers:{origin:"https://accounts.lebrands.store","content-type":"application/json"},body:JSON.stringify(body)});
      const response = await handleStoreRoutes(req, {}, db, user, token);
      const result = await response.json();
      assert.equal(response.status,200,JSON.stringify(result));
      const product = result.products.find(p=>p.id===result.saved_product_id);
      assert.equal(product.classification.product_type_id,Number(row.id));
      assert.equal(product.classification.descriptors.length,ref.descriptors.length);
      assert.deepEqual(product.variants.map(v=>v.stock),selected.map((_,i)=>i+1));
      assert.equal(product.catalogue.axes[0].name,option.name);
    });
    await t.test("restricted application role cannot mutate shared masters", async () => {
      await assert.rejects(db.withMemberStore(store,token,tx=>tx`UPDATE public.catalogue_variant_options SET name='forged'`), e=>e.code==="42501");
    });
  } finally { await pg.close(); }
});
