import{MARKETING_DEFAULTS,publicMarketing,validateMarketing,marketingError}from"./rules.js";
import{sealCredentials,openCredentials}from"../connections/providers.js";
import{keyFor}from"../connections/runtime-client.js";
export async function marketingAvailable(tx){
  const[r]=await tx`SELECT to_regclass('public.store_marketing_integrations') IS NOT NULL AS ready`;return r?.ready===true;
}
export async function readMarketing(tx,id){
  const[row]=await tx`SELECT *,updated_at::text AS revision FROM public.store_marketing_integrations WHERE store_id=${id}`;
  return row||{...MARKETING_DEFAULTS,store_id:id,revision:"",meta_capi_token_encrypted:null,meta_token_hint:""};
}
export function settingsResult(row,canEdit,store){
  return{settings:publicMarketing(row),can_edit:canEdit,revision:row.revision||"",
    meta_token_hint:canEdit?(row.meta_token_hint||""):"",
    storefront_url:store.status==="live"?`https://${store.subdomain}.lebrands.store/`:null};
}
export async function saveMarketing(tx,id,body,env){
  if(!body||Object.keys(body).some(k=>!["settings","expected_revision","meta_capi_token","remove_meta_capi_token"].includes(k)))
    throw marketingError("Check your integration settings.");
  if(typeof body.expected_revision!=="string")throw marketingError("Reload these settings before saving.",409);
  const settings=validateMarketing(body.settings);
  const current=await readMarketing(tx,id);
  if(current.revision!==body.expected_revision)throw marketingError("These settings changed elsewhere. Reload before saving.",409);
  if(body.remove_meta_capi_token!==undefined&&typeof body.remove_meta_capi_token!=="boolean")throw marketingError("Choose whether to remove the saved token.");
  if(body.meta_capi_token!==undefined&&(typeof body.meta_capi_token!=="string"||body.meta_capi_token.length>4096))
    throw marketingError("Check your Meta access token.",400,{meta_capi_token:"Enter a valid access token."});
  const token=body.meta_capi_token?.trim()||"";
  if(token&&(!/^[A-Za-z0-9._~-]{20,4096}$/.test(token)||body.remove_meta_capi_token))
    throw marketingError("Check your Meta access token.",400,{meta_capi_token:"Enter a new token or remove the old one, not both."});
  let encrypted=current.meta_capi_token_encrypted,hint=current.meta_token_hint||"";
  if(body.remove_meta_capi_token){encrypted=null;hint="";}
  if(token){encrypted=await sealCredentials(keyFor(env),id,"meta-marketing",{token});hint=token.slice(-4);}
  // Serialize store settings using the existing withMemberStore store-row lock.
  const columns=Object.keys(MARKETING_DEFAULTS),values={store_id:id,...settings,meta_capi_token_encrypted:encrypted,meta_token_hint:hint};
  await tx`INSERT INTO public.store_marketing_integrations ${tx(values)}
    ON CONFLICT(store_id) DO UPDATE SET ${tx(Object.fromEntries([...columns,"meta_capi_token_encrypted","meta_token_hint"].map(k=>[k,values[k]])))},
      updated_at=clock_timestamp()`;
  return readMarketing(tx,id);
}
export async function metaToken(row,env){
  if(!row.meta_capi_token_encrypted)throw marketingError("Add a Meta access token under Advanced first.");
  return(await openCredentials(keyFor(env),row.store_id,"meta-marketing",row.meta_capi_token_encrypted)).token;
}
