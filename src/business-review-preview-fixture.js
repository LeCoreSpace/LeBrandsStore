// Node-only synthetic fixture. Never imported by the production Worker.
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "./ann-preview-fixture.js";
import {handleBusinessDocumentRoutes} from "./store/business-document-routes.js";
import {handleBusinessReview} from "./admin/business-review-routes.js";

export const REVIEW_FIXTURE_STORE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const REVIEW_FIXTURE_STAFF="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const REVIEW_FIXTURE_TOKEN="c".repeat(64);
const OWNER={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
const ownerToken="a".repeat(64);
const origin="https://app.lebrands.store";
const prefix="/__business-review-preview";

export async function setupBusinessReviewFixture() {
  const pg=await setupAnnFixtureDatabase({verifiedBusiness:true,businessDocuments:true,businessAccess:true,samplePolicies:true,sampleCatalogue:true});
  try {
    for(const file of ["0032_business_editor_access.sql","0033_business_document_retention.sql"])
      await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'synthetic fixture') ON CONFLICT(filename) DO NOTHING",[file]);
    await pg.exec(await readFile(new URL("../db/staged/0034_business_document_scanning.sql",import.meta.url),"utf8"));
    await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0034_business_document_scanning.sql','synthetic fixture')");
    const [before]=(await pg.query("SELECT 'public.guard_store_approval()'::regprocedure::oid AS oid")).rows;
    await pg.exec(await readFile(new URL("../db/staged/0035_business_document_review.sql",import.meta.url),"utf8"));
    const [after]=(await pg.query("SELECT 'public.guard_store_approval()'::regprocedure::oid AS oid")).rows;
    if(before.oid!==after.oid)throw new Error("Prepared function identity changed.");
    await pg.query("INSERT INTO public.users(id,name,email) VALUES($1,'Example platform reviewer','reviewer@example.invalid')",[REVIEW_FIXTURE_STAFF]);
    await pg.query("INSERT INTO public.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[REVIEW_FIXTURE_TOKEN,REVIEW_FIXTURE_STAFF]);
    await pg.query("INSERT INTO public.platform_business_reviewers(user_id) VALUES($1)",[REVIEW_FIXTURE_STAFF]);
    const files=new Map();
    const env={BUSINESS_DOCUMENTS:{
      async put(key,bytes){files.set(key,new Uint8Array(bytes));},
      async get(key){const body=files.get(key);return body?{body}:null;},
      async head(key){return files.has(key)?{size:files.get(key).length}:null;},
      async delete(key){files.delete(key);},
    },BUSINESS_DOCUMENT_SCANNER:{async fetch(){return Response.json({clean:true,engine:"configured"});}}};
    const member=annFixtureAdapter(pg);
    const api=`${origin}/api/stores/${REVIEW_FIXTURE_STORE}/business-verification`;
    const state=await (await handleBusinessDocumentRoutes(new Request(api),env,member,OWNER,ownerToken)).json();
    const form=new FormData();
    form.set("details",JSON.stringify({expected_revision:0,country_code:"IN",legal_name:state.gst.legal_name,
      registration_type:"gst_registered",registration_number:state.gst.gstin,document_type:"gst_certificate",explanation:""}));
    form.set("file",new Blob(["%PDF-1.4\nSynthetic registration test document only.\n%%EOF\n"],{type:"application/pdf"}),"synthetic-registration.pdf");
    const result=await handleBusinessDocumentRoutes(new Request(api,{method:"POST",headers:{origin},body:form}),env,member,OWNER,ownerToken);
    if(result.status!==201)throw new Error("Synthetic document setup failed.");
    const db={...member,account:fn=>pg.transaction(async trx=>{
      await trx.exec("SET LOCAL ROLE lebrands_app");
      const tx=async(parts,...values)=>(await trx.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values)).rows;
      tx.json=v=>JSON.stringify(v);
      return fn(tx);
    })};
    return {pg,db,env,files,owner:OWNER,ownerToken,user:{id:REVIEW_FIXTURE_STAFF,name:"Example platform reviewer"},
      token:REVIEW_FIXTURE_TOKEN,store:REVIEW_FIXTURE_STORE,initial:await result.json()};
  } catch(e){await pg.close();throw e;}
}

let fixture;
export async function businessReviewPreview(req,res) {
  const url=new URL(req.url,"http://localhost");
  if(url.pathname!==prefix&&!url.pathname.startsWith(`${prefix}/`))return false;
  try {
    const f=await (fixture||=setupBusinessReviewFixture().catch(e=>{fixture=null;throw e;}));
    const suffix=url.pathname.slice(prefix.length);
    const target=new URL(`/admin/business-reviews${suffix}${url.search}`,origin);
    const headers=new Headers(req.headers);
    // Synthetic fixture only; no live cookies, DB, R2 or scanner is consulted.
    if(req.method==="POST")headers.set("origin",origin);
    const options={method:req.method,headers};
    if(!["GET","HEAD"].includes(req.method))Object.assign(options,{body:Readable.toWeb(req),duplex:"half"});
    let response=await handleBusinessReview(new Request(target,options),f.env,f.db,f.user,f.token);
    if(response.headers.get("content-type")?.includes("text/html")){
      const html=(await response.text()).replaceAll("/admin/business-reviews",prefix)
        .replace("<body>",'<body><p style="padding:8px;text-align:center;background:#fff4ce" role="status">Isolated synthetic review preview. No real business evidence or account access.</p>');
      response=new Response(html,{status:response.status,headers:response.headers});
    }
    res.statusCode=response.status;
    for(const[k,v]of response.headers)res.setHeader(k,k==="location"?v.replace("/admin/business-reviews",prefix):v);
    res.end(req.method==="HEAD"?undefined:Buffer.from(await response.arrayBuffer()));
  }catch{res.statusCode=503;res.end("Synthetic business review preview unavailable.");}
  return true;
}
