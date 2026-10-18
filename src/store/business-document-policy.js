import {businessDocumentScannerStatus} from "./business-document-scanner.js";
import {BUSINESS_DOCUMENT_MAX_BYTES} from "./business-document-limits.js";
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

export function businessDocumentUploadPolicy(env,retention,{managedBudgetAvailable=false}={}){
  const storage_available=typeof env.BUSINESS_DOCUMENTS?.put==="function";
  const scanner=businessDocumentScannerStatus(env);
  const screening_available=scanner.available&&(scanner.provider!=="cloudmersive"||managedBudgetAvailable);
  const uploads_available=storage_available&&screening_available&&retention.configured;
  const upload_message=!retention.configured?"The subscription-duration document retention update is required before submissions can open."
    :!storage_available?"Private document storage is not configured. Document uploads are paused."
    :!scanner.available?"Private document storage is ready. Security screening needs platform activation before files can be uploaded."
    :!screening_available?"The managed security screening database update is required before files can be uploaded.": "";
  return {storage_available,screening_available,screening_provider:scanner.provider,retention,uploads_available,upload_message,max_file_bytes:BUSINESS_DOCUMENT_MAX_BYTES};
}
