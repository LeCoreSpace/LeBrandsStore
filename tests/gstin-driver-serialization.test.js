import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleGSTINRoutes} from "../src/gstin/routes.js";

const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},hash="a".repeat(64);
const raw=JSON.parse(await readFile(new URL("../test/fixtures/gstin-active-sample.json",import.meta.url),"utf8"));
const request=(action,body)=>new Request(`https://app.lebrands.store/api/stores/${id}/gstin/${action}`,{
  method:action==="state"?"GET":"POST",headers:{origin:"https://app.lebrands.store","content-type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})});

test("Production-driver GST serialization reproduces GST-REQUEST, then verifies, caches and confirms without live lookups",async t=>{
  const pg=await setupAnnFixtureDatabase();
  const driver=postgres({host:"127.0.0.1",port:1,max:1,prepare:true,fetch_types:false});
  const serialize=driver.options.serializers[3802];
  const fetchMock=t.mock.method(globalThis,"fetch",async()=>Response.json(raw));
  const log=t.mock.method(console,"error",()=>{});
  try{
    await pg.exec(await readFile(new URL("../db/staged/0011_gstin_approval.sql",import.meta.url),"utf8"));
    const db=annFixtureAdapter(pg);
    const wireDb=legacy=>({withMemberStore:(store,token,fn)=>db.withMemberStore(store,token,tx=>{
      const wire=async(strings,...values)=>{
        const parts=[...strings];
        if(legacy&&parts.join("").includes("INSERT INTO public.store_gstin_verifications")){
          for(let i=0;i<parts.length;i++)parts[i]=parts[i].replaceAll("::text::jsonb","::jsonb");
        }
        const bound=values.map((value,i)=>value==null?value:/^\s*::jsonb\b/.test(parts[i+1])?serialize(value):value);
        return tx(parts,...bound);
      };
      wire.json=tx.json;
      return fn(wire);
    })});
    const env={GSTIN_KEY:"synthetic-offline-test-key"};
    const body={gstin:raw.data.gstin,state_code:raw.data.gstin.slice(0,2)};
    let response=await handleGSTINRoutes(request("verify",body),env,wireDb(true),user,hash);
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/GST-REQUEST/);
    assert.equal(JSON.parse(log.mock.calls[0].arguments[0]).diagnostic,"UNEXPECTED");
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM store_gstin_verifications")).rows[0].n,0,
      "a successful provider response was lost when double-encoding broke supplier matching");
    response=await handleGSTINRoutes(request("verify",body),env,wireDb(false),user,hash);
    assert.equal(response.status,200);
    const verified=await response.json();
    assert.equal(verified.state,"verified");assert.equal(verified.confirmed,false);
    assert.equal(typeof verified.registration,"object");
    const [types]=(await pg.query("SELECT jsonb_typeof(normalized) AS normalized_type,jsonb_typeof(raw_response) AS raw_type FROM store_gstin_verifications")).rows;
    assert.deepEqual(types,{normalized_type:"object",raw_type:"object"});
    response=await handleGSTINRoutes(request("verify",body),env,wireDb(false),user,hash);
    assert.equal(response.status,200);
    assert.equal(fetchMock.mock.calls.length,2,"the verified cache must not spend another lookup");
    response=await handleGSTINRoutes(request("confirm",{verification_id:verified.id,address_index:0,lock_invoice_address:true}),env,wireDb(false),user,hash);
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).settings.gstin_invoice_identity_locked,true);
    response=await handleGSTINRoutes(request("state"),env,wireDb(false),user,hash);
    assert.equal(response.status,200);assert.equal((await response.json()).confirmed,true);
  }finally{fetchMock.mock.restore();log.mock.restore();await driver.end({timeout:0});await pg.close();}
});
