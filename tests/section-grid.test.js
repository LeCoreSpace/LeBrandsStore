import test from "node:test";
import assert from "node:assert/strict";
import {createSectionInstance,validSectionInstance,sectionBindingError} from "../src/public/section-instance-model.js";
import {changeGrid,cellKeys,gridSnapshot,prepareGrid,validGridData,gridRecords} from "../src/public/section-grid-model.js";
import {renderSectionInstance} from "../src/public/section-instances.js";
import {applyDesignContent} from "../src/public/ann-section-content.js";
const pid="dddddddd-dddd-4ddd-8ddd-dddddddddddd",pid2="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",cid="ffffffff-ffff-4fff-8fff-ffffffffffff";
const data={store:{name:"Example"},products:[{id:pid,title:"First",slug:"first",price_paise:10000},{id:pid2,title:"Second",slug:"second",price_paise:20000}],collections:[{id:cid,title:"Collection",slug:"collection",product_ids:[pid]}],reviews:[]};
const model=instance=>({sections:{home:{instances:[instance],order:[instance.id]}},copy:{},media:{},formatting:{}});
test("grid defaults, ten stable slots and all typed settings reject malformed input",()=>{
  const i=createSectionInstance("image-gallery");
  assert.equal(i.items.length,3);assert.ok(validSectionInstance(i,"home"));
  for(const patch of [{desktop:7},{mobile:3},{limit:11},{arrangement:"<script>"},{gap:"100px"},{source:"automatic"},{foo:true}])
    assert.throws(()=>changeGrid(model(i),"home",i.id,"settings",patch,data));
  const invalid=structuredClone(i);invalid.items[1].slot=invalid.items[0].slot;
  assert.equal(validGridData(invalid),false);
});
test("number shown creates default cells and hiding cells does not delete their content",()=>{
  const i=createSectionInstance("image-gallery");
  let m=changeGrid(model(i),"home",i.id,"settings",{limit:6,desktop:4,mobile:1},data);
  assert.equal(m.sections.home.instances[0].items.length,6);
  const keys=cellKeys("home",i.id,5);assert.ok(m.copy[keys.title]);assert.ok(m.copy[keys.body]);
  m=changeGrid(m,"home",i.id,"settings",{limit:2},data);
  assert.equal(m.sections.home.instances[0].items.length,6);
  assert.ok(m.copy[keys.title]);
  const html=renderSectionInstance(m.sections.home.instances[0],{...data,settings:{ann_design:m}},{page:"home"});
  assert.equal([...html.matchAll(/data-cell-id=/g)].length,2);
  assert.ok(html.includes("--g-desktop:4"));assert.ok(html.includes("--g-mobile:1"));
});
test("cell reordering preserves text, rich text, media, IDs and slot identities",()=>{
  const i=createSectionInstance("image-gallery"),first=i.items[0],second=i.items[1],keys=cellKeys("home",i.id,first.slot);
  let m=model(i);m.copy[keys.title]="Unique caption";m.media[keys.image]={media_id:pid,url:"https://media.lebrands.store/stores/"+cid+"/"+pid+".jpg",alt:"Image"};m.formatting[keys.title]={version:1,runs:[{text:"Unique caption",bold:true}],style:{}};
  const original=structuredClone(m);
  m=changeGrid(m,"home",i.id,"reorder",{ids:[second.id,first.id,i.items[2].id]},data);
  assert.equal(m.copy[keys.title],"Unique caption");assert.deepEqual(m.media,original.media);assert.deepEqual(m.formatting,original.formatting);
  assert.equal(gridSnapshot(m,"home",i.id,data).items[0].title,"Gallery image 2","Unedited defaults belong to the cell, not its new array position.");
  const html=applyDesignContent(`<main>${renderSectionInstance(m.sections.home.instances[0],{...data,settings:{ann_design:m}},{page:"home",designEdit:true})}</main>`,m,"home",true);
  assert.ok(html.indexOf(second.id)<html.indexOf(first.id));
  assert.ok(html.includes(`data-design-image="${keys.image}"`));assert.ok(html.includes("Unique caption"));
  assert.throws(()=>changeGrid(m,"home",i.id,"reorder",{ids:[first.id,first.id,second.id]},data));
});
test("duplicate/remove/reuse clear stale fields while explicit blank text stays blank",()=>{
  const i=createSectionInstance("image-gallery"),first=i.items[0],keys=cellKeys("home",i.id,0);
  let m=changeGrid(model(i),"home",i.id,"update",{id:first.id,patch:{title:"",body:"Our details",alt:"Accessible",link:"/pages/about"}},data);
  assert.equal(gridSnapshot(m,"home",i.id,data).items[0].title,"");
  m=changeGrid(m,"home",i.id,"duplicate",{id:first.id},data);
  assert.equal(m.sections.home.instances[0].items.length,4);
  const cloned=m.sections.home.instances[0].items[1];
  assert.notEqual(cloned.id,first.id);assert.equal(m.copy[cellKeys("home",i.id,cloned.slot).body],"Our details");
  m=changeGrid(m,"home",i.id,"remove",{id:first.id},data);assert.equal(Object.hasOwn(m.copy,keys.body),false);
  m=changeGrid(m,"home",i.id,"add",{},data);assert.notEqual(m.copy[keys.body],"Our details");
});
test("legacy gallery upgrade maps edited captions and image slots without mutating the original",()=>{
  const i=createSectionInstance("image-gallery");delete i.grid;delete i.items;
  const m=model(i);m.copy[`section.home.${i.id}.text1`]="Existing caption";m.media[cellKeys("home",i.id,0).image]={media_id:pid};
  const before=structuredClone(m),snap=gridSnapshot(m,"home",i.id,data);
  assert.equal(snap.items[0].title,"Existing caption");assert.deepEqual(m,before);
  const next=prepareGrid(m,"home",i.id,data);
  assert.equal(next.copy[cellKeys("home",i.id,0).title],"Existing caption");
  assert.deepEqual(next.media,m.media);assert.deepEqual(next.sections.home.order,m.sections.home.order);
});
test("catalogue selections and review text cannot be invented or edited as free text",()=>{
  const i=createSectionInstance("product-grid",{kind:"all"});let m=prepareGrid(model(i),"home",i.id,data);
  const cell=m.sections.home.instances[0].items[0];
  assert.throws(()=>changeGrid(m,"home",i.id,"update",{id:cell.id,patch:{title:"Fake price"}},data));
  m=changeGrid(m,"home",i.id,"settings",{source:"manual"},data);
  m=changeGrid(m,"home",i.id,"remove",{id:m.sections.home.instances[0].items[1].id},data);
  const bad=structuredClone(m.sections);bad.home.instances[0].items[0].recordId=cid;
  assert.ok(sectionBindingError(bad,data));
  assert.equal(sectionBindingError(m.sections,data),"");
  assert.equal(gridRecords(createSectionInstance("product-grid",{kind:"collection",id:cid}),data).length,1);
  const extra={...data,collections:[...data.collections,{id:pid,title:"Second collection",slug:"second"}]};
  const legacy=createSectionInstance("collection-cards",{kind:"all"});delete legacy.grid;delete legacy.items;
  let old=model(legacy);old.copy[`section.home.${legacy.id}.text2`]="Existing second collection name";
  old=changeGrid(old,"home",legacy.id,"settings",{limit:1},extra);
  old=changeGrid(old,"home",legacy.id,"settings",{limit:2},extra);
  assert.equal(gridSnapshot(old,"home",legacy.id,extra).items[1].title,"Existing second collection name","Reducing the display limit must retain hidden record edits.");
  const set=createSectionInstance("product-set",{kind:"all"});
  assert.ok(renderSectionInstance(set,data,{page:"home"}).includes("Product total: ₹300.00"));
});
test("fixed comparisons keep two cells and unsafe cell links are rejected",()=>{
  const i=createSectionInstance("before-after"),m=model(i),id=i.items[0].id;
  assert.throws(()=>changeGrid(m,"home",i.id,"remove",{id},data));
  assert.throws(()=>changeGrid(m,"home",i.id,"add",{},data));
  for(const link of ["javascript:alert(1)","//evil.test","/\\evil.test","data:text/html,x"])
    assert.throws(()=>changeGrid(m,"home",i.id,"update",{id,patch:{link}},data));
});
test("missing text gains defaults at reserved keys without shifting later legacy edits",()=>{
  const i=createSectionInstance("policy-text"),m=model(i);m.copy[`section.home.${i.id}.text2`]="Existing second policy heading";
  const input={...data,settings:{ann_design:m},policies:[{title:"First",body:""},{title:"Second",body:"Actual policy"}]};
  const html=applyDesignContent(`<main>${renderSectionInstance(i,input,{page:"home",designEdit:true})}</main>`,m,"home",true);
  assert.ok(html.includes("Existing second policy heading"));assert.ok(html.includes("See this store"));
  assert.ok(html.includes(`data-design-copy="section.home.${i.id}.text50"`));
});
