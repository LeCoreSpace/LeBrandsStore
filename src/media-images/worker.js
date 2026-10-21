import {createDb} from "../db.js";
import {UUID} from "../public/validation.js";
import {MEDIA_KEY,validateUpload} from "../store/media.js";
import {requestMediaImage,imageProviderReady} from "./provider.js";
import {imageSchema} from "./repository.js";

export async function processMediaImage(message,env,providedDb){
  if(!UUID.test(message?.store_id||"")||!UUID.test(message?.job_id||""))return;
  // Disabled/unfinished configuration must not dispatch a paid request.
  if(env.MEDIA_IMAGE_TRIAL_ENABLED!=="true"||!imageProviderReady(env)||!env.MEDIA)throw new Error("Media image trial unavailable.");
  const db=providedDb||createDb(env),store=message.store_id;
  let job,finalizing=false;
  try{
    [job]=await db.withStore(store,tx=>tx`SELECT * FROM public.media_image_claim(${store},${message.job_id})`);
    if(!job)return; // Already claimed: no duplicate paid retries.
    let reference;
    if(job.reference_id){
      const[media]=await db.withStore(store,tx=>tx`SELECT object_key,content_type FROM public.media WHERE store_id=${store} AND id=${job.reference_id}`);
      if(!media||!MEDIA_KEY.test(media.object_key)||!media.object_key.startsWith(`stores/${store}/`))throw new Error("Reference is no longer available.");
      const object=await env.MEDIA.get(media.object_key);
      if(!object||object.size>4194304)throw new Error("Reference is no longer available.");
      const bytes=new Uint8Array(await object.arrayBuffer()),meta=validateUpload(bytes,"image");
      if(meta.width*meta.height>4000000)throw new Error("Reference exceeds the image limit.");
      reference={bytes,contentType:meta.contentType,ext:meta.ext};
    }
    const result=await requestMediaImage(env,{prompt:job.prompt,width:job.width,height:job.height,reference});
    if(result.meta.ext!=="webp")throw new Error("Provider output was not WebP.");
    await env.MEDIA.put(job.object_key,result.bytes,{httpMetadata:{contentType:"image/webp"},
      customMetadata:{media_ai_trial:"true"}});
    const patch={status:"ready",content_type:"image/webp",size_bytes:result.bytes.length,
      provider_ms:result.provider_ms,total_ms:Date.now()-new Date(job.created_at).getTime(),usage:result.usage};
    finalizing=true;
    await db.withStore(store,tx=>tx`SELECT public.media_image_finish(${store},${job.id},${JSON.stringify(patch)}::jsonb)`);
  }catch(error){
    if(!job)throw error;
    if(finalizing)throw error;
    // Clean up before releasing reserved storage. On a database/network error
    // leave the claimed job for scheduled recovery, never call OpenAI again.
    await env.MEDIA.delete(job.object_key);
    const patch={status:"failed",error:error.status?error.message:"This image could not be completed. Your existing media is unchanged.",
      total_ms:Date.now()-new Date(job.created_at).getTime()};
    await db.withStore(store,tx=>tx`SELECT public.media_image_finish(${store},${job.id},${JSON.stringify(patch)}::jsonb)`);
  }finally{if(!providedDb)await db.close();}
}

export async function scheduleMediaImages(env){
  if(env.MEDIA_IMAGE_TRIAL_ENABLED!=="true"||!env.AI_BUILD_QUEUE||!env.MEDIA||!imageProviderReady(env))return;
  const db=createDb(env);
  try{
    if(!await db.account(imageSchema))return;
    const jobs=await db.account(tx=>tx`SELECT * FROM public.media_image_pending()`);
    for(const job of jobs){
      if(job.status==="queued")await env.AI_BUILD_QUEUE.send({type:"media-image",store_id:job.store_id,job_id:job.id});
      else{
        await env.MEDIA.delete(job.object_key);
        const patch={status:"failed",error:"Generation was interrupted. This request was not automatically retried."};
        await db.withStore(job.store_id,tx=>tx`SELECT public.media_image_finish(${job.store_id},${job.id},${JSON.stringify(patch)}::jsonb)`);
      }
    }
  }finally{await db.close();}
}
