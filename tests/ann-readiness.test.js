import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { gstinChecksum } from "../src/public/commerce-rules.js";
import { inrToPaise } from "../src/public/ann-readiness-ui.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("Ann checkout amounts preserve paise and never infer zero from invalid input",()=>{
  assert.equal(inrToPaise("99.09"),9909);
  assert.equal(inrToPaise("0",{allowZero:true}),0);
  for(const v of ["", "0","-1","1e3","99.999","100000000.01"])assert.throws(()=>inrToPaise(v));
});
test("Ann readiness reuses real business/policy/checkout rules with consent, stale guards and owner isolation",async()=>{
  const pg=await setupAnnFixtureDatabase(),db=annFixtureAdapter(pg);
  const call=async(method,body,origin="https://app.lebrands.store",user=owner,hash="a".repeat(64))=>{
    const response=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/readiness`,{
      method,headers:{origin,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),
    }),{},db,{id:user},hash);
    return {status:response.status,body:await response.json()};
  };
  const write=(state,action,extra={})=>({expected_draft:state.expected_draft,confirm:true,action,...extra});
  try{
    let state=(await call("GET")).body;
    assert.equal(state.checkout.can_edit,true);assert.equal(state.checkout.saved,false);
    assert.equal(state.checklist.every(c=>c.complete),false);
    assert.equal((await call("POST",{})).status,405);
    assert.equal((await call("PATCH",write(state,"business",{settings:{support_email:"help@example.invalid"}}),"https://untrusted.invalid")).status,403);
    assert.equal((await call("PATCH",{...write(state,"business",{settings:{support_email:"help@example.invalid"}}),confirm:false})).status,400);
    assert.equal((await call("PATCH",write(state,"business",{settings:{subdomain:"change-without-confirming"}}))).status,400);
    assert.equal((await call("PATCH",write(state,"business",{settings:{invoice_prefix:"NEW"}}))).status,400);
    assert.equal((await call("PATCH",write(state,"business",{settings:{support_email:"bad"}}))).status,400);
    let result=await call("PATCH",write(state,"business",{settings:{support_email:"help@example.invalid"}}));
    assert.equal(result.status,200); assert.equal(result.body.settings.support_email,"help@example.invalid");
    assert.equal((await call("PATCH",write(state,"business",{settings:{support_phone:"9876543210"}}))).status,409);
    state=result.body;
    const editor="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    assert.equal((await call("PATCH",write(state,"checkout",{checkout:{cod_enabled:false}}),undefined,editor,"b".repeat(64))).status,403);
    await pg.query("UPDATE store_members SET role='admin' WHERE store_id=$1 AND user_id=$2",[id,owner]);
    assert.equal((await call("GET")).body.checkout.can_edit,false);
    assert.equal((await call("PATCH",write(state,"checkout",{checkout:{cod_enabled:false}}))).status,403);
    await pg.query("UPDATE store_members SET role='owner' WHERE store_id=$1 AND user_id=$2",[id,owner]);
    const logo="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await pg.query("INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes,upload_type) VALUES($1,$2,$3,'image','image/webp',32,'logo')",[logo,id,`stores/${id}/logo/sample.webp`]);
    state=(await call("GET")).body;
    const prefix="33ABCDE1234F1Z";
    result=await call("PATCH",write(state,"business",{settings:{
      logo_media_id:logo,description:"Thoughtfully made clothing and everyday essentials for a considered wardrobe.",
      legal_name:"Example Studio Private Limited",gstin:prefix+gstinChecksum(prefix),business_state:"33",
      business_line1:"23 Example Road",business_city:"Chennai",business_pincode:"600001",support_phone:"9876543210",
    }}));
    assert.equal(result.status,200);state=result.body;
    assert.equal(state.settings.support_phone,"+919876543210");assert.match(state.settings.address,/Chennai/);
    result=await call("PATCH",write(state,"business",{settings:{
      logo_media_id:null,description:"",support_email:"care@example.invalid",support_phone:"9888888888",
    }}));
    assert.equal(result.status,200);state=result.body;
    assert.equal(state.settings.support_email,"care@example.invalid");
    assert.equal(state.settings.support_phone,"+919888888888");
    assert.equal(state.business_errors.logo_media_id,"Upload your brand logo.");
    result=await call("PATCH",write(state,"generate-policies"));
    assert.equal(result.status,200,JSON.stringify(result.body));state=result.body;assert.equal(state.policies.length,6);
    assert.match(state.policies.find(p=>p.kind==="contact").body,/care@example.invalid.*\+91/);
    assert.equal(state.checklist.every(item=>item.complete),false);
    assert.ok(state.policies.every(p=>!p.reviewed));
    const stale=state, policy={...state.policies[0],body:"Merchant-edited policy with real delivery, privacy and contact terms.",reviewed:true};
    result=await call("PATCH",write(state,"policy",{policy:{kind:policy.kind,body:policy.body,reviewed:true}}));
    assert.equal(result.status,200);state=result.body;
    assert.equal(state.policies.find(p=>p.kind===policy.kind).reviewed,true);
    assert.equal((await call("PATCH",write(stale,"generate-policies"))).status,409);
    result=await call("PATCH",write(state,"checkout",{checkout:{delivery_mode:"free_above",flat_paise:9909,free_above_paise:150000,cod_enabled:true,cod_max_paise:300000,store_state:"33"}}));
    assert.equal(result.status,200);state=result.body;
    assert.equal(state.checkout.settings.flat_paise,9909);assert.equal(state.checkout.saved,true);
    assert.equal(state.policies.find(p=>p.kind===policy.kind).body,policy.body);
    assert.ok(state.policies.every(p=>!p.reviewed));
    assert.equal((await call("PATCH",write(state,"checkout",{checkout:{free_above_paise:0}}))).status,400);
    assert.equal((await call("PATCH",{...write(state,"business",{settings:{support_phone:"9876543210"}}),publish:true})).status,400);
    for(const action of [["business"],["generate-policies"],{toString:"business"}])
      assert.equal((await call("PATCH",{...write(state,"business"),action})).status,400);
    assert.equal((await call("GET")).body.policies.find(p=>p.kind===policy.kind).body,policy.body);
    result=await call("PATCH",write(state,"generate-policies"));
    assert.equal(result.status,200,JSON.stringify(result.body));state=result.body;
    assert.match(state.policies.find(p=>p.kind==="shipping").body,/₹99\.09/);
    assert.match(state.policies.find(p=>p.kind==="shipping").body,/₹1,500\.00/);
    assert.match(state.policies.find(p=>p.kind==="pricing").body,/₹3,000\.00/);
    assert.equal(Number((await pg.query("SELECT count(*) AS n FROM store_publications")).rows[0].n),0);
    assert.equal((await pg.query("SELECT status FROM stores WHERE store_id=$1",[id])).rows[0].status,"draft");
  } finally {await pg.close();}
});
