import test from "node:test";
import assert from "node:assert/strict";
import {navigationController,navigationHead,NAVIGATION_BODY,withNavigation} from "../src/ui/navigation-loader.js";
import {layout} from "../src/ui/layout.js";

test("navigation feedback starts immediately, respects intercepted/new-tab actions, and resets on return or cancellation",async()=>{
  const keys=["window","document","location","setTimeout","clearTimeout"];
  const original=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const handlers={},events={},root={dataset:{}},label={textContent:""},timers=new Map();
  let serial=0;
  Object.assign(globalThis,{
    window:{addEventListener:(name,fn)=>handlers[name]=fn,navigation:{addEventListener:(name,fn)=>handlers[name]=fn}},
    document:{documentElement:root,querySelector:s=>s==="#lb-navigation span"?label:null,addEventListener:(name,fn)=>events[name]=fn},
    location:{href:"https://app.lebrands.store/stores/example"},
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
  });
  const click=(href,attrs={},extra={})=>handlers.click({button:0,defaultPrevented:false,target:{closest:()=>({
    href,getAttribute:key=>attrs[key]??null,hasAttribute:key=>Object.hasOwn(attrs,key),
  })},...extra});
  try{
    navigationController();
    assert.equal(root.dataset.navigationLoading,"true");
    events.DOMContentLoaded();assert.equal(root.dataset.navigationLoading,undefined);
    for(const [attrs,extra,href] of [
      [{target:"_blank"},{},"https://brand.lebrands.store/"],
      [{download:""},{},"https://app.lebrands.store/file"],
      [{},{ctrlKey:true},"https://app.lebrands.store/next"],
      [{},{defaultPrevented:true},"https://app.lebrands.store/next"],
      [{},{},"https://app.lebrands.store/stores/example#section"],
      [{},{},"mailto:help@example.invalid"],
    ]){
      click(href,attrs,extra);assert.equal(root.dataset.navigationLoading,undefined);
    }
    click("https://app.lebrands.store/stores/example/build/ann");
    assert.equal(root.dataset.navigationLoading,"true");
    [...timers.values()].at(-1)();assert.match(label.textContent,/Still loading/);
    handlers.pageshow();assert.equal(root.dataset.navigationLoading,undefined);
    const form={getAttribute:()=>null};
    handlers.submit({defaultPrevented:true,target:form});assert.equal(root.dataset.navigationLoading,undefined);
    handlers.submit({defaultPrevented:false,target:form});assert.equal(root.dataset.navigationLoading,"true");
    handlers.beforeunload({defaultPrevented:true,returnValue:""});await Promise.resolve();
    assert.equal(root.dataset.navigationLoading,undefined,"cancelled unsaved-changes navigation must not get stuck");
    handlers.beforeunload({defaultPrevented:false,returnValue:""});await Promise.resolve();
    assert.equal(root.dataset.navigationLoading,"true");
    handlers.navigateerror();assert.equal(root.dataset.navigationLoading,undefined);
  }finally{
    for(const key of keys){if(original[key])Object.defineProperty(globalThis,key,original[key]);else delete globalThis[key];}
  }
});

test("shared account pages embed feedback without another blocking asset request",()=>{
  const html=layout({title:"Example",description:"Example",body:"<main>Ready</main>",noindex:true});
  assert.ok(html.includes(NAVIGATION_BODY));
  assert.ok(html.includes(navigationHead()));
  assert.match(html,/prefers-reduced-motion/);
  assert.match(html,/aria-live="polite"/);
  assert.doesNotMatch(navigationHead(),/<script src=/);
  const publicHtml=withNavigation('<html><head><title>Store</title></head><body class="merchant"><main>Store</main></body></html>');
  assert.ok(publicHtml.includes(NAVIGATION_BODY));
  assert.equal(withNavigation(publicHtml),publicHtml,"no duplicate navigation handlers");
  assert.match(publicHtml,/@media print/);
});
