import {UUID} from "../public/validation.js";
export const BILLING_PLAN_CODES=Object.freeze(["free","launch","grow","scale","flagship"]);
export const isBillingPagePath=path=>path==="/plans"||/^\/stores\/[a-f0-9-]{36}\/billing$/i.test(path);
export function billingSelection(params){
  return {
    plan:BILLING_PLAN_CODES.includes(params.get("plan"))?params.get("plan"):null,
    interval:["monthly","annual"].includes(params.get("interval"))?params.get("interval"):null,
  };
}
export function billingDestination(plan,interval,storeId){
  const params=new URLSearchParams();
  if(BILLING_PLAN_CODES.includes(plan))params.set("plan",plan);
  if(["monthly","annual"].includes(interval))params.set("interval",interval);
  return `${storeId&&UUID.test(storeId)?`/stores/${storeId}/billing`:"/plans"}${params.size?`?${params}`:""}`;
}
// Only local billing destinations can survive an authentication redirect.
// No arbitrary next URLs, nested redirects, duplicate keys or extra query keys.
export function billingContinuation(value){
  if(typeof value!=="string"||value.length>250||!value.startsWith("/")||value.startsWith("//")||/[\\\u0000-\u0020\u007f]/.test(value))return null;
  let url;try{url=new URL(value,"https://app.lebrands.store");}catch{return null;}
  if(url.origin!=="https://app.lebrands.store"||url.hash||!isBillingPagePath(url.pathname))return null;
  for(const key of url.searchParams.keys()){
    if(!["plan","interval"].includes(key)||url.searchParams.getAll(key).length!==1)return null;
  }
  const {plan,interval}=billingSelection(url.searchParams);
  if(url.searchParams.has("plan")&&!plan||url.searchParams.has("interval")&&!interval)return null;
  return billingDestination(plan,interval,url.pathname.match(/^\/stores\/([^/]+)\/billing$/)?.[1]);
}
