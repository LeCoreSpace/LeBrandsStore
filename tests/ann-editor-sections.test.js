import test from "node:test";
import assert from "node:assert/strict";
import { designPreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { designSections, applyDesignSections } from "../src/public/ann-section-layout.js";
import { STYLE_IDS, styleSettings } from "../src/public/aura-styles.js";
import { ANN_EXTRA_SECTIONS } from "../src/public/ann-config.js";
import { sectionDisplayName } from "../src/public/section-library.js";
import { renderAura } from "../src/public/aura.js";

const fixture=()=>({
  store:{store_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Example Studio"},
  settings:{brand_name:"Example Studio",category:"beauty-personal-care",subcategory:"skincare"},
  products:[],collections:[],layouts:{},reviews:[],policies:[],
});
const model=(style,section_options={},mode="sample")=>({
  version:1,style,catalogue_mode:mode,plan:{style_preset:style,section_options},
  sections:{},copy:{},media:{},
});

test("all styles give every home section a useful name without changing existing IDs",()=>{
  for(const style of STYLE_IDS){
    const data=designPreviewData(fixture(),model(style));
    const sections=designSections(renderStylePreview(data,styleSettings(style))).sections;
    assert.ok(sections.length>0);
    for(const section of sections){
      assert.ok(section.label.trim(),`${style}: every section needs a name`);
      assert.doesNotMatch(section.label,/^Section \d+$/);
    }
  }
  const html='<main><section class="ar-stats"><p>Highlights</p></section><section class="sc-sec sc-offers"><p>Offers</p></section></main>';
  assert.deepEqual(designSections(html).sections.map(s=>[s.id,s.label]),[
    ["slot-ar-stats-0","Store Highlights"],["slot-sc-offers-0","Offer Cards"],
  ]);
});

test("every optional section appears from the saved plan, with stable IDs and meaningful names",()=>{
  for(const style of STYLE_IDS)for(const [page,types] of Object.entries(ANN_EXTRA_SECTIONS)){
    const design=model(style,{[page]:types});
    const source=fixture(),before=structuredClone(source);
    const data=designPreviewData(source,design);
    const html=renderStylePreview(data,styleSettings(style),{page});
    const sections=designSections(html,page).sections;
    for(const type of types){
      assert.match(html,new RegExp(`data-section-type="${type}"`),`${style}/${page}/${type} must render`);
      const section=sections.find(s=>s.id===`slot-${type}-0`);
      assert.ok(section,`${style}/${page}/${type} must be listed`);
      assert.equal(section.label,sectionDisplayName(type));
      const alone=renderStylePreview(designPreviewData(source,model(style,{[page]:[type]})),styleSettings(style),{page});
      assert.ok(designSections(alone,page).sections.some(s=>s.id===section.id),"Toggling another option cannot change its ID");
      const hidden=applyDesignSections(html,{[page]:{hidden:[section.id]}},page);
      assert.doesNotMatch(hidden,new RegExp(`data-section-type="${type}"`));
    }
    assert.deepEqual(source,before,"Previewing options never changes real catalogue or layouts");
    const removed=renderStylePreview(designPreviewData(source,model(style,{[page]:[]})),styleSettings(style),{page});
    assert.doesNotMatch(removed,/data-section-type=/);
  }
});

test("chosen sections render with a real-catalogue design too, without fabricated reviews",()=>{
  for(const style of STYLE_IDS){
    const data=fixture();
    data.settings={...data.settings,...styleSettings(style),
      ann_design:model(style,{home:["lookbook","reviews","trust"]},"own")};
    const html=renderAura(data,{page:"home",preview:true});
    assert.match(html,/data-section-type="lookbook"/,style);
    assert.match(html,/Customer reviews appear here once your store has real ones/);
    assert.match(html,/Add your verified details here/);
    assert.doesNotMatch(html,/data-section-type="founder"/);
  }
});
