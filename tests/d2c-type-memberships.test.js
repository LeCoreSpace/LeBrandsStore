import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d2cTypeMembershipSeed, NEW_SUBCATEGORIES } from "../db/d2c-type-memberships.js";
import { reviewedCatalogueSeed } from "../db/catalogue-reviewed-seed.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { migrationSelection } from "../db/migration-selection.js";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { catalogueReference } from "../src/store/catalogue-classification.js";

const file = "0026_d2c_type_memberships.sql";
const source = await readFile(new URL(`../db/staged/${file}`,import.meta.url),"utf8");
const seed = await d2cTypeMembershipSeed();
const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", token = "a".repeat(64);
test("the deterministic mapping covers all types, preserves reviewed links and avoids unverified properties",async()=>{
  assert.equal((await d2cTypeMembershipSeed()).sql,seed.sql);
  assert.equal(new Set(seed.payload.assignments.map(a=>a.type_key)).size,1698);
  const links = new Set(seed.payload.assignments.map(a=>`${a.type_key}:${a.subcategory_id}`));
  assert.equal(links.size,seed.payload.assignments.length);
  for(const a of (await reviewedCatalogueSeed()).payload.type_links)
    assert.ok(links.has(`${a.type_key}:${a.subcategory_id}`),"Retain every approved mapping");
  for(const [type,id] of [["dress",2],["shirt",1],["shirt",2],["kurti",17],["ring",46],
    ["serum",21],["smartphone",81],["car_charger",221],["tyre",781],["drag_es",102],
    ["book",790],["watch",787],["fabric",788],["candle",789],["sunglasses",791]])
    assert.ok(links.has(`${type}:${id}`),`${type} belongs to ${id}`);
  // Prior reviewed links are preserved, but no NEW association makes claims.
  for(const a of seed.payload.assignments.filter(a=>a.basis!=="previously_reviewed")) {
    assert.ok(![10,30,41,42,44,51,53,57,58,79,109,179,198,301,302,314,315,320,786].includes(a.subcategory_id) ||
      ["ayurvedic_kit","coin","essential_oil","loose_gemstone","silver_coin","ubtan"].includes(a.type_key),
      `Unverified property for ${a.type_key} in ${a.subcategory_id}`);
  }
  assert.equal(NEW_SUBCATEGORIES.length,5);
  assert.deepEqual(migrationSelection(["--staged-d2c-memberships"]),{
    staged:true,filename:file,requires:"0025_catalogue_writer_identity.sql"});
  await assert.rejects(preparePageMigration(file,"no marker"),/exactly once/);
});

test("full foundational schema activates references without modifying merchants, privileges or writer identity",async t=>{
  const pg=await setupAnnFixtureDatabase({complete:false,commerce:true,catalogueApi:true});
  const db=annFixtureAdapter(pg);
  const migrate=async f=>pg.exec(`BEGIN;${await preparePageMigration(f,await readFile(new URL(`../db/staged/${f}`,import.meta.url),"utf8"))}COMMIT;`);
  const snapshot=async tables=>{
    const result={};
    for(const table of tables)result[table]=(await pg.query(`SELECT to_jsonb(t)::text row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows;
    return result;
  };
  try {
    for(const f of ["0022_catalogue_reviewed_references.sql","0023_d2c_variant_profiles.sql","0024_store_variant_values.sql","0025_catalogue_writer_identity.sql"])await migrate(f);
    const merchantTables=["products","product_options","product_variant_axes","product_variant_axis_values",
      "product_variant_option_values","product_descriptor_values","collections","collection_products","product_media","media"];
    const before=await snapshot(merchantTables);
    const oldLinks=(await pg.query("SELECT to_jsonb(m)::text row FROM catalogue_subcategory_product_types m ORDER BY subcategory_id,product_type_id")).rows;
    const oldTaxonomy=await snapshot(["catalogue_categories","catalogue_subcategories"]);
    const oid=(await pg.query("SELECT 'public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id;
    const refs=await snapshot(["catalogue_variant_options","catalogue_variant_option_values","catalogue_product_type_options",
      "catalogue_product_type_option_values","catalogue_descriptors","catalogue_descriptor_values","catalogue_product_type_descriptors"]);
    await migrate(file);
    assert.deepEqual(await snapshot(merchantTables),before);
    assert.deepEqual(await snapshot(Object.keys(refs)),refs,"Mappings must not change variants/descriptors or existing IDs.");
    assert.equal((await pg.query("SELECT 'public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id,oid);
    const afterLinks=new Set((await pg.query("SELECT to_jsonb(m)::text row FROM catalogue_subcategory_product_types m")).rows.map(r=>r.row));
    for(const r of oldLinks)assert.ok(afterLinks.has(r.row),"Existing memberships retain timestamps and exact status.");
    const afterTaxonomy=await snapshot(["catalogue_categories","catalogue_subcategories"]);
    assert.deepEqual(afterTaxonomy.catalogue_categories,oldTaxonomy.catalogue_categories);
    const allSubs=new Set(afterTaxonomy.catalogue_subcategories.map(r=>r.row));
    for(const row of oldTaxonomy.catalogue_subcategories)assert.ok(allSubs.has(row.row));
    assert.equal(afterTaxonomy.catalogue_subcategories.length,345);
    assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_product_types WHERE review_status='approved' AND is_active")).rows[0].n,1698);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM catalogue_product_types t WHERE NOT EXISTS(
      SELECT 1 FROM catalogue_subcategory_product_types m JOIN catalogue_subcategories s USING(subcategory_id)
      JOIN catalogue_categories c USING(category_id) WHERE m.product_type_id=t.id AND m.is_active
        AND m.review_status='approved' AND s.is_active AND c.is_active)`)).rows[0].n,0);
    await t.test("shared Ann/dashboard reference reads expose complete typed choices under the restricted role",async()=>{
      await db.withMemberStore(store,token,async tx=>{
        for(const [id,key] of [[2,"dress"],[46,"ring"],[81,"smartphone"],[787,"watch"],[788,"fabric"],[789,"candle"],[790,"book"],[791,"sunglasses"]]){
          const list=await catalogueReference(tx,id,null);
          const type=list.product_types.find(p=>p.type_key===key);
          assert.ok(type,`${key} visible in ${id}`);
          const detail=await catalogueReference(tx,id,type.id);
          assert.equal(detail.product_type.type_key,key);
          assert.ok(detail.options.length>0,`${key} exposes its existing variant profile`);
        }
        const women=await catalogueReference(tx,2,null);
        const dress=women.product_types.find(p=>p.type_key==="dress");
        assert.equal((await catalogueReference(tx,21,dress.id)).product_type,null,"An unrelated subcategory cannot select Dress.");
        assert.equal(Number((await tx`SELECT count(*)::int n FROM catalogue_product_types WHERE is_active`)[0].n),1698);
        assert.equal(Number((await tx`SELECT count(*)::int n FROM catalogue_subcategories WHERE is_active`)[0].n),345);
      });
      await assert.rejects(db.withMemberStore(store,token,tx=>tx`UPDATE catalogue_subcategory_product_types SET is_active=false WHERE subcategory_id=2`),e=>e.code==="42501");
      await assert.rejects(db.withMemberStore(store,token,tx=>tx`INSERT INTO catalogue_subcategories(subcategory_id,category_id,name,slug) VALUES(9999,1,'Unapproved','unapproved')`),e=>e.code==="42501");
    });
    await t.test("replaying the seed is additive and rejects taxonomy collisions or retirements atomically",async()=>{
      const all=await snapshot(["catalogue_product_types","catalogue_subcategory_product_types","catalogue_subcategories"]);
      await migrate(file);
      assert.deepEqual(await snapshot(Object.keys(all)),all);
      const expanded=await preparePageMigration(file,source);
      await pg.exec("BEGIN; UPDATE catalogue_subcategories SET name='Conflicting name' WHERE subcategory_id=787");
      await assert.rejects(pg.exec(expanded),/collides/);
      await pg.exec("ROLLBACK");
      await pg.exec("BEGIN; UPDATE catalogue_product_types SET is_active=false WHERE type_key='dress'");
      await assert.rejects(pg.exec(expanded),/retired product type/);
      await pg.exec("ROLLBACK");
      assert.deepEqual(await snapshot(Object.keys(all)),all);
    });
    await t.test("ambiguous food names expose food variants, not pill strengths or bag sizes",async()=>{
      await migrate("0027_d2c_food_profile_corrections.sql");
      assert.deepEqual(await snapshot(merchantTables),before,"Reference correction must preserve merchant data.");
      for(const [subcategory,key] of [[102,"drag_es"],[103,"pouch_meal"]]){
        await db.withMemberStore(store,token,async tx=>{
          const list=await catalogueReference(tx,subcategory,null);
          const type=list.product_types.find(p=>p.type_key===key);
          assert.ok(type);
          const detail=await catalogueReference(tx,subcategory,type.id);
          const names=detail.options.map(o=>o.name);
          assert.ok(names.includes("Flavour"));
          assert.ok(!names.some(name=>/strength|form|colour|material|size/i.test(name) && !/pack size/i.test(name)),names.join(", "));
        });
        assert.equal((await pg.query("SELECT p.profile_key FROM catalogue_variant_profile_assignments p JOIN catalogue_product_types t ON t.id=p.product_type_id WHERE t.type_key=$1",[key])).rows[0].profile_key,"foodFresh");
      }
    });
  } finally { await pg.close(); }
});
