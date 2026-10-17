import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {d2cVariantSeed} from "../db/d2c-variant-seed.js";
import {PROFILES,profileForType} from "../db/d2c-variant-profiles.js";
import {preparePageMigration} from "../db/page-schema-migration.js";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {catalogueReference} from "../src/store/catalogue-classification.js";
import {handleStoreRoutes} from "../src/store/routes.js";
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const token="a".repeat(64),user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
const seed=await d2cVariantSeed();
test("every source type has an explicit curated variant profile, without invented tax or compatibility values",()=>{
  assert.equal(seed.payload.assignments.length,1698);
  for(const item of seed.payload.assignments)assert.ok(PROFILES[item.profile_key],item.type_key);
  for(const [type,expected]of Object.entries({dress:"apparel",cooking_oil:"foodLiquid",engine_oil:"fluid",lab_coat:"apparel",pedal:"musicAccessory",ring:"ring",shoe_rack:"furniture",weight_plates:"weights",serum:"beautyLiquid",bp_monitor:"medical",notebook:"stationery"}))
    assert.equal(profileForType(type),expected,type);
  for(const profile of seed.payload.profiles){
    assert.equal(new Set(profile.axes.map(a=>a.option_key)).size,profile.axes.length);
    for(const a of profile.axes)assert.ok(seed.payload.options.some(o=>o.key===a.option_key));
  }
  for(const name of ["Strength","Shade","Compatibility","Model","Licence","Lens power"])
    assert.deepEqual(seed.payload.options.find(o=>o.name===name).items,[],name);
  assert.equal(profileForType("not_a_reviewed_product_type"),null);
});
test("real DDL: complete profiles, store-private values, SKU persistence and tenant isolation",async t=>{
  const pg=await setupAnnFixtureDatabase({catalogueApi:true,sampleCatalogue:true});
  const db=annFixtureAdapter(pg);
  // The browser fixture adapter intentionally supports only its own store.
  // Exercise a second tenant with a real restricted-role transaction instead.
  const asOther=fn=>pg.transaction(async trx=>{
    await trx.exec("SET LOCAL ROLE lebrands_app");
    assert.equal((await trx.query("SELECT public.authorize_store_session($1,$2) allowed",[token,other])).rows[0].allowed,true);
    await trx.query("SELECT set_config('app.store_id',$1,true)",[other]);
    const tx=async(strings,...values)=>(await trx.query(strings.reduce((sql,part,i)=>sql+(i?`$${i}`:"")+part,""),values)).rows;
    return fn(tx);
  });
  const migrate=async filename=>pg.exec(`BEGIN;${await preparePageMigration(filename,await readFile(new URL(`../db/staged/${filename}`,import.meta.url),"utf8"))}COMMIT;`);
  const request=async(path,body,storeId=store,actor=user,auth=token,method="POST")=>{
    const response=await handleStoreRoutes(new Request(`https://accounts.lebrands.store/api/stores/${storeId}/${path}`,{
      method,headers:{origin:"https://accounts.lebrands.store","content-type":"application/json"},body:JSON.stringify(body),
    }),{},db,actor,auth);
    return{status:response.status,body:await response.json()};
  };
  try{
    await migrate("0022_catalogue_reviewed_references.sql");
    const merchantTables=["products","product_options","product_variant_axes","product_variant_axis_values","product_variant_option_values","product_descriptor_values","collections","collection_products","product_media"];
    const snapshot=async()=>Object.fromEntries(await Promise.all(merchantTables.map(async table=>[table,JSON.stringify((await pg.query(`SELECT to_jsonb(t)::text row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows)])));
    const before=await snapshot();
    const oldTypeStatus=(await pg.query("SELECT id,review_status,is_active FROM catalogue_product_types ORDER BY id")).rows;
    await migrate("0023_d2c_variant_profiles.sql");
    await migrate("0024_store_variant_values.sql");
    const originalOid=(await pg.query("SELECT 'public.catalogue_write_product_v1(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id;
    await migrate("0025_catalogue_writer_identity.sql");
    assert.equal((await pg.query("SELECT 'public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id,originalOid,"Keep the original callable identity for prepared connections.");
    assert.deepEqual(await snapshot(),before,"Reference migrations must not mutate any merchant catalogue or inventory.");
    assert.deepEqual((await pg.query("SELECT id,review_status,is_active FROM catalogue_product_types ORDER BY id")).rows,oldTypeStatus,"Do not silently approve missing category memberships.");
    assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_variant_profile_assignments")).rows[0].n,1698);
    const serum=Number((await pg.query("SELECT id FROM catalogue_product_types WHERE type_key='serum'")).rows[0].id);
    const category=Number((await pg.query("SELECT category_id FROM catalogue_subcategories WHERE subcategory_id=21")).rows[0].category_id);
    const ref=await db.withMemberStore(store,token,tx=>catalogueReference(tx,21,serum));
    assert.equal(ref.custom_values_enabled,true);
    const volume=ref.options.find(o=>o.name==="Volume");
    assert.ok(volume.values.some(v=>v.value==="30 ml"));
    const publicCount=(await pg.query("SELECT count(*)::int n FROM catalogue_variant_option_values WHERE store_id IS NULL")).rows[0].n;
    let custom;
    await t.test("custom values are reused case-insensitively, scoped to a type, and do not change public masters",async()=>{
      const first=await request("catalogue/variant-values",{product_type_id:serum,option_id:volume.id,value:" 37 ml "});
      assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.created,true);
      custom=first.body.value;
      const again=await request("catalogue/variant-values",{product_type_id:serum,option_id:volume.id,value:"37 ML"});
      assert.equal(again.status,200);assert.equal(again.body.created,false);assert.deepEqual(again.body.value,custom);
      assert.equal((await pg.query("SELECT count(*)::int n FROM catalogue_variant_option_values WHERE store_id IS NULL")).rows[0].n,publicCount);
      const refreshed=await db.withMemberStore(store,token,tx=>catalogueReference(tx,21,serum));
      assert.ok(refreshed.options.find(o=>o.id===volume.id).values.some(v=>v.id===custom.id));
      assert.equal((await request("catalogue/variant-values",{product_type_id:serum,option_id:volume.id,value:"<script>"})).status,400);
      assert.equal((await request("catalogue/variant-values",{product_type_id:serum,option_id:999999,value:"bad"})).status,400);
    });
    await t.test("the shared product API saves and reloads custom values, generated SKU identity and per-SKU quantities",async()=>{
      const labels=[volume.values[0],custom];
      const payload={
        title:"Custom volume fixture",description:"A synthetic skincare product used to test private variant values.",
        price_paise:150000,sku:"PRIVATE-VOLUME",stock:10,hsn_code:"3304",gst_rate:18,
        catalogue:{vendor:"Test vendor",category:"",subcategory:"",axes:[{name:"Volume",values:labels.map(v=>v.value)}],seo_title:"Custom volume",seo_description:"Synthetic product"},
        classification:{category_id:category,subcategory_id:21,product_type_id:serum,expected_revision:0,
          options:[{option_id:volume.id,value_ids:labels.map(v=>v.id)}],descriptors:[]},
        variants:labels.map((v,i)=>({values:[v.value],sku:`PRIVATE-VOLUME-${i}`,stock:i+2,price_paise:null})),
      };
      const saved=await request("products",payload);
      assert.equal(saved.status,200,JSON.stringify(saved.body));
      const product=saved.body.products.find(p=>p.id===saved.body.saved_product_id);
      assert.deepEqual(product.classification.options[0].value_ids,labels.map(v=>v.id));
      assert.deepEqual(product.variants.map(v=>v.stock),[2,3]);
      const edited=await request(`products/${product.id}`,{title:"Updated custom volume fixture",
        classification:{...product.classification,expected_revision:product.catalogue_revision}},store,user,token,"PATCH");
      assert.equal(edited.status,200,JSON.stringify(edited.body));
      const reloaded=edited.body.products.find(p=>p.id===product.id);
      assert.deepEqual(reloaded.variants.map(v=>[v.id,v.sku,v.stock]),product.variants.map(v=>[v.id,v.sku,v.stock]));
      await pg.query("UPDATE catalogue_variant_option_values SET is_active=false WHERE id=$1",[custom.id]);
      const retired=await request(`products/${product.id}`,{price_paise:151000,classification:reloaded.classification},store,user,token,"PATCH");
      assert.equal(retired.status,200,JSON.stringify(retired.body));
      assert.deepEqual(retired.body.products.find(p=>p.id===product.id).variants.map(v=>[v.id,v.sku,v.stock]),product.variants.map(v=>[v.id,v.sku,v.stock]),"Retiring a private choice must not replace saved SKUs.");
    });
    await t.test("other tenants cannot read private values or smuggle guessed IDs through either writer",async()=>{
      await pg.exec(`INSERT INTO brands(id,name,legal_name) VALUES('${other}','Other fixture','Other fixture');
        INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES('${other}','${other}','other-variant-fixture','Other fixture');
        INSERT INTO store_members(store_id,user_id,role) VALUES('${other}','${user.id}','owner');`);
      await asOther(async tx=>{
        assert.equal((await tx`SELECT id FROM catalogue_variant_option_values WHERE id=${custom.id}`).length,0);
        const ref=await catalogueReference(tx,21,serum);
        assert.equal(ref.options.find(o=>o.id===volume.id).values.some(v=>v.id===custom.id),false);
        const [added]=await tx`SELECT catalogue_add_variant_value(${other},${token},${serum},${volume.id},'37 ml')::text result`;
        assert.notEqual(JSON.parse(added.result).value.id,custom.id,"The second store must own a separate private value ID.");
      });
      await assert.rejects(asOther(tx=>tx`SELECT catalogue_write_product(${other},'dddddddd-dddd-4ddd-8ddd-dddddddddddd',${token},0,${JSON.stringify({product_type_id:serum,options:[{option_id:volume.id,value_ids:[custom.id]}]})}::jsonb,'save')`),e=>e.code==="42501"&&/Variant value isolation denied/.test(e.message));
      assert.equal((await pg.query("SELECT to_regprocedure('public.catalogue_write_product_v1(uuid,uuid,text,integer,jsonb,text)') IS NULL absent")).rows[0].absent,true);
      await assert.rejects(asOther(tx=>tx`SELECT catalogue_write_product_guarded_compat(${other},'dddddddd-dddd-4ddd-8ddd-dddddddddddd',${token},0,${JSON.stringify({product_type_id:serum,options:[{option_id:volume.id,value_ids:[custom.id]}]})}::jsonb,'save')`),e=>e.code==="42501"&&/Variant value isolation denied/.test(e.message));
      await assert.rejects(db.withMemberStore(store,token,tx=>tx`UPDATE catalogue_variant_option_values SET label='tampered' WHERE id=${custom.id}`),e=>e.code==="42501");
      assert.notEqual((await request("catalogue/variant-values",{product_type_id:serum,option_id:volume.id,value:"forbidden"},store,{id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"})).status,200);
    });
  }finally{await pg.close();}
});
