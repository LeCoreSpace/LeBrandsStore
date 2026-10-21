// Public catalogue facts only. Never fetch draft classification or global masters.
export const facetKey=value=>String(value||"").normalize("NFKC").trim().toLocaleLowerCase();
const list=value=>Array.isArray(value)?value:[];
const values=items=>[...new Set(list(items).filter(v=>typeof v==="string"&&v.trim()&&v.length<=200).map(v=>v.trim()))];
export function filterFacts(product){
 const saved=product?.product_filters;
 const type=typeof saved?.product_type==="string"?saved.product_type.trim():"";
 const groups=Object.create(null);
 const labels=Object.create(null);
 const add=(key,label,items)=>{
  const selected=values(items);if(!selected.length||!label)return;
  groups[key]=[...new Set([...(groups[key]||[]),...selected.map(facetKey)])];
  labels[key]={label,values:{...(labels[key]?.values||{}),...Object.fromEntries(selected.map(v=>[facetKey(v),v]))}};
 };
 if(type)add("type","Product type",[type]);
 for(const d of list(saved?.descriptors))add(`d:${facetKey(d.label)}`,d.label,d.values);
 // Legacy published facts are useful without re-reading mutable draft records.
 if(!saved)for(const d of list(product?.product_details))add(`d:${facetKey(d.label)}`,d.label,[d.value]);
 const axes=list(product?.catalogue?.axes).map(a=>typeof a?.name==="string"?a.name.trim():"");
 const combinations=[];
 for(const variant of list(product?.variants)){
  const selected=Object.create(null);
  axes.forEach((name,index)=>{
   const value=list(variant?.values)[index];
   if(!name||typeof value!=="string")return;
   const key=`v:${facetKey(name)}`;
   add(key,name,[value]);selected[key]=facetKey(value);
  });
  if(Object.keys(selected).length)combinations.push({values:selected,available:variant.stock==null||Number(variant.stock)>0});
 }
 return {groups,labels,combinations};
}
export function matchesFacets(facts,selections={},stockOnly=false){
 const entries=Object.entries(selections).filter(([,v])=>list(v).length);
 for(const [key,selected] of entries.filter(([key])=>!key.startsWith("v:")))
  if(!selected.some(v=>list(facts?.groups?.[key]).includes(v)))return false;
 const variants=entries.filter(([key])=>key.startsWith("v:"));
 return !variants.length||list(facts?.combinations).some(combo=>
  (!stockOnly||combo.available)&&variants.every(([key,selected])=>selected.includes(combo.values[key])));
}
export function buildFacetGroups(facts){
 const groups=new Map();
 for(const fact of facts)for(const [key,meta] of Object.entries(fact.labels)){
  if(!groups.has(key))groups.set(key,{key,label:meta.label,values:new Map()});
  for(const [value,label] of Object.entries(meta.values))groups.get(key).values.set(value,label);
 }
 const order=key=>key==="type"?0:key.startsWith("v:")?1:2;
 return [...groups.values()].sort((a,b)=>order(a.key)-order(b.key)||a.label.localeCompare(b.label))
  .map(g=>({...g,values:[...g.values].sort((a,b)=>a[1].localeCompare(b[1],undefined,{numeric:true})).map(([value,label])=>({value,label}))}));
}
export function facetCounts(items,groups,selections={},stockOnly=false){
 const counts=Object.create(null);
 for(const group of groups){
  const other={...selections};delete other[group.key];
  const variants=Object.entries(other).filter(([key,v])=>key.startsWith("v:")&&v.length);
  const map=Object.create(null);
  for(const item of items){
   if(stockOnly&&!item.available||!matchesFacets(item.facets,other,stockOnly))continue;
   const options=group.key.startsWith("v:")
    ?list(item.facets?.combinations).filter(c=>(!stockOnly||c.available)&&variants.every(([key,v])=>v.includes(c.values[key]))).map(c=>c.values[group.key])
    :list(item.facets?.groups?.[group.key]);
   for(const value of new Set(options.filter(Boolean)))map[value]=(map[value]||0)+1;
  }
  counts[group.key]=map;
 }
 return counts;
}
