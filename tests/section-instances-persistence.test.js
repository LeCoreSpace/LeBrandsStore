import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
import {createSectionInstance,setInstanceLayout} from "../src/public/section-instance-model.js";
import {renderSavedDesign} from "../src/public/aura-design.js";

test("restricted-role section save/reload keeps drafts isolated, checks ownership and rejects stale ordering writes",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,samplePolicies:true}),db=annFixtureAdapter(pg);
  const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const call=async(method,body)=>{
    const response=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ann/design`,{
      method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}),
      {},db,{id:owner},"a".repeat(64));
    return {status:response.status,body:await response.json()};
  };
  try{
    const initial=(await call("GET")).body;
    const adopted=await call("POST",{expected_draft:initial.expected_draft,confirm:true,catalogue_mode:"own",
      answers:{category_id:1,subcategory_id:1,style_preset:"boutique",store_name:"Example Studio",
        tagline:"Considered essentials",description:"Thoughtfully chosen everyday products for a considered collection."}});
    assert.equal(adopted.status,200,JSON.stringify(adopted.body));
    const a=createSectionInstance("faq"),b=createSectionInstance("brand-story");
    const sections={about:{instances:[a,b],order:[a.id,b.id]},product:{instances:[createSectionInstance("size-guide",{kind:"current-product"})],order:["slot-core-product-0"]}};
    const key=`section.about.${b.id}.text1`;
    const payload={expected_draft:adopted.body.expected_draft,confirm:true,sections,copy:{[key]:"A carefully preserved independent story"}};
    const saved=await call("PATCH",payload);
    assert.equal(saved.status,200,JSON.stringify(saved.body));
    assert.deepEqual(saved.body.design.sections,sections);
    assert.equal(saved.body.design.copy[key],"A carefully preserved independent story");
    const loaded=(await call("GET")).body;
    assert.deepEqual(loaded.design.sections,sections);
    assert.ok(renderSavedDesign(loaded.draft,{page:"about"}).body.includes("A carefully preserved independent story"));
    const stale=await call("PATCH",{...payload,sections:{about:{...sections.about,order:[b.id,a.id]}}});
    assert.equal(stale.status,409);
    const foreign=createSectionInstance("featured-product",{kind:"product",id:"ffffffff-ffff-4fff-8fff-ffffffffffff"});
    const rejected=await call("PATCH",{confirm:true,expected_draft:loaded.expected_draft,sections:{home:{instances:[foreign]}}});
    assert.equal(rejected.status,400);
    assert.match(rejected.body.error,/belonging to this store/);
    const core=await call("PATCH",{confirm:true,expected_draft:loaded.expected_draft,sections:{product:{order:[a.id,"slot-core-product-0"],instances:[a]}}});
    assert.equal(core.status,400);
    const after=(await call("GET")).body;
    assert.deepEqual(after.design.sections,sections);
    assert.equal(after.expected_draft,loaded.expected_draft);
    assert.equal(after.draft.store.status,initial.draft.store.status);
    assert.deepEqual(after.draft.products,initial.draft.products);
    const changed=setInstanceLayout(after.design.sections,"about",b.id,"vintage");
    const layoutSave=await call("PATCH",{confirm:true,expected_draft:after.expected_draft,sections:changed});
    assert.equal(layoutSave.status,200);
    const reloaded=(await call("GET")).body;
    assert.equal(reloaded.design.sections.about.instances[1].layout,"vintage");
    assert.deepEqual(reloaded.design.copy,after.design.copy);
    assert.deepEqual(reloaded.design.sections.about.order,after.design.sections.about.order);
    assert.ok(renderSavedDesign(reloaded.draft,{page:"about"}).body.includes('data-section-layout="vintage"'));
    const invalid=structuredClone(changed);invalid.about.instances[1].layout="arbitrary-css";
    assert.equal((await call("PATCH",{confirm:true,expected_draft:reloaded.expected_draft,sections:invalid})).status,400);
  }finally{await pg.close();}
});
