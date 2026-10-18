import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase} from "../src/ann-preview-fixture.js";
import {businessEditorAccess,requireBusinessEditorAccess,protectedEditorLinks} from "../src/store/business-access.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
import {handlePageRoutes} from "../src/store/page-routes.js";
import {handleStoreRoutes} from "../src/store/routes.js";
import {handleStyleStudio} from "../src/store/style-routes.js";
import {handleBusinessDocumentRoutes} from "../src/store/business-document-routes.js";
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const owner={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},editor={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};
const hash="a".repeat(64),editorHash="b".repeat(64),origin="https://app.lebrands.store";
function adapter(pg){return {withMemberStore:(id,token,fn)=>pg.transaction(async tr=>{
  await tr.exec("SET LOCAL ROLE lebrands_app");
  const a=await tr.query("SELECT public.authorize_store_session($1,$2) AS ok",[token,id]);
  if(!a.rows[0]?.ok)throw Object.assign(new Error("Forbidden"),{status:403});
  await tr.query("SELECT set_config('app.store_id',$1,true)",[id]);
  const tx=async(parts,...values)=>(await tr.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values)).rows;
  tx.json=JSON.stringify;return fn(tx);
})};}
const req=(path,method="GET",body)=>new Request(origin+path,{method,headers:{origin,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
const root=id=>`/api/stores/${id}`;
const env=()=>({BUSINESS_DOCUMENT_RETENTION_DAYS:"90",BUSINESS_DOCUMENT_SCANNER:{async fetch(){return Response.json({clean:true,engine:"configured"});}},
  BUSINESS_DOCUMENTS:{async put(){},async delete(){}}});
async function submit(pg,id,details,file=true){
  const form=new FormData();form.set("details",JSON.stringify(details));
  if(file)form.set("file",new Blob(["%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"],{type:"application/pdf"}),"fictional-proof.pdf");
  return handleBusinessDocumentRoutes(new Request(origin+root(id)+"/business-verification",{method:"POST",headers:{origin},body:form}),env(),adapter(pg),owner,hash);
}

test("migration assigns every existing store India without rewriting accounts, evidence or prepared functions; new stores require an explicit country",async()=>{
  const pg=await setupAnnFixtureDatabase({verifiedBusiness:true,businessDocuments:true});
  try{
    await pg.query("UPDATE public.users SET country_code='GB',phone='+447911123456' WHERE id=$1",[owner.id]);
    const oid=(await pg.query("SELECT 'public.ann_save_session(uuid,text,integer,text,jsonb)'::regprocedure::oid AS oid")).rows[0].oid;
    const before=JSON.stringify((await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[store])).rows[0]);
    await pg.exec("INSERT INTO schema_migrations(filename,checksum) VALUES('0031_business_documents.sql','isolated fixture') ON CONFLICT(filename) DO NOTHING");
    await pg.exec(await readFile(new URL("../db/staged/0032_business_editor_access.sql",import.meta.url),"utf8"));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM stores s LEFT JOIN store_business_access a USING(store_id) WHERE a.business_country IS DISTINCT FROM 'IN'")).rows[0].n,0);
    assert.equal((await pg.query("SELECT country_code FROM users WHERE id=$1",[owner.id])).rows[0].country_code,"GB");
    assert.equal((await pg.query("SELECT 'public.ann_save_session(uuid,text,integer,text,jsonb)'::regprocedure::oid AS oid")).rows[0].oid,oid);
    assert.equal(JSON.stringify((await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[store])).rows[0]),before);
    const db=adapter(pg);
    let access=await db.withMemberStore(store,hash,tx=>businessEditorAccess(tx,store,hash));
    assert.equal(access.business_country,"IN");assert.equal(access.reason,"documents_required");assert.equal(access.allowed,false);
    await assert.rejects(db.withMemberStore(store,hash,tx=>requireBusinessEditorAccess(tx,store,hash)),e=>e.status===403);
    const html=protectedEditorLinks(`<a href="/stores/${store}/editor">Theme editor</a><a href="/stores/${store}/products">Products</a>`,store,access);
    assert.match(html,/aria-disabled="true"/);assert.doesNotMatch(html,new RegExp(`\\shref="/stores/${store}/editor"`));
    assert.match(html,new RegExp(`href="/stores/${store}/products"`));
    assert.equal((await handleAnnRoutes(req(root(store)+"/ann/design","POST",{}),{},db,owner,hash)).status,403);
    assert.equal((await handleStoreRoutes(req(root(store)+"/setup","PATCH",{settings:{font_preset:"serif"}}),{},db,owner,hash)).status,403);
    assert.equal((await handlePageRoutes(req(root(store)+"/pages/home","PUT",{}),{},db,owner,hash)).status,403);
    const blocked=await handleStyleStudio(req(`/stores/${store}/styles`),{},db,owner,hash);
    assert.equal(blocked.status,303);assert.match(blocked.headers.get("location"),/build\/ann/);
    const current=await handleBusinessDocumentRoutes(req(root(store)+"/business-verification"),env(),db,owner,hash);
    const state=await current.json();
    const saved=await submit(pg,store,{expected_revision:0,country_code:"IN",legal_name:state.gst.legal_name,
      registration_type:"gst_registered",registration_number:state.gst.gstin,document_type:"gst_certificate",explanation:""});
    assert.equal(saved.status,201,await saved.clone().text());
    access=await db.withMemberStore(store,hash,tx=>businessEditorAccess(tx,store,hash));
    assert.equal(access.allowed,true);assert.equal(access.status,"pending_review");
    await pg.query("UPDATE store_business_verifications SET status='changes_requested',feedback='Replace the certificate' WHERE store_id=$1",[store]);
    assert.equal((await db.withMemberStore(store,hash,tx=>businessEditorAccess(tx,store,hash))).reason,"changes_requested");
    assert.equal(JSON.stringify((await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[store])).rows[0]),before);

    await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'New example','New example')",[other]);
    await pg.query("INSERT INTO stores(store_id,brand_id,name,subdomain) VALUES($1,$1,'New example','new-example-access')",[other]);
    await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')",[other,owner.id,editor.id]);
    await pg.query("INSERT INTO store_setup(store_id,settings) VALUES($1,'{}')",[other]);
    access=await db.withMemberStore(other,hash,tx=>businessEditorAccess(tx,other,hash));
    assert.equal(access.business_country,null);assert.equal(access.reason,"country_required");
    const bad=await handleAnnRoutes(req(root(other)+"/ann/country","PATCH",{country_code:"GB",expected_revision:1,confirm:true}),{},db,editor,editorHash);
    assert.equal(bad.status,403);
    const country=await handleAnnRoutes(req(root(other)+"/ann/country","PATCH",{country_code:"GB",expected_revision:1,confirm:true}),{},db,owner,hash);
    assert.equal(country.status,200,await country.clone().text());
    const countryState=await country.json();
    assert.equal(countryState.business_access.business_country,"GB");assert.equal(countryState.verification.state,"unverified");
    const evidence=await submit(pg,other,{expected_revision:0,country_code:"GB",legal_name:"Example British Business",
      registration_type:"business_registered",registration_number:"EXAMPLE-GB-123",document_type:"business_registration",explanation:""});
    assert.equal(evidence.status,201,await evidence.clone().text());
    access=await db.withMemberStore(other,hash,tx=>businessEditorAccess(tx,other,hash));
    assert.equal(access.allowed,true);assert.equal(access.gst_required,false);assert.equal(access.status,"pending_review");
    const exception=await submit(pg,other,{expected_revision:1,country_code:"GB",legal_name:"Example British Business",
      registration_type:"not_registered",registration_number:"",document_type:"",explanation:"This fictional business does not require registration; please assess this exception manually."},false);
    assert.equal(exception.status,201,await exception.clone().text());
    assert.equal((await db.withMemberStore(other,hash,tx=>businessEditorAccess(tx,other,hash))).reason,"exception_review_required");
    await pg.query("UPDATE store_business_verifications SET status='approved' WHERE store_id=$1",[other]);
    assert.equal((await db.withMemberStore(other,hash,tx=>businessEditorAccess(tx,other,hash))).allowed,true);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM store_gstin_verifications WHERE store_id=$1",[other])).rows[0].n,0);
    await pg.exec("SET ROLE lebrands_app");
    await assert.rejects(pg.query("UPDATE store_business_access SET business_country='GB'"),/permission denied/);
    await pg.exec("RESET ROLE");
  }finally{await pg.close();}
});
