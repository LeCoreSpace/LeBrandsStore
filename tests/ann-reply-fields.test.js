import test from "node:test";
import assert from "node:assert/strict";
import {attachAnnReplyFields} from "../src/public/ann-reply-fields.js";
import {verifyGSTIN} from "../src/gstin/service.js";
import {readFile} from "node:fs/promises";
import {mapGSTINResponse} from "../src/gstin/provider.js";

test("One composer preserves field identity, validation, editor normalization and change events",async()=>{
  const doc=globalThis.document,observer=globalThis.MutationObserver,events=[];
  let nodes=[];
  function field(name,value=""){
    const attrs={"data-ann-product":"first","data-ann-field":name};
    const n={value,placeholder:"",inputMode:"decimal",tagName:"INPUT",type:"text",disabled:false,readOnly:false,isConnected:true,
      getAttributeNames:()=>Object.keys(attrs),getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>{attrs[k]=v;},
      matches:()=>n.disabled,checkValidity:()=>n.value!=="invalid",validationMessage:"Use a valid price.",
      closest:q=>q==="#ann-composer"?null:q==="#ann-log"?{}:q==="label"?{cloneNode:()=>({textContent:name,querySelectorAll:()=>[]})}:q==="fieldset"?null:{id:"ann-application-slot"},
      after:b=>{n.nextElementSibling=b;},dispatchEvent:e=>{
        events.push({field:name,type:e.type,value:n.value});
        if(name==="price"&&e.type==="input"){
          const replacement=field(name,n.value.trim());n.isConnected=false;nodes[0]=replacement;
        }
      }};
    n.dataset=new Proxy({},{get:(_,k)=>attrs["data-"+k.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())],set:(_,k,v)=>{attrs["data-"+k.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())]=v;return true;}});
    return n;
  }
  const root={querySelectorAll:()=>nodes,addEventListener(){}};
  globalThis.document={createElement:()=>{
    const attrs={};return {setAttribute:(k,v)=>attrs[k]=v,hasAttribute:k=>k in attrs,textContent:""};
  }};
  globalThis.MutationObserver=class{observe(){}disconnect(){}};
  try{
    const details={open:false,parentElement:null},partner=field("provider_key");
    partner.parentElement={closest:()=>details};
    nodes=[field("price","10.00"),field("hsn"),partner];
    const bridge=attachAnnReplyFields({root});await Promise.resolve();
    const key=bridge.current().key;bridge.refresh();assert.equal(bridge.current().key,key);
    assert.equal(nodes[0].hidden,true);assert.match(nodes[0].nextElementSibling.textContent,/Change in chat/);
    assert.throws(()=>bridge.submit("invalid"),/valid price/);assert.equal(nodes[0].value,"10.00");
    bridge.submit(" 1299.00 ");
    assert.equal(nodes[0].value,"1299.00","do not overwrite the editor's normalized value");
    assert.deepEqual(events.slice(0,2),[{field:"price",type:"input",value:" 1299.00 "},{field:"price",type:"change",value:"1299.00"}]);
    assert.equal(bridge.current().label,"hsn");
    bridge.submit("6109");assert.equal(nodes[1].value,"6109");assert.equal(bridge.current(),null);
    assert.equal(partner.nextElementSibling,undefined,"closed setup must not request credentials in chat");
    details.open=true;bridge.refresh();assert.equal(bridge.current().label,"provider_key");
    details.open=false;bridge.refresh();assert.equal(bridge.current(),null);
    bridge.disconnect();
  }finally{globalThis.document=doc;globalThis.MutationObserver=observer;}
});

test("GST failures retain safe specific codes, never raw transport errors; missing configuration spends no lookup",async()=>{
  const raw=JSON.parse(await readFile(new URL("../test/fixtures/gstin-active-sample.json",import.meta.url),"utf8"));
  const r=mapGSTINResponse(raw);let lookups=0,quotas=0;
  const tx=async(parts,...values)=>{
    const query=parts.join("?");
    if(query.includes("to_regclass"))return[{enabled:true}];
    if(query.includes("SELECT *"))return[];
    if(query.includes("reserve_gstin_lookup")){quotas++;return[{reservation:{allowed:true}}];}
    if(query.includes("INSERT INTO public.store_gstin_verifications"))return[{id:"test",gstin:r.gstin,state:values[2],normalized:null,error_code:values[6]}];
    throw Error("Unexpected query");
  };
  const payload={gstin:r.gstin,state_code:r.gstin.slice(0,2)};
  await assert.rejects(()=>verifyGSTIN(tx,{},"test",payload),e=>e.publicCode==="GSTIN_CONFIGURATION_REQUIRED");
  assert.equal(quotas,0);
  const result=await verifyGSTIN(tx,{},"test",payload,{lookup:async()=>{lookups++;throw Object.assign(new Error("private transport detail"),{code:"NETWORK_ERROR"});}});
  assert.equal(lookups,1);assert.equal(result.error_code,"NETWORK_ERROR");
  assert.match(result.message,/connect to the GST provider/);assert.doesNotMatch(JSON.stringify(result),/private transport|manually/);
});
