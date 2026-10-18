import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

// Use the actual workerd runtime bundled with this project's Wrangler.
// Node fetch accepts redirect:"error"; Workers reject it before the HTTP call.
const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve("wrangler"));
const {Miniflare,convertV4MiniflareOptions}=wranglerRequire("miniflare");
const {build}=wranglerRequire("esbuild");

test("actual Worker runtime scans securely and never follows provider redirects",async()=>{
  const result=await build({
    stdin:{resolveDir:process.cwd(),contents:`
      import {scanBusinessDocument} from "./src/store/business-document-scanner.js";
      export default {async fetch(){
        const env={BUSINESS_DOCUMENT_SCAN_PROVIDER:"cloudmersive",
          BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED:"true",CLOUDMERSIVE_API_KEY:"synthetic-worker-scanner-key"};
        try{
          const result=await scanBusinessDocument(env,new TextEncoder().encode("%PDF-1.4\\n%%EOF\\n"),"application/pdf");
          return Response.json({success:true,provider:result.provider});
        }catch(error){
          return Response.json({success:false,status:error.status,code:error.screeningCode});
        }
      }};
    `},
    bundle:true,write:false,format:"esm",platform:"neutral",target:"es2022",
  });
  let calls=0,mode="clean";
  const mf=new Miniflare(convertV4MiniflareOptions({
    modules:true,compatibilityDate:"2026-01-01",script:result.outputFiles[0].text,
    outboundService:async request=>{
      calls++;
      assert.equal(request.url,"https://api.cloudmersive.com/virus/scan/file/advanced");
      assert.equal(request.method,"POST");
      assert.equal(request.headers.get("Apikey"),"synthetic-worker-scanner-key");
      const form=await request.formData();
      assert.equal(form.get("inputFile").name,"document.pdf");
      if(mode==="redirect")return new Response(null,{status:302,headers:{location:"https://never-follow.invalid/document"}});
      if(mode==="malware")return Response.json({CleanResult:false,FoundViruses:[{VirusName:"synthetic-test"}]});
      return Response.json({CleanResult:true,FoundViruses:null});
    },
  }));
  try{
    assert.deepEqual(await (await mf.dispatchFetch("http://scanner.test/")).json(),{success:true,provider:"cloudmersive"});
    assert.equal(calls,1,"The actual Worker must reach the provider exactly once");
    mode="redirect";
    assert.deepEqual(await (await mf.dispatchFetch("http://scanner.test/")).json(),{success:false,status:503,code:"SCANNER_PROVIDER_ERROR"});
    assert.equal(calls,2,"Redirect destination must never be contacted");
    mode="malware";
    const blocked=await (await mf.dispatchFetch("http://scanner.test/")).json();
    assert.equal(blocked.success,false);assert.equal(blocked.status,400);
    assert.equal(calls,3);
  }finally{await mf.dispose();}
});
