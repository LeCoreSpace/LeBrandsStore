import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutIllustration, openSectionLibrary } from "../src/public/section-library-ui.js";

test("layout illustration is labeled, deterministic and neutral", () => {
  const a = layoutIllustration("faq");
  assert.equal(a, layoutIllustration("faq"));
  assert.match(a, /aria-label="Layout illustration"/);
});
test("workspace wires the library through setExtra only when ready and editable", () => {
  const src = readFileSync("src/public/ann-design-workspace.js", "utf8");
  assert.match(src, /data-ws-library/);
  assert.match(src, /!ready\(\) \|\| readOnly \|\| o\.getPage\(\)!==pg \|\| !ANN_EXTRA_SECTIONS\[pg\]\?\.includes\(t\)/);
  assert.match(src, /o\.setExtra\(t,on\)/);
  assert.doesNotMatch(src, /data-ws-extra/);
});

// Lightweight DOM boundary for event/state contracts, not a browser-layout test.
function harness(overrides={}) {
  const original=globalThis.document, nodes=new Map(), listeners=new Map();
  const doc={activeElement:null,body:{style:{overflow:"auto"},appendChild(){}},
    addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:"",selectionStart:0,selectionEnd:0,
      focus(){doc.activeElement=this;},setSelectionRange(){}});
    return nodes.get(selector);
  };
  const dlg={innerHTML:"",querySelector:node,querySelectorAll:()=>[node("first"),node("last")],contains:n=>[...nodes.values()].includes(n)};
  const events={},root={firstElementChild:dlg,addEventListener:(k,v)=>events[k]=v,remove(){this.removed=true;}};
  doc.createElement=()=>root;
  globalThis.document=doc;
  let selected=[],changes=[];
  const api=openSectionLibrary({host:doc.body,page:"home",allowedTypes:["faq"],selectedTypes:()=>selected,
    readOnly:false,ready:()=>true,onToggle:(type,on)=>{changes.push([type,on]);selected=on?[type]:[];},...overrides});
  return {api,dlg,doc,changes,listeners,
    click:dataset=>events.click({target:{closest:()=>({dataset,disabled:false})}}),
    input:value=>events.input({target:{value,matches:s=>s==="[data-sl-q]"}}),
    cleanup(){api.close();globalThis.document=original;}};
}
test("library events filter families and add/remove supported optional types only",()=>{
  const h=harness();
  try{
    assert.match(h.dlg.innerHTML,/Hero Banner/);
    h.input("size guide");
    assert.match(h.dlg.innerHTML,/Size Guide/);
    assert.doesNotMatch(h.dlg.innerHTML,/Hero Banner/);
    h.input("no matching section");
    assert.match(h.dlg.innerHTML,/No sections match/);
    h.click({slOpen:"faq"});
    h.click({slAdd:"faq",on:"1"});
    assert.deepEqual(h.changes,[["faq",true]]);
    assert.match(h.dlg.innerHTML,/added to the Home page/);
    h.click({slAdd:"faq",on:"0"});
    assert.deepEqual(h.changes,[["faq",true],["faq",false]]);
    h.click({slAdd:"bundle",on:"1"});
    assert.equal(h.changes.length,2);
    assert.equal(h.doc.body.style.overflow,"hidden");
  }finally{h.cleanup();}
  assert.equal(h.doc.body.style.overflow,"auto");
});
test("read-only and unready library dialogs never mutate sections",()=>{
  for(const override of [{readOnly:true},{ready:()=>false}]){
    const h=harness(override);
    try{
      h.click({slOpen:"faq"});
      assert.match(h.dlg.innerHTML,/data-sl-add="faq"[^>]* disabled/);
      h.click({slAdd:"faq",on:"1"});
      assert.equal(h.changes.length,0);
    }finally{h.cleanup();}
  }
});
test("failed mutations are not reported as successful and Escape restores the current trigger",()=>{
  let refreshed=false,focused=false;
  const h=harness({onToggle(){},onClose:()=>{refreshed=true;},returnFocus:()=>({focus:()=>{focused=refreshed;}})});
  try{
    h.click({slOpen:"faq"});
    h.click({slAdd:"faq",on:"1"});
    assert.match(h.dlg.innerHTML,/could not be added/);
    h.listeners.get("keydown")({key:"Escape",preventDefault(){},stopPropagation(){}});
    assert.equal(focused,true);
    assert.equal(h.listeners.has("keydown"),false);
  }finally{h.cleanup();}
});
