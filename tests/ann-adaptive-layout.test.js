import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {mountAnnAdaptiveLayout} from "../src/public/ann-adaptive-layout.js";

class Node extends EventTarget {
  dataset = {}; attributes = {}; hidden = false; disabled = false;
  children = []; scrollTop = 73; value = "My unsaved answer";
  setAttribute(name,value) { this.attributes[name]=value; }
  querySelector(selector) { return this.nodes?.[selector]||null; }
  insertBefore(node) { this.children.push(node);node.parent=this; }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this); }
}
function setup(narrow=false) {
  const app=new Node(),frame=new Node(),chat=new Node(),stage=new Node(),menu=new Node(),grid=new Node(),mq=new Node(),win=new Node();
  frame.contentDocument=new Node();frame.srcdoc="<p>Keep this exact document</p>";
  app.nodes={".ann-grid":grid,".ann-chat":chat,".ann-stage":stage,"#ann-more .ann-more-menu":menu};
  mq.matches=narrow;win.matchMedia=()=>mq;
  const previous={window:globalThis.window,document:globalThis.document};
  globalThis.window=win;globalThis.document={createElement:()=>new Node()};
  const api=mountAnnAdaptiveLayout({app,frame});
  const fire=(target,type,drag=false)=>{const event=new Event(type);Object.defineProperty(event,"target",{value:{closest:()=>drag?{}:null}});target.dispatchEvent(event);};
  return {app,frame,chat,stage,menu,mq,win,api,fire,button:menu.children[0],
    cleanup(){api.destroy();for(const key of["window","document"]){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}}};
}

test("Ann adapts to intentional panel input without replacing or resetting content",()=>{
  const h=setup();try{
    assert.equal(h.app.dataset.split,"chat");
    const doc=h.frame.contentDocument,src=h.frame.srcdoc;
    h.fire(h.stage,"pointerenter");assert.equal(h.app.dataset.split,"chat");
    h.fire(h.stage,"pointerdown");assert.equal(h.app.dataset.split,"preview");
    h.fire(h.chat,"focusin");assert.equal(h.app.dataset.split,"chat");
    h.fire(doc,"focusin");assert.equal(h.app.dataset.split,"preview");
    h.fire(h.chat,"pointerdown");assert.equal(h.app.dataset.split,"chat");
    h.fire(doc,"keydown");assert.equal(h.app.dataset.split,"preview");
    h.api.setFocus("invalid");assert.equal(h.app.dataset.split,"preview");
    assert.equal(h.frame.contentDocument,doc);assert.equal(h.frame.srcdoc,src);
    assert.equal(h.chat.value,"My unsaved answer");assert.equal(h.chat.scrollTop,73);
  }finally{h.cleanup();}
});
test("layout lock freezes the current split, then follows the most recent panel",()=>{
  const h=setup();try{
    h.fire(h.stage,"pointerdown");h.fire(h.button,"click");
    assert.equal(h.button.attributes["aria-pressed"],"true");
    h.fire(h.chat,"focusin");assert.equal(h.app.dataset.split,"preview");
    assert.equal(h.api.getState().focus,"chat");
    h.fire(h.button,"click");assert.equal(h.app.dataset.split,"chat");
    h.mq.matches=true;h.fire(h.mq,"change");
    assert.equal(h.button.hidden,true);assert.equal(h.button.disabled,true);
    h.mq.matches=false;h.fire(h.mq,"change");assert.equal(h.button.hidden,false);
  }finally{h.cleanup();}
});
test("iframe listeners follow new documents and are removed on teardown",()=>{
  const h=setup();try{
    const old=h.frame.contentDocument;h.frame.contentDocument=new Node();h.fire(h.frame,"load");
    h.fire(old,"pointerdown");assert.equal(h.app.dataset.split,"chat");
    h.fire(h.frame.contentDocument,"pointerdown");assert.equal(h.app.dataset.split,"preview");
    h.api.destroy();h.fire(h.frame.contentDocument,"focusin");
    assert.equal(h.app.dataset.split,undefined);assert.equal(h.menu.children.length,0);
  }finally{h.cleanup();}
});
test("section drag holds geometry until the gesture ends",async()=>{
  const h=setup();try{
    h.fire(h.frame.contentDocument,"pointerdown",true);
    assert.equal(h.api.getState().gesture,true);assert.equal(h.app.dataset.split,"chat");
    h.fire(h.frame.contentDocument,"pointerup");
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(h.app.dataset.split,"preview");
    h.fire(h.chat,"pointerdown",true);h.fire(h.win,"pointerup");h.api.destroy();
    await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.app.dataset.split,undefined);
  }finally{h.cleanup();}
});
test("desktop transitions preserve existing mobile switching and fixed preview sizing",async()=>{
  const css=await readFile(new URL("../src/public/ann-builder.css",import.meta.url),"utf8");
  assert.match(css,/@media\(min-width:901px\)[\s\S]*minmax\(320px,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/data-split=preview[\s\S]*minmax\(320px,1fr\) minmax\(0,3fr\)/);
  assert.match(css,/transition:grid-template-columns .3s/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[^\n]*transition:none/);
  const source=await readFile(new URL("../src/public/ann-builder.js",import.meta.url),"utf8");
  assert.match(source,/mountAnnAdaptiveLayout\(\{ app, frame \}\)/);
  assert.match(source,/data-view-switch/);
});
