import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Execute the real page controller with small DOM/dependency doubles. No
// account, network or merchant data is involved in sidebar navigation checks.
function editor(role="owner"){
  const events=new Map(),nodes=new Map(),calls=[];
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
    renderStylePreview:()=>"<main>Preview</main>",designSections:()=>({sections:[{id:"main-hero-0",label:"Hero"}]}),
    annPreviewConfiguration:()=>({theme:{}}),ANN_EXTRA_SECTIONS:{home:["lookbook"]},
    ANN_SECTION_LABELS:{lookbook:"Lookbook"},DESIGN_COPY_LIMITS:{title:100},DESIGN_MEDIA_KEYS:["hero"],
  });
  const source=readFileSync(new URL("../src/public/ann-theme-editor.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"");
  vm.runInContext(source,context);
  const emit=(type,target,extra={})=>{
    for(const fn of events.get(type)||[])fn({target:{...target,closest:()=>target},preventDefault(){},...extra});
  };
  return {get,tabs,calls,emit,controller};
}

test("editor panels switch with clicks and keyboard and survive page/canvas refresh",()=>{
  const h=editor();
  h.emit("click",h.tabs[2]);
  assert.equal(h.get("#ae-tools").dataset.tab,"style");
  assert.equal(h.get("#ae-content").attrs["aria-labelledby"],"ae-tab-style");
  assert.equal(h.tabs[2].attrs["aria-selected"],true);
  h.emit("change",{id:"ae-page-select",value:"about"});
  assert.equal(h.get("#ae-page-select").value,"about");
  assert.equal(h.get("#ae-tools").dataset.tab,"style","Preview refresh retains the selected panel");
  h.emit("keydown",h.tabs[2],{key:"Home"});
  assert.equal(h.get("#ae-tools").dataset.tab,"sections");
  assert.equal(h.tabs[0].focused,true);
  h.emit("keydown",h.tabs[0],{key:"ArrowRight"});
  assert.equal(h.get("#ae-tools").dataset.tab,"content");
  assert.equal(h.get("#ae-content").attrs["aria-labelledby"],"ae-tab-content");
  h.emit("click",{dataset:{aeEdit:"copy",key:"title"}});
  assert.deepEqual(h.calls,[["select","copy","title"]]);
});

test("new section controls preserve editing hooks and read-only boundaries",()=>{
  const h=editor();
  assert.match(h.get("#ae-sections").innerHTML,/data-ae-edit="section" data-key="main-hero-0"/);
  assert.match(h.get("#ae-sections").innerHTML,/data-ae-extra="lookbook"/);
  h.emit("click",{dataset:{aeSection:"main-hero-0"},hasAttribute:()=>true});
  assert.deepEqual(h.calls,[["sections"]]);
  const viewer=editor("viewer");
  viewer.emit("change",{dataset:{aeExtra:"lookbook"},checked:true});
  viewer.emit("click",{dataset:{aeSection:"main-hero-0"},hasAttribute:()=>true});
  assert.deepEqual(viewer.calls,[]);
  assert.match(viewer.get("#ae-sections").innerHTML,/data-ae-extra="lookbook" disabled/);
  assert.equal(viewer.get("#ae-own").disabled,true);
  viewer.emit("change",{id:"ae-page-select",value:"product"});
  assert.equal(viewer.get("#ae-page-select").value,"product","Read-only members can still preview pages");
});
