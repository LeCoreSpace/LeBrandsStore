export async function requireBusinessPublication(tx,storeId) {
  const [schema]=await tx`SELECT to_regprocedure('public.business_publication_access(uuid)') AS business_publication_definition,
    to_regprocedure('public.business_publication_ready(uuid)') AS pending_review_enabled`;
  // Explicit staged compatibility; once installed, query errors never bypass it.
  if(!schema?.business_publication_definition)return {enforced:false};
  const [row]=schema.pending_review_enabled
    ?await tx`SELECT public.business_publication_ready(${storeId}) AS approved`
    :await tx`SELECT public.business_publication_access(${storeId}) AS approved`;
  if(row?.approved!==true)throw Object.assign(new Error(schema.pending_review_enabled
    ?"Submit your business documents and correct any review feedback before publishing. Check Business documents in Settings."
    :"Your business documents must be approved before publishing. Check Business documents in Settings."),{status:403});
  return {enforced:true};
}
