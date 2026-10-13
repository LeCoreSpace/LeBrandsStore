import { renderAura } from "./public/aura.js";
import { auraDashboardFixture } from "./local-dashboard-fixture.js";
export function aiBuilderFixture(mode="form"){
  const base=auraDashboardFixture(), draft={...base.draft,media:base.draft.media||[]};
  const boot={store_id:base.store.store_id,store_name:base.store.name,role:"owner",available:true,
    verified:true,provider_ready:true,image_ready:true,remaining_builds:1,monthly_cap_usd:20,draft,fixture:true,job:null};
  if(["review","generating","ready","completed","failed"].includes(mode))boot.job={id:"00000000-0000-4000-8000-000000000050",
    workflow:"whole-store",status:mode==="review"||mode==="ready"?"ready_to_save":mode,version:1,
    progress:{content_ready:["review","ready","completed"].includes(mode),preview_ready:["review","ready"].includes(mode),images_total:0,images_completed:0},
    cursor:["review","ready","completed"].includes(mode)?54:2,total_steps:54,
    step:{page:"home",type:"hero",label:"Hero"},candidate:{section:{id:"default-hero",type:"hero",settings:{title:"Cotton, considered."},blocks:[]},
      copy:["Cotton, considered.","Everyday cotton canvas, made for a quieter routine."],images:[]},
    approved:["home","collection","product","cart","checkout","about","contact","faq"].map(page=>({label:page,page})),
    error:mode==="failed"?"The generation service was interrupted.":null,usage:{tokens:600,images:0,cost_usd:0.0012,cost_estimated:true}};
  boot.preview_html=renderAura(boot.draft,{preview:true,commerce:true,readOnly:true})
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
  return boot;
}
