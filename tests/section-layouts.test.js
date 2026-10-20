import test from "node:test";
import assert from "node:assert/strict";
import {SECTION_LIBRARY} from "../src/public/section-library.js";
import {SECTION_LAYOUTS,sectionLayouts,validSectionLayout} from "../src/public/section-layouts.js";
import {SECTION_LAYOUT_CSS} from "../src/public/section-layout-css.js";
import {createSectionInstance,sectionBindingKinds,setInstanceLayout,validSectionInstance,copyInstanceFields} from "../src/public/section-instance-model.js";
import {renderSectionInstance} from "../src/public/section-instances.js";
import {renderSectionLayoutPreview} from "../src/public/section-layout-preview.js";
import {applyDesignContent} from "../src/public/ann-section-content.js";
import {validateDesignRequest} from "../src/store/ann-design.js";
const productId="dddddddd-dddd-4ddd-8ddd-dddddddddddd",collectionId="ffffffff-ffff-4fff-8fff-ffffffffffff";
const source={store:{name:"Example Studio"},settings:{accent_color:"#74213d"},
  products:[{id:productId,title:"Example shirt",slug:"example-shirt",description:"Real product description",price_paise:129900,images:[],collection_ids:[collectionId]}],
  collections:[{id:collectionId,title:"Shirts",slug:"shirts",description:"Our shirts",product_ids:[productId]}],policies:[],reviews:[]};
const bind=(family,page)=>{
  const kind=sectionBindingKinds(family,page)[0];
  return ["product","collection"].includes(kind)?{kind,id:kind==="product"?productId:collectionId}:{kind};
};

test("all 37 content families have eight actual theme-inspired adaptations plus unchanged original",()=>{
  assert.equal(SECTION_LAYOUTS.length,9);
  for(const family of SECTION_LIBRARY.filter(f=>f.kind==="content")){
    assert.equal(sectionLayouts(family.id).length,9);
    for(const layout of SECTION_LAYOUTS){
      assert.equal(validSectionLayout(family.id,layout.id),true);
      const instance=createSectionInstance(family.id,bind(family.id,"home"),layout.id);
      const html=renderSectionInstance(instance,source,{page:"home",designEdit:true});
      assert.ok(html.includes(`data-section-layout="${layout.id}"`),family.id+" "+layout.id);
    }
  }
  assert.deepEqual(sectionLayouts("header"),[]);
  assert.deepEqual(sectionLayouts("footer"),[]);
});
test("old instances remain valid; unrecognised layout values and data injection fail closed",()=>{
  const old=createSectionInstance("brand-story");
  assert.equal(Object.hasOwn(old,"layout"),false);
  assert.equal(validSectionInstance(old,"home"),true);
  for(const layout of [null,{},[],7,"custom-css","<script>","boutique;color:red","shared"]){
    const altered={...old,layout};
    assert.equal(validSectionInstance(altered,"home"),false);
    assert.throws(()=>validateDesignRequest({confirm:true,expected_draft:"a".repeat(64),sections:{home:{instances:[altered]}}}));
  }
});
test("layout changes preserve identity, sources, ordering, hiding and independent content",()=>{
  const a=createSectionInstance("featured-product",{kind:"product",id:productId},"boutique");
  const before={home:{order:["slot-hero-0",a.id],hidden:[a.id],instances:[a]}};
  const after=setInstanceLayout(before,"home",a.id,"architectural");
  assert.equal(after.home.instances[0].layout,"architectural");
  assert.equal(after.home.instances[0].id,a.id);
  assert.deepEqual(after.home.instances[0].binding,a.binding);
  assert.deepEqual(after.home.hidden,before.home.hidden);
  assert.deepEqual(after.home.order,before.home.order);
  assert.equal(before.home.instances[0].layout,"boutique");
  const original={...a};delete original.layout;
  assert.deepEqual(setInstanceLayout(after,"home",a.id,"original").home.instances[0],original);
});
test("native required/core blocks cannot be changed through instance layout mutation",()=>{
  assert.throws(()=>setInstanceLayout({product:{order:["slot-core-product-0"]}},"product","slot-core-product-0","minimal"));
  assert.throws(()=>setInstanceLayout({},"checkout","slot-core-checkout-0","minimal"));
});
test("all layouts preserve editable text and image identities because presentation never rewrites content",()=>{
  for(const family of SECTION_LIBRARY.filter(f=>f.kind==="content")){
    const instance=createSectionInstance(family.id,bind(family.id,"home")),design={copy:{},media:{},catalogue_mode:"own"};
    const keys=html=>[...html.matchAll(/data-design-(?:copy|image)="([^"]+)"/g)].map(m=>m[1]);
    const baseline=keys(applyDesignContent(`<main>${renderSectionInstance(instance,source,{designEdit:true})}</main>`,design,"home",true));
    for(const layout of SECTION_LAYOUTS){
      const html=renderSectionInstance({...instance,layout:layout.id},source,{designEdit:true});
      assert.deepEqual(keys(applyDesignContent(`<main>${html}</main>`,design,"home",true)),baseline,`${family.id}/${layout.id}`);
    }
  }
});
test("previews use the same live renderer with actual saved copy and media on all content pages",()=>{
  for(const page of ["home","collection","product","about","contact"]){
    const instance=createSectionInstance("brand-story"),key=`section.${page}.${instance.id}.text0`;
    const design={copy:{[key]:"Our independent story <not markup>"},media:{},plan:{color_preset:"midnight",accent_color:"#123456"}};
    const before=structuredClone(design);
    for(const layout of SECTION_LAYOUTS){
      const html=renderSectionLayoutPreview({data:source,design,page,instance,layout:layout.id});
      assert.ok(html.includes('data-section-layout="'+layout.id+'"'));
      assert.ok(html.includes("Our independent story &lt;not markup&gt;"),page);
      assert.ok(html.includes("default-src 'none'"));
      assert.ok(html.includes("form-action 'none'"));
      assert.ok(!html.includes("<script"));
      assert.ok(!html.includes("data-preview-core"));
      assert.ok(html.includes("background:#12151d"));
    }
    assert.deepEqual(design,before,"Looking at layouts must not mutate the draft");
  }
});
test("new-section preview normalises ephemeral dialog identities without persisting them",()=>{
  const preview=renderSectionLayoutPreview({data:source,instance:{id:"preview",family:"brand-story",binding:{kind:"none"}},layout:"boutique"});
  assert.ok(preview.includes('data-section-layout="boutique"'));
  assert.ok(preview.includes('data-section-instance="slot-library-00000000000000000000000000000000-0"'));
});
test("preview never executes untrusted content or accepts arbitrary layout styling",()=>{
  assert.equal(renderSectionLayoutPreview({data:source,instance:createSectionInstance("brand-story"),layout:'"><script>'}),"");
  const instance=createSectionInstance("intro-text"),data={...source,store:{name:'</title><script>alert(1)</script>'}};
  const html=renderSectionLayoutPreview({data,instance});
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
test("every theme adaptation is explicitly scoped and duplicate retains the selected layout",()=>{
  for(const layout of SECTION_LAYOUTS.filter(l=>l.id!=="original"))
    assert.ok(SECTION_LAYOUT_CSS.includes(`.lb-section[data-section-layout="${layout.id}"]`));
  const instance=createSectionInstance("brand-story",{kind:"none"},"editorial"),copy=createSectionInstance(instance.family,instance.binding,instance.layout);
  const model={copy:{[`section.home.${instance.id}.text0`]:"Our story"},media:{},formatting:{}};
  const cloned=copyInstanceFields(model,"home",instance.id,copy.id);
  assert.equal(copy.layout,"editorial");
  assert.equal(cloned.copy[`section.home.${copy.id}.text0`],"Our story");
});
