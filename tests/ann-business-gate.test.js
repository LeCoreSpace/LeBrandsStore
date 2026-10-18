import test from "node:test";
import assert from "node:assert/strict";
import {requiredAnnBusinessPrompt,annBusinessPosition} from "../src/public/ann-business-gate.js";
const prompts=[{id:"store_name",step:"business"},{id:"business_country",step:"business"},{id:"gstin",step:"business"},
  {id:"business_documents",step:"business"},{id:"logo",step:"business"},{id:"collections",step:"collections"},{id:"review",step:"review"}];
const blocked={available:true,allowed:false,business_country:"IN",reason:"documents_required"};

test("required business recovery follows country and verified GST, never saved design completion",()=>{
  assert.equal(requiredAnnBusinessPrompt(blocked),"business_documents");
  assert.equal(requiredAnnBusinessPrompt({...blocked,business_country:null}),"business_country");
  assert.equal(requiredAnnBusinessPrompt({...blocked,reason:"gst_required"}),"gstin");
  assert.equal(requiredAnnBusinessPrompt(blocked,{gstVerified:false}),"gstin");
  assert.equal(requiredAnnBusinessPrompt({...blocked,business_country:"US"},{gstVerified:false}),"business_documents");
  assert.equal(requiredAnnBusinessPrompt({...blocked,reason:"changes_requested"}),"business_documents");
  assert.equal(requiredAnnBusinessPrompt({...blocked,allowed:true,status:"pending_review"}),null);
  assert.equal(requiredAnnBusinessPrompt({...blocked,allowed:true,status:"approved"}),null);
  assert.equal(requiredAnnBusinessPrompt(blocked,{readOnly:true}),null);
  assert.equal(requiredAnnBusinessPrompt({available:false,allowed:true}),null);
});

test("late hydration keeps upload active and resumes the saved catalogue position only after access opens",()=>{
  const saved={promptId:"collections",step:"collections"};
  let position=annBusinessPosition(saved,prompts,"business_documents",{setupLocked:true});
  assert.equal(position.promptId,"business_documents");assert.deepEqual(position.resume,saved);
  for(const required of ["business_documents","gstin","business_documents"]){
    position=annBusinessPosition(position,prompts,required,{setupLocked:true});
    assert.deepEqual(position.resume,saved);
  }
  position=annBusinessPosition(position,prompts,null,{setupLocked:true});
  assert.deepEqual(position,{...saved,resume:null});
  assert.equal(annBusinessPosition({...saved,promptId:"review",step:"review"},prompts,"business_documents",{setupLocked:true}).promptId,"business_documents");
});

test("new accounts retain brand-first onboarding and read-only visits do not move saved progress",()=>{
  const fresh={promptId:"store_name",step:"business"};
  assert.deepEqual(annBusinessPosition(fresh,prompts,"business_country"),{...fresh,resume:null});
  const saved={promptId:"collections",step:"collections"};
  assert.deepEqual(annBusinessPosition(saved,prompts,null,{setupLocked:true}),{...saved,resume:null});
});
