import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {businessDocumentRetention,businessDocumentUploadPolicy} from "../src/store/business-document-policy.js";
import {handleBusinessDocumentRoutes} from "../src/store/business-document-routes.js";
import {migrationSelection} from "../db/migration-selection.js";
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hash="a".repeat(64);
const owner={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
const doc="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const root=`https://app.lebrands.store/api/stores/${store}/business-verification`;
const identity="public.business_document_submit(uuid,text,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,integer)";
const pdf=new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");

test("retention selection and policy fail closed without the schema, genuine scanner, or private storage",async()=>{
  assert.deepEqual(migrationSelection(["--staged-business-document-retention"]),{
    staged:true,filename:"0033_business_document_retention.sql",requires:"0031_business_documents.sql",
  });
  const absent=await businessDocumentRetention(async()=>[{business_retention_definition:null}]);
  assert.equal(absent.configured,false);
  assert.equal(businessDocumentUploadPolicy({BUSINESS_DOCUMENT_RETENTION_DAYS:"90"},absent).uploads_available,false);
  const policy={configured:true,key:"subscription_lifetime_v1"};
  const storageOnly=businessDocumentUploadPolicy({BUSINESS_DOCUMENTS:{put(){}}},policy);
  assert.equal(storageOnly.uploads_available,false);
  assert.equal(storageOnly.storage_available,true);assert.equal(storageOnly.screening_available,false);
  assert.match(storageOnly.upload_message,/Security screening/);
  assert.equal(businessDocumentUploadPolicy({BUSINESS_DOCUMENT_SCANNER:{fetch(){}}},policy).uploads_available,false);
  await assert.rejects(businessDocumentRetention(async()=>{throw Object.assign(new Error("Denied"),{code:"42501"});}),e=>e.code==="42501");
  let calls=0;
  await assert.rejects(businessDocumentRetention(async()=>++calls===1?[{business_retention_definition:true}]:[{policy:{key:"fixed_days"}}]),e=>e.status===503);
});

test("subscription-duration migration preserves evidence and callable identity; secure uploads need no day setting",async()=>{
  const pg=await setupAnnFixtureDatabase({verifiedBusiness:true,businessDocuments:true,businessRetention:false});
  const db=annFixtureAdapter(pg),files=new Map();
  let deletes=0,scans=0;
  const env={BUSINESS_DOCUMENTS:{
    async put(key,bytes){files.set(key,new Uint8Array(bytes));},
    async get(key){return files.has(key)?{body:files.get(key)}:null;},
    async delete(key){deletes++;files.delete(key);},
  },BUSINESS_DOCUMENT_SCANNER:{async fetch(){scans++;return Response.json({clean:true,engine:"configured"});}}};
  const api=(request,e=env)=>handleBusinessDocumentRoutes(request,e,db,owner,hash);
  try{
    const [settings]=(await pg.query("SELECT settings FROM public.store_setup WHERE store_id=$1",[store])).rows;
    const before=JSON.stringify(settings);
    const initial=await (await api(new Request(root))).json();
    assert.equal(initial.retention.configured,false);
    assert.equal(initial.uploads_available,false);
    assert.match(initial.upload_message,/retention update/);
    const originalOid=(await pg.query("SELECT $1::regprocedure::oid AS oid",[identity])).rows[0].oid;
    await db.withMemberStore(store,hash,tx=>tx`SELECT public.business_document_submit(
      ${store},${hash},${0},${"IN"},${settings.settings.legal_name},${"gst_registered"},${settings.settings.gstin},${null},
      ${doc},${"gst_certificate"},${`business-verifications/${store}/${doc}`},${"old-proof.pdf"},
      ${"application/pdf"},${pdf.length},${"a".repeat(64)},${90})`);
    files.set(`business-verifications/${store}/${doc}`,pdf);
    const old=(await pg.query("SELECT id,object_key,sha256,retention_review_at FROM public.store_business_documents WHERE id=$1",[doc])).rows[0];
    await pg.exec("INSERT INTO schema_migrations(filename,checksum) VALUES('0031_business_documents.sql','isolated fixture')");
    await pg.exec(await readFile(new URL("../db/staged/0033_business_document_retention.sql",import.meta.url),"utf8"));
    assert.equal((await pg.query("SELECT $1::regprocedure::oid AS oid",[identity])).rows[0].oid,originalOid);
    const previous=(await pg.query("SELECT id,object_key,sha256,retention_review_at,retention_policy FROM public.store_business_documents WHERE id=$1",[doc])).rows[0];
    assert.deepEqual({...previous,retention_policy:undefined},{...old,retention_policy:undefined});
    assert.equal(previous.retention_policy,"subscription_lifetime_v1");
    assert.equal(files.size,1);assert.equal(deletes,0);
    const ready=await (await api(new Request(root))).json();
    assert.equal(ready.retention.configured,true);assert.equal(ready.uploads_available,true);
    assert.equal(ready.retention.during_onboarding,true);assert.equal(ready.retention.during_subscription,true);
    assert.equal(ready.retention.after_cancellation,"not_decided");assert.equal(ready.retention.automatic_deletion,false);
    const unavailable=await (await api(new Request(root),{BUSINESS_DOCUMENTS:env.BUSINESS_DOCUMENTS})).json();
    assert.equal(unavailable.retention.configured,true);assert.equal(unavailable.uploads_available,false);
    assert.match(unavailable.upload_message,/Security screening/);
    const details={expected_revision:1,country_code:"IN",legal_name:ready.gst.legal_name,
      registration_type:"gst_registered",registration_number:ready.gst.gstin,document_type:"gst_certificate",explanation:""};
    const request=()=>{
      const body=new FormData();body.set("details",JSON.stringify(details));
      body.set("file",new Blob([pdf],{type:"application/pdf"}),"replacement.pdf");
      return new Request(root,{method:"POST",headers:{origin:"https://app.lebrands.store"},body});
    };
    assert.equal((await api(request(),{BUSINESS_DOCUMENTS:env.BUSINESS_DOCUMENTS})).status,503);
    assert.equal(scans,0);assert.equal(files.size,1);
    const submitted=await api(request());
    assert.equal(submitted.status,201,await submitted.clone().text());
    const result=await submitted.json();
    assert.equal(scans,1);assert.equal(files.size,2);assert.equal(deletes,0);
    assert.equal(result.verification.status,"pending_review");
    assert.doesNotMatch(JSON.stringify(result),/object_key|business-verifications\/|sha256/);
    const rows=(await pg.query("SELECT retention_policy,retention_review_at FROM public.store_business_documents ORDER BY submission_version")).rows;
    assert.equal(rows.length,2);assert.equal(rows[1].retention_policy,"subscription_lifetime_v1");
    assert.equal(rows[1].retention_review_at,null);
    assert.equal(JSON.stringify((await pg.query("SELECT settings FROM public.store_setup WHERE store_id=$1",[store])).rows[0]),before);
    const download=await api(new Request("https://app.lebrands.store"+result.verification.documents[0].download_url));
    assert.equal(download.status,200);assert.equal(download.headers.get("cache-control"),"no-store");
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()),pdf);
    await pg.exec("SET ROLE lebrands_app");
    await assert.rejects(pg.query("UPDATE public.store_business_documents SET retention_policy='fixed_days'"),/permission denied/);
    await pg.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(pg.query("SELECT public.business_document_retention_policy()"),/permission denied/);
    await pg.exec("RESET ROLE");
  }finally{await pg.close();}
});
