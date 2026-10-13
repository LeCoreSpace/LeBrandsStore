import { createDb } from "../db.js";
import { getJob, updateJob, prospectiveDraft,ownedMedia } from "./repository.js";
import { loadDraft } from "../store/repository.js";
import { systemPrompt,validateCandidate,optionalFacts,productContent } from "./plan.js";
import { generateText,verifyFacts,generateImage } from "./provider.js";
import { aiError } from "./input.js";
import { validateUpload,mediaUrl } from "../store/media.js";
import { isWholeDraft,advanceWholeDraft } from "./draft-flow.js";
import { storePrompt,validateStoreCopy } from "./batch.js";

async function paid(db,storeId,jobId,kind,fn) {
  const operation = crypto.randomUUID();
  await db.withStore(storeId,tx=>tx`SELECT public.ai_budget_reserve(${storeId},${jobId},${operation},${kind})`);
  let usage;
  try {
    usage = await fn();
    return usage;
  } finally {
    await db.withStore(storeId,tx=>tx`SELECT public.ai_budget_settle(${storeId},${operation},
      ${usage?.input_tokens??0},${usage?.output_tokens??0},${usage?.images??0},
      ${usage?.cost_usd??(kind==="text"?0.20:0.35)})`);
  }
}
function imageSlots(job,step,draft) {
  if (!optionalFacts(job.brief,step)) return [];
  const media = new Map(draft.media.map(m=>[m.id,m]));
  if (step.type==="product-content") {
    const product = job.brief.products.find(p=>p.id===step.product_id), source=media.get(product.photo_ids[0]);
    return Array.from({length:product.ai_images},(_,n)=>({id:crypto.randomUUID(),media_id:null,status:"pending",
      regenerations:0,product_id:product.id,source_key:source.key,label:product.image_styles[n%product.image_styles.length],style:product.image_styles[n%product.image_styles.length]}));
  }
  const count = job.approved.flatMap(a=>a.images||[]).filter(i=>!i.product_id).length;
  if (job.brief.brand.section_images!==true || count>=6 || step.page!=="home" || !["hero","spotlight","lookbook","craft"].includes(step.type)) return [];
  const source = media.get(job.brief.products[0].photo_ids[0]);
  const number = step.type==="lookbook"?Math.min(3,6-count):1;
  return Array.from({length:number},()=>({id:crypto.randomUUID(),media_id:null,status:"pending",regenerations:0,
    source_key:source?.key||null,label:`${step.label} image`,style:"lifestyle"}));
}
function deterministic(job,step) {
  if (step.type==="product-content") return {content:productContent(job.brief.products.find(p=>p.id===step.product_id),job.brief.selling)};
  if (step.type==="page-content") {
    const b=job.brief.brand,s=job.brief.selling;
    if(step.page==="faq")return {section:{...structuredClone(job.approved.find(item=>item.page==="home"&&item.type==="faq")?.section),
      id:"ai-faq-page"}};
    return {body:step.page==="about"?[b.sells,b.founder_story].filter(Boolean).join("\n\n"):
      step.page==="contact"?[s.contact_email,s.phone,s.address].filter(Boolean).join("\n"):
      step.page==="policy-shipping"?[s.delivery_time,s.free_shipping_threshold_paise==null?"":`Requested free-shipping threshold: ₹${s.free_shipping_threshold_paise/100}. Configuration must be confirmed.`].filter(Boolean).join("\n"):
      step.page==="policy-cancellation-refund"?[s.returns_window,s.returns_conditions].filter(Boolean).join("\n"):
      "Review before publishing. This policy needs the brand's legal review; AI has not supplied missing legal terms."};
  }
  const section=structuredClone(step.section);
  section.settings.enabled = optionalFacts(job.brief,step);
  // Core commerce and customer reviews are never generated or enabled by AI.
  if (["header","footer","commerce","product-details","product-grid"].includes(step.type)) section.settings.enabled=true;
  if(step.type==="announcement")section.settings.text=job.brief.selling.first_order_offer
    .replace(/[\u2013\u2014]/g,"-").replace(/\s+/g," ").slice(0,200);
  return {section};
}
function copyOf(candidate) {
  if(candidate.body!=null)return [candidate.body];
  if(candidate.content)return Object.values(candidate.content).filter(v=>typeof v==="string"&&v);
  const section=candidate.section;
  return section?[...Object.values(section.settings),...section.blocks.flatMap(b=>Object.values(b.settings))].filter(v=>typeof v==="string"&&v&&!v.startsWith("/")):[];
}
export async function processAiMessage(body,env) {
  if (!body || ![body.store_id,body.job_id].every(v=>typeof v==="string"&&/^[a-f0-9-]{36}$/i.test(v))) throw new Error("Invalid AI queue message");
  const db=createDb(env);
  let job,uploaded=[];
  try {
    job = await db.withStore(body.store_id,async tx=>{
      const found=await getJob(tx,body.store_id,body.job_id,null);
      if(found.status!=="queued")return null;
      return updateJob(tx,found,{status:"generating",lease_until:new Date(Date.now()+10*60*1000)});
    });
    if(!job)return;
    const step=job.plan[job.cursor];
    const draft=await db.withStore(job.store_id,async tx=>({...await loadDraft(tx,job.store_id),media:await ownedMedia(tx,job.store_id)}));
    const meta={_whole_store:isWholeDraft(job),_retry_count:job.candidate?._retry_count||0};
    if(isWholeDraft(job)&&!job.candidate?._batch){
      const prompt=storePrompt(job);
      let raw={};
      if(prompt.tasks.length){
        const result=await paid(db,job.store_id,job.id,"text",async()=>{
          const first=await generateText(env,prompt);
          let prepared;
          try{raw=JSON.parse(first.raw);prepared=validateStoreCopy(job,raw,draft,prompt);}
          catch(error){return {...first,error:error.message};}
          const second=await verifyFacts(env,job.brief,JSON.stringify(raw));
          let supported=false;try{supported=JSON.parse(second.raw).supported===true;}catch{}
          return {prepared,input_tokens:first.input_tokens+second.input_tokens,output_tokens:first.output_tokens+second.output_tokens,
            cost_usd:first.cost_usd+second.cost_usd,...(!supported?{error:"AI returned unsupported facts. Resume to try again."}:{})};
        });
        if(result.error)throw aiError(result.error,503);
      }
      const prepared=validateStoreCopy(job,raw,draft,prompt),prefix=[];
      for(let index=0;index<prepared.length;index++){
        const item=prepared[index];
        if(!item.images)item.images=imageSlots({...job,approved:prefix},job.plan[index],draft);
        prefix.push(item);
      }
      const candidate={...meta,_batch:true,prepared,images:prepared.flatMap(item=>item.images||[])};
      job=await db.withStore(job.store_id,tx=>updateJob(tx,job,{candidate}));
    }
    let candidate=job.candidate;
    if(candidate?._batch)candidate.images=candidate.prepared.flatMap(item=>item.images||[]);
    if(candidate&&!candidate._batch&&!candidate.section&&!candidate.content&&typeof candidate.body!=="string")candidate=null;
    if(!candidate){
      if(step.deterministic || step.type==="announcement" || !optionalFacts(job.brief,step))candidate=deterministic(job,step);
      else {
        const data=await paid(db,job.store_id,job.id,"text",async()=>{
          let first,second;
          first=await generateText(env,systemPrompt(step,job.brief));
          let parsed;
          try{parsed=JSON.parse(first.raw);}catch{ return {...first,error:"AI returned invalid JSON."}; }
          let section;
          try{section=validateCandidate(step,parsed,job.brief,prospectiveDraft(draft,job.brief));}
          catch(error){return {...first,error:error.message};}
          second=await verifyFacts(env,job.brief,JSON.stringify(parsed));
          let supported=false;
          try{supported=JSON.parse(second.raw).supported===true;}catch{}
          return {section,input_tokens:first.input_tokens+second.input_tokens,output_tokens:first.output_tokens+second.output_tokens,
            cost_usd:first.cost_usd+second.cost_usd,...(!supported?{error:"AI returned unsupported facts. Retry this section."}:{})};
        });
        if(data.error)throw aiError(data.error,503);
        candidate={section:data.section};
      }
      candidate={...meta,...candidate,images:imageSlots(job,step,draft)};
      candidate.copy=copyOf(candidate);
      job=await db.withStore(job.store_id,tx=>updateJob(tx,job,{candidate}));
    }
    const image=candidate.images.find(i=>!i.media_id && i.status==="pending");
    if(image){
      if(!env.MEDIA||!env.IMAGES)throw aiError("AI image storage and resizing are not configured yet. Please try again later.",503);
      const source=await env.MEDIA.get(image.source_key);
      if(!source)throw aiError("The real source photo is unavailable.",503);
      const bounded=await env.IMAGES.input(source.body).transform({width:1024,height:1024,fit:"contain"}).output({format:"image/webp"});
      const sourceBytes=new Uint8Array(await new Response(bounded.image()).arrayBuffer());
      const output=await paid(db,job.store_id,job.id,"image",()=>generateImage(env,sourceBytes,"image/webp",image.style));
      const metadata=validateUpload(output.bytes,"image"), mediaId=crypto.randomUUID();
      const key=`stores/${job.store_id}/${mediaId}.webp`;
      await env.MEDIA.put(key,output.bytes,{httpMetadata:{contentType:"image/webp",cacheControl:"private, no-store"},customMetadata:{ai_generated:"true"}});
      uploaded.push(key);
      const renditions=[];
      for(const width of [480,768]){
        const resized=await env.IMAGES.input(new Blob([output.bytes]).stream()).transform({width}).output({format:"image/webp"});
        const variant=`stores/${job.store_id}/${crypto.randomUUID()}.webp`;
        await env.MEDIA.put(variant,await resized.image(),{httpMetadata:{contentType:"image/webp",cacheControl:"private, no-store"},customMetadata:{ai_generated:"true"}});
        uploaded.push(variant);renditions.push({url:mediaUrl(variant),width,height:Math.round(metadata.height*width/metadata.width)});
      }
      await db.withStore(job.store_id,async tx=>{
        const[sourceRow]=await tx`SELECT id FROM public.media WHERE store_id=${job.store_id} AND object_key=${image.source_key} AND NOT ai_generated`;
        if(!sourceRow)throw aiError("Source photo does not belong to this store.");
        await tx`INSERT INTO public.media(id,store_id,object_key,kind,content_type,upload_type,size_bytes,width,height,alt_text,renditions,ai_generated,source_media_id,approval_status)
          VALUES(${mediaId},${job.store_id},${key},'image','image/webp','image',${output.bytes.length},${metadata.width},${metadata.height},${image.label},
            ${tx.json(renditions)},true,${sourceRow.id},'pending')`;
        image.media_id=mediaId;image.key=key;image.width=metadata.width;image.height=metadata.height;image.sources=renditions;
        job=await updateJob(tx,job,{candidate,status:candidate.images.some(i=>!i.media_id&&i.status==="pending")?"queued":"review",lease_until:null});
      });
      uploaded=[];
    }else job=await db.withStore(job.store_id,tx=>updateJob(tx,job,{status:"review",lease_until:null}));
    if(job.status==="review"&&candidate._batch){
      job=await db.withStore(job.store_id,tx=>updateJob(tx,job,{approved:candidate.prepared,cursor:job.plan.length,
        candidate:null,status:"ready_to_save",error:null,lease_until:null}));
    }else if(job.status==="review"&&isWholeDraft(job)){
      job=await db.withStore(job.store_id,tx=>advanceWholeDraft(tx,job));
    }
    if(job.status==="queued")await env.AI_BUILD_QUEUE.send({type:"ai",store_id:job.store_id,job_id:job.id});
  }catch(error){
    for(const key of uploaded)try{await env.MEDIA.delete(key);}catch{}
    if(job){
      const retryJob=await db.withStore(job.store_id,async tx=>{
      const current=await getJob(tx,job.store_id,job.id,null);
      if(["generating","queued","review"].includes(current.status)){
        const retries=Number(current.candidate?._retry_count||0);
        const retry=isWholeDraft(current)&&current.status!=="queued"&&retries<2;
        const next=await updateJob(tx,current,{candidate:{...current.candidate,_whole_store:isWholeDraft(current),
          _retry_count:retry?retries+1:retries},status:retry?"queued":"failed",lease_until:null,
          error:retry?null:error.status?error.message:error.code==="P0001"?error.message:"Generation was interrupted. Resume your build; your build allowance has not been used."});
        return retry?next:null;
      }
    });
      if(retryJob){
        try{await env.AI_BUILD_QUEUE.send({type:"ai",store_id:retryJob.store_id,job_id:retryJob.id});}
        catch{await db.withStore(job.store_id,async tx=>{
          const current=await getJob(tx,job.store_id,job.id,null);
          if(current.status==="queued")await updateJob(tx,current,{status:"failed",error:"The generation queue is busy. Resume your build to continue."});
        });}
      }
    }
    else throw error;
  }finally{await db.close();}
}
