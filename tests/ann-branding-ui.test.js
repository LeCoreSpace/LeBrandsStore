import test from "node:test";
import assert from "node:assert/strict";
import {attachAnnBranding} from "../src/public/ann-branding-ui.js";
const one="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",two="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const url=id=>`https://media.lebrands.store/stores/${one}/${id}.webp`;
const flush=()=>new Promise(setImmediate);
async function harness(readOnly=false,options={}) {
  const old={document:globalThis.document,fetch:globalThis.fetch},events=new Map(),requests=[],previews=[];
  const slot={innerHTML:"",contains:()=>true};
  globalThis.document={querySelector:()=>slot,addEventListener:(name,fn)=>{
    const list=events.get(name)||[];list.push(fn);events.set(name,list);
  }};
  let revision=0,current=one,fail=false,continued=0,saved=0;
  const logos=[{id:one,url:url(one),label:"Existing logo"},{id:two,url:url(two),label:"New logo"}];
  const state=()=>({expected_draft:String(revision).padStart(64,"0"),settings:{logo_media_id:current},logo_media:logos});
  globalThis.fetch=async(path,options={})=>{
    requests.push({path,...options});
    if(path.endsWith("/media")){revision++;return Response.json({media:logos[1]});}
    if(options.method==="PATCH") {
      const body=JSON.parse(options.body);
      if(fail || body.expected_draft!==state().expected_draft)return Response.json({error:"Store changed. Refresh the logo list."},{status:409});
      current=body.settings.logo_media_id;revision++;
    }
    return Response.json(state());
  };
  const ui=attachAnnBranding({api:"/sample/ann",readOnly,...options,initial:{logo_media_id:one,logo_url:url(one)},
    onPreview:logo=>previews.push({...logo}),onSaved:()=>saved++,onContinue:()=>continued++});
  ui.mount();await flush();
  const change=async(attribute,extra={})=>{
    const target={hasAttribute:key=>key===attribute,...extra};
    for(const fn of events.get("change")||[])fn({target});await flush();
  };
  const click=async brand=>{
    const target={dataset:{brand},closest(){return this;},disabled:false};
    for(const fn of events.get("click")||[])fn({target,preventDefault(){}});await flush();
  };
  return {ui,slot,requests,previews,change,click,setFailure:v=>{fail=v;},
    get continued(){return continued;},get saved(){return saved;},
    close(){globalThis.document=old.document;globalThis.fetch=old.fetch;}};
}
test("logo selection previews immediately but only explicit confirmation saves a logo-only patch",async()=>{
  const h=await harness();
  try {
    await h.change("data-brand-select",{value:two});
    assert.equal(h.previews.at(-1).url,url(two));assert.equal(h.ui.hasUnsavedChanges(),true);
    assert.equal(h.requests.filter(r=>r.method==="PATCH").length,0);
    await h.click("continue");
    const body=JSON.parse(h.requests.find(r=>r.method==="PATCH").body);
    assert.deepEqual(body,{action:"business",confirm:true,expected_draft:"0".repeat(64),settings:{logo_media_id:two}});
    assert.equal(h.continued,1);assert.equal(h.saved,1);assert.equal(h.ui.hasUnsavedChanges(),false);
  }finally{h.close();}
});
test("logo uploads use existing media storage and refresh the fingerprint before confirming",async()=>{
  const h=await harness();
  try {
    await h.change("data-brand-file",{files:[new File(["sample"],"brand.webp",{type:"image/webp"})]});
    const upload=h.requests.find(r=>r.method==="POST");
    assert.equal(upload.path,"/sample/ann/media");assert.equal(upload.body.get("type"),"logo");
    assert.equal(h.previews.at(-1).url,url(two));
    await h.click("continue");
    assert.equal(JSON.parse(h.requests.find(r=>r.method==="PATCH").body).expected_draft,"1".padStart(64,"0"));
    assert.equal(h.continued,1);
  }finally{h.close();}
});
test("failed logo saves keep the pending choice and cannot advance; refresh enables an explicit retry",async()=>{
  const h=await harness();
  try {
    await h.change("data-brand-select",{value:two});h.setFailure(true);await h.click("continue");
    assert.match(h.slot.innerHTML,/Store changed/);assert.equal(h.continued,0);assert.equal(h.saved,0);
    assert.equal(h.ui.hasUnsavedChanges(),true);
    h.setFailure(false);await h.click("refresh");await h.click("continue");
    assert.equal(h.continued,1);assert.equal(h.saved,1);
  }finally{h.close();}
});
test("invalid uploads, skipping and readonly controls never change stored branding",async()=>{
  const h=await harness();
  try {
    await h.change("data-brand-file",{files:[new File(["svg"],"unsafe.svg",{type:"image/svg+xml"})]});
    assert.match(h.slot.innerHTML,/Choose a PNG/);
    await h.change("data-brand-select",{value:""});await h.click("skip");
    assert.equal(h.previews.at(-1).id,one);assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.ok(h.requests.every(r=>r.method==="GET"));
  }finally{h.close();}
  const ro=await harness(true);
  try {
    await ro.change("data-brand-select",{value:two});await ro.click("continue");
    assert.ok(ro.requests.every(r=>r.method==="GET"));assert.equal(ro.saved,0);
  }finally{ro.close();}
});

test("historical logo controls offer an explicit save without promising to advance the chat",async()=>{
  const h=await harness(false,{inConversationStep:()=>false});
  try{
    assert.match(h.ui.html(),/Upload a logo/);
    assert.match(h.ui.html(),/Keep current branding/);
    await h.change("data-brand-select",{value:two});
    assert.match(h.ui.html(),/>Save logo<\/button>/);
    assert.doesNotMatch(h.ui.html(),/Save logo and continue/);
    await h.click("continue");
    assert.equal(h.saved,1);
    assert.equal(h.ui.hasUnsavedChanges(),false);
  }finally{h.close();}
});
