// Development-only, synthetic in-memory data. Never imported by the Worker.
import {readFile} from "node:fs/promises";
import {setupBusinessReviewFixture} from "./business-review-preview-fixture.js";
import {handleAnnRoutes} from "./store/ann-routes.js";
import {handleBillingRoutes} from "./billing/routes.js";
import {businessEditorAccess} from "./store/business-access.js";
import {loadDraft} from "./store/repository.js";
import {annReference,annSessionResponse,loadAnnSession} from "./store/ann-repository.js";
import {renderAnnBuilder} from "./ui/ann-builder.js";
import {REGISTRATION_COUNTRIES} from "./public/registration-validation.js";
let fixture;
async function create(){
  const f=await setupBusinessReviewFixture();
  for(const file of ["0037_platform_billing.sql","0038_free_subscriptions.sql","0039_ann_plan_selection.sql"]){
    // setupBusinessReviewFixture applies real review DDL but does not record
    // schema_migrations because its base tables are an isolated test harness.
    await f.pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'local fixture') ON CONFLICT DO NOTHING",
      [file==="0037_platform_billing.sql"?"0035_business_document_review.sql":file==="0038_free_subscriptions.sql"?"0037_platform_billing.sql":"0038_free_subscriptions.sql"]);
    await f.pg.exec(await readFile(new URL(`../db/staged/${file}`,import.meta.url),"utf8"));
  }
  await f.pg.query("UPDATE public.stores SET billing_enrolment_required=true WHERE store_id=$1",[f.store]);
  return f;
}
export async function annPlanPreview(req,res){
  const url=new URL(req.url||"/","http://local");
  if(!url.pathname.startsWith("/__ann-plan-preview"))return false;
  try{
    fixture ||= create();
    const f=await fixture,{store,db,owner,ownerToken}=f;
    let response;
    if(url.pathname==="/__ann-plan-preview"||url.pathname==="/__ann-plan-preview/"){
      if(!["GET","HEAD"].includes(req.method))response=new Response("Method not allowed",{status:405});
      else {
        const html=await db.withMemberStore(store,ownerToken,async tx=>{
          const data={...await loadDraft(tx,store),role:"owner",
            business_access:await businessEditorAccess(tx,store,ownerToken),
            business_countries:REGISTRATION_COUNTRIES.map(({code,name})=>({code,name}))};
          return renderAnnBuilder(data,owner,{
            apiRoot:"/__ann-plan-preview/api/ann",
            reference:await annReference(tx),
            sessionResponse:await annSessionResponse(tx,store,await loadAnnSession(tx,store))
          });
        });
        response=new Response(req.method==="HEAD"?null:html,{headers:{"content-type":"text/html; charset=utf-8"}});
      }
    }else {
      const match=url.pathname.match(/^\/__ann-plan-preview\/api\/(ann(?:\/[a-z-]+)?|subscription(?:\/free)?)$/);
      if(!match)response=new Response("Not found",{status:404});
      else {
        const chunks=[];let bytes=0;
        if(!["GET","HEAD"].includes(req.method)){
          for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)throw new Error("Fixture request too large");chunks.push(chunk);}
        }
        const request=new Request(`https://app.lebrands.store/api/stores/${store}/${match[1]}${url.search}`,{
          method:req.method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},
          ...(!["GET","HEAD"].includes(req.method)?{body:Buffer.concat(chunks)}:{})
        });
        response=match[1].startsWith("subscription")
          ?await handleBillingRoutes(request,db,owner,ownerToken)
          :await handleAnnRoutes(request,{},db,owner,ownerToken);
      }
    }
    res.writeHead(response.status,{...Object.fromEntries(response.headers),"cache-control":"no-store"});
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){
    console.error("Isolated Ann plan preview failed",error.message);
    res.writeHead(503,{"content-type":"text/plain"});res.end("The isolated Ann plan preview is unavailable.");
  }
  return true;
}
