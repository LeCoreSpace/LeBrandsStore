import test from "node:test";
import assert from "node:assert/strict";
import {renderCatalogueOrganisation} from "../src/ui/catalogue-forms.js";
import {renderDashboard} from "../src/ui/dashboard.js";
import {renderDescriptors,applyDescriptorInput,initDescriptorState} from "../src/public/catalogue-classification-ui.js";
import {productPatch} from "../src/store/input.js";
import {setupBusinessReviewFixture,REVIEW_FIXTURE_STORE as STORE} from "../src/business-review-preview-fixture.js";
import {saveProduct,loadDraft} from "../src/store/repository.js";

test("listing and vendor controls are dropdowns with saved values and a new-vendor entry",()=>{
  const html=renderDashboard("product",{store:{store_id:STORE,name:"Own brand"},catalogue_forms_enabled:true,
    product:{id:"eeeeeeee-1111-4111-8111-111111111111",status:"active",catalogue:{vendor:"Saved vendor"}}});
  assert.match(html,/<select name="status">/);
  assert.match(html,/<option value="active" selected>Active/);
  const org=renderCatalogueOrganisation({enabled:true,product:{catalogue:{vendor:"Saved & vendor"}},vendors:["Own brand","Own brand"]});
  assert.match(org,/<select name="catalogue_vendor">/);
  assert.match(org,/<option value="Saved &amp; vendor" selected>/);
  assert.equal((org.match(/value="Own brand"/g)||[]).length,1);
  assert.match(org,/data-new-vendor hidden/);
});

test("country of origin uses country names while preserving legacy values and descriptor storage",()=>{
  const descriptors=[{id:1,name:"Country of origin",input_type:"text"}];
  const state=initDescriptorState({descriptors:[{descriptor_id:1,text_value:"India"}]});
  assert.match(renderDescriptors(descriptors,state),/<select data-descriptor data-desc-id="1" data-desc-kind="text">/);
  assert.match(renderDescriptors(descriptors,state),/<option value="India" selected>/);
  assert.ok((renderDescriptors(descriptors,state).match(/<option /g)||[]).length>=250);
  applyDescriptorInput(state,{dataset:{descId:"1",descKind:"text"},value:"Canada"});
  assert.equal(state[1].text,"Canada");
  state[1].text="Previously saved origin";
  assert.match(renderDescriptors(descriptors,state),/<option value="Previously saved origin" selected>/);
});

test("listing status only accepts editable states",()=>{
  assert.equal(productPatch({status:"draft"}).status,"draft");
  assert.equal(productPatch({status:"active"}).status,"active");
  for(const status of ["archived","published","live",null])assert.throws(()=>productPatch({status}),/Draft or Active/);
});

test("status, vendor and base or variant stock survive database reload; archived records cannot be restored",async()=>{
  const f=await setupBusinessReviewFixture();
  try{
    const save=(id,patch)=>f.db.withMemberStore(STORE,f.ownerToken,tx=>saveProduct(tx,STORE,id,productPatch(patch),{tokenHash:f.ownerToken}));
    const fresh=await save(null,{title:"Form controls test",description:"A complete description for checking product form controls.",
      price_paise:9900,hsn_code:"33049900",gst_rate:18,sku:"CONTROLS-BASE",status:"draft",stock:19,
      catalogue:{vendor:"New maker",axes:[]}});
    const id=fresh.saved_product_id;
    const reload=async()=>{const draft=await f.db.withMemberStore(STORE,f.ownerToken,tx=>loadDraft(tx,STORE));return draft.products.find(p=>p.id===id);};
    let p=await reload();
    assert.equal(p.status,"draft");assert.equal(p.stock,19);assert.equal(p.catalogue.vendor,"New maker");
    await save(id,{status:"active",catalogue:{vendor:"New maker",axes:[{name:"Size",values:["S","M"]}]},
      stock:999,variants:[{values:["S"],sku:"CONTROLS-S",stock:7},{values:["M"],sku:"CONTROLS-M",stock:11}]});
    p=await reload();
    assert.equal(p.status,"active");assert.equal(p.stock,18);assert.deepEqual(p.variants.map(v=>v.stock),[7,11]);
    await save(id,{variants:p.variants.map(v=>({...v,stock:v.stock+1}))});
    p=await reload();assert.equal(p.stock,20);assert.deepEqual(p.variants.map(v=>v.stock),[8,12]);
    await f.pg.query("UPDATE public.products SET status='archived' WHERE id=$1",[id]);
    await assert.rejects(save(id,{status:"active"}),/cannot be restored/);
  }finally{await f.pg.close();}
});
