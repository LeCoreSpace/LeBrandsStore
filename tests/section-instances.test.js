import test from "node:test";
import assert from "node:assert/strict";
import {SECTION_LIBRARY} from "../src/public/section-library.js";
import {createSectionInstance,sectionBindingKinds,validSectionInstance,insertSectionInstance,removeSectionInstance,
  instanceOnlySections,sectionBindingError,copyInstanceFields,clearInstanceFields} from "../src/public/section-instance-model.js";
import {validDesignSections,designSections,applyDesignSections} from "../src/public/ann-section-layout.js";
import {injectSectionInstances} from "../src/public/section-instances.js";
import {applyDesignContent} from "../src/public/ann-section-content.js";
import {validateDesignRequest} from "../src/store/ann-design.js";
import {STYLE_IDS,styleSettings} from "../src/public/aura-styles.js";
import {designPreviewData,renderStylePreview} from "../src/public/style-preview.js";
import {renderSavedDesign} from "../src/public/aura-design.js";

const productId="dddddddd-dddd-4ddd-8ddd-dddddddddddd",collectionId="ffffffff-ffff-4fff-8fff-ffffffffffff";
const data=()=>({store:{name:"Example",store_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
  settings:{brand_name:"Example",category:"fashion",subcategory:"mens-clothing"},
  products:[{id:productId,slug:"example-shirt",title:"Example Shirt",description:"Cotton shirt",price_paise:129900,status:"active",collection_ids:[collectionId],images:[]}],
  collections:[{id:collectionId,slug:"shirts",title:"Shirts",description:"Our shirt collection",product_ids:[productId]}],
  reviews:[],policies:[],layouts:{}});
const binding=(family,page)=>{
  const kind=sectionBindingKinds(family,page)[0];
  return ["product","collection"].includes(kind)?{kind,id:kind==="product"?productId:collectionId}:{kind};
};
const native='<main><section class="ed-hero"><h1>Original hero</h1></section><section class="ed-shelf"><h2>Products</h2></section></main>';

test("all 37 content families can be inserted on each content page, but never transaction/global pages",()=>{
  for(const page of ["home","collection","product","about","contact"])for(const family of SECTION_LIBRARY.filter(x=>x.kind==="content")){
    const instance=createSectionInstance(family.id,binding(family.id,page));
    assert.ok(validSectionInstance(instance,page),`${family.id} on ${page}`);
  }
  for(const page of ["cart","checkout","confirmation","track"])assert.deepEqual(sectionBindingKinds("faq",page),[]);
  assert.throws(()=>createSectionInstance("header"));
  assert.throws(()=>createSectionInstance("footer"));
});
test("bounded versioned instance documents reject injection, duplicate ids and context-free current records",()=>{
  const instance=createSectionInstance("faq");
  assert.ok(validDesignSections({home:{instances:[instance]}}));
  for(const change of [{family:"header"},{version:2},{id:'"><script>'},{html:"<b>raw</b>"},{binding:{kind:"none",id:productId}}])
    assert.equal(validDesignSections({home:{instances:[{...instance,...change}]}}),false);
  assert.equal(validDesignSections({home:{instances:[instance]},about:{instances:[instance]}}),false);
  assert.equal(validDesignSections({home:{instances:[createSectionInstance("featured-product",{kind:"current-product"})]}}),false);
  assert.equal(validDesignSections({home:{instances:Array.from({length:13},()=>createSectionInstance("faq"))}}),false);
  assert.throws(()=>validateDesignRequest({confirm:true,expected_draft:"a".repeat(64),sections:{checkout:{instances:[instance]}}}));
});
test("insertions preserve old configuration and support exact between-section positions",()=>{
  const first=createSectionInstance("faq"),second=createSectionInstance("brand-story");
  const original={home:{hidden:["slot-lookbook-0"],order:["slot-ed-hero-0","slot-ed-shelf-0"]}};
  const next=insertSectionInstance(original,"home",first,original.home.order,"slot-ed-hero-0");
  assert.deepEqual(next.home.order,["slot-ed-hero-0",first.id,"slot-ed-shelf-0"]);
  const again=insertSectionInstance(next,"home",second,next.home.order,first.id);
  assert.deepEqual(again.home.order,["slot-ed-hero-0",first.id,second.id,"slot-ed-shelf-0"]);
  assert.deepEqual(original.home.order,["slot-ed-hero-0","slot-ed-shelf-0"]);
  assert.deepEqual(again.home.hidden,original.home.hidden);
  assert.throws(()=>insertSectionInstance({},"product",createSectionInstance("faq"),["slot-core-product-0"],null));
  assert.ok(validDesignSections({product:{instances:[first],order:["slot-core-product-0",first.id]}}));
});
test("duplicate/delete keep field identities independent and remove only the chosen section",()=>{
  const a=createSectionInstance("image-gallery"),b=createSectionInstance("image-gallery");
  const key=`section.home.${a.id}.text0`,image=`section.home.${a.id}.image0`;
  const model={sections:{home:{instances:[a],order:["slot-ed-hero-0",a.id]}},copy:{[key]:"Our gallery",title:"Old hero"},media:{[image]:{media_id:productId}},formatting:{}};
  const copied=copyInstanceFields(model,"home",a.id,b.id);
  assert.equal(copied.copy[`section.home.${b.id}.text0`],"Our gallery");
  copied.media[`section.home.${b.id}.image0`].media_id="different";
  assert.equal(model.media[image].media_id,productId);
  const clean=clearInstanceFields(copied,"home",a.id);
  assert.equal(clean.copy[key],undefined);
  assert.equal(clean.copy.title,"Old hero");
  assert.equal(clean.copy[`section.home.${b.id}.text0`],"Our gallery");
  const removed=removeSectionInstance(model.sections,"home",a.id);
  assert.deepEqual(removed.home.instances,[]);
  assert.deepEqual(removed.home.order,["slot-ed-hero-0"]);
  assert.equal(model.sections.home.instances.length,1);
});
test("record bindings never accept another store's product or collection",()=>{
  const own=createSectionInstance("featured-product",{kind:"product",id:productId});
  assert.equal(sectionBindingError({home:{instances:[own]}},data()),"");
  const foreign=createSectionInstance("featured-product",{kind:"product",id:collectionId});
  assert.match(sectionBindingError({home:{instances:[foreign]}},data()),/belonging to this store/);
});
test("every content family has trusted escaped markup and stable editable identities",()=>{
  for(const family of SECTION_LIBRARY.filter(x=>x.kind==="content")){
    const instance=createSectionInstance(family.id,binding(family.id,"home"));
    const sections={home:{instances:[instance]}};
    const html=injectSectionInstances(native,sections,data(),{page:"home",designEdit:true});
    assert.ok(html.includes(`data-section-instance="${instance.id}"`),family.id);
    assert.equal(designSections(html).sections.at(-1).id,instance.id);
  }
  const instance=createSectionInstance("intro-text"),sections={home:{instances:[instance]}};
  const html=injectSectionInstances(native,sections,data(),{page:"home",designEdit:true});
  const design={copy:{[`section.home.${instance.id}.text0`]:"Our new <chapter>"},media:{}};
  const edited=applyDesignContent(html,design,"home",true);
  assert.ok(edited.includes("Our new &lt;chapter&gt;"));
  assert.ok(edited.includes("Original hero"));
  const arranged=applyDesignSections(edited,{home:{...sections.home,order:["slot-ed-hero-0",instance.id,"slot-ed-shelf-0"]}});
  assert.ok(arranged.indexOf("Our new")<arranged.indexOf(">Products<"));
});
test("all eight styles show saved instances in preview and live output without changing existing store content",()=>{
  for(const style of STYLE_IDS){
    const source=data(),instance=createSectionInstance("brand-story"),design={version:1,style,catalogue_mode:"own",plan:styleSettings(style),
      copy:{[`section.home.${instance.id}.text1`]:"An independent section story"},media:{},sections:{home:{instances:[instance]}}};
    source.settings.ann_design=design;
    const preview=renderStylePreview(designPreviewData(source,design),styleSettings(style),{page:"home",designEdit:true});
    const live=renderSavedDesign(source,{page:"home"});
    assert.ok(preview.includes(instance.id),style);
    assert.ok(live.body.includes(instance.id),style);
    assert.ok(live.body.includes("An independent section story"),style);
    assert.equal((live.body.match(/data-section-instance=/g)||[]).length,1,style);
    assert.ok(live.css.includes(".lb-section"),style);
  }
});
test("sample preview binds explicit store products to their real catalogue, not demo lookalikes",()=>{
  const source=data(),instance=createSectionInstance("featured-product",{kind:"product",id:productId});
  const design={version:1,style:"boutique",catalogue_mode:"sample",plan:{},copy:{},media:{},sections:{home:{instances:[instance]}}};
  const html=renderStylePreview(designPreviewData(source,design),styleSettings("boutique"),{designEdit:true});
  const block=designSections(html).sections.find(s=>s.id===instance.id);
  assert.ok(block.html.includes("Example Shirt"));
  assert.ok(!block.html.includes("Select an available product"));
});
test("metadata rendering strips arrangement without losing new section definitions",()=>{
  const instance=createSectionInstance("faq");
  const full={home:{instances:[instance],order:["slot-ed-shelf-0","slot-ed-hero-0",instance.id],hidden:[instance.id]}};
  const bare=instanceOnlySections(full);
  assert.deepEqual(bare,{home:{instances:[instance]}});
  assert.ok(validDesignSections(bare));
});
