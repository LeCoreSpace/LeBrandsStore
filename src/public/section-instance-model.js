import { sectionLibraryEntry } from "./section-library.js";
import {validSectionLayout} from "./section-layouts.js";
import {validGridData,defaultGrid,newCell,GRID_KINDS,gridBindingError} from "./section-grid-model.js";

export const INSTANCE_PAGES=Object.freeze(["home","collection","product","about","contact"]);
export const SECTION_INSTANCE_LIMIT=12;
export const SECTION_INSTANCE_DOCUMENT_LIMIT=40;
export const INSTANCE_ID=/^slot-library-[a-f0-9]{16,32}-0$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const keys=(v,allowed)=>plain(v)&&Object.keys(v).every(k=>allowed.includes(k));
const PRODUCT=new Set(["featured-product","product-description","product-specifications","materials-care","size-guide","how-to-use","product-guide","routine-guide","related-products"]);
const COLLECTION=new Set(["collection-header","collection-description","related-collections"]);

export function sectionBindingKinds(family,page){
  if(!INSTANCE_PAGES.includes(page)||sectionLibraryEntry(family)?.kind!=="content")return [];
  if(PRODUCT.has(family))return [...(page==="product"?["current-product"]:[]),"product"];
  if(COLLECTION.has(family))return [...(page==="collection"?["current-collection"]:[]),"collection"];
  if(["product-grid","product-set"].includes(family))return ["all","collection",...(page==="collection"?["current-collection"]:[])];
  if(family==="collection-cards")return ["all","collection"];
  return ["none"];
}
export function validSectionInstance(instance,page){
  if(!keys(instance,["id","version","family","binding","layout","grid","items"])||instance.version!==1||
    !INSTANCE_ID.test(instance.id)||sectionLibraryEntry(instance.family)?.id!==instance.family)return false;
  if(Object.hasOwn(instance,"layout")&&!validSectionLayout(instance.family,instance.layout))return false;
  if(!validGridData(instance))return false;
  const binding=instance.binding;
  if(!keys(binding,["kind","id"])||!sectionBindingKinds(instance.family,page).includes(binding.kind))return false;
  return ["product","collection"].includes(binding.kind)?UUID.test(binding.id||""):
    !Object.hasOwn(binding,"id");
}
export function validSectionInstances(instances,page){
  return Array.isArray(instances)&&instances.length<=SECTION_INSTANCE_LIMIT&&
    instances.every(i=>validSectionInstance(i,page))&&new Set(instances.map(i=>i.id)).size===instances.length;
}
export function validInstanceDocument(sections){
  let count=0;
  const ids=new Set();
  for(const [page,entry] of Object.entries(sections||{})){
    if(entry.instances===undefined)continue;
    if(!validSectionInstances(entry.instances,page))return false;
    for(const i of entry.instances){if(ids.has(i.id))return false;ids.add(i.id);count++;}
  }
  return count<=SECTION_INSTANCE_DOCUMENT_LIMIT;
}
export function createSectionInstance(family,binding={kind:"none"},layout="original"){
  if(sectionLibraryEntry(family)?.kind!=="content")throw new Error("Choose a content section from the library.");
  if(!validSectionLayout(family,layout))throw new Error("Choose an available section layout.");
  const instance={version:1,id:`slot-library-${crypto.randomUUID().replace(/-/g,"")}-0`,family,binding:structuredClone(binding)};
  if(layout!=="original")instance.layout=layout;
  if(GRID_KINDS[family]){
    instance.grid=defaultGrid(family);
    if(GRID_KINDS[family]==="images")instance.items=Array.from({length:instance.grid.limit},(_,slot)=>newCell(slot));
  }
  return instance;
}
export function setInstanceLayout(sections,page,id,layout){
  const next=structuredClone(sections||{}),instance=next[page]?.instances?.find(i=>i.id===id);
  if(!instance)throw new Error("Choose an added section to change its layout.");
  if(!validSectionLayout(instance.family,layout))throw new Error("Choose an available section layout.");
  if(layout==="original")delete instance.layout;
  else instance.layout=layout;
  if(!validSectionInstance(instance,page))throw new Error("This section could not be updated.");
  return next;
}
export function insertSectionInstance(sections,page,instance,orderedIds,afterId=null){
  if(!validSectionInstance(instance,page))throw new Error("Choose a valid section and its product or collection.");
  const next=structuredClone(sections||{}),entry=next[page]||{};
  if((entry.instances?.length||0)>=SECTION_INSTANCE_LIMIT)throw new Error(`A page can contain up to ${SECTION_INSTANCE_LIMIT} added sections.`);
  const ids=[...new Set(orderedIds||entry.order||[])];
  if(!ids.length)throw new Error("Load the page before adding a section.");
  if(afterId!==null&&!ids.includes(afterId))throw new Error("The insertion position changed. Choose a position again.");
  const index=afterId===null?0:ids.indexOf(afterId)+1;
  if(["product","contact"].includes(page)&&index===0)throw new Error("Keep required page content first.");
  ids.splice(index,0,instance.id);
  if(ids.length>40)throw new Error("This page has reached its section limit.");
  next[page]={...entry,instances:[...(entry.instances||[]),instance],order:ids};
  if(!validInstanceDocument(next))throw new Error("This design has reached its section limit.");
  return next;
}
export function removeSectionInstance(sections,page,id){
  const next=structuredClone(sections||{}),entry=next[page];
  if(!entry?.instances?.some(i=>i.id===id))return null;
  entry.instances=entry.instances.filter(i=>i.id!==id);
  if(entry.order)entry.order=entry.order.filter(k=>k!==id);
  if(entry.hidden)entry.hidden=entry.hidden.filter(k=>k!==id);
  return next;
}
// Used for metadata rendering: keep instance definitions but ignore arrangement.
export function instanceOnlySections(sections){
  return Object.fromEntries(Object.entries(sections||{}).filter(([,v])=>v?.instances?.length)
    .map(([page,v])=>[page,{instances:structuredClone(v.instances)}]));
}
export function sectionBindingError(sections,data){
  const gridError=gridBindingError(sections,data);
  if(gridError)return gridError;
  const products=new Set((data.products||[]).map(p=>String(p.id)));
  const collections=new Set((data.collections||[]).map(c=>String(c.id)));
  for(const entry of Object.values(sections||{}))for(const instance of entry.instances||[]){
    const {kind,id}=instance.binding;
    if(kind==="product"&&!products.has(id))return "Choose a product belonging to this store for each added section.";
    if(kind==="collection"&&!collections.has(id))return "Choose a collection belonging to this store for each added section.";
  }
  return "";
}
export function copyInstanceFields(model,page,fromId,toId){
  const prefix=`section.${page}.${fromId}.`,replacement=`section.${page}.${toId}.`;
  const next=structuredClone(model);
  for(const field of ["copy","media","formatting"]){
    next[field]||={};
    for(const [key,value] of Object.entries(model[field]||{}))
      if(key.startsWith(prefix))next[field][replacement+key.slice(prefix.length)]=structuredClone(value);
  }
  return next;
}
export function clearInstanceFields(model,page,id){
  const prefix=`section.${page}.${id}.`,next=structuredClone(model);
  for(const field of ["copy","media","formatting"])
    for(const key of Object.keys(next[field]||{}))if(key.startsWith(prefix))delete next[field][key];
  return next;
}
