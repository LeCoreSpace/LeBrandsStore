import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachAnnLaunch } from "../src/public/ann-launch-ui.js";

const flush=async()=>{await new Promise(setImmediate);await new Promise(r=>setTimeout(r,2));};
async function harness(readOnly=false,onStep) {
  const previous={document:globalThis.document,fetch:globalThis.fetch};
  const events=new Map(),requests=[];
  const slot={innerHTML:"",scrollTop:0,contains:t=>Boolean(t),querySelector:()=>null,querySelectorAll:()=>[]};
  globalThis.document={activeElement:null,querySelector:()=>slot,addEventListener:(name,fn)=>{
    const list=events.get(name)||[];list.push(fn);events.set(name,list);
  }};
  let state={revision:0,can_edit:!readOnly,execution_available:true,included_address:"sample.lebrands.store",
    preferences:{address:"included",payments:"cod",shipping:"manual"},providers:{},platform:{domains_available:false},jobs:[]};
  let fail=false,done=0,saved=0;
  globalThis.fetch=async(url,options={})=>{
    if(options.method==="PATCH") {
      const body=JSON.parse(options.body);requests.push(body);
      if(fail) return Response.json({error:"Please retry. Your choices are kept."},{status:503});
      state={...state,revision:state.revision+1,preferences:body.preferences};
    }
    return Response.json(state);
  };
  const ui=attachAnnLaunch({api:"/isolated/api",readOnly,onStep,onSaved:()=>saved++,onDone:()=>done++});
  ui.mount();await flush();
  const click=async dataset=>{
    const target={dataset,disabled:false,closest(){return this;}};
    for(const fn of events.get("click")||[])fn({target,preventDefault(){}});
    await flush();
  };
  return {ui,slot,requests,click,setFailure:v=>{fail=v;},get done(){return done;},get saved(){return saved;},
    async close(){await flush();globalThis.document=previous.document;globalThis.fetch=previous.fetch;}};
}
test("unavailable domain choices stay readable, explain their prerequisite and cannot be selected",async()=>{
  const h=await harness();
  try {
    assert.match(h.slot.innerHTML,/data-v="custom"[^>]*aria-disabled="true"[^>]*disabled/);
    assert.match(h.slot.innerHTML,/Platform domain setup is needed first/);
    assert.match(h.slot.innerHTML,/sample\.lebrands\.store/);
    await h.click({pref:"address",v:"custom"});
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.equal(h.requests.length,0);
    assert.match(h.slot.innerHTML,/data-v="included" aria-pressed="true"/);
  } finally {await h.close();}
});
test("default choices can proceed address to payments to delivery and return to review without writes or activation",async()=>{
  const h=await harness();
  try {
    await h.click({lnA:"next",next:"2"});
    assert.match(h.slot.innerHTML,/data-step="2" open/);
    assert.doesNotMatch(h.slot.innerHTML,/data-step="1" open/);
    await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="3" open/);
    await h.click({lnA:"next",next:"4"});
    assert.equal(h.done,1);assert.equal(h.requests.length,0);
    assert.match(h.slot.innerHTML,/does not activate services/);
  } finally {await h.close();}
});
test("save-and-continue retains failed choices, advances only after commit, and never activates a provider",async()=>{
  const h=await harness();
  try {
    await h.click({lnA:"next",next:"2"});
    await h.click({pref:"payments",v:"razorpay"});
    h.setFailure(true);await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="2" open/);
    assert.match(h.slot.innerHTML,/Your choices are kept/);
    assert.equal(h.ui.hasUnsavedChanges(),true);assert.equal(h.saved,0);
    h.setFailure(false);await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="3" open/);
    assert.equal(h.ui.hasUnsavedChanges(),false);assert.equal(h.saved,1);
    assert.equal(h.requests.length,2);
    assert.ok(h.requests.every(r=>r.action==="choose" && r.confirm===true && r.expected_revision===0));
    assert.deepEqual(h.requests[1].preferences,{address:"included",payments:"razorpay",shipping:"manual"});
  } finally {await h.close();}
});
test("readonly members cannot save or advance through owner actions",async()=>{
  const h=await harness(true);
  try {
    await h.click({pref:"payments",v:"razorpay"});
    await h.click({lnA:"next",next:"4"});
    assert.equal(h.requests.length,0);assert.equal(h.done,0);
  } finally {await h.close();}
});
test("selected choice hover has an explicit contrasting state and launch options do not use a clipped scroll area",async()=>{
  const css=await readFile("src/public/ann-builder.css","utf8");
  assert.match(css,/\.ann-chip\[aria-pressed=true\]:hover:not\(:disabled\)/);
  assert.match(css,/\.ann-choice\[aria-pressed=true\]:hover:not\(:disabled\)/);
  assert.match(css,/\.ann-launch-step \.ann-chips\.stack\{max-height:none;overflow:visible\}/);
  assert.match(css,/\.ann-launch-step \.ann-launch-option:disabled\{opacity:1;color:#574e53;background:#f3f0f2/);
});
test("conversation steps show only their own controls and advance through the real setup callback without activation",async()=>{
  const transitions=[],h=await harness(false,n=>transitions.push(n));
  try {
    h.ui.mount(1);
    assert.match(h.slot.innerHTML,/data-step="1"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-step="[23]"/);
    await h.click({lnA:"next",next:"2"});assert.deepEqual(transitions,[2]);
    h.ui.mount(2);
    assert.match(h.slot.innerHTML,/data-step="2"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="rz.key_id"/);
    await h.click({pref:"payments",v:"razorpay"});
    assert.match(h.slot.innerHTML,/data-ln="rz.key_id"/);
    h.setFailure(true);await h.click({lnA:"next",next:"3"});
    assert.deepEqual(transitions,[2]);assert.equal(h.ui.hasUnsavedChanges(),true);
    h.setFailure(false);await h.click({lnA:"next",next:"3"});
    assert.deepEqual(transitions,[2,3]);
    h.ui.mount(3);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="sr.email"/);
    await h.click({pref:"delivery",v:"shiprocket"});
    assert.match(h.slot.innerHTML,/data-ln="sr.email"/);
    await h.click({lnA:"skip"});
    assert.deepEqual(transitions,[2,3,4]);assert.match(h.ui.summary(3),/Left unchanged/);
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.ok(h.requests.every(r=>r.action==="choose"));
  }finally{await h.close();}
});
test("read-only members can skip optional conversation setup without changing provider settings",async()=>{
  const transitions=[],h=await harness(true,n=>transitions.push(n));
  try {
    h.ui.mount(1);await h.click({lnA:"skip"});
    assert.deepEqual(transitions,[2]);assert.equal(h.requests.length,0);
  }finally{await h.close();}
});
test("Ann exposes address, payments and delivery as conversation stages and uses plain-language questions",async()=>{
  const js=await readFile("src/public/ann-builder.js","utf8");
  for(const [id,label,n] of [["domain","Store address",1],["payments","Payments",2],["shipping","Delivery",3]]) {
    assert.ok(js.includes(`["${id}", "${label}"`),`${label} must appear in the progress steps`);
    assert.ok(js.includes(`case "${id}": return {kind:"launch",launchStep:${n}`),`${label} must use the working launch controls`);
  }
  assert.ok(js.includes("What category of products do you sell?"));
  assert.ok(!js.includes("Nothing goes live here. What do you sell?"));
  assert.ok(js.includes("A collection is a group of related products"));
  assert.ok(js.includes("That's a tagline"));
  assert.ok(js.includes('!["domain","payments","shipping","review"].includes(k)'),"payment and delivery setup must not inflate design progress");
  assert.match(js,/if \(p\.id === "review"\) \{\s*if \(active\)/,"editing earlier questions must not mount a second launch widget in an inactive review");
  const css=await readFile("src/public/ann-builder.css","utf8");
  assert.match(css,/\.ann-rail\{display:flex;flex-wrap:wrap/);
});
