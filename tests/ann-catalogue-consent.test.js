import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { attachAnnDesign } from "../src/public/ann-design-ui.js";

const source = await readFile(new URL("../src/public/ann-builder.js", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ saved = true, readOnly = false, themeEditor = false, contextual = false } = {}) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  const events = new Map(), requests = [], activations = [];
  let confirmed = 0, mode = themeEditor ? "store" : "showcase";
  const el = { innerHTML: "", setAttribute() {}, scrollIntoView() {},
    querySelector: () => null, addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { activeElement: null, createElement: () => el };
  const design = { version: 1, style: "editorial", media_pack: "editorial",
    plan: { style_preset: "editorial" }, copy: {}, media: {} };
  globalThis.fetch = async (url, opts) => {
    requests.push(opts);
    if(opts.method==="PATCH"){
      const body=JSON.parse(opts.body);
      for(const [key,value] of Object.entries(body.copy||{})){
        if(value===null)delete design.copy[key];else design.copy[key]=value;
      }
      design.plan=body.answers||design.plan;
      design.sections=body.sections||design.sections;
      design.catalogue_mode=body.catalogue_mode||design.catalogue_mode;
    }
    return new Response(JSON.stringify({
      expected_draft: "2026-10-16T10:00:00.000001Z",
      design: opts.method === "POST" ? { ...design, catalogue_mode: JSON.parse(opts.body).catalogue_mode } : saved ? design : null, images: [],
    }), { status: 200 });
  };
  let answers={style_preset:"editorial"};
  const ui = attachAnnDesign({
    api: "/fixture", root: "/fixture", readOnly, themeEditor, contextual,
    mount: { parentNode: { insertBefore() {} } }, say() {},
    getAnswers: () => answers,applyPlan:p=>{answers=structuredClone(p);},
    getPreviewMode: () => mode,
    onActivated: data => activations.push(data),
    backToDesign: plan => { answers = structuredClone(plan); mode = "store"; },
    onCatalogueConfirmed: () => { confirmed++; mode = "store"; },
  });
  const change = (dataset, checked) => events.get("change")({ target: { dataset, checked } });
  const click = action => events.get("click")({ target: { closest: () => ({ dataset: { designAct: action } }) } });
  return { el, ui, requests, activations, change, click,
    key:key=>events.get("keydown")({key,preventDefault(){},stopPropagation(){}}),
    input:(key,value)=>events.get("input")({target:{dataset:{designInput:key},value}}),
    setPlan:p=>{answers={...answers,...p};ui.planChanged();},
    get confirmed() { return confirmed; },
    close() { Object.assign(globalThis, previous); } };
}

test("saved Ann designs load without automatically consenting to merchant catalogue preview", async () => {
  const h = harness();
  try {
    await tick();
    assert.deepEqual(h.activations, [{ restored: true, useOwnProducts: false }]);
    assert.match(h.el.innerHTML, /Your saved Editorial design/);
    assert.match(h.el.innerHTML, /sample products/);
    h.ui.requestCatalogue();
    assert.match(h.el.innerHTML, /Ready to see your own products/);
    h.click("catalogue");
    assert.equal(h.confirmed, 0, "a button event cannot bypass the unchecked consent");
    h.change({ designCatalogueAck: "" }, true);
    h.click("catalogue");
    assert.equal(h.confirmed, 1);
    assert.equal(h.requests.length, 1, "preview confirmation never writes catalogue, draft or publications");
  } finally { h.close(); }
});

test("resuming an adopted style opens editing without reseeding, catalogue consent or lost local styling",async()=>{
  const h=harness();
  try{
    await tick();
    h.setPlan({accent_color:"#aabbcc"});
    const calls=h.requests.length;
    assert.equal(h.ui.isSavedStyle("editorial"),true);
    assert.equal(h.ui.isSavedStyle("boutique"),false);
    assert.equal(h.ui.resumeEditing(),true);
    assert.equal(h.ui.editing(),true);
    assert.equal(h.ui.previewDesign().plan.accent_color,"#aabbcc");
    assert.equal(h.requests.length,calls,"returning to editing never reseeds or saves");
    assert.equal(h.confirmed,0,"sample design does not require real-catalogue consent");
  }finally{h.close();}
});

test("theme undo groups typing, reverses sections and optional/theme choices, and never writes automatically",async()=>{
  const h=harness({themeEditor:true});
  try{
    await tick();assert.equal(h.ui.canUndo(),false);
    h.input("title","H");h.input("title","Hello");h.input("title","Hello world");
    assert.equal(h.ui.previewDesign().copy.title,"Hello world");
    h.ui.undo();
    assert.equal(h.ui.previewDesign().copy.title,undefined);
    assert.equal(h.ui.canUndo(),false,"One typing burst is one undo step");
    h.setPlan({accent_color:"#ff0000",section_options:{home:["lookbook"]}});
    h.ui.setSections({home:{hidden:["slot-lookbook-0"]}});
    h.ui.undo();assert.deepEqual(h.ui.previewDesign().sections,{});
    assert.equal(h.ui.previewDesign().plan.accent_color,"#ff0000");
    h.ui.undo();assert.equal(h.ui.previewDesign().plan.accent_color,undefined);
    assert.equal(h.ui.previewDesign().plan.section_options,undefined);
    assert.equal(h.requests.length,1,"Undo does not write drafts or publish");
    assert.equal(h.ui.hasUnsavedChanges(),false);
  }finally{h.close();}
});

test("undo survives saves in the current session and saves deletion of newly added copy overrides",async()=>{
  const h=harness({themeEditor:true});
  try{
    await tick();
    const key="section.home.slot-craft-0.text0";
    h.input(key,"Our craft");await h.ui.save();
    assert.equal(h.ui.canUndo(),true);
    h.ui.undo();assert.equal(h.ui.previewDesign().copy[key],undefined);
    assert.equal(h.ui.canSave(),true);
    await h.ui.save();
    const body=JSON.parse(h.requests.at(-1).body);
    assert.equal(body.copy[key],null,"Reset needs an explicit tombstone, not an omitted PATCH field");
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.equal(h.ui.previewDesign().copy[key],undefined);
    assert.equal(h.ui.canUndo(),false);
    await h.ui.reload();assert.equal(h.ui.canUndo(),false);
  }finally{h.close();}
});

test("read-only theme viewers cannot undo even after simulated mutations",async()=>{
  const h=harness({themeEditor:true,readOnly:true});
  try{
    await tick();h.input("title","Cannot change");
    h.ui.setSections({home:{hidden:["slot-lookbook-0"]}});
    h.ui.undo();assert.equal(h.ui.canUndo(),false);
    assert.equal(h.ui.previewDesign().copy.title,undefined);
  }finally{h.close();}
});

test("declining merchant catalogue keeps samples and requires fresh consent next time", async () => {
  const h = harness();
  try {
    await tick();
    h.ui.requestCatalogue();
    h.change({ designCatalogueAck: "" }, true);
    h.click("samples");
    assert.equal(h.confirmed, 0);
    h.ui.requestCatalogue();
    h.click("catalogue");
    assert.equal(h.confirmed, 0);
    assert.equal(h.requests.length, 1);
  } finally { h.close(); }
});

test("adopting a design requires separate explicit catalogue consent, not just replacement consent", async () => {
  const h = harness({ saved: false });
  try {
    await tick();
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 1);
    h.change({ designAck: "" }, true);
    h.change({ designCatalogueAck: "" }, true);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].method, "POST");
    assert.deepEqual(h.activations, [{ restored: false, useOwnProducts: true }]);
  } finally { h.close(); }
});

test("pending theme editor exposes confirmation and unlocks edits after adopting samples", async () => {
  const h = harness({ saved: false, themeEditor: true });
  try {
    await tick();
    assert.equal(h.ui.active(), false);
    assert.match(h.el.innerHTML, /Confirm below, then choose Use this design to unlock editing/);
    assert.doesNotMatch(h.el.innerHTML, /<details\b/);
    assert.match(h.el.innerHTML, /data-design-ack/);
    assert.match(h.el.innerHTML, /data-design-act="use" disabled/);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 1, "Opening the editor cannot adopt a design");
    h.change({ designAck: "" }, true);
    assert.match(h.el.innerHTML, /data-design-act="use" >Use this design/);
    h.click("use");
    await tick();
    assert.equal(h.ui.active(), true);
    assert.equal(h.ui.editing(), true);
    assert.equal(JSON.parse(h.requests[1].body).catalogue_mode, "sample");
    assert.deepEqual(h.activations, [{ restored: false, useOwnProducts: false }]);
  } finally { h.close(); }
});

test("inline text and image selection opens their editors, including after editing was switched off",async()=>{
  const h=harness({themeEditor:true});
  try{
    await tick();
    const events=new Map();
    const nodes=["title","hero"].map(key=>({
      dataset:key==="title"?{designCopy:key}:{designImage:key},
      setAttribute(){},removeAttribute(){},
    }));
    const previousCSS=globalThis.CSS;
    globalThis.CSS={escape:value=>value};
    const doc={querySelector:selector=>nodes.find(n=>selector.includes(`="${n.dataset.designCopy||n.dataset.designImage}"`))||null,
      querySelectorAll:()=>nodes,addEventListener:(name,fn)=>events.set(name,fn)};
    h.ui.bindPreview(doc);
    for(const n of nodes){
      events.get("click")({target:{closest:()=>n},preventDefault(){},stopImmediatePropagation(){}});
      assert.match(h.el.innerHTML,n.dataset.designCopy?/data-design-input="title"/:/data-design-file/);
    }
    h.click("toggle");
    assert.equal(h.ui.editing(),false);
    h.ui.selectContent("copy","title");
    assert.equal(h.ui.editing(),true);
    assert.match(h.el.innerHTML,/data-design-input="title"/);
    assert.equal(h.ui.canPublish(),true);
    globalThis.CSS=previousCSS;
  }finally{h.close();}
});

test("read-only Ann participants cannot adopt designs even if consent events are simulated", async () => {
  const h = harness({ saved: false, readOnly: true });
  try {
    await tick();
    h.change({ designAck: "" }, true);
    h.change({ designCatalogueAck: "" }, true);
    h.click("use");
    await tick();
    assert.equal(h.requests.length, 1);
  } finally { h.close(); }
});

test("Escape from a parent contextual text field dismisses the panel without disabling editing",async()=>{
  const h=harness({themeEditor:true,contextual:true});
  try{
    await tick();
    h.ui.selectContent("copy","title");
    assert.match(h.el.innerHTML,/class="ann-ctx"/);
    assert.match(h.el.innerHTML,/data-design-input="title"/);
    h.key("Escape");
    assert.doesNotMatch(h.el.innerHTML,/class="ann-ctx"/);
    assert.equal(h.ui.editing(),true);
  }finally{h.close();}
});

test("every Ann visit resets old browser preferences to samples and automatic callbacks cannot bypass consent", () => {
  assert.doesNotMatch(source, /sessionStorage\.getItem\(previewModeKey\)/);
  assert.match(source, /let previewMode = "showcase"/);
  const code = source.slice(source.indexOf("function setPreviewMode("), source.indexOf("function rememberScroll("));
  const context = vm.createContext({
    previewMode: "showcase", ownProductsConfirmed: false, pendingCatalogueAction: null,
    previewSource: { products: [{ id: "merchant-product" }] }, productId: "old", collectionId: "old",
    rememberScroll() {}, say() {}, base: null, asked: 0,
    designUI: { active: () => context.designActive, requestCatalogue() { context.asked++; } }, designActive: false,
    stylePreviewData: (data, options) => ({ ...data, ...options }),
  });
  vm.runInContext(code, context);
  vm.runInContext('setPreviewMode("store")', context);
  assert.equal(context.previewMode, "showcase");
  vm.runInContext("requestOwnProducts()", context);
  assert.equal(context.asked, 1);
  assert.equal(context.previewMode, "showcase");
  vm.runInContext('ownProductsConfirmed = true; requestOwnProducts()', context);
  assert.equal(context.previewMode, "store");
  assert.equal(context.previewSource.products[0].id, "merchant-product");
  // A saved sample-catalogue design is viewable as Your store without own-products consent.
  context.ownProductsConfirmed = false; context.designActive = true; context.previewMode = "showcase";
  vm.runInContext('setPreviewMode("store")', context);
  assert.equal(context.previewMode, "store");
  assert.equal(context.ownProductsConfirmed, false);
});
