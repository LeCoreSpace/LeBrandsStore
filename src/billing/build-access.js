const decode=value=>typeof value==="string"?JSON.parse(value):value;
export const PLAN_REQUIRED_MESSAGE="Choose and accept your Free plan in Ann after confirming your store name before continuing.";
export async function annPlanAccess(tx,id,tokenHash) {
  const [schema]=await tx`SELECT to_regprocedure('public.billing_build_access(uuid,text)') AS billing_build_definition`;
  if(!schema?.billing_build_definition)
    return {available:false,enforced:false,allowed:true,reason:"rollout_pending",name_confirmed:false};
  const [row]=await tx`SELECT public.billing_build_access(${id},${tokenHash}) AS plan_access`;
  return decode(row.plan_access);
}
export async function requireAnnPlan(tx,id,tokenHash) {
  const access=await annPlanAccess(tx,id,tokenHash);
  if(!access.allowed)throw Object.assign(new Error(PLAN_REQUIRED_MESSAGE),{status:403,planAccess:access});
  return access;
}
