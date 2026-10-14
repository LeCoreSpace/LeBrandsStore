import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { migrationSelection } from "../db/migration-selection.js";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { subcategoriesFor, validCategoryPair } from "../src/public/aura-taxonomy.js";
import { starterLayouts, mergeStarter } from "../src/public/aura-skeleton.js";
import { prefilledSection, starterPreview, starterAvailable, STARTER_PACK_ID } from "../src/public/aura-starters.js";
import { STARTER_IMAGE_URLS } from "../src/public/aura-starter-assets.js";
import { validateLayout, validateLayoutMedia } from "../src/public/aura-layout.js";
import { settingsPatch } from "../src/store/input.js";
import { renderAura } from "../src/public/aura.js";
import { renderEditor } from "../src/ui/editor.js";

const store = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const data = () => ({
  store: { store_id: store, name: "Preview brand", subdomain: "preview-brand" },
  aura_starter_enabled: true, aura_skeleton_enabled: true,
  settings: { category: "fashion-and-apparel", subcategory: "mens-clothing", brand_name: "Preview brand" },
  products: [], collections: [], policies: [],
});
test("editor HTML preserves the starter capability and legacy fashion selection", () => {
  const d = data();
  d.settings.category = "fashion";
  const payload = input => JSON.parse(renderEditor(input).match(/id="editor-data">([\s\S]*?)<\/script>/)[1]);
  const enabled = payload(d);
  assert.equal(enabled.aura_starter_enabled, true);
  assert.equal(starterAvailable(enabled), true);
  assert.equal(starterLayouts(enabled).home.find(s => s.type === "hero").settings.heading,
    starterLayouts(d).home.find(s => s.type === "hero").settings.heading);
  assert.equal(starterAvailable(payload({ ...d, aura_starter_enabled: undefined })), false);
  assert.equal(starterAvailable(payload({ ...d, aura_starter_enabled: false })), false);
  assert.equal(starterAvailable(payload({ ...d, settings: { ...d.settings, subcategory: "" } })), false);
});
test("product taxonomy preserves 17 parents, 340 unique children and legacy category values", () => {
  assert.equal(TAXONOMY.categories.length, 17);
  assert.equal(TAXONOMY.subcategories.length, 340);
  assert.equal(new Set(TAXONOMY.subcategories.map(s => s.id)).size, 340);
  for (const c of TAXONOMY.categories) assert.equal(subcategoriesFor(c.slug).length, 20);
  assert.equal(TAXONOMY.categories.some(c => c.id === 17), false);
  assert.equal(subcategoriesFor("fashion")[0].slug, "mens-clothing");
  assert.equal(validCategoryPair("beauty", "mens-clothing"), false);
  assert.throws(() => settingsPatch({ category: "beauty", subcategory: "mens-clothing" }));
  assert.equal(settingsPatch({ category: "fashion", subcategory: "mens-clothing" }).category, "fashion");
});
test("all five prefilled pages validate; existing content is preserved and gating is safe", () => {
  const d=data(), layouts=starterLayouts(d);
  assert.equal(Object.values(layouts).flat().length, 43);
  for (const [page,layout] of Object.entries(layouts)) {
    validateLayout(page, layout, { storeId: store, productIds: new Set(), collectionIds: new Set() });
  }
  const hero=layouts.home.find(s=>s.type==="hero");
  assert.match(hero.settings.image.url,/aura-starters/);
  assert.equal(prefilledSection("hero","home",{...d,aura_starter_enabled:false}),null);
  assert.equal(prefilledSection("hero","home",{...d,settings:{category:"beauty",subcategory:"mens-clothing"}}),null);
  const existing=structuredClone(layouts.home);existing.find(s=>s.type==="hero").settings.title="Keep my brand";
  assert.equal(mergeStarter(existing,"home",d).find(s=>s.type==="hero").settings.title,"Keep my brand");
  assert.equal(prefilledSection("craft","home",d,"new-craft").blocks.length,2);
});
test("only exact shared image URLs bypass tenant ownership checks", () => {
  assert.equal(STARTER_IMAGE_URLS.length,20);
  validateLayoutMedia({url:STARTER_IMAGE_URLS[0],alt:"Sample" },"image",{storeId:store});
  for(const url of [
    "/assets/img/aura-starters/arbitrary.webp", STARTER_IMAGE_URLS[0]+"?x=1",
    `https://media.lebrands.store/stores/${other}/33333333-3333-4333-8333-333333333333.webp`,
  ])assert.throws(()=>validateLayoutMedia({url,alt:"Sample"},"image",{storeId:store}));
  assert.throws(()=>validateLayoutMedia({url:STARTER_IMAGE_URLS[0],alt:"Sample"},"video",{storeId:store}));
});
test("demo products are preview-only; real inventory takes precedence", () => {
  const d=data();d.layouts=starterLayouts(d);const original=JSON.stringify(d);
  const shown=starterPreview(d,"home");
  assert.equal(shown.products.length,6);assert.equal(shown.collections.length,3);
  assert.equal(shown.products[0].price_paise,199900);
  assert.equal(JSON.stringify(d),original);
  assert.equal(d.layouts.home.find(s=>s.type==="spotlight").settings.product,null);
  const html=renderAura(shown,{page:"home",preview:true,readOnly:true,editorSkeleton:true});
  assert.match(html,/A quieter way to dress/);assert.match(html,/hero-mobile-v01.webp/);
  assert.match(html,/Sample Ecru/);
  const real={...d,products:[{id:store,title:"Real merchant product",price_paise:50000,images:[]}]};
  assert.deepEqual(starterPreview(real,"home").products,real.products);
});
test("staged starter migration compiles, validates seeds and restricts app writes in isolated PostgreSQL",async()=>{
  assert.equal(migrationSelection(["--staged-starters"]).requires,"0012_aura_skeleton_sections.sql");
  const pg=new PGlite();
  try {
    await pg.exec(`CREATE ROLE lebrands_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE users(id uuid PRIMARY KEY,must_change_password boolean DEFAULT false);
      CREATE TABLE sessions(user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE store_members(store_id uuid,user_id uuid,role text);
      CREATE TABLE stores(store_id uuid PRIMARY KEY,name text,settings jsonb DEFAULT '{}',status text);
      CREATE TABLE store_setup(store_id uuid PRIMARY KEY,settings jsonb DEFAULT '{}');
      CREATE TABLE store_publications(store_id uuid PRIMARY KEY,snapshot jsonb);
      CREATE TABLE products(id uuid PRIMARY KEY,store_id uuid,title text DEFAULT 'Product');
      CREATE TABLE collections(id uuid PRIMARY KEY,store_id uuid);
      CREATE TABLE media(id uuid DEFAULT gen_random_uuid(),store_id uuid,object_key text,width integer,height integer,alt_text text,upload_type text CHECK(upload_type IN('logo','image')));
      CREATE TABLE product_media(store_id uuid,product_id uuid,media_id uuid,sort_order integer DEFAULT 0);
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT ON stores,store_setup,products,collections,media,product_media TO lebrands_app;`);
    for(const [dir,file] of [["migrations","0010_store_pages.sql"],["staged","0012_aura_skeleton_sections.sql"],["staged","0015_aura_starter_library.sql"]]) {
      const sql=await readFile(new URL(`../db/${dir}/${file}`,import.meta.url),"utf8");
      await pg.exec(await preparePageMigration(file,sql));
    }
    const rows=(await pg.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname LIKE 'aura_library_%' OR relname='store_starter_packs'")).rows;
    assert.equal(rows.filter(r=>r.relrowsecurity&&r.relforcerowsecurity).length,8);
    assert.equal((await pg.query("SELECT count(*)::int n FROM aura_library_subcategories")).rows[0].n,340);
    assert.equal((await pg.query("SELECT count(*)::int n FROM aura_library_section_content")).rows[0].n,43);
    await pg.exec("SET ROLE lebrands_app");
    assert.equal((await pg.query("SELECT count(*)::int n FROM aura_library_assets")).rows[0].n,20);
    for(const table of ["aura_library_categories","aura_library_packs","store_starter_packs"]) {
      await assert.rejects(pg.query(`DELETE FROM ${table}`),e=>e.code==="42501");
    }
    await pg.query("SELECT set_config('app.store_id',$1,false)",[store]);
    await assert.rejects(pg.query("SELECT pin_aura_starter_pack($1,$2,$3)",[other,STARTER_PACK_ID,"a".repeat(64)]),e=>e.code==="42501");
    // Internal validators intentionally have no APP EXECUTE grant.
    await pg.exec("RESET ROLE");
    const fields={image:{type:"image",required:true,default:null}};
    await pg.query("SELECT aura_validate_fields($1,$2,$3)",[fields,{image:{url:STARTER_IMAGE_URLS[0],alt:"Sample"}},store]);
    await assert.rejects(pg.query("SELECT aura_validate_fields($1,$2,$3)",[fields,{image:{url:"/assets/img/aura-starters/fake.webp",alt:"Sample"}},store]),e=>e.code==="22023");
    assert.equal((await pg.query("SELECT count(*)::int n FROM stores")).rows[0].n,0);
  } finally {await pg.close();}
});
