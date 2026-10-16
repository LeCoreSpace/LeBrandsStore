import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachAnnLaunch } from "../src/public/ann-launch-ui.js";

const flush=async()=>{await new Promise(setImmediate);await new Promise(r=>setTimeout(r,2));};
async function harness(readOnly=false) {
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
  const ui=attachAnnLaunch({api:"/isolated/api",readOnly,onSaved:()=>saved++,onDone:()=>done++});
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
