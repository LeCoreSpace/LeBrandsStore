import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/public/catalogue-confirm.js","utf8");
function harness(){
  const listeners={},nav={},assigned=[],timers=[],questions=[];
  let decision=false,changed=true;
  const window={addEventListener(k,f){(listeners[k]||=[]).push(f);},navigation:{addEventListener(k,f){nav[k]=f;},traverseTo(key){assigned.push(key);}}};
  const location={href:"https://app.example.invalid/settings",assign(u){assigned.push(u);},replace(u){assigned.push(u);},reload(){assigned.push("reload");}};
  const context={window,location,Symbol,URL,Set,document:{querySelector(){return null;}},setTimeout(fn){timers.push(fn);},
    ask:async(message,options)=>{questions.push({message,options});return decision;}};
  runInNewContext(source.replace(/^export /gm,"")+"\nconfirmCatalogueAction=ask;globalThis.register=registerLeaveGuard;",context);
  const unregister=context.register(()=>changed);
  const event=(extra={})=>({defaultPrevented:false,button:0,preventDefault(){this.defaultPrevented=true;},...extra});
  const link=(attrs={})=>({href:"https://app.example.invalid/next",hasAttribute:k=>k in attrs,getAttribute:k=>k==="href"?(attrs.href||"/next"):attrs[k]||null});
  const click=(attrs={},extra={})=>{const e=event({target:{closest(){return link(attrs);}},...extra});listeners.click.forEach(fn=>fn(e));return e;};
  return{context,window,listeners,nav,assigned,timers,questions,click,event,unregister,
    decide(v){decision=v;},dirty(v){changed=v;}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test("application navigation cancellation preserves state, approval navigates once and cannot remain bypassed",async()=>{
  const h=harness();
  assert.equal(h.click().defaultPrevented,true);await settle();
  assert.equal(h.questions.length,1);assert.deepEqual(h.assigned,[]);
  h.decide(true);h.click();await settle();
  assert.equal(h.assigned.length,1);
  h.timers.splice(0).forEach(fn=>fn());
  h.decide(false);h.click();await settle();assert.equal(h.questions.length,3);
  assert.equal(h.listeners.beforeunload,undefined);
});
test("new tabs, downloads, modifiers, fragment links, handled events and clean pages do not ask",async()=>{
  const h=harness();
  for(const [attrs,extra]of[[{target:"_blank"},{}],[{download:""},{}],[{href:"#section"},{}],[{}, {ctrlKey:true}],[{}, {defaultPrevented:true}]]){
    h.click(attrs,extra);
  }
  h.dirty(false);h.click();await settle();assert.equal(h.questions.length,0);
});
test("multiple module copies share one guard and one dialog; unsubscribe removes a guard",async()=>{
  const h=harness(),copy={...h.context};
  runInNewContext(source.replace(/^export /gm,"")+"\nconfirmCatalogueAction=ask;globalThis.register=registerLeaveGuard;",copy);
  copy.register(()=>true);h.click();h.click();await settle();
  assert.equal(h.questions.length,1);
  assert.equal(h.listeners.click.length,1);
  h.unregister();h.dirty(false);h.click();await settle();assert.equal(h.questions.length,2,"other registered guard remains active");
});
test("AJAX saves are not intercepted, native form navigation waits and preserves the submitter",async()=>{
  const h=harness();let submitted=0;
  const submitter={getAttribute(){return null;}};
  const form={getAttribute(){return null;},requestSubmit(button){assert.equal(button,submitter);submitted++;h.listeners.submit.forEach(fn=>fn(h.event({target:form,submitter})));}};
  h.listeners.submit[0](h.event({defaultPrevented:true,target:form,submitter}));await settle();assert.equal(h.questions.length,0);
  h.listeners.submit[0](h.event({target:form,submitter}));await settle();assert.equal(submitted,0);
  h.decide(true);h.listeners.submit[0](h.event({target:form,submitter}));await settle();assert.equal(submitted,1);
});
test("cancelable browser navigation is guarded without native unload dialogs",async()=>{
  const h=harness();const e=h.event({cancelable:true,navigationType:"traverse",destination:{key:"previous",sameDocument:false}});
  h.nav.navigate(e);await settle();assert.equal(e.defaultPrevented,true);assert.equal(h.assigned.length,0);
  h.decide(true);h.nav.navigate(h.event({cancelable:true,navigationType:"traverse",destination:{key:"previous",sameDocument:false}}));await settle();
  assert.deepEqual(h.assigned,["previous"]);
});
test("all merchant surfaces are free of native dialogs and destructive async decisions are awaited",()=>{
  const files=readdirSync("src/public").filter(n=>n.endsWith(".js"));
  for(const name of files){
    const text=readFileSync("src/public/"+name,"utf8");
    assert.doesNotMatch(text,/\b(?:window|globalThis|self)\s*\.\s*(?:confirm|alert|prompt)\s*\(/,name);
    assert.doesNotMatch(text,/\b(?:alert|prompt)\s*\(/,name);
    if(!["catalogue-form.js","ann-onboarding-ui.js"].includes(name))assert.doesNotMatch(text,/\bconfirm\s*\(/,name);
    assert.doesNotMatch(text,/\b(?:onbeforeunload|beforeunload)\b/,name);
    for(const match of text.matchAll(/\bapp(?:Confirm|Prompt)\s*\(/g)){
      assert.match(text.slice(Math.max(0,match.index-12),match.index),/await\s*$/,name);
    }
  }
  assert.doesNotMatch(readFileSync("src/ui/navigation-loader.js","utf8"),/beforeunload/);
  assert.match(readFileSync("src/public/dashboard.js","utf8"),/await appPrompt[\s\S]*type:"datetime-local"/);
});
