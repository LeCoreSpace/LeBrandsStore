export async function requireBusinessPublication(tx,storeId) {
  const [schema]=await tx`SELECT to_regprocedure('public.business_publication_access(uuid)') AS business_publication_definition`;
  // Explicit staged compatibility; once installed, query errors never bypass it.
  if(!schema?.business_publication_definition)return {enforced:false};
  const [row]=await tx`SELECT public.business_publication_access(${storeId}) AS approved`;
  if(row?.approved!==true)throw Object.assign(new Error("Your business documents must be approved before publishing. Check Business documents in Settings."),{status:403});
  return {enforced:true};
}
