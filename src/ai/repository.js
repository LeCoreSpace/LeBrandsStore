import { aiError, validateBrief } from "./input.js";
import { buildPlan } from "./plan.js";
import { loadDraft,saveSetup } from "../store/repository.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { mediaUrl } from "../store/media.js";

export async function aiEnabled(tx) {
  const [row] = await tx`SELECT to_regclass('public.ai_generation_jobs') IS NOT NULL AS enabled`;
  return row.enabled;
}
export async function ownedMedia(tx,storeId){
  const rows=await tx`SELECT m.*,to_jsonb(m)->'renditions' AS sources FROM public.media m WHERE store_id=${storeId} ORDER BY created_at,id`;
  return rows.map(m=>({id:m.id,key:m.object_key,url:mediaUrl(m.object_key),type:m.upload_type,
    width:m.width,height:m.height,alt:m.alt_text,size_bytes:m.size_bytes,
    ...(m.width&&m.height&&m.sources?.length?{sources:m.sources}:{}),
    ai_generated:m.ai_generated===true,approval_status:m.approval_status||"approved",source_media_id:m.source_media_id||null}));
}
export async function verified(tx,hash) {
  const [row] = await tx`SELECT public.ai_account_verified(${hash}) AS verified`;
  return row.verified;
}
export async function currentJob(tx,storeId) {
  const [job] = await tx`SELECT *,base_updated_at::text AS base_updated_at FROM public.ai_generation_jobs WHERE store_id=${storeId}
    ORDER BY (status NOT IN('completed','cancelled')) DESC,created_at DESC LIMIT 1`;
  return job ?? null;
}
export async function jobUsage(tx,id) {
  const [row] = await tx`SELECT COALESCE(sum(input_tokens+output_tokens),0)::integer AS tokens,
    COALESCE(sum(images),0)::integer AS images,COALESCE(sum(CASE WHEN status='reserved' THEN reserved_usd ELSE cost_usd END),0) AS cost_usd
    FROM public.ai_usage WHERE job_id=${id}`;
  return {...row,cost_usd:Number(row.cost_usd),cost_estimated:true};
}
export async function publicJob(tx,job) {
  if (!job) return null;
  const candidate = job.candidate && structuredClone(job.candidate);
  if (candidate) candidate.images = (candidate.images||[]).map(image=>({...image,
    url:image.media_id ? `/api/stores/${job.store_id}/ai/image?media_id=${image.media_id}` : "",
    source_url:mediaUrl(image.source_key),
  }));
  return {id:job.id,status:job.status,version:job.version,cursor:job.cursor,total_steps:job.plan.length,
    progress:{content_ready:job.candidate?._batch===true||["ready_to_save","completed"].includes(job.status),
      preview_ready:job.candidate?._batch===true||job.status==="ready_to_save",
      images_total:(job.candidate?._batch?job.candidate.images:job.approved.flatMap(item=>item.images||[])||[]).length,
      images_completed:(job.candidate?._batch?job.candidate.images:job.approved.flatMap(item=>item.images||[])||[]).filter(image=>image.media_id||image.status==="discarded").length},
    workflow:job.plan[0]?.workflow==="whole-store"||job.approved?.[0]?.workflow==="whole-store"||
      job.candidate?._whole_store===true?"whole-store":"section-review",
    step:job.plan[job.cursor] ? {page:job.plan[job.cursor].page,type:job.plan[job.cursor].type,
      label:job.plan[job.cursor].label,product_id:job.plan[job.cursor].product_id} : null,
    candidate,approved:job.approved.map(value=>({label:value.label,page:value.page})),
    error:job.error,completed_at:job.completed_at,usage:await jobUsage(tx,job.id)};
}
export async function getJob(tx,storeId,id,version,{lock=true}={}) {
  if (typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id)) throw aiError("Build not found.",404);
  const [job] = lock ? await tx`SELECT *,base_updated_at::text AS base_updated_at FROM public.ai_generation_jobs WHERE store_id=${storeId} AND id=${id} FOR UPDATE`
    : await tx`SELECT *,base_updated_at::text AS base_updated_at FROM public.ai_generation_jobs WHERE store_id=${storeId} AND id=${id}`;
  if (!job) throw aiError("Build not found.",404);
  if (version!=null && (!Number.isInteger(version)||version!==job.version)) throw aiError("This build changed. Refresh and try again.",409);
  return job;
}
export async function updateJob(tx,job,patch) {
  const next = {...job,...patch,version:job.version+1};
  const changed=await tx`UPDATE public.ai_generation_jobs SET status=${next.status},cursor=${next.cursor},
    candidate=${tx.json(next.candidate)},approved=${tx.json(next.approved)},version=${next.version},
    error=${next.error??null},lease_until=${next.lease_until??null},completed_at=${next.completed_at??null},updated_at=now()
    WHERE store_id=${job.store_id} AND id=${job.id} AND version=${job.version} RETURNING id`;
  if(!changed.length)throw aiError("This build changed. Refresh and try again.",409);
  return next;
}
export function prospectiveDraft(draft,brief) {
  const media = new Map(draft.media.map(m=>[m.id,m]));
  const products = brief.products.map(p=>({id:p.id,title:p.name,description:p.features.join("\n"),
    price_paise:p.price_paise,gst_rate:p.gst_rate,stock:p.stock,track_inventory:true,
    images:p.photo_ids.map(id=>media.get(id)).filter(Boolean),collection_ids:[brief.collection_id]}));
  return {...draft,settings:{...draft.settings,brand_name:brief.brand.name,tagline:brief.brand.tagline||brief.brand.name,
    description:brief.brand.sells},products,collections:[{id:brief.collection_id,title:brief.brand.category,slug:"ai-collection",product_ids:products.map(p=>p.id)}]};
}
export async function startBuild(tx,storeId,user,hash,raw) {
  await dashboardAccess(tx,storeId,user.id,true);
  if (!await verified(tx,hash)) throw aiError("Verify your email before starting an AI build.",403);
  await saveSetup(tx,storeId);
  const brief = validateBrief(raw), draft = {...await loadDraft(tx,storeId),media:await ownedMedia(tx,storeId)};
  const ids = new Map(draft.media.map(m=>[m.id,m]));
  if (brief.brand.logo_id && ids.get(brief.brand.logo_id)?.type!=="logo") throw aiError("Choose a logo uploaded to this store.");
  for (const product of brief.products) {
    for (const photo of product.photo_ids) {
      const m = ids.get(photo);
      if (!m || m.type!=="image" || m.ai_generated) throw aiError("Choose real product photos uploaded to this store.");
    }
    if (product.id) {
      const existing = draft.products.find(p=>p.id===product.id);
      if (!existing) throw aiError("Choose products belonging to this store.");
      if (Number(existing.price_paise)!==product.price_paise || Number(existing.gst_rate)!==product.gst_rate ||
          (existing.track_inventory&&Number(existing.stock)!==product.stock)) throw aiError("Edit existing prices, GST and stock in Products before starting the AI build.");
    } else product.id = crypto.randomUUID();
  }
  brief.collection_id = crypto.randomUUID();
  const plan = buildPlan(prospectiveDraft(draft,brief),brief);
  const [job] = await tx`INSERT INTO public.ai_generation_jobs(store_id,user_id,brief,plan,base_versions,base_updated_at)
    VALUES(${storeId},${user.id},${tx.json(brief)},${tx.json(plan)},${tx.json(draft.page_versions||{})},
      (SELECT updated_at FROM public.store_setup WHERE store_id=${storeId})) RETURNING *,base_updated_at::text AS base_updated_at`;
  return job;
}
