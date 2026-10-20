import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { sectionMeta, nextSections } from "../src/public/ann-design-workspace.js";
import {stylePreviewData,designPreviewData,renderStylePreview} from "../src/public/style-preview.js";
import {styleSettings} from "../src/public/aura-styles.js";

const html = '<main><section class="ar-stats"><p>Highlights</p></section><section class="sc-sec sc-offers"><p>Offers</p></section></main>';

test("restored and newly adopted merchant designs open the workspace without opening read-only controls",()=>{
  const src=readFileSync("src/public/ann-builder.js","utf8");
  const callback=src.slice(src.indexOf("onActivated:")+"onActivated:".length,src.indexOf("onChange:")).trim().replace(/,$/,"");
  for(const restored of [false,true])for(const readOnly of [false,true]){
    let opened=0;
    const context={structuredClone,readOnly,answers:{},ownProductsConfirmed:false,previewSource:{products:[]},
      workspaceUI:{refresh(){},open(){opened++;}},setPreviewMode(){},draw(){},renderPreview(){},say(){}};
    const activate=vm.runInNewContext(`(${callback})`,context);
    activate({restored});
    assert.equal(opened,readOnly?0:1);
  }
});

test("workspace control is clearly named and resumes the saved draft even while browsing a different showcase",()=>{
  const b=readFileSync("src/public/ann-builder.js","utf8"),ui=readFileSync("src/ui/ann-builder.js","utf8");
  assert.match(ui,/data-ws-toggle[^>]*>Design workspace</);
  const click=b.slice(b.indexOf('if ("wsToggle" in d)'),b.indexOf("if (d.viewSwitch)"));
  assert.match(click,/previewMode === "showcase" && designUI\?\.active\(\)/);
  assert.match(click,/designUI\.resumeEditing\(\)/);
});

test("shared showcase data removes saved merchant design while editable sample draft preserves it",()=>{
  const design={version:1,style:"boutique",catalogue_mode:"sample",plan:{style_preset:"boutique"},copy:{title:"Merchant copy only"},media:{},sections:{}};
  const source={store:{name:"Example"},settings:{brand_name:"Example",ann_design:design},products:[],collections:[],layouts:{},policies:[]};
  const original=structuredClone(source);
  assert.equal(stylePreviewData(source,{showcase:true}).settings.ann_design,undefined);
  assert.equal(designPreviewData(source,design).settings.ann_design.copy.title,"Merchant copy only");
  assert.doesNotMatch(renderStylePreview(stylePreviewData(source,{showcase:true}),styleSettings("boutique"),{page:"home"}),/Merchant copy only/);
  assert.match(renderStylePreview(designPreviewData(source,design),styleSettings("boutique"),{page:"home"}),/Merchant copy only/);
  assert.deepEqual(source,original);
});
test("Ann composer relocation excludes local design editors and the shared workspace",()=>{
  const source=readFileSync("src/public/ann-reply-fields.js","utf8");
  const exclusions=source.match(/n\.closest\("(#ann-composer[^"]+)"\)/)?.[1].split(/,\s*/);
  for(const selector of ["#ann-composer",".ann-ctx",".aw","#ann-design"])assert.ok(exclusions?.includes(selector),selector);
});

test("reselecting or keeping the adopted style resumes editing, and browser preview is outside More",()=>{
  const source=readFileSync("src/public/ann-builder.js","utf8");
  const choose=source.slice(source.indexOf("function chooseStyle("),source.indexOf("function advance("));
  assert.match(choose,/isSavedStyle\(value\)/);
  assert.ok(choose.indexOf("resumeEditing()")<choose.indexOf('setPreviewMode("showcase")'));
  assert.match(source,/chooseStyle\(v\)/);
  assert.match(source,/chooseStyle\(d\.pickStyle\)/);
  assert.match(source,/if \("wsToggle" in d\)[^]*?active\(\)[^]*?resumeEditing\(\)/);
  const html=readFileSync("src/ui/ann-builder.js","utf8");
  assert.ok(html.indexOf('id="ann-open-browser"')<html.indexOf('<details class="ann-tb-d ann-more"'));
});

test("section metadata is computed per page and orders sections", () => {
  const { meta, order } = sectionMeta(html, {}, "home");
  assert.equal(meta.size, order.length);
  assert.ok(order.length >= 1);
  [...meta.values()].forEach((m, i) => assert.equal(m.index, i));
});

test("nextSections never mutates its input and rejects unknown ids", () => {
  const cfg = { home: { order: [], hidden: [] } }, copy = structuredClone(cfg);
  assert.equal(nextSections(html, cfg, "home", "nope", "toggle"), null);
  const { order } = sectionMeta(html, cfg, "home");
  const out = nextSections(html, cfg, "home", order[0], "toggle");
  assert.deepEqual(cfg, copy);
  if (out) assert.ok(out.home.hidden.includes(order[0]));
});

test("Ann wires the shared contextual controller and keeps one draft", () => {
  const src = readFileSync("src/public/ann-builder.js", "utf8");
  assert.match(src, /attachAnnDesign\(\{[^]*contextual: true/);
  assert.match(src, /attachAnnWorkspace/);
  assert.doesNotMatch(src, /Explore with sample products, then choose your own whenever you are ready\.\" : \"Your design is saved/);
  const onAct = src.slice(src.indexOf("onActivated:"), src.indexOf("onChange:"));
  assert.match(onAct, /restored/);
});

test("workspace is a drawer in the preview, not a third grid column, and module is served", () => {
  const ui = readFileSync("src/ui/ann-builder.js", "utf8");
  assert.match(ui, /id="ann-tools"/);
  assert.match(ui, /ann-canvas" data-device="desktop" data-tools="closed"/);
  assert.match(readFileSync("src/index.js", "utf8"), /"ann-design-workspace\.js"/);
  assert.doesNotMatch(readFileSync("src/public/ann-design-ui.js", "utf8").match(/const CTX_CSS = .*/)[0], /\u2014/);
});

test("sample adoption shows Your store; showcase is never overlaid or editable", () => {
  const b = readFileSync("src/public/ann-builder.js", "utf8"), u = readFileSync("src/public/ann-design-ui.js", "utf8");
  const act = b.slice(b.indexOf("onActivated:"), b.indexOf("onChange:"));
  assert.match(act, /setPreviewMode\("store", previewSource\)/);
  assert.doesNotMatch(act, /"showcase", previewSource/);
  assert.match(b, /const dsg = previewMode === "store" \? candidate : null;/);
  assert.doesNotMatch(b, /candidate\?\.catalogue_mode==="sample" \? candidate/);
  assert.match(b, /!ownProductsConfirmed && !designUI\?\.active\(\)/);
  assert.match(b, /d\.previewMode === "store" && !designUI\?\.active\(\) && !requestOwnProducts/);
  assert.match(b, /backToDesign: plan => \{ answers[^]*setPreviewMode\("store"\)/);
  assert.match(b, /canEdit: \(\) => editorAccess\.allowed && previewMode === "store" && Boolean\(designUI\?\.previewDesign\(\)\)/);
  assert.match(u, /const editing = \(\) => active\(\) && !readOnly && editMode && mode\(\) === "store" && sameStyle\(\)/);
  assert.doesNotMatch(u, /catalogue_mode==="sample"\) && sameStyle/);
});

test("section metadata cache key includes optional section choices; own-products consent stays explicit", () => {
  const b = readFileSync("src/public/ann-builder.js", "utf8");
  assert.match(b, /d\?\.sections, answers\.section_options, displayedKey/);
  assert.match(b, /onCatalogueConfirmed/);
});
