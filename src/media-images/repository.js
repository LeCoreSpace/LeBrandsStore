export const decode=v=>typeof v==="string"?JSON.parse(v):v;
export function publicImageJob(j){
  return{id:j.id,status:j.status,placement_id:j.placement_id,prompt:j.prompt,width:j.width,height:j.height,
    created_at:j.created_at,provider_ms:j.provider_ms,total_ms:j.total_ms,error:j.error,media_id:j.media_id};
}
export async function imageSchema(tx){
  const[row]=await tx`SELECT to_regclass('public.media_image_jobs') IS NOT NULL AS ready`;
  return Boolean(row?.ready);
}
export async function imageJob(tx,store,id){
  const[job]=await tx`SELECT * FROM public.media_image_jobs WHERE store_id=${store} AND id=${id}`;
  if(!job)throw Object.assign(new Error("Image not found."),{status:404});return job;
}
