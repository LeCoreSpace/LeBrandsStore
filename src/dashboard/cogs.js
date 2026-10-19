import {UUID} from "../public/validation.js";
import {commerceError} from "../public/commerce-rules.js";

const fail=(message,status=400)=>{throw commerceError(message,undefined,status);};
const decode=value=>typeof value==="string"?JSON.parse(value):value;
export const cogsCanEdit=role=>["owner","admin"].includes(role);
export async function cogsEnabled(tx){
  const [schema]=await tx`SELECT to_regprocedure('public.catalogue_cost_list(uuid,text,text,boolean,integer,integer)') IS NOT NULL AS enabled`;
  return schema?.enabled===true;
}
export function cogsFilters(params){
  const get=key=>params instanceof URLSearchParams?params.get(key):params?.[key];
  const search=String(get("search")??"").trim();
  const number=(key,fallback,min,max)=>{
    const raw=get(key);if(raw==null||raw==="")return fallback;
    if(!/^\d+$/.test(String(raw)))fail("Use valid cost filters.");
    const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)fail("Use valid cost filters.");return n;
  };
  if(search.length>100||!["","0","1"].includes(String(get("missing")??"")))fail("Use valid cost filters.");
  return{search,missing:String(get("missing"))==="1",limit:number("limit",50,1,100),offset:number("offset",0,0,1000000)};
}
export function costChange(body){
  if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).some(k=>!["product_id","product_option_id","cost_price_paise","expected_revision"].includes(k))||
    !UUID.test(body.product_id??"")||(body.product_option_id!=null&&!UUID.test(body.product_option_id))||
    !Object.hasOwn(body,"cost_price_paise")||
    (body.cost_price_paise!==null&&(!Number.isSafeInteger(body.cost_price_paise)||body.cost_price_paise<0||body.cost_price_paise>1000000000000))||
    !Number.isSafeInteger(body.expected_revision)||body.expected_revision<0||body.expected_revision>2147483646)
    fail("Use a valid cost, product and cost revision.");
  return{...body,product_id:body.product_id.toLowerCase(),product_option_id:body.product_option_id?.toLowerCase()??null};
}
function costError(error){
  if(error.status)throw error;
  if(error.code==="40001")fail("Cost changed. Your edits have not been saved. Reload the latest costs before trying again.",409);
  if(error.code==="42501")fail("Only store owners and admins can access product costs.",403);
  if(error.code==="22023")fail("Choose a valid product or SKU in this store and check its cost.",400);
  throw error;
}
export async function setCost(tx,storeId,tokenHash,body){
  const c=costChange(body);
  try{
    const [row]=await tx`SELECT public.catalogue_cost_set(${storeId},${tokenHash},${c.product_id},${c.product_option_id},${c.cost_price_paise},${c.expected_revision})::text AS result`;
    return decode(row.result);
  }catch(error){costError(error);}
}
export async function listCosts(tx,storeId,tokenHash,filters){
  if(!await cogsEnabled(tx))return{available:false,can_edit:false,currency:"",items:[],total:0,limit:filters.limit,offset:filters.offset};
  try{
    const [row]=await tx`SELECT public.catalogue_cost_list(${storeId},${tokenHash},${filters.search},${filters.missing},${filters.limit},${filters.offset})::text AS result`;
    return decode(row.result);
  }catch(error){costError(error);}
}
export async function saveCosts(tx,storeId,tokenHash,body){
  if(!await cogsEnabled(tx))fail("Apply the catalogue COGS database update before saving costs.",409);
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>k!=="changes")||
    !Array.isArray(body.changes)||!body.changes.length||body.changes.length>100)fail("Save between 1 and 100 cost changes together.");
  const changes=body.changes.map(costChange),keys=new Set();
  for(const c of changes){
    const key=`${c.product_id}:${c.product_option_id??""}`;
    if(keys.has(key))fail("Each product or SKU can appear only once in a cost save.");keys.add(key);
  }
  // Caller owns the transaction: a later conflict rolls the whole batch back.
  for(const c of changes)await setCost(tx,storeId,tokenHash,c);
}
export async function costHistory(tx,storeId,tokenHash,productId){
  if(!await cogsEnabled(tx))fail("Apply the catalogue COGS database update before reading cost history.",409);
  const [row]=await tx`SELECT public.catalogue_cost_history_read(${storeId},${tokenHash},${productId})::text AS result`;
  return{history:decode(row.result)};
}
export async function productCostFields(tx,storeId,tokenHash,productId){
  if(!productId)return{cost_price_paise:null,cost_revision:0};
  const [row]=await tx`SELECT public.catalogue_product_cost_read(${storeId},${tokenHash},${productId})::text AS result`;
  return decode(row?.result)||{};
}
