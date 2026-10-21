const decode=value=>typeof value==="string"?JSON.parse(value):value;
const names={products:"product",skus:"SKU",storage:"storage",staff:"staff seat"};
export function capacityError(error){
 if(error?.code==="PQU02")return {status:409,message:"This person is already a member of your store."};
 if(error?.code!=="PQU01")return null;
 let quota;
 try{quota=decode(error.detail);}catch{}
 if(!quota||!Object.hasOwn(names,quota.resource))return {status:409,message:"Your plan allowance has been reached. Review your usage in Plans and billing."};
 const unknown=quota.limit==null;
 return {status:409,quota,message:unknown
  ?"Your plan allowance needs confirmation. Contact support before adding more."
  :`This action would exceed your ${names[quota.resource]} allowance. ${quota.resource==="storage"?"This file has not been uploaded. ":""}${quota.resource==="skus"?"Reduce the variants or choose a plan with more capacity.":"Review your usage or choose a plan with more capacity."}`};
}
export async function capacityState(tx,id){
 const [schema]=await tx`SELECT to_regprocedure('public.plan_capacity(uuid)') IS NOT NULL AS enabled`;
 if(!schema?.enabled)return null;
 const [row]=await tx`SELECT public.plan_capacity(${id}) AS capacity`;
 return decode(row.capacity);
}
export async function requireStorageCapacity(tx,id,bytes){
 if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error("Invalid upload size.");
 await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
 const capacity=await capacityState(tx,id);
 if(!capacity)throw Object.assign(new Error("Storage capacity checks are not available yet. Please try again later."),{status:503});
 const used=capacity.used.storage,limit=capacity.limits.storage;
 if(!Number.isSafeInteger(used)||used<0||(limit!==null&&(!Number.isSafeInteger(limit)||limit<0)))
  throw Object.assign(new Error("Storage capacity could not be confirmed. Please retry."),{status:503});
 if(limit==null||used+bytes>limit){
  const detail=JSON.stringify({resource:"storage",used,projected:used+bytes,limit});
  throw Object.assign(new Error("Storage allowance reached."),{code:"PQU01",detail});
 }
 return capacity;
}
