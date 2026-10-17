import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { catalogueProductTypeSeed } from "../db/catalogue-master-seed.js";
import { migrationSelection } from "../db/migration-selection.js";
import { annReference } from "../src/store/ann-repository.js";

const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "22222222-2222-4222-8222-222222222222";
const product = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const sku = "77777777-7777-4777-8777-777777777777";
const owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = "a".repeat(64);
const filename = "0020_catalogue_masters.sql";
const source = await readFile(new URL(`../db/staged/${filename}`, import.meta.url), "utf8");
const tables = [
  "catalogue_product_types", "catalogue_subcategory_product_types",
  "catalogue_variant_options", "catalogue_variant_option_values",
  "catalogue_product_type_options", "catalogue_product_type_option_values",
  "catalogue_descriptors", "catalogue_descriptor_values", "catalogue_product_type_descriptors",
  "product_variant_axes", "product_variant_axis_values", "product_variant_option_values", "product_descriptor_values",
];
async function asApp(pg, id, fn) {
  await pg.exec("BEGIN; SET LOCAL ROLE lebrands_app;");
  try {
    await pg.query("SELECT set_config('app.store_id',$1,true)", [id]);
    const result = await fn();
    await pg.exec("COMMIT");
    return result;
  } catch (error) {
    await pg.exec("ROLLBACK");
    throw error;
  }
}
const rejected = (action, code) => assert.rejects(action, error => error.code === code);

test("master migration is explicit, deterministic and seeds names only", async () => {
  assert.deepEqual(migrationSelection(["--staged-catalogue-masters"]), {
    staged: true, filename, requires: "0019_catalogue_forms.sql",
  });
  const seed = await catalogueProductTypeSeed();
  assert.equal(seed.count, 1698);
  const sql = await preparePageMigration(filename, source);
  assert.equal(sql, await preparePageMigration(filename, source));
  assert.doesNotMatch(sql, /__CATALOGUE_PRODUCT_TYPES_V1__/);
  assert.doesNotMatch(seed.sql, /INSERT INTO public\.(products|catalogue_subcategory_product_types|catalogue_variant_options)/);
  await assert.rejects(preparePageMigration(filename, "no marker"), /exactly once/);
});

test("real foundational schema: taxonomy rename, protected masters and typed merchant selections", async t => {
  const pg = await setupAnnFixtureDatabase({ sampleCatalogue: true, catalogueMasters: false });
  try {
    await pg.query(`INSERT INTO public.product_options(id,store_id,product_id,name,value,sku,stock,price_paise)
      VALUES($1,$2,$3,'Legacy option','Preserved','LEGACY-SKU',7,125000)`, [sku, store, product]);
    const before = (await pg.query("SELECT id,sku,slug,price_paise,stock,hsn_code,gst_rate,updated_at FROM products ORDER BY id")).rows;
    const oldCategories = (await pg.query("SELECT category_id,name,slug FROM aura_library_categories ORDER BY category_id")).rows;
    const oldSubs = (await pg.query("SELECT subcategory_id,category_id,name,slug FROM aura_library_subcategories ORDER BY subcategory_id")).rows;
    const oldReference = await annFixtureAdapter(pg).withMemberStore(store, token, tx => annReference(tx, 2));
    await pg.exec("BEGIN");
    try {
      await pg.exec(await preparePageMigration(filename, source));
      await pg.exec("COMMIT");
    } catch (error) { await pg.exec("ROLLBACK"); throw error; }
    await t.test("canonical tables preserve IDs, foreign keys, records and legacy read compatibility", async () => {
      assert.deepEqual((await pg.query("SELECT category_id,name,slug FROM catalogue_categories ORDER BY category_id")).rows, oldCategories);
      assert.deepEqual((await pg.query("SELECT subcategory_id,category_id,name,slug FROM catalogue_subcategories ORDER BY subcategory_id")).rows, oldSubs);
      assert.deepEqual((await pg.query("SELECT id,sku,slug,price_paise,stock,hsn_code,gst_rate,updated_at FROM products ORDER BY id")).rows, before);
      assert.equal((await pg.query("SELECT stock FROM product_options WHERE id=$1", [sku])).rows[0].stock, 7);
      const relations = (await pg.query(`SELECT relname,relkind,reloptions FROM pg_class
        WHERE oid IN('public.catalogue_categories'::regclass,'public.catalogue_subcategories'::regclass,
          'public.aura_library_categories'::regclass,'public.aura_library_subcategories'::regclass)`)).rows;
      assert.ok(relations.filter(r => r.relname.startsWith("catalogue")).every(r => r.relkind === "r"));
      assert.ok(relations.filter(r => r.relname.startsWith("aura_")).every(r => r.relkind === "v" && r.reloptions.includes("security_invoker=true")));
      const afterReference = await annFixtureAdapter(pg).withMemberStore(store, token, tx => annReference(tx, 2));
      assert.deepEqual(afterReference, oldReference);
      assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types WHERE review_status='pending' AND NOT is_active")).rows[0].n, 1698);
      assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_subcategory_product_types")).rows[0].n, 0);
    });
    await t.test("compatibility views honour underlying RLS and pending masters stay hidden", async () => {
      await pg.query("UPDATE catalogue_categories SET is_active=false WHERE category_id=1");
      await asApp(pg, store, async () => {
        assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types")).rows[0].n, 0);
        assert.equal((await pg.query("SELECT count(*)::int n FROM aura_library_categories WHERE category_id=1")).rows[0].n, 0);
        assert.equal((await pg.query("SELECT count(*)::int n FROM aura_library_subcategories WHERE category_id=1")).rows[0].n, 0);
      });
      await pg.query("UPDATE catalogue_categories SET is_active=true WHERE category_id=1");
      const flags = (await pg.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
        WHERE relname IN(${tables.map((_, i) => `$${i + 1}`).join(",")})`, tables)).rows;
      assert.equal(flags.length, tables.length);
      assert.ok(flags.every(f => f.relrowsecurity && f.relforcerowsecurity));
      for (const table of tables) {
        const [p] = (await pg.query(`SELECT has_table_privilege('lebrands_app',$1,'SELECT') AS r,
          has_table_privilege('lebrands_app',$1,'INSERT,UPDATE,DELETE') AS w,
          has_table_privilege('anon',$1,'SELECT') AS anonymous`, ["public." + table])).rows;
        assert.equal(p.r, true); assert.equal(p.w, false); assert.equal(p.anonymous, false);
      }
      await rejected(() => asApp(pg, store, () => pg.query("UPDATE catalogue_product_types SET review_status='approved'")), "42501");
      await rejected(() => pg.query("UPDATE catalogue_product_types SET is_active=true WHERE type_key='dress'"), "23514");
    });

    const dress = (await pg.query("UPDATE catalogue_product_types SET review_status='approved',is_active=true WHERE type_key='dress' RETURNING id")).rows[0].id;
    await pg.query("INSERT INTO catalogue_subcategory_product_types(subcategory_id,product_type_id,review_status,is_active) VALUES(2,$1,'approved',true)", [dress]);
    await pg.query("UPDATE products SET category_id=1,subcategory_id=2,product_type_id=$1 WHERE id=$2", [dress, product]);
    await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'Other','Other')", [other]);
    await pg.query("INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES($1,$1,'other-catalogue-fixture','Other')", [other]);
    const optionIds = [];
    for (const key of ["size", "colour", "pack", "fourth"]) {
      const id = (await pg.query("INSERT INTO catalogue_variant_options(option_key,name,review_status,is_active) VALUES($1,$1,'approved',true) RETURNING id", [key])).rows[0].id;
      await pg.query("INSERT INTO catalogue_product_type_options(product_type_id,option_id,review_status,is_active) VALUES($1,$2,'approved',true)", [dress, id]);
      const value = (await pg.query("INSERT INTO catalogue_variant_option_values(option_id,value_key,label,review_status,is_active) VALUES($1,'example','Example','approved',true) RETURNING id", [id])).rows[0].id;
      await pg.query("INSERT INTO catalogue_product_type_option_values(product_type_id,option_id,value_id,review_status,is_active) VALUES($1,$2,$3,'approved',true)", [dress, id, value]);
      optionIds.push({ id, value });
    }
    await t.test("classification and variant links enforce category, type, option, value and tenant boundaries", async () => {
      await rejected(() => pg.query("UPDATE products SET category_id=2 WHERE id=$1", [product]), "23503");
      await rejected(() => pg.query("UPDATE products SET subcategory_id=NULL WHERE id=$1", [product]), "23514");
      await rejected(() => pg.query("UPDATE products SET subcategory_id=1 WHERE id=$1", [product]), "23503");
      for (const [i, option] of optionIds.slice(0, 3).entries()) {
        await pg.query(`INSERT INTO product_variant_axes(store_id,product_id,product_type_id,option_id,position)
          VALUES($1,$2,$3,$4,$5)`, [store, product, dress, option.id, i + 1]);
        await pg.query(`INSERT INTO product_variant_axis_values(store_id,product_id,product_type_id,option_id,value_id)
          VALUES($1,$2,$3,$4,$5)`, [store, product, dress, option.id, option.value]);
      }
      await rejected(() => pg.query(`INSERT INTO product_variant_axes(store_id,product_id,product_type_id,option_id,position)
        VALUES($1,$2,$3,$4,4)`, [store, product, dress, optionIds[3].id]), "23514");
      await rejected(() => pg.query(`INSERT INTO product_variant_axes(store_id,product_id,product_type_id,option_id,position)
        VALUES($1,$2,$3,$4,1)`, [other, product, dress, optionIds[0].id]), "23503");
      await rejected(() => pg.query(`INSERT INTO product_variant_axis_values(store_id,product_id,product_type_id,option_id,value_id)
        VALUES($1,$2,$3,$4,$5)`, [store, product, dress, optionIds[0].id, optionIds[1].value]), "23503");
      await pg.query(`INSERT INTO product_variant_option_values(store_id,product_id,product_option_id,option_id,value_id)
        VALUES($1,$2,$3,$4,$5)`, [store, product, sku, optionIds[0].id, optionIds[0].value]);
      await rejected(() => pg.query(`INSERT INTO product_variant_option_values(store_id,product_id,product_option_id,option_id,value_id)
        VALUES($1,$2,$3,$4,$5)`, [other, product, sku, optionIds[0].id, optionIds[0].value]), "23503");
      assert.equal((await pg.query("SELECT sku,stock FROM product_options WHERE id=$1", [sku])).rows[0].sku, "LEGACY-SKU");
    });
    await t.test("descriptors have typed values, multiple selections and no three-descriptor cap", async () => {
      for (const [key, kind] of [["fabric", "single_select"], ["occasion", "multi_select"], ["notes", "text"], ["weight", "number"], ["vegan", "boolean"]]) {
        const id = (await pg.query("INSERT INTO catalogue_descriptors(descriptor_key,name,input_type,review_status,is_active) VALUES($1,$1,$2,'approved',true) RETURNING id", [key, kind])).rows[0].id;
        await pg.query("INSERT INTO catalogue_product_type_descriptors(product_type_id,descriptor_id,review_status,is_active) VALUES($1,$2,'approved',true)", [dress, id]);
        const selections = kind.endsWith("select") ? (kind === "multi_select" ? 2 : 1) : 1;
        for (let i = 0; i < selections; i++) {
          const valueId = kind.endsWith("select") ? (await pg.query("INSERT INTO catalogue_descriptor_values(descriptor_id,value_key,label,review_status,is_active) VALUES($1,$2,$2,'approved',true) RETURNING id", [id, `value${i}`])).rows[0].id : null;
          await pg.query(`INSERT INTO product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,value_id,text_value,number_value,boolean_value)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [store, product, dress, id, kind, valueId, kind === "text" ? "Example" : null, kind === "number" ? 250 : null, kind === "boolean" ? false : null]);
        }
        if (kind === "text") {
          await rejected(() => pg.query(`INSERT INTO product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,text_value)
            VALUES($1,$2,$3,$4,'text',' ')`, [store, product, dress, id]), "23514");
        }
        if (kind === "number") {
          await rejected(() => pg.query(`INSERT INTO product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,number_value)
            VALUES($1,$2,$3,$4,'number','NaN')`, [store, product, dress, id]), "23514");
          await rejected(() => pg.query(`UPDATE product_descriptor_values
            SET input_type='boolean',number_value=NULL,boolean_value=true
            WHERE store_id=$1 AND product_id=$2 AND descriptor_id=$3`, [store, product, id]), "23503");
        }
      }
      assert.equal((await pg.query("SELECT count(DISTINCT descriptor_id)::int n FROM product_descriptor_values")).rows[0].n, 5);
      const single = (await pg.query("SELECT * FROM product_descriptor_values WHERE input_type='single_select'")).rows[0];
      const second = (await pg.query("INSERT INTO catalogue_descriptor_values(descriptor_id,value_key,label) VALUES($1,'second','Second') RETURNING id", [single.descriptor_id])).rows[0].id;
      await rejected(() => pg.query(`INSERT INTO product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,value_id)
        VALUES($1,$2,$3,$4,'single_select',$5)`, [store, product, dress, single.descriptor_id, second]), "23505");
    });
    await t.test("merchant selections are tenant-isolated and cannot be written through the restricted app role", async () => {
      await asApp(pg, store, async () => {
        assert.equal((await pg.query("SELECT count(*)::int n FROM product_variant_axes")).rows[0].n, 3);
        assert.equal((await pg.query("SELECT count(*)::int n FROM product_descriptor_values")).rows[0].n, 6);
        assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types")).rows[0].n, 1);
      });
      await asApp(pg, other, async () => {
        for (const table of tables.filter(name => name.startsWith("product_"))) {
          assert.equal((await pg.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
        }
      });
      await rejected(() => asApp(pg, store, () => pg.query("DELETE FROM product_descriptor_values")), "42501");
      await pg.query("UPDATE catalogue_product_types SET is_active=false WHERE id=$1", [dress]);
      await asApp(pg, store, async () => {
        assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types")).rows[0].n, 1);
        assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types WHERE is_active")).rows[0].n, 0);
      });
      const info = (await pg.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at' AND table_name LIKE 'catalogue_%'")).rows[0].n;
      assert.equal(info, 11);
      assert.equal((await pg.query("SELECT count(*)::int n FROM store_members WHERE store_id=$1 AND user_id=$2", [store, owner])).rows[0].n, 1);
    });
  } finally { await pg.close(); }
});
