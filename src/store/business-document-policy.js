const decode=value=>typeof value==="string"?JSON.parse(value):value;
export async function businessDocumentRetention(tx){
  const [schema]=await tx`SELECT to_regprocedure('public.business_document_retention_policy()') AS business_retention_definition`;
  if(!schema?.business_retention_definition)return {configured:false,key:null,automatic_deletion:false};
  const [row]=await tx`SELECT public.business_document_retention_policy() AS policy`;
  const policy=decode(row?.policy);
  if(policy?.key!=="subscription_lifetime_v1"||policy.during_onboarding!==true||
    policy.during_subscription!==true||policy.after_cancellation!=="not_decided"||policy.automatic_deletion!==false)
    throw Object.assign(new Error("Business document retention policy is unavailable."),{status:503});
  return {...policy,configured:true};
}

export function businessDocumentUploadPolicy(env,retention){
  const storage_available=typeof env.BUSINESS_DOCUMENTS?.put==="function";
  const screening_available=typeof env.BUSINESS_DOCUMENT_SCANNER?.fetch==="function";
  const uploads_available=storage_available&&screening_available&&retention.configured;
  const upload_message=!retention.configured?"The subscription-duration document retention update is required before submissions can open."
    :!storage_available?"Private document storage is not configured. Document uploads are paused."
    :!screening_available?"Private document storage is ready. Security screening must be connected before files can be uploaded.": "";
  return {storage_available,screening_available,retention,uploads_available,upload_message,max_file_bytes:5*1024*1024};
}
