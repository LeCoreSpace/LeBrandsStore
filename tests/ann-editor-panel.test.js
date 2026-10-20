import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {instanceOnlySections} from "../src/public/section-instance-model.js";
import {sectionMeta,nextSections} from "../src/public/ann-design-workspace.js";

// Execute the real page controller with small DOM/dependency doubles. No
// account, network or merchant data is involved in sidebar navigation checks.
function editor(role="owner"){
  const events=new Map(),nodes=new Map(),calls=[];
  let workspaceOptions,refreshes=0;
  const node=()=>({
    dataset:{},attrs:{},style:{},disabled:false,hidden:false,innerHTML:"",
    querySelectorAll:()=>[],querySelector:()=>null,contains:()=>false,
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    focus(){this.focused=true;},addEventListener(){},classList:{toggle(){}},
  });
  const get=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);};
  const tabs=["sections","content","style"].map(name=>Object.assign(node(),{dataset:{aeTab:name}}));
  const design={style:"editorial",plan:{style_preset:"editorial"},copy:{},media:{},sections:{},catalogue_mode:"sample"};
  get("#ae-data").textContent=JSON.stringify({store:{store_id:"fixture",name:"Example"},role,settings:{ann_design:design}});
  get("#ae-frame").parentElement={clientWidth:1100,clientHeight:800,style:{}};
  const controller={
    active:()=>true,canUndo:()=>false,canSave:()=>false,canPublish:()=>role==="owner",
    previewDesign:()=>design,editing:()=>true,
    selectContent:(...args)=>calls.push(["select",...args]),
    setSections:value=>{design.sections=value;calls.push(["sections"]);},
    planChanged:()=>calls.push(["plan"]),undo:()=>calls.push(["undo"]),
  };
  const context=vm.createContext({
    document:{querySelector:get,querySelectorAll:s=>s==="[data-ae-tab]"?tabs:[],activeElement:null,
      addEventListener:(type,fn)=>{const list=events.get(type)||[];list.push(fn);events.set(type,list);}},
    window:{addEventListener(){}},CSS:{escape:v=>v},ResizeObserver:class{observe(){}},structuredClone,setTimeout,clearTimeout,queueMicrotask,
    attachAnnDesign:()=>controller,designPreviewData:(source,d)=>({...source,settings:{...source.settings,ann_design:d}}),
    attachAnnWorkspace:options=>{workspaceOptions=options;return{slot:()=>get("#context-slot"),refresh(){refreshes++;}};},
    sectionMeta,nextSections,instanceOnlySections,
    renderStylePreview:()=>"<main><section><h1>Preview</h1></section></main>",designSections:()=>({sections:[{id:"main-0",label:"Hero"}]}),
    annPreviewConfiguration:()=>({theme:{}}),ANN_EXTRA_SECTIONS:{home:["lookbook"]},
    ANN_SECTION_LABELS:{lookbook:"Lookbook"},DESIGN_COPY_LIMITS:{title:100},DESIGN_MEDIA_KEYS:["hero"],
  });
  const source=readFileSync(new URL("../src/public/ann-theme-editor.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"");
  vm.runInContext(source,context);
  const emit=(type,target,extra={})=>{
    for(const fn of events.get(type)||[])fn({target:{...target,closest:()=>target},preventDefault(){},...extra});
  };
  return {get,tabs,calls,emit,controller,workspace:workspaceOptions,get refreshes(){return refreshes;}};
}

test("standalone editor delegates sidebar lifecycle and page changes to the shared workspace",()=>{
  const h=editor();
  assert.equal(h.workspace.variant,"sidebar");
  assert.equal(h.workspace.mount,h.get("#ae-tools"));
  assert.equal(h.workspace.controller(),h.controller);
  assert.equal(h.workspace.getPage(),"home");
  const count=h.refreshes;
  h.workspace.setPage("about");
  assert.equal(h.workspace.getPage(),"about");
  assert.ok(h.refreshes>count,"Page changes refresh the existing shared panel, not an old separate tab bar");
  assert.equal(h.workspace.readOnly,false);
});

test("new section controls preserve editing hooks and read-only boundaries",()=>{
  const h=editor();
  assert.ok(h.workspace.sectionInfo().meta.has("main-0"));
  h.workspace.onSectionAction("main-0","toggle");
  assert.deepEqual(h.calls,[["sections"]]);
  const viewer=editor("viewer");
  assert.equal(viewer.workspace.readOnly,true);
  viewer.workspace.setExtra("lookbook",true);
  viewer.workspace.onSectionAction("main-0","toggle");
  assert.deepEqual(viewer.calls,[]);
  viewer.workspace.setPage("product");
  assert.equal(viewer.workspace.getPage(),"product","Read-only members can still preview pages");
});
