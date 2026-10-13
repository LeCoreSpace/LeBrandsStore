import { auraDashboardFixture } from "./local-dashboard-fixture.js";
export function aiBuilderFixture(mode="form"){
  const base=auraDashboardFixture(), draft={...base.draft,media:base.draft.media||[]};
  const boot={store_id:base.store.store_id,store_name:base.store.name,role:"owner",available:true,
    verified:true,provider_ready:true,image_ready:true,remaining_builds:1,monthly_cap_usd:20,draft,fixture:true,job:null};
  if(mode==="review")boot.job={id:"00000000-0000-4000-8000-000000000050",status:"review",version:1,cursor:2,total_steps:54,
    step:{page:"home",type:"hero",label:"Hero"},candidate:{section:{id:"default-hero",type:"hero",settings:{title:"Cotton, considered."},blocks:[]},
      copy:["Cotton, considered.","Everyday cotton canvas, made for a quieter routine."],images:[]},
    approved:[{label:"Announcement",page:"home"},{label:"Header",page:"home"}],error:null,usage:{tokens:600,images:0,cost_usd:0.0012,cost_estimated:true}};
  return boot;
}
