import {UUID} from "./validation.js";

export const MAX_AXES=3;
export const MAX_VARIANTS=200;
const MAX_STOCK=2147483647,MAX_PRICE=10000000000;
const object=v=>v&&typeof v==="object"&&!Array.isArray(v);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(v,max,label)=>{
  if(typeof v!=="string"||[...v].length>max||/[\u0000-\u001f\u007f]/.test(v))fail(`Check ${label}.`);
  return v.trim();
};
export function validateCatalogue(value){
  if(!object(value)||Object.keys(value).some(k=>!["vendor","category","subcategory","axes","seo_title","seo_description"].includes(k)))fail("Use the catalogue details form.");
  const out={};
  for(const [key,max] of Object.entries({vendor:120,category:80,subcategory:80,seo_title:70,seo_description:160}))out[key]=text(value[key]??"",max,key.replaceAll("_"," "));
  if(!Array.isArray(value.axes??[])||(value.axes??[]).length>MAX_AXES)fail("Choose up to three buying-option types.");
  const names=new Set();
  out.axes=(value.axes??[]).map(axis=>{
    if(!object(axis)||Object.keys(axis).some(k=>!["name","values"].includes(k)))fail("Check each buying-option type.");
    const name=text(axis.name,60,"option name");
    if(!name||names.has(name.toLowerCase()))fail("Give each buying-option type a different name.");
    names.add(name.toLowerCase());
    if(!Array.isArray(axis.values)||!axis.values.length||axis.values.length>50)fail("Add between 1 and 50 values to each option.");
    const values=axis.values.map(v=>text(v,80,"option value"));
    if(values.some(v=>!v)||new Set(values.map(v=>v.toLowerCase())).size!==values.length)fail("Use different, non-empty option values.");
    return {name,values};
  });
  if(out.axes.length&&out.axes.reduce((n,a)=>n*a.values.length,1)>MAX_VARIANTS)fail(`Use at most ${MAX_VARIANTS} combinations per product.`);
  return out;
}
export function variantCombinations(axes){
  const normalized=validateCatalogue({axes}).axes;
  if(!normalized.length)return [];
  return normalized.reduce((rows,axis)=>rows.flatMap(row=>axis.values.map(value=>[...row,value])),[[]]);
}
export function reconcileVariants(axes,existing=[],baseSKU=""){
  const base=text(baseSKU,80,"base SKU")||`LB-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
  const old=new Map(existing.map(row=>[JSON.stringify(row.values),row]));
  const used=new Set(existing.map(row=>String(row.sku||"").toLowerCase()));
  let serial=1;
  return variantCombinations(axes).map(values=>{
    const row=old.get(JSON.stringify(values));
    if(row)return {...row,values:[...values],...(row.id&&row.expected_stock==null?{expected_stock:row.stock}:{})};
    let sku;
    do{sku=`${base.slice(0,73)}-${String(serial++).padStart(4,"0")}`;}while(used.has(sku.toLowerCase()));
    used.add(sku.toLowerCase());
    return {values,sku,stock:0,price_paise:null};
  });
}
export function validateVariants(rows,catalogue){
  const axes=validateCatalogue(catalogue).axes,combinations=variantCombinations(axes);
  if(!Array.isArray(rows)||rows.length>MAX_VARIANTS||rows.length!==combinations.length)fail("Generate and complete every buying-option combination.");
  const allowed=new Set(combinations.map(v=>JSON.stringify(v))),seen=new Set(),skus=new Set(),ids=new Set();
  let stockTotal=0;
  return rows.map(row=>{
    if(!object(row)||Object.keys(row).some(k=>!["id","values","sku","stock","price_paise","expected_stock"].includes(k)))fail("Check the variant details.");
    if(!Array.isArray(row.values))fail("Choose the values for every variant.");
    const key=JSON.stringify(row.values);
    if(!allowed.has(key)||seen.has(key))fail("Each combination must appear exactly once.");
    seen.add(key);
    const sku=text(row.sku,80,"variant SKU");
    if(!sku||skus.has(sku.toLowerCase()))fail("Give every combination a different SKU.");
    skus.add(sku.toLowerCase());
    if(!Number.isSafeInteger(row.stock)||row.stock<0||row.stock>MAX_STOCK||(stockTotal+=row.stock)>MAX_STOCK)fail("Use valid whole stock quantities.");
    if(row.price_paise!=null&&(!Number.isSafeInteger(row.price_paise)||row.price_paise<0||row.price_paise>MAX_PRICE))fail("Use a valid variant price.");
    const result={values:[...row.values],sku,stock:row.stock,price_paise:row.price_paise??null};
    if(row.id!=null){
      if(typeof row.id!=="string"||!UUID.test(row.id)||ids.has(row.id.toLowerCase()))fail("Choose different saved variants.");
      result.id=row.id.toLowerCase();ids.add(result.id);
    }
    if(row.expected_stock!=null){
      if(!Number.isSafeInteger(row.expected_stock)||row.expected_stock<0||row.expected_stock>MAX_STOCK)fail("Reload the current variant quantities.");
      result.expected_stock=row.expected_stock;
    }
    return result;
  });
}
