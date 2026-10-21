import {SECURITY_HEADERS} from "../auth/security.js";
import {UUID} from "../public/validation.js";
import {dashboardAccess} from "../dashboard/repository.js";
import {readJson} from "../store/input.js";
import {mediaUrl} from "../store/media.js";
import {capacityError} from "../billing/capacity.js";
import {imagePlacements,imageInput} from "./placements.js";
import {imageProviderReady} from "./provider.js";
import {decode,imageSchema,imageJob,publicImageJob} from "./repository.js";

export const isMediaImagePath=p=>/^\/api\/stores\/[^/]+\/media-library\/ai(?:\/[^/]+(?:\/(?:image|save))?)?$/.test(p);
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
export async function handleMediaImages(request,env,db,user,token){
  const url=new URL(request.url),m=url.pathname.match(/^\/api\/stores\/([^/]+)\/media-library\/ai(?:\/([^/]+)(?:\/(image|save))?)?$/);
  const headers={...SECURITY_HEADERS,"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};
  const json=(body,status=200)=>new Response(request.method==="HEAD"?null:JSON.stringify(body),
    {status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try{
    if(!user||user.must_change_password)fail("Sign in to generate images.",401);
    if(!m||!UUID.test(m[1])||m[2]&&!UUID.test(m[2]))fail("Image not found.",404);
    const[,id,jobId,action]=m,read=["GET","HEAD"].includes(request.method);
    if(!read&&request.method!=="POST"||read&&action==="save"||!read&&jobId&&action!=="save")fail("Method not allowed.",405);
    if(!read&&request.headers.get("origin")!==url.origin)fail("Open the media library in your store dashboard before continuing.",403);
    const body=!read?await readJson(request):null;
    const state=await db.withMemberStore(id,token,async tx=>{
      const role=await dashboardAccess(tx,id,user.id);
      if(!["owner","admin","editor"].includes(role))fail("You cannot view this store's media.",403);
      const[setup]=await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
      const placements=imagePlacements(decode(setup?.settings)||{},id),schema=await imageSchema(tx);
      const enabled=schema&&env.MEDIA_IMAGE_TRIAL_ENABLED==="true"&&imageProviderReady(env)&&Boolean(env.AI_BUILD_QUEUE&&env.MEDIA);
      const reason=role!=="owner"?"Only the store owner can use the image-generation trial."
        :!schema?"Image generation is awaiting its database update."
        :!enabled?"The image-generation trial is not enabled. Your existing media is unchanged.":null;
      if(!jobId&&read){
        if(!schema||role!=="owner")return{available:enabled,can_generate:false,reason,trial:true,remaining:0,placements,jobs:[]};
        await tx`SELECT set_config('app.media_image_token',${token},true)`;
        const jobs=await tx`SELECT * FROM public.media_image_jobs WHERE store_id=${id}
          ORDER BY CASE WHEN status IN('queued','generating','ready') THEN 0 ELSE 1 END,created_at DESC LIMIT 50`;
        const[count]=await tx`SELECT count(*)::integer AS used FROM public.media_image_jobs WHERE store_id=${id}
          AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
        const remaining=Math.max(0,3-count.used),busy=jobs.some(j=>["queued","generating"].includes(j.status));
        const full=jobs.filter(j=>j.status==="ready").length>=5;
        return{available:enabled,can_generate:enabled&&remaining>0&&!busy&&!full,reason:reason||(!remaining?"Your three image requests for today have been used. The limit resets at 00:00 UTC.":busy?"An image is already being generated.":full?"Save an existing preview to your library before generating another image.":null),
          trial:true,remaining,placements,jobs:jobs.map(publicImageJob)};
      }
      if(role!=="owner")fail("Only the store owner can use this trial.",403);
      if(!schema)fail("Image generation is awaiting its database update.",503);
      await tx`SELECT set_config('app.media_image_token',${token},true)`;
      if(jobId){
        const job=await imageJob(tx,id,jobId);
        if(read&&action==="image"){
          if(!["ready","saved"].includes(job.status))fail("The image is not ready yet.",409);
          return{imageKey:job.object_key};
        }
        if(read)return{job:publicImageJob(job)};
        if(Object.keys(body||{}).length)fail("Use the image Save button.",400);
        const[row]=await tx`SELECT to_jsonb(public.media_image_save(${id},${token},${jobId})) AS job`;
        const saved=decode(row.job);
        return{job:publicImageJob(saved),media:{id:saved.media_id,url:mediaUrl(saved.object_key),width:saved.width,height:saved.height}};
      }
      if(!enabled)fail(reason||"Image generation is unavailable.",503);
      const input=imageInput(body,placements);
      const[row]=await tx`SELECT to_jsonb(public.media_image_create(${id},${token},${input.request_id},${input.id},
        ${input.prompt},${input.width},${input.height},${input.reference_id})) AS job`;
      const job=decode(row.job);
      return{job:publicImageJob(job),queue:job.status==="queued"?{type:"media-image",store_id:id,job_id:job.id}:null};
    },{lockStore:!read});
    if(state.imageKey){
      const object=request.method==="HEAD"?await env.MEDIA.head(state.imageKey):await env.MEDIA.get(state.imageKey);
      if(!object)fail("The generated image is temporarily unavailable.",503);
      return new Response(request.method==="HEAD"?null:object.body,{headers:{...headers,"content-type":"image/webp","x-content-type-options":"nosniff"}});
    }
    if(state.queue){
      // The committed job can be recovered by the existing scheduled worker if
      // delivery fails. A repeated queue message cannot repeat a provider call.
      try{await env.AI_BUILD_QUEUE.send(state.queue);}catch{}
      delete state.queue;
    }
    return json(state,!read&&!jobId?202:200);
  }catch(error){
    const capacity=capacityError(error);
    const status=capacity?.status||error.status||(["42501"].includes(error.code)?403:["22023","P0001"].includes(error.code)?409:503);
    const safe=capacity?.message||(error.status||["22023","P0001"].includes(error.code)?error.message:
      status===403?"You do not have access to this image.":"Image generation is temporarily unavailable. Your existing media is unchanged.");
    return json({error:safe},status);
  }
}
