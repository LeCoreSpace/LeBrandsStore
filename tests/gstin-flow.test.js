import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {mapGSTINResponse} from "../src/gstin/provider.js";
import {verifyGSTIN,supplierPatch,supplierMatches} from "../src/gstin/service.js";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const active=JSON.parse(await readFile(new URL("../test/fixtures/gstin-active-sample.json",import.meta.url),"utf8"));
const registration=mapGSTINResponse(active);
function tag(pg){return async(strings,...args)=>{let sql=strings[0];args.forEach((_,i)=>sql+=`$${i+1}${strings[i+1]}`);return(await pg.query(sql,args)).rows}}
test("0011 compiles, preserves live stores, forces verification isolation and reserves quotas atomically",async()=>{
 const pg=new PGlite(),tx=tag(pg);
 try{
  await pg.exec(`CREATE ROLE lebrands_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE stores(store_id uuid PRIMARY KEY,status text CHECK(status IN('draft','live','paused')));
   CREATE TABLE store_setup(store_id uuid PRIMARY KEY,settings jsonb);
   CREATE TABLE store_publications(store_id uuid PRIMARY KEY,snapshot jsonb);
   CREATE TABLE media(id uuid,store_id uuid,object_key text,upload_type text);
   CREATE TABLE audit_log(store_id uuid,actor_type text,action text,entity_type text,entity_id uuid,metadata jsonb);
   GRANT USAGE ON SCHEMA public TO lebrands_app;
   GRANT SELECT,UPDATE ON stores TO lebrands_app;GRANT SELECT ON store_setup,store_publications,media TO lebrands_app;`);
  const old=await readFile(new URL("../db/migrations/0009_required_gstin.sql",import.meta.url),"utf8");
  for(const name of ["gstin_is_valid","supplier_is_complete"]){
   const fn=old.match(new RegExp(`CREATE FUNCTION public\\.${name}[\\s\\S]+?\\$\\$;`));
   assert.ok(fn,`Find actual ${name} implementation`);await pg.exec(fn[0]);
  }
  for(const id of [a,b])await pg.query("INSERT INTO stores VALUES($1,'live')",[id]);
  const settings=supplierPatch(registration,0);
  for(const id of [a,b]){
   await pg.query("INSERT INTO store_setup VALUES($1,$2)",[id,JSON.stringify(settings)]);
   await pg.query("INSERT INTO store_publications VALUES($1,$2)",[id,JSON.stringify({settings})]);
  }
  await pg.exec(await readFile(new URL("../db/staged/0011_gstin_approval.sql",import.meta.url),"utf8"));
  assert.equal((await pg.query("SELECT count(*)::integer AS n FROM stores WHERE status='live' AND approved_by='migration-0011'")).rows[0].n,2);
  assert.equal((await pg.query("SELECT count(*)::integer AS n FROM audit_log WHERE action='store.approved'")).rows[0].n,2);
  await pg.exec(`SET ROLE lebrands_app;SELECT set_config('app.store_id','${a}',false)`);
  const lookup=async()=>({registration,raw_response:active});
  let calls=0;
  const first=await verifyGSTIN(tx,{},a,{gstin:registration.gstin,state_code:registration.principal_address.state_code},{lookup:async(...args)=>{calls++;return lookup(...args)}});
  assert.equal(first.state,"verified");assert.equal(first.raw_response,undefined);
  await verifyGSTIN(tx,{},a,{gstin:registration.gstin,state_code:registration.principal_address.state_code},{lookup:async()=>{calls++;throw Error("Should not call cached provider")}});
  assert.equal(calls,1);
  assert.ok(supplierMatches(settings,registration));
  assert.equal((await pg.query("SELECT public.invoice_supplier($1) AS supplier",[a])).rows[0].supplier.legal_name,registration.legal_name);
  await assert.rejects(()=>pg.query("UPDATE stores SET approved_by='brand-owner' WHERE store_id=$1",[a]),e=>e.code==="42501");
  await assert.rejects(()=>pg.query("UPDATE stores SET approval_revoked_at=now(),approval_revocation_note='self' WHERE store_id=$1",[a]),e=>e.code==="42501");
  await assert.rejects(()=>pg.query("INSERT INTO store_gstin_verifications(store_id,gstin,state)VALUES($1,'anything','unverified')",[b]),e=>e.code==="42501");
  await assert.rejects(()=>pg.query("SELECT public.reserve_gstin_lookup($1)",[b]),e=>e.code==="42501");
  await assert.rejects(()=>pg.query("UPDATE store_gstin_verifications SET state='unverified'"),e=>e.code==="42501");
  await pg.exec(`RESET ROLE;SELECT set_config('app.store_id','${b}',false)`);
  await pg.query("INSERT INTO store_gstin_verifications(store_id,gstin,state)VALUES($1,'other-store','unverified')",[b]);
  await pg.exec(`SET ROLE lebrands_app;SELECT set_config('app.store_id','${a}',false)`);
  assert.equal((await pg.query("SELECT count(*)::integer AS n FROM store_gstin_verifications WHERE store_id=$1",[b])).rows[0].n,0);
  for(let i=0;i<2;i++)assert.equal((await pg.query("SELECT reserve_gstin_lookup($1) AS value",[a])).rows[0].value.allowed,true);
  assert.equal((await pg.query("SELECT reserve_gstin_lookup($1) AS value",[a])).rows[0].value.allowed,false);
  await pg.exec("RESET ROLE");
  await pg.query("UPDATE gstin_lookup_attempts SET created_at=now()-interval '2 minutes' WHERE store_id=$1",[a]);
  for(let i=0;i<7;i++){
   await pg.exec("SET ROLE lebrands_app");
   assert.equal((await pg.query("SELECT reserve_gstin_lookup($1) AS value",[a])).rows[0].value.allowed,true);
   await pg.exec("RESET ROLE");await pg.query("UPDATE gstin_lookup_attempts SET created_at=now()-interval '2 minutes' WHERE store_id=$1",[a]);
  }
  await pg.exec("SET ROLE lebrands_app");
  assert.equal((await pg.query("SELECT reserve_gstin_lookup($1) AS value",[a])).rows[0].value.allowed,false);
  await pg.exec("RESET ROLE");
  await pg.query("UPDATE store_setup SET settings=settings||'{\"legal_name\":\"Unpublished new name\"}'::jsonb WHERE store_id=$1",[a]);
  assert.equal((await pg.query("SELECT public.invoice_supplier($1) AS supplier",[a])).rows[0].supplier.legal_name,registration.legal_name,"Invoices read published supplier, not draft");
  await pg.query("UPDATE store_gstin_verifications SET verified_at=now()-interval '31 days' WHERE store_id=$1",[a]);
  await assert.rejects(()=>pg.query("SELECT public.invoice_supplier($1)",[a]),e=>e.code==="23514");
  await pg.query("INSERT INTO store_gstin_verifications(store_id,gstin,state,normalized,raw_response)VALUES($1,$2,'blocked',$3,$4)",[a,registration.gstin,JSON.stringify({...registration,status:"Cancelled"}),JSON.stringify(active)]);
  await assert.rejects(()=>pg.query("SELECT public.invoice_supplier($1)",[a]),e=>e.code==="23514");
 }finally{await pg.close()}
});
test("GSTIN prechecks spend no lookups and address selection uses only provider fields",async()=>{
 let queries=0,calls=0;
 const tx=async()=>{queries++;return[]};
 await assert.rejects(()=>verifyGSTIN(tx,{},a,{gstin:"wrong",state_code:"33"},{lookup:async()=>{calls++}}));
 await assert.rejects(()=>verifyGSTIN(tx,{},a,{gstin:registration.gstin,state_code:"07"},{lookup:async()=>{calls++}}));
 assert.equal(queries,0);assert.equal(calls,0);
 const second={...registration,additional_addresses:[{...registration.principal_address,line1:"Second registered building"}]};
 assert.equal(supplierPatch(second,1).business_line1,"Second registered building");
 assert.throws(()=>supplierPatch(second,2));
 const blank={...registration,principal_address:{...registration.principal_address,line1:"",line2:"Registered road"}};
 assert.equal(supplierPatch(blank).business_line1,"Registered road");assert.equal(supplierPatch(blank).business_line2,"");
});
