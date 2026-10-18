const decode=value=>typeof value==="string"?JSON.parse(value):value;
export const FREE_TERMS_VERSION="free-v1";
const definition="public.billing_activate_free(uuid,text,uuid,text,boolean)";

export async function requireFreeService(tx) {
  const [schema]=await tx`SELECT to_regprocedure(${definition}) AS free_subscription_definition`;
  if(!schema?.free_subscription_definition)
    throw Object.assign(new Error("Subscription setup is not available yet. Your store is unchanged."),{status:503});
}
export async function freeSubscriptionState(tx,storeId,tokenHash) {
  await requireFreeService(tx);
  const [row]=await tx`SELECT public.billing_free_state(${storeId},${tokenHash}) AS state`;
  return decode(row.state);
}
export async function activateFreeSubscription(tx,storeId,tokenHash,input) {
  await requireFreeService(tx);
  const [row]=await tx`SELECT public.billing_activate_free(
    ${storeId},${tokenHash},${input.price_id},${input.terms_version},${input.accepted}) AS state`;
  return decode(row.state);
}
