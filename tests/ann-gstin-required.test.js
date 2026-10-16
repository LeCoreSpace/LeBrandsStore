import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
import {handleGSTINRoutes} from "../src/gstin/routes.js";
import {mapGSTINResponse} from "../src/gstin/provider.js";
import {saveSetup} from "../src/store/repository.js";
import {attachAnnOnboarding} from "../src/public/ann-onboarding-ui.js";
import {migrationSelection} from "../db/migration-selection.js";

const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},hash="a".repeat(64);
const rawRegistration=JSON.parse(await readFile(new URL("../test/fixtures/gstin-active-sample.json",import.meta.url),"utf8"));
const registration=mapGSTINResponse(rawRegistration);
const request=(path,body)=>new Request(`https://app.lebrands.store/api/stores/${id}/${path}`,{
  method:"POST",headers:{origin:"https://app.lebrands.store","content-type":"application/json"},body:JSON.stringify(body)});

test("GST migration is an explicit separate rollout after the required-GST security migration",()=>{
  assert.deepEqual(migrationSelection(["--staged-gstin"]),{staged:true,filename:"0011_gstin_approval.sql",requires:"0009_required_gstin.sql"});
  assert.deepEqual(migrationSelection([]),{staged:false});
  assert.throws(()=>migrationSelection(["--staged-gstin","--staged-ann"]));
});

test("Missing GST setup is explicit; real staged DDL enables confirmation and immutable invoice identity",async()=>{
  const pg=await setupAnnFixtureDatabase();
  try{
    const db=annFixtureAdapter(pg);
    const gst=(path,body)=>handleGSTINRoutes(request(`gstin/${path}`,body),{},db,user,hash);
    const progress=()=>handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/session`,{
      method:"PATCH",headers:{origin:"https://app.lebrands.store","content-type":"application/json"},
      body:JSON.stringify({expected_revision:0,current_step:"selling",answers:{}})}),{},db,user,hash);
    let response=await gst("verify",{gstin:registration.gstin,state_code:registration.principal_address.state_code});
    assert.equal(response.status,503);assert.equal((await response.json()).code,"GSTIN_SETUP_REQUIRED");
    assert.equal((await progress()).status,503);
    // Apply the actual staged migration to the real existing Ann foundation, never a production database.
    await pg.exec(await readFile(new URL("../db/staged/0011_gstin_approval.sql",import.meta.url),"utf8"));
    assert.equal((await progress()).status,409);
    const record=(await pg.query(`INSERT INTO public.store_gstin_verifications
      (store_id,gstin,state,normalized,raw_response,verified_at) VALUES($1,$2,'verified',$3::jsonb,$4::jsonb,now()) RETURNING id`,
      [id,registration.gstin,JSON.stringify(registration),JSON.stringify(rawRegistration)])).rows[0];
    response=await gst("confirm",{verification_id:record.id,address_index:0,lock_invoice_address:true});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const saved=await response.json();
    assert.equal(saved.settings.gstin_invoice_identity_locked,true);
    assert.equal(saved.settings.business_pincode,registration.principal_address.pin);
    assert.equal((await progress()).status,200);
    for(const patch of [{business_city:"Another city"},{gstin:"changed"},{address:"A manually typed address"},
      {gstin_invoice_identity_locked:false},{legal_name:"Another legal entity"}]){
      await assert.rejects(()=>db.withMemberStore(id,hash,tx=>saveSetup(tx,id,patch)),e=>e.status===409);
    }
    const unchanged=await db.withMemberStore(id,hash,tx=>saveSetup(tx,id,{business_city:registration.principal_address.city,brand_name:"A new display name"}));
    assert.equal(unchanged.settings.gstin_invoice_identity_locked,true);
    assert.equal(unchanged.settings.brand_name,"A new display name");
  } finally{await pg.close();}
});

test("Ann cannot skip GST, distinguishes platform setup, and locks the confirmed invoice address",async()=>{
  const originalDocument=globalThis.document,originalFetch=globalThis.fetch;
  const listeners={},slot={innerHTML:"",childElementCount:0,contains:node=>!!node,querySelector:()=>null};
  let env={store:{name:"Example Studio"},settings:{},verification:{enabled:false,state:"unverified",confirmed:false}};
  let continued=0,confirmBody=null;
  globalThis.document={activeElement:null,getElementById:()=>slot,addEventListener:(kind,fn)=>(listeners[kind]||=[]).push(fn)};
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith("/onboarding"))return Response.json(env);
    if(url.endsWith("/verify")){
      assert.equal(JSON.parse(options.body).state_code,registration.gstin.slice(0,2),"the typed GSTIN supplies the registered state");
      return Response.json({id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",state:"verified",registration});
    }
    if(url.endsWith("/confirm")){
      confirmBody=JSON.parse(options.body);
      const a=registration.principal_address;
      env={...env,settings:{gstin:registration.gstin,legal_name:registration.legal_name,
        business_line1:a.line1||a.line2,business_line2:a.line1?a.line2:"",business_city:a.city,
        business_pincode:a.pin,business_state:a.state_code,gstin_invoice_identity_locked:true},
        verification:{id:confirmBody.verification_id,state:"verified",confirmed:true,registration}};
      return Response.json({});
    }
    throw Error("Unexpected request");
  };
  const click=action=>{const button={dataset:{ob:action},disabled:false};for(const fn of listeners.click||[])fn({preventDefault(){},target:{closest:()=>button}});};
  const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
  try{
    const ui=attachAnnOnboarding({api:`/api/stores/${id}/ann`,storeId:id,mode:"gstin",onContinue:()=>continued++});
    await ui.refresh();
    assert.match(ui.html(),/platform update/);assert.doesNotMatch(ui.html(),/Save for later and continue|data-ob="skip"/);
    assert.doesNotThrow(()=>ui.summary());click("skip");click("continue");assert.equal(continued,0);
    assert.equal(await ui.submit(registration.gstin),false);
    assert.match(ui.html(),/platform update/);
    env={...env,settings:{business_state:"07"},verification:{enabled:true,state:"unverified",confirmed:false}};
    await ui.refresh();
    assert.doesNotMatch(ui.html(),/<input[^>]+data-ob-in="gstin"/);
    await ui.submit(registration.gstin);
    assert.match(ui.html(),/Confirm and lock this invoice address/);
    click("continue");assert.equal(continued,0);
    click("confirm");await flush();
    assert.equal(confirmBody.lock_invoice_address,true);assert.equal(confirmBody.address_index,0);
    assert.equal(continued,1);assert.equal(ui.envelope().settings.gstin_invoice_identity_locked,true);
  }finally{globalThis.document=originalDocument;globalThis.fetch=originalFetch;}
});
