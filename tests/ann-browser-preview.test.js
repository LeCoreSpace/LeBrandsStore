import test, {mock} from "node:test";
import assert from "node:assert/strict";
import {stylePreviewData} from "../src/public/style-preview.js";
import {renderAnnBuilder} from "../src/ui/ann-builder.js";
mock.module("../src/public/aura-ui.js",{namedExports:{attachAuraSearch(){},attachAuraCatalog(){}}});
const {browserPreviewLocation,openAnnBrowserPreview}=await import("../src/public/ann-browser-preview.js");

const origin="https://preview.example.test";
const data={store:{name:"Example Studio"},settings:{},products:[{id:"sample-shirt"}],
  collections:[{id:"sample-collection",slug:"everyday"}],layouts:{}};
test("browser preview navigates recognised storefront pages and rejects external or executable URLs",()=>{
  assert.deepEqual(browserPreviewLocation("/products/sample-shirt",data,origin),{page:"product",productId:"sample-shirt"});
  assert.deepEqual(browserPreviewLocation("/collections/everyday",data,origin),{page:"collection",collectionId:"sample-collection"});
  assert.deepEqual(browserPreviewLocation("/collections/all",data,origin),{page:"collection",collectionId:undefined});
  for(const [path,page] of [["/","home"],["/cart","cart"],["/checkout","checkout"],["/pages/about","about"],["/pages/contact","contact"]])
    assert.deepEqual(browserPreviewLocation(path,data,origin),{page});
  for(const path of ["https://other.example/checkout","javascript:alert(1)","/api/checkout","/products/unknown","/products/%invalid"])
    assert.equal(browserPreviewLocation(path,data,origin),null);
});
function fakeWindow(){
  const nodes=[];
  const node=tag=>{const n={tag,children:[],dataset:{},attrs:{},events:{},
    append(...children){this.children.push(...children);},
    setAttribute(key,value){this.attrs[key]=value;},
    addEventListener(name,fn){this.events[name]=fn;}};nodes.push(n);return n;};
  const doc={head:node("head"),body:node("body"),createElement:node};
  const win={document:doc,opener:{},close(){this.closed=true;}};
  return {win,nodes};
}
test("new-tab preview uses an isolated catalogue and bag, restrictive sandbox, working viewport controls and no publishing",()=>{
  const {win,nodes}=fakeWindow();
  const sample=stylePreviewData({...data,products:[],collections:[]},{showcase:true});
  const before=structuredClone(sample),bag=new Map([[sample.products[0].id,2]]);
  assert.equal(openAnnBrowserPreview({data:sample,theme:{style_preset:"editorial"},bag,device:"mobile"},
    {openWindow:()=>win}),true);
  const frame=nodes.find(n=>n.tag==="iframe");
  assert.equal(win.opener,null);
  assert.equal(frame.attrs.sandbox,"allow-same-origin");
  assert.equal(frame.attrs.referrerpolicy,"no-referrer");
  assert.match(frame.srcdoc,/<!doctype html>/i);
  assert.equal(frame.dataset.device,"mobile");
  const desktop=nodes.find(n=>n.textContent==="Desktop"),mobile=nodes.find(n=>n.textContent==="Mobile");
  desktop.events.click();assert.equal(frame.dataset.device,"desktop");assert.equal(desktop.attrs["aria-pressed"],"true");
  mobile.events.click();assert.equal(frame.dataset.device,"mobile");
  nodes.find(n=>n.textContent==="Close preview").events.click();assert.equal(win.closed,true);
  assert.deepEqual(sample,before);assert.deepEqual([...bag],[[sample.products[0].id,2]]);
  assert.match(nodes.find(n=>n.tag==="p").textContent,/No orders or payments/);
});
test("blocked browser windows return a recoverable result",()=>{
  assert.equal(openAnnBrowserPreview({},{openWindow:()=>null}),false);
});
test("Ann supplies brand-name and username labels without exposing user details or unsafe HTML",()=>{
  const actor=html=>JSON.parse(html.match(/<script[^>]*id="ann-data"[^>]*>([\s\S]*?)<\/script>/)[1]).speakerName;
  assert.equal(actor(renderAnnBuilder({store:{name:"FunStyle"}},{username:"owner",name:"Other"})),"FunStyle");
  assert.equal(actor(renderAnnBuilder({},{username:"owner",name:"Other"})),"owner");
  assert.equal(actor(renderAnnBuilder({},{name:"Morgan"})),"Morgan");
  assert.equal(actor(renderAnnBuilder({})),"You");
  const html=renderAnnBuilder({store:{name:"</script><script>bad()</script>"}});
  assert.ok(!html.includes("<script>bad()</script>"));
  assert.match(html,/id="ann-open-browser">Open browser preview<\/button>/);
});
