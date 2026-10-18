import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {scanBusinessDocument,businessDocumentScannerStatus} from "../src/store/business-document-scanner.js";
import {businessDocumentUploadPolicy} from "../src/store/business-document-policy.js";
import {handleBusinessDocumentRoutes} from "../src/store/business-document-routes.js";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {migrationSelection} from "../db/migration-selection.js";
const pdf=new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const managed={BUSINESS_DOCUMENT_SCAN_PROVIDER:"cloudmersive",
  BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED:"true",CLOUDMERSIVE_API_KEY:"synthetic-test-key"};
const clean=()=>Response.json({CleanResult:true,FoundViruses:[],ContainsScript:false});

test("managed scanner requires named processor approval and a key; never falls back to another scanner",async()=>{
  let calls=0;
  for(const env of [{},{...managed,CLOUDMERSIVE_API_KEY:""},{...managed,BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED:"false"},
    {...managed,BUSINESS_DOCUMENT_SCAN_PROVIDER:"disabled",BUSINESS_DOCUMENT_SCANNER:{fetch(){calls++;return clean();}}}]){
    assert.equal(businessDocumentScannerStatus(env).available,false);
    await assert.rejects(scanBusinessDocument(env,pdf,"application/pdf",{fetchImpl:async()=>{calls++;return clean();}}),e=>e.status===503);
  }
  assert.equal(calls,0);
  const policy={configured:true};
  assert.equal(businessDocumentUploadPolicy({...managed,BUSINESS_DOCUMENTS:{put(){}}},policy).uploads_available,false);
  assert.equal(businessDocumentUploadPolicy({...managed,BUSINESS_DOCUMENTS:{put(){}}},policy,{managedBudgetAvailable:true}).uploads_available,true);
});

test("Cloudmersive advanced API contract sends only bytes with a generic filename and strict policies",async()=>{
  let calls=0;
  const result=await scanBusinessDocument(managed,pdf,"application/pdf",{fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,"https://api.cloudmersive.com/virus/scan/file/advanced");
    assert.equal(options.method,"POST");assert.equal(options.redirect,"error");
    assert.equal(options.headers.Apikey,"synthetic-test-key");
    assert.equal(options.headers.restrictFileTypes,".pdf,.png,.jpg,.jpeg");
    for(const key of ["allowExecutables","allowInvalidFiles","allowScripts","allowPasswordProtectedFiles",
      "allowMacros","allowXmlExternalEntities","allowInsecureDeserialization","allowHtml",
      "allowUnsafeArchives","allowOleEmbeddedObject","allowUnwantedAction"])assert.equal(options.headers[key],"false");
    assert.deepEqual([...options.body.keys()],["inputFile"]);
    const file=options.body.get("inputFile");assert.equal(file.name,"document.pdf");
    assert.equal(file.type,"application/pdf");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()),pdf);
    assert.ok(options.signal instanceof AbortSignal);
    return clean();
  }});
  assert.equal(calls,1);assert.equal(result.provider,"cloudmersive");assert.equal(result.engine,"advanced");
  assert.ok(Number.isFinite(Date.parse(result.scanned_at)));
});

test("managed scanning rejects malicious, contradictory, malformed, oversized, redirected and unavailable responses",async()=>{
  const cases=[
    [()=>Response.json({CleanResult:false,FoundViruses:[]}),400],
    [()=>Response.json({CleanResult:true,FoundViruses:[{VirusName:"private-threat",FileName:"private-name"}]}),400],
    [()=>Response.json({CleanResult:true,FoundViruses:[],ContainsPasswordProtectedFile:true}),400],
    [()=>Response.json({CleanResult:true,FoundViruses:[],ContainsScript:true}),400],
    [()=>Response.json({CleanResult:"true",FoundViruses:[]}),503],
    [()=>Response.json({CleanResult:true}),503],
    [()=>Response.json({CleanResult:true,FoundViruses:[],ContainsScript:"false"}),503],
    [()=>new Response("private provider error",{status:401}),503],
    [()=>new Response("quota",{status:429}),503],
    [()=>new Response(null,{status:302,headers:{location:"https://untrusted.example"}}),503],
    [()=>new Response("<html>private</html>",{headers:{"content-type":"text/html"}}),503],
    [()=>new Response("not-json",{headers:{"content-type":"application/json"}}),503],
    [()=>new Response('"'+("x".repeat(65536))+'"',{headers:{"content-type":"application/json"}}),503],
    [()=>{throw new DOMException("private timeout","TimeoutError");},503],
  ];
  for(const [response,status] of cases){
    let calls=0;
    await assert.rejects(scanBusinessDocument(managed,pdf,"application/pdf",{fetchImpl:async()=>{calls++;return response();}}),
      e=>e.status===status&&!/private|synthetic-test-key/.test(e.message));
    assert.equal(calls,1,"No retries that could repeat paid processing");
  }
});

test("screening distinguishes provider failures without exposing upstream bodies or transport details",async()=>{
  for(const [status,code] of [[401,"SCANNER_AUTHENTICATION"],[403,"SCANNER_AUTHENTICATION"],
    [402,"SCANNER_RATE_LIMIT"],[429,"SCANNER_RATE_LIMIT"],[413,"SCANNER_FILE_LIMIT"],[500,"SCANNER_PROVIDER_ERROR"]]){
    await assert.rejects(scanBusinessDocument(managed,pdf,"application/pdf",{
      fetchImpl:async()=>new Response("private-provider-body synthetic-test-key",{status}),
    }),e=>e.status===503&&e.screeningCode===code&&e.providerStatus===status&&!/private-provider-body|synthetic-test-key/.test(e.message));
  }
  for(const [error,code] of [[new DOMException("private-timeout","TimeoutError"),"SCANNER_TIMEOUT"],
    [new TypeError("private-network-address"),"SCANNER_NETWORK"]]){
    await assert.rejects(scanBusinessDocument(managed,pdf,"application/pdf",{
      fetchImpl:async()=>{throw error;},
    }),e=>e.screeningCode===code&&!/private/.test(e.message));
  }
  await assert.rejects(scanBusinessDocument(managed,pdf,"application/pdf",{
    fetchImpl:async()=>Response.json({CleanResult:"unknown",FoundViruses:[]}),
  }),e=>e.screeningCode==="SCANNER_RESPONSE");
});

test("managed upload uses committed durable budgets, scan-before-storage and private provenance (mock provider)",async t=>{
  assert.deepEqual(migrationSelection(["--staged-business-document-scanning"]),{
    staged:true,filename:"0034_business_document_scanning.sql",requires:"0033_business_document_retention.sql",
  });
  const pg=await setupAnnFixtureDatabase({verifiedBusiness:true,businessDocuments:true});
  const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hash="a".repeat(64);
  const db=annFixtureAdapter(pg),owner={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
  const root=`https://app.lebrands.store/api/stores/${store}/business-verification`;
  const files=new Map();let scans=0,provider=()=>{throw new Error("private transport failure");},storageFails=false;
  const env={...managed,BUSINESS_DOCUMENTS:{
    async put(key,bytes,metadata){if(storageFails)throw new Error("private storage error");files.set(key,{bytes,metadata});},
    async delete(key){files.delete(key);},
  }};
  const api=(req,bindings=env)=>handleBusinessDocumentRoutes(req,bindings,db,owner,hash);
  const used=async()=>Number((await pg.query("SELECT used FROM public.business_document_scan_budgets WHERE scope='platform-month'")).rows[0]?.used||0);
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    assert.equal(url,"https://api.cloudmersive.com/virus/scan/file/advanced");
    scans++;assert.equal(await used(),scans,"Reservation already committed before external processing");
    assert.equal(options.body.get("inputFile").name,"document.pdf");
    return provider();
  });
  try{
    const unavailable=await (await api(new Request(root))).json();
    assert.equal(unavailable.uploads_available,false);
    assert.match(unavailable.upload_message,/database update/);
    await pg.exec("INSERT INTO schema_migrations(filename,checksum) VALUES('0033_business_document_retention.sql','isolated fixture')");
    await pg.exec(await readFile(new URL("../db/staged/0034_business_document_scanning.sql",import.meta.url),"utf8"));
    const state=await (await api(new Request(root))).json();
    assert.equal(state.uploads_available,true);assert.equal(state.screening_provider,"cloudmersive");
    const request=(revision=0)=>{
      const body=new FormData();body.set("details",JSON.stringify({
        expected_revision:revision,country_code:"IN",legal_name:state.gst.legal_name,
        registration_type:"gst_registered",registration_number:state.gst.gstin,document_type:"gst_certificate",explanation:"",
      }));
      body.set("file",new Blob([pdf],{type:"application/pdf"}),"very-private-gst-certificate.pdf");
      return new Request(root,{method:"POST",headers:{origin:"https://app.lebrands.store"},body});
    };
    assert.equal((await api(request(),{...env,BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED:"false"})).status,503);
    assert.equal(await used(),0);assert.equal(scans,0);
    const failed=await api(request());
    assert.equal(failed.status,503);assert.equal((await failed.json()).screening_code,"SCANNER_NETWORK");
    assert.equal(await used(),1);assert.equal(files.size,0);
    provider=()=>Response.json({CleanResult:false,FoundViruses:[{FileName:"private",VirusName:"private"}]});
    const blocked=await api(request());assert.equal(blocked.status,400);
    assert.doesNotMatch(await blocked.text(),/VirusName|FileName|synthetic-test-key/);
    assert.equal(await used(),2);assert.equal(files.size,0);
    provider=clean;
    const uploaded=await api(request());assert.equal(uploaded.status,201,await uploaded.clone().text());
    assert.equal(await used(),3);assert.equal(files.size,1);
    const saved=[...files.values()][0];
    assert.equal(saved.metadata.httpMetadata.contentType,"application/octet-stream");
    assert.equal(saved.metadata.customMetadata.scanProvider,"cloudmersive");
    assert.equal(saved.metadata.customMetadata.scanEngine,"advanced");
    assert.match(saved.metadata.customMetadata.sha256,/^[a-f0-9]{64}$/);
    assert.equal((await api(request())).status,409);assert.equal(await used(),3);assert.equal(scans,3);
    provider=()=>Response.json({CleanResult:"true",FoundViruses:[]});
    assert.equal((await api(request(1))).status,503);assert.equal(await used(),4);
    provider=clean;storageFails=true;
    assert.equal((await api(request(1))).status,503);assert.equal(await used(),5);assert.equal(files.size,1);
    assert.equal((await api(request(1))).status,429);assert.equal(scans,5);assert.equal(await used(),5);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.store_business_documents")).rows[0].n,1);
    await pg.exec("SET ROLE lebrands_app");
    await assert.rejects(pg.query("SELECT public.business_document_reserve_scan($1,$2)",[store,"b".repeat(64)]),e=>e.code==="42501");
    await assert.rejects(pg.query("SELECT public.business_document_reserve_scan($1,$2)",["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",hash]),e=>e.code==="42501");
    await assert.rejects(pg.exec("UPDATE public.business_document_scan_budgets SET used=0"),/permission denied/);
    await pg.exec("RESET ROLE");
    // Independent monthly caps also fail closed without spending another call.
    await pg.exec("UPDATE public.business_document_scan_budgets SET used=CASE WHEN scope='platform-month' THEN 500 ELSE 0 END");
    assert.equal((await api(request(1))).status,429);assert.equal(scans,5);
    await pg.exec("UPDATE public.business_document_scan_budgets SET used=CASE WHEN scope LIKE 'store-month:%' THEN 30 ELSE 0 END");
    assert.equal((await api(request(1))).status,429);assert.equal(scans,5);
  }finally{await pg.close();}
});
