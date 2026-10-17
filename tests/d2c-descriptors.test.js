import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {d2cDescriptorSeed} from "../db/d2c-descriptor-seed.js";
import {reviewedCatalogueSeed} from "../db/catalogue-reviewed-seed.js";
import {preparePageMigration} from "../db/page-schema-migration.js";
import {migrationSelection} from "../db/migration-selection.js";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {catalogueReference} from "../src/store/catalogue-classification.js";
import {handleStoreRoutes} from "../src/store/routes.js";
import {renderDescriptors,initDescriptorState,buildClassification} from "../src/public/catalogue-classification-ui.js";

const file="0028_d2c_descriptor_coverage.sql";
const source=await readFile(new URL(`../db/staged/${file}`,import.meta.url),"utf8");
const seed=await d2cDescriptorSeed();
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",token="a".repeat(64),user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
test("descriptor profiles cover every source type with explicit contextual, optional input definitions",async()=>{
  assert.equal((await d2cDescriptorSeed()).sql,seed.sql);
  assert.equal(seed.payload.profiles.length,1698);
  assert.equal(new Set(seed.payload.profiles.map(p=>p.type_key)).size,1698);
  assert.deepEqual(migrationSelection(["--staged-d2c-descriptors"]),{staged:true,filename:file,requires:"0027_d2c_food_profile_corrections.sql"});
  const profiles=new Map(seed.payload.profiles.map(p=>[p.type_key,p]));
  for(const [key,expected,excluded]of [["dress","Fabric composition","Ingredients"],["shampoo","Hair type","Skin type"],
    ["ring","Metal composition","Neckline"],["smartphone","Connectivity","Feeding instructions"],
    ["book","Page count","Skin type"],["pet_supplement","Suitable species","Skin type"],
    ["drag_es","Allergen information","Labelled active ingredients"],["pouch_meal","Nutrition information","Bag material"]]){
    assert.ok(profiles.get(key).fields.includes(expected),key);
    assert.ok(!profiles.get(key).fields.includes(excluded),key);
  }
  const defs=new Map(seed.payload.descriptors.map(d=>[d.key,d]));
  const old=await reviewedCatalogueSeed();
  for(const a of seed.payload.assignments)assert.ok(defs.has(a.descriptor_key));
  for(const d of seed.payload.descriptors){
    assert.ok(["text","number","boolean","multi_select"].includes(d.input_type));
    assert.equal(d.items.length,d.input_type==="multi_select"?d.values.length:0);
    assert.equal(new Set(d.items.map(v=>v.label.toLowerCase())).size,d.items.length);
    assert.ok(!/certified|approved|prescription required|tax|gst|hsn/i.test(d.name));
  }
  assert.equal(old.summary.type_descriptor_links,235,"Do not rewrite the original source import.");
  await assert.rejects(preparePageMigration(file,"missing token"),/exactly once/);
});

test("full migration sequence preserves existing data and the shared API round-trips descriptor selections",async t=>{
  const pg=await setupAnnFixtureDatabase({complete:false,commerce:true,catalogueApi:true});
  const db=annFixtureAdapter(pg);
  const migrate=async f=>pg.exec(`BEGIN;${await preparePageMigration(f,await readFile(new URL(`../db/staged/${f}`,import.meta.url),"utf8"))}COMMIT;`);
  const snapshot=async tables=>{
    const out={};for(const name of tables)out[name]=(await pg.query(`SELECT to_jsonb(t)::text row FROM public.${name} t ORDER BY to_jsonb(t)::text`)).rows;
    return out;
  };
  const call=async(path,body,method="POST")=>{
    const response=await handleStoreRoutes(new Request(`https://accounts.lebrands.store/api/stores/${store}/${path}`,{
      method,headers:{origin:"https://accounts.lebrands.store","content-type":"application/json"},body:JSON.stringify(body),
    }),{},db,user,token);
    return{status:response.status,body:await response.json()};
  };
  const getRef=async(sub,key)=>db.withMemberStore(store,token,async tx=>{
    const refs=await catalogueReference(tx,sub,null),type=refs.product_types.find(p=>p.type_key===key);
    assert.ok(type,`${key} is selectable`);
    return catalogueReference(tx,sub,type.id);
  });
  try{
    for(const f of ["0022_catalogue_reviewed_references.sql","0023_d2c_variant_profiles.sql","0024_store_variant_values.sql",
      "0025_catalogue_writer_identity.sql","0026_d2c_type_memberships.sql","0027_d2c_food_profile_corrections.sql"])await migrate(f);
    const merchantAndVariantTables=["products","product_options","product_variant_axes","product_variant_axis_values",
      "product_variant_option_values","product_descriptor_values","collections","collection_products","product_media","media",
      "catalogue_categories","catalogue_subcategories","catalogue_product_types","catalogue_subcategory_product_types",
      "catalogue_variant_options","catalogue_variant_option_values","catalogue_product_type_options","catalogue_product_type_option_values"];
    const before=await snapshot(merchantAndVariantTables);
    const oldDescriptors=await snapshot(["catalogue_descriptors","catalogue_descriptor_values","catalogue_product_type_descriptors"]);
    const oid=(await pg.query("SELECT 'public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id;
    await migrate(file);
    assert.deepEqual(await snapshot(merchantAndVariantTables),before);
    assert.equal((await pg.query("SELECT 'public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure::oid id")).rows[0].id,oid);
    const newDescriptors=await snapshot(Object.keys(oldDescriptors));
    for(const[name,rows]of Object.entries(oldDescriptors)){
      const after=new Set(newDescriptors[name].map(r=>r.row));
      for(const r of rows)assert.ok(after.has(r.row),`Preserve ${name} row exactly`);
    }
    assert.equal((await pg.query(`SELECT count(DISTINCT t.id)::int n FROM catalogue_product_types t
      JOIN catalogue_product_type_descriptors m ON m.product_type_id=t.id AND m.is_active AND m.review_status='approved'
      JOIN catalogue_descriptors d ON d.id=m.descriptor_id AND d.is_active AND d.review_status='approved'`)).rows[0].n,1698);
    await t.test("every profile field is readable, no same-label duplicates are added, and references remain read-only",async()=>{
      const rows=(await pg.query(`SELECT t.type_key,d.name,d.input_type,d.unit,m.is_required,d.descriptor_key
        FROM catalogue_product_types t JOIN catalogue_product_type_descriptors m ON m.product_type_id=t.id
        JOIN catalogue_descriptors d ON d.id=m.descriptor_id WHERE m.is_active AND m.review_status='approved'
        AND d.is_active AND d.review_status='approved'`)).rows;
      for(const p of seed.payload.profiles)for(const name of p.fields)
        assert.ok(rows.some(r=>r.type_key===p.type_key&&r.name.toLowerCase()===name.toLowerCase()),`${p.type_key}:${name}`);
      for(const d of rows.filter(r=>r.descriptor_key.startsWith("d2c_descriptor_")))assert.equal(d.is_required,false);
      for(const [sub,key] of [[2,"dress"],[21,"serum"],[22,"shampoo"],[46,"ring"],[81,"smartphone"],[790,"book"],[102,"drag_es"]]){
        const r=await getRef(sub,key);
        assert.ok(r.descriptors.length>=5);
        assert.equal(new Set(r.descriptors.map(d=>d.name.toLowerCase())).size,r.descriptors.length,key);
      }
      await assert.rejects(db.withMemberStore(store,token,tx=>tx`UPDATE catalogue_descriptors SET name='Changed' WHERE name='Country of origin'`),e=>e.code==="42501");
    });
    await t.test("replay preserves all references and retirement conflicts roll back instead of reviving rows",async()=>{
      const all=await snapshot(Object.keys(oldDescriptors));
      await migrate(file);assert.deepEqual(await snapshot(Object.keys(all)),all);
      await pg.exec("BEGIN; UPDATE catalogue_descriptors SET is_active=false WHERE descriptor_key LIKE 'd2c_descriptor_%' AND name='Country of origin'");
      await assert.rejects(pg.exec(await preparePageMigration(file,source)),/collision or retirement/);
      await pg.exec("ROLLBACK");
      assert.deepEqual(await snapshot(Object.keys(all)),all);
    });
    const saved=[];
    await t.test("text, enum, numeric and explicit false details save and reload without creating variants",async()=>{
      for(const[key,sub,category,field,value]of [
        ["dress",2,1,"Fit","enum"],["book",790,11,"Page count",128],["keyboard",94,5,"Wireless",false],
      ]){
        const ref=await getRef(sub,key),main=ref.descriptors.find(d=>d.name===field),
          origin=ref.descriptors.find(d=>d.name==="Country of origin");
        assert.ok(main);assert.ok(origin);
        const picked={descriptor_id:main.id,...(value==="enum"?{value_ids:[main.values[0].id]}:
          typeof value==="boolean"?{boolean_value:value}:{number_value:value})};
        const classification={category_id:category,subcategory_id:sub,product_type_id:ref.product_type.id,
          expected_revision:0,options:[],descriptors:[picked,{descriptor_id:origin.id,text_value:"India"}]};
        const response=await call("products",{
          title:`Descriptor fixture ${key}`,description:"A synthetic catalogue product for descriptor persistence verification.",
          sku:`DESC-${key.toUpperCase()}`,price_paise:150000,stock:5,hsn_code:"1234",gst_rate:18,
          catalogue:{vendor:"Fixture maker",axes:[],seo_title:"Fixture search title",seo_description:"Fixture search description"},
          classification,variants:[],
        });
        assert.equal(response.status,200,JSON.stringify(response.body));
        const product=response.body.products.find(p=>p.id===response.body.saved_product_id);
        assert.deepEqual(product.classification.descriptors.find(d=>d.descriptor_id===main.id),picked);
        assert.equal(product.variants.length,0);
        assert.equal(product.stock,5);
        assert.equal(product.catalogue.seo_title,"Fixture search title");
        const html=renderDescriptors(ref.descriptors,initDescriptorState(product.classification),product.classification_reference);
        if(value===false)assert.match(html,/<option value="false" selected>No<\/option>/);
        if(typeof value==="number"){assert.match(html,/Page count \(pages\)/);assert.match(html,/value="128"/);}
        const rebuilt=buildClassification({initial:product.classification,typeId:ref.product_type.id,categoryId:category,
          subcategoryId:sub,descriptors:ref.descriptors,descriptorState:initDescriptorState(product.classification)});
        assert.deepEqual([...rebuilt.descriptors].sort((a,b)=>a.descriptor_id-b.descriptor_id),product.classification.descriptors);
        saved.push(product);
      }
      const result=await db.withMemberStore(store,token,async tx=>(await import("../src/store/repository.js")).loadDraft(tx,store));
      for(const p of saved)assert.deepEqual(result.products.find(r=>r.id===p.id).classification.descriptors,p.classification.descriptors);
    });
    await t.test("unrelated or wrong-type descriptors fail atomically, and unchanged retired selections survive stock edits",async()=>{
      const dress=saved[0],book=saved[1];
      const foreign=book.classification.descriptors.find(d=>"number_value" in d);
      const bad=await call(`products/${dress.id}`,{title:"Must roll back",
        classification:{...dress.classification,descriptors:[...dress.classification.descriptors,foreign]}},"PATCH");
      assert.equal(bad.status,400);
      assert.equal((await pg.query("SELECT title FROM products WHERE id=$1",[dress.id])).rows[0].title,dress.title);
      const numeric=book.classification.descriptors.find(d=>"number_value" in d);
      assert.equal((await call(`products/${book.id}`,{classification:{...book.classification,
        descriptors:[{descriptor_id:numeric.descriptor_id,text_value:"wrong input"}]}},"PATCH")).status,400);
      await pg.query("UPDATE catalogue_descriptors SET is_active=false WHERE id=$1",[numeric.descriptor_id]);
      const edited=await call(`products/${book.id}`,{stock:6,classification:book.classification},"PATCH");
      assert.equal(edited.status,200,JSON.stringify(edited.body));
      const result=edited.body.products.find(p=>p.id===book.id);
      assert.equal(result.stock,6);
      assert.deepEqual(result.classification.descriptors,book.classification.descriptors);
    });
  }finally{await pg.close();}
});
