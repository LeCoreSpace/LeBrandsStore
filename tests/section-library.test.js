import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_LIBRARY, SECTION_CATEGORIES, SECTION_THEMES, libraryEntries, sectionLibraryEntry, sectionDisplayName, selectedLibraryTypes } from "../src/public/section-library.js";
import { ANN_EXTRA_SECTIONS } from "../src/public/ann-config.js";
import { designSections, applyDesignSections, validDesignSections } from "../src/public/ann-section-layout.js";

test("catalogue has unique universal names, categories and stable family identities",()=>{
  assert.equal(SECTION_LIBRARY.length,39);
  assert.equal(new Set(SECTION_LIBRARY.map(s=>s.id)).size,39);
  assert.equal(new Set(SECTION_LIBRARY.map(s=>s.name)).size,39);
  for(const s of SECTION_LIBRARY){
    assert.ok(SECTION_CATEGORIES.some(c=>c.id===s.category));
    assert.ok(s.description);
    assert.ok(s.layouts.length);
    for(const t of s.themeIds)assert.ok(SECTION_THEMES.some(x=>x.id===t));
    assert.equal(sectionLibraryEntry(s.id),s);
    for(const alias of s.aliases)assert.equal(sectionLibraryEntry(alias),s);
  }
});
test("legacy optional keys map to universal families without changing stored types",()=>{
  for(const types of Object.values(ANN_EXTRA_SECTIONS)) for(const type of types) {
    const entry=sectionLibraryEntry(type);
    assert.ok(entry,`missing ${type}`);
    assert.equal(entry.optionalType,type);
  }
  assert.equal(sectionDisplayName("lookbook"),"Image Gallery");
  assert.equal(sectionDisplayName("ed-shelf"),"Product Grid");
  assert.equal(sectionDisplayName("unknown","Merchant heading"),"Merchant heading");
});
test("search includes legacy labels, category words and available source layouts",()=>{
  assert.equal(libraryEntries({query:"lookbook"})[0].name,"Image Gallery");
  assert.ok(libraryEntries({query:"boutique hero"}).some(s=>s.id==="hero-banner"));
  assert.ok(libraryEntries({category:"trust"}).every(s=>s.category==="trust"));
  assert.equal(libraryEntries({query:"<script>"}).length,0);
  assert.equal(libraryEntries({category:"invalid"}).length,0);
  assert.ok(libraryEntries({theme:"boutique"}).some(s=>s.id==="before-after"));
  assert.ok(!libraryEntries({theme:"vintage"}).some(s=>s.id==="before-after"));
});
test("insertion eligibility only reflects original page rules, never theme or search",()=>{
  for(const [page,allowedTypes] of Object.entries(ANN_EXTRA_SECTIONS)) {
    const available=libraryEntries({allowedTypes}).filter(s=>s.available).map(s=>s.optionalType).sort();
    assert.deepEqual(available,[...allowedTypes].sort(),page);
  }
  assert.ok(libraryEntries().every(s=>!s.available));
  assert.ok(libraryEntries({allowedTypes:["header","footer","bundle","product-grid"]}).every(s=>!s.available));
  assert.equal(libraryEntries({allowedTypes:["faq"],selectedTypes:["faq"]}).find(s=>s.id==="faq").selected,true);
});
test("universal labels retain saved section IDs, order, content and required protection",()=>{
  const html='<main><section class="ed-hero"><h1>Merchant title</h1></section><section class="ed-shelf"><h2>Our edit</h2></section><section data-section-type="lookbook"><h2>Journal</h2></section></main>';
  const sections=designSections(html).sections;
  assert.deepEqual(sections.map(s=>s.id),["slot-ed-hero-0","slot-ed-shelf-0","slot-lookbook-0"]);
  assert.deepEqual(sections.map(s=>s.label),["Hero Banner","Product Grid","Image Gallery"]);
  const config={home:{order:["slot-ed-shelf-0","slot-ed-hero-0"],hidden:["slot-lookbook-0"]}};
  assert.ok(validDesignSections(config));
  const arranged=applyDesignSections(html,config);
  assert.ok(arranged.indexOf("Our edit")<arranged.indexOf("Merchant title"));
  assert.ok(!arranged.includes("Journal"));
  assert.equal(designSections('<main><section class="ar-pdp">Buy</section></main>',"product").sections[0].id,"slot-core-product-0");
  assert.equal(validDesignSections({product:{hidden:["slot-core-product-0"]}}),false);
});
test("removed optional sections are not reported as on-page and remain restorable",()=>{
  const info={meta:new Map([["slot-lookbook-0",{hidden:true}],["slot-faq-0",{hidden:false}]]),
    map:new Map([["slot-lookbook-0",{type:"lookbook"}],["slot-faq-0",{type:"faq"}]])};
  assert.deepEqual(selectedLibraryTypes(["lookbook","faq"],info),["faq"]);
  info.meta.get("slot-lookbook-0").hidden=false;
  assert.deepEqual(selectedLibraryTypes(["lookbook","faq"],info),["lookbook","faq"]);
  assert.deepEqual(selectedLibraryTypes(undefined),[]);
});
