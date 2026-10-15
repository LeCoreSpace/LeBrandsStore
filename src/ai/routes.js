import { SECURITY_HEADERS } from "../auth/security.js";
import { sha256,randomToken } from "../auth/passwords.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { loadDraft } from "../store/repository.js";
import { readJson } from "../store/input.js";
import { mediaUrl } from "../store/media.js";
import { attachImages,resumeWholeDraft,isWholeDraft } from "./draft-flow.js";
import { providerReady } from "./provider.js";
import { aiError } from "./input.js";
import { aiEnabled,verified,currentJob,publicJob,getJob,updateJob,startBuild,ownedMedia } from "./repository.js";
import { completeBuild } from "./complete.js";
import { renderAiBuilder } from "../ui/ai-builder.js";
import { batchPreview } from "./batch.js";
import { renderAura } from "../public/aura.js";
import { sendVerification } from "../email/service.js";

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...SECURITY_HEADERS,"content-type":"application/json"}});
export const isAiRoute=path=>/^\/(?:api\/)?stores\/[a-f0-9-]{36}\/(?:build|ai(?:\/[a-z]+)?)$/i.test(path);
export async function builderState(tx,storeId,hash,env,user) {
  const draft={...await loadDraft(tx,storeId),media:await ownedMedia(tx,storeId)},available=await aiEnabled(tx);
  const base={store_id:storeId,store_name:draft.store.name,role:await dashboardAccess(tx,storeId,user.id),draft,
    available,verified:false,provider_ready:providerReady(env)&&Boolean(env.AI_BUILD_QUEUE),
    image_ready:Boolean(env.MEDIA&&env.IMAGES),remaining_builds:0,monthly_cap_usd:20,job:null};
  if(!available)return base;
  const [allowance]=await tx`SELECT 1+COALESCE((SELECT extra_builds FROM public.ai_build_allowances WHERE store_id=${storeId}),0)
    -(SELECT count(*) FROM public.ai_generation_jobs WHERE store_id=${storeId} AND status='completed') AS remaining`;
  const [cap]=await tx`SELECT public.ai_global_cap() AS cap`;
  let job=await currentJob(tx,storeId);
  if(job?.status==="generating"&&job.lease_until&&new Date(job.lease_until).getTime()<Date.now()){
    job=await updateJob(tx,job,{status:"failed",error:"Generation was interrupted. Resume your build to continue from the saved progress.",lease_until:null});
  }
  return {...base,verified:await verified(tx,hash),remaining_builds:Number(allowance.remaining),
    monthly_cap_usd:Number(cap.cap),job:await publicJob(tx,job)};
}
export async function handleAiRoutes(request,env,db,user,hash){
  const url=new URL(request.url),match=url.pathname.match(/^\/(api\/)?stores\/([a-f0-9-]{36})\/(build|ai)(?:\/([a-z]+))?$/i);
  if(!match||!user||user.must_change_password)return json({error:"Sign in first."},401);
  const [,api,storeId,view,action="state"]=match;
  let message;
  try{
    if(!api&&view==="build"&&["GET","HEAD"].includes(request.method)){
      const state=await db.withMemberStore(storeId,hash,tx=>builderState(tx,storeId,hash,env,user));
      return new Response(request.method==="HEAD"?null:renderAiBuilder(state,user),{headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8"}});
    }
    if(!api||view!=="ai")return json({error:"Page not found."},404);
    if(request.method==="GET"&&action==="draft"){
      const page=url.searchParams.get("page")||"home";
      if(!["home","collection","product","cart","checkout"].includes(page))throw aiError("Choose a store page.");
      const html=await db.withMemberStore(storeId,hash,async tx=>{
        if(!["owner","admin"].includes(await dashboardAccess(tx,storeId,user.id)))throw aiError("Store access denied.",403);
        const job=await getJob(tx,storeId,url.searchParams.get("job_id"),null);
        const draft={...await loadDraft(tx,storeId),media:await ownedMedia(tx,storeId)};
        const data=batchPreview(draft,job);
        return renderAura(data,{page,productId:data.products[0]?.id,preview:true,commerce:true,readOnly:true,storeKey:storeId})
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
          .replace("</head>","<style>a,button,input,select,textarea{pointer-events:none}</style></head>");
      });
      return new Response(html,{headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"private, no-store"}});
    }
    if(request.method==="GET"&&action==="image"){
      const item=await db.withMemberStore(storeId,hash,async tx=>{
        const [image]=await tx`SELECT object_key FROM public.media WHERE store_id=${storeId} AND id=${url.searchParams.get("media_id")||null}
          AND to_jsonb(media)->>'ai_generated'='true' AND to_jsonb(media)->>'approval_status'<>'discarded'`;
        if(!image)throw aiError("Image not found.",404);return image;
      });
      const image=await env.MEDIA?.get(item.object_key);
      return image?new Response(image.body,{headers:{...SECURITY_HEADERS,"content-type":"image/webp"}}):json({error:"Image not found."},404);
    }
    if(request.method==="GET"&&action==="state")return json(await db.withMemberStore(storeId,hash,tx=>builderState(tx,storeId,hash,env,user)));
    if(request.method!=="POST"||!["start","verify","generate","approve","image","retry","cancel","complete","preview"].includes(action))return json({error:"Method not available."},405);
    const body=await readJson(request);
    const result=await db.withMemberStore(storeId,hash,async tx=>{
      await dashboardAccess(tx,storeId,user.id,true);
      if(action==="start")throw aiError("The previous AI builder has been retired. Continue in Build your store.",410);
      if(!await aiEnabled(tx))throw aiError("Apply the reviewed AI-builder migration before using this feature.",409);
      if(action==="verify"){
        if(!env.RESEND_API_KEY)throw aiError("Verification email is not configured yet.",503);
        const token=randomToken();
        const [row]=await tx`SELECT public.ai_issue_verification(${hash},${await sha256(token)}) AS email`;
        message={type:"verification",email:row.email,token};
        return {message:"Verification requested. Check your inbox."};
      }
      if(!await verified(tx,hash))throw aiError("Verify your email before using AI generation.",403);
      if(action==="start"){
        if(!providerReady(env)||!env.AI_BUILD_QUEUE)throw aiError("AI generation is not configured yet. Please try again later.",503);
        const wantsImages=body.brief?.brand?.section_images===true||body.brief?.products?.some(p=>p.ai_images>0);
        if(wantsImages&&(!env.MEDIA||!env.IMAGES))throw aiError("AI image storage is not configured yet.",503);
         const started=await startBuild(tx,storeId,user,hash,body.brief);
         message={type:"ai",store_id:storeId,job_id:started.id};
         return {job:await publicJob(tx,await updateJob(tx,started,{status:"queued"}))};
      }
      const job=await getJob(tx,storeId,body.job_id,action==="preview"?null:body.version);
      if(action==="preview"){
        if(job.status!=="completed")throw aiError("Save the completed draft before opening its full preview.",409);
        return {url:`/stores/${storeId}/editor`};
      }
      if(action==="cancel"){
        if(["completed","cancelled"].includes(job.status))throw aiError("This build cannot be cancelled.",409);
        return {job:await publicJob(tx,await updateJob(tx,job,{status:"cancelled",candidate:null,lease_until:null}))};
      }
      if(action==="complete")return {job:await publicJob(tx,await completeBuild(tx,job,hash))};
      if(["generate","retry"].includes(action)){
        if(!env.AI_BUILD_QUEUE)throw aiError("The AI job queue is not configured.",503);
        message={type:"ai",store_id:storeId,job_id:job.id};
         return {job:await publicJob(tx,await resumeWholeDraft(tx,job))};
      }
       if(isWholeDraft(job))throw aiError("The complete draft is being prepared automatically. Review it in the theme editor when it is ready.",409);
       if(job.status!=="review"||!job.candidate)throw aiError("Wait for this section to finish generating.",409);
      if(action==="image"){
        const image=job.candidate.images.find(i=>i.id===body.image_id);
        if(!image||image.status!=="pending"||!image.media_id)throw aiError("This image is not awaiting approval.",409);
        if(!["approve","discard","regenerate"].includes(body.decision))throw aiError("Choose an image decision.");
        if(body.decision==="regenerate"&&(!image.product_id||image.regenerations>=2))throw aiError("Only product images can be regenerated, at most twice.",409);
        await tx`UPDATE public.media SET approval_status=${body.decision==="approve"?"approved":"discarded"} WHERE store_id=${storeId} AND id=${image.media_id}`;
        if(body.decision==="regenerate"){
          image.media_id=null;image.regenerations++;message={type:"ai",store_id:storeId,job_id:job.id};
        }else image.status=body.decision==="approve"?"approved":"discarded";
        const next=await updateJob(tx,job,{candidate:job.candidate,status:body.decision==="regenerate"?"queued":"review"});
        return {job:await publicJob(tx,next)};
      }
      if(job.candidate.images.some(i=>i.status==="pending"))throw aiError("Approve or discard every image before moving on.",409);
      attachImages(job.candidate);
      const approved={...job.candidate,page:job.plan[job.cursor].page,type:job.plan[job.cursor].type,label:job.plan[job.cursor].label,
        product_id:job.plan[job.cursor].product_id};
      return {job:await publicJob(tx,await updateJob(tx,job,{approved:[...job.approved,approved],cursor:job.cursor+1,candidate:null,
        status:job.cursor+1===job.plan.length?"ready_to_save":"ready"}))};
    });
    if(message?.type==="ai"){
      try{await env.AI_BUILD_QUEUE.send(message);}
      catch{
        await db.withMemberStore(storeId,hash,async tx=>{
          const job=await getJob(tx,storeId,message.job_id,null);
           if(job.status==="queued")await updateJob(tx,job,{status:"failed",error:"The generation queue is busy. Resume your build to continue."});
        });
         throw aiError("The generation queue is busy. Resume your build to continue.",503);
      }
    }
    if(message?.type==="verification")await sendVerification(env,db,message.email,message.token,storeId,hash);
    return json(result);
  }catch(error){
    return json({error:error.status?error.message:error.code==="P0001"?error.message:
      error.code==="23505"?"An active build already exists. Resume or cancel it first.":"AI services are temporarily unavailable."},error.status||(["P0001","23505"].includes(error.code)?409:503));
  }
}
