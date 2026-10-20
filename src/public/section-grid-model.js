/** Validated repeated-item settings. Cell slots never move with visual order. */
export const GRID_KINDS=Object.freeze({"product-grid":"products","related-products":"products","product-set":"products","collection-cards":"collections","related-collections":"collections","image-gallery":"images","customer-photos":"images","press-logos":"images","before-after":"images","customer-reviews":"reviews"});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CELL=/^cell-[a-f0-9]{16,32}$/;
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const only=(v,keys)=>plain(v)&&Object.keys(v).every(k=>keys.includes(k));
export const GRID_MAX=10;
export function defaultGrid(family){
  if(!GRID_KINDS[family])return null;
  return {arrangement:"grid",desktop:3,tablet:2,mobile:2,gap:"normal",ratio:family==="press-logos"?"wide":"portrait",fit:family==="press-logos"?"contain":"cover",align:"left",card:"plain",limit:family==="before-after"?2:family==="product-set"||GRID_KINDS[family]==="images"?3:family==="customer-reviews"?6:family==="related-collections"?4:8,source:GRID_KINDS[family]==="images"?"manual":"automatic"};
}
export function safeCellLink(value){
  if(typeof value!=="string"||value.length>1000||/[\u0000-\u0020\u007f\\<>]/.test(value))return false;
  return value===""||(/^\/(?!\/)/.test(value))||/^https:\/\/[^/]+/i.test(value)||/^(?:mailto:|tel:)[^:]+$/i.test(value);
}
export function validGridData(instance){
  const {grid,items,family}=instance,kind=GRID_KINDS[family];
  if(grid===undefined&&items===undefined)return true;
  if(!kind||!only(grid,Object.keys(defaultGrid(family))))return false;
  const enums={arrangement:["grid","featured","masonry","strip"],gap:["compact","normal","relaxed"],ratio:["portrait","square","wide","natural"],fit:["cover","contain"],align:["left","center"],card:["plain","outlined","filled"],source:["automatic","manual"]};
  for(const [key,values]of Object.entries(enums))if(!values.includes(grid[key]))return false;
  for(const [key,max]of [["desktop",6],["tablet",4],["mobile",2],["limit",10]])
    if(!Number.isInteger(grid[key])||grid[key]<1||grid[key]>max)return false;
  if(family==="before-after"&&grid.limit!==2||kind==="images"&&grid.source!=="manual")return false;
  if(items===undefined)return kind!=="images";
  if(!Array.isArray(items)||items.length>GRID_MAX||family==="before-after"&&items.length!==2)return false;
  const ids=new Set(),slots=new Set(),refs=new Set();
  return items.every(item=>{
    if(!only(item,["id","slot","recordId","link","alt","focus"])||!CELL.test(item.id)||!Number.isInteger(item.slot)||item.slot<0||item.slot>=GRID_MAX||ids.has(item.id)||slots.has(item.slot))return false;
    ids.add(item.id);slots.add(item.slot);
    if(kind!=="images"){if(!UUID.test(item.recordId||"")||refs.has(item.recordId))return false;refs.add(item.recordId);}
    else if(item.recordId!==undefined)return false;
    if(item.link!==undefined&&(kind!=="images"||!safeCellLink(item.link)))return false;
    if(item.alt!==undefined&&(kind!=="images"||typeof item.alt!=="string"||item.alt.length>300))return false;
    return item.focus===undefined||["center","top","bottom"].includes(item.focus);
  });
}
export const cellKeys=(page,id,slot)=>Object.fromEntries([["title",`text${20+slot*3}`],["body",`text${21+slot*3}`],["label",`text${22+slot*3}`],["image",`image${slot}`],["video",`video${slot}`]].map(([name,key])=>[name,`section.${page}.${id}.${key}`]));
export function gridRecords(instance,data={},options={}){
  const source=data.section_source||data,kind=GRID_KINDS[instance.family],b=instance.binding;
  let products=(source.products||[]).filter(p=>p.status!=="archived"),collections=(source.collections||[]).filter(c=>c.status!=="archived");
  const selected=b.kind==="current-collection"?(options.collectionId||options.collectionSlug||collections[0]?.id):b.id;
  if(["collection","current-collection"].includes(b.kind)){
    const collection=collections.find(c=>c.id===selected||c.slug===selected);
    products=collection?products.filter(p=>(collection.product_ids||[]).includes(p.id)||(p.collection_ids||[]).includes(collection.id)):[];
    collections=collection?[collection]:[];
  }
  if(instance.family==="related-collections")collections=(source.collections||[]).filter(c=>c.status!=="archived"&&c.id!==selected&&c.slug!==selected);
  if(instance.family==="related-products"){
    const current=b.kind==="current-product"?(options.productId||options.productSlug||products[0]?.id):b.id;
    products=products.filter(p=>p.id!==current&&p.slug!==current);
  }
  const records=kind==="products"?products:kind==="collections"?collections:kind==="reviews"?(data.reviews||[]).filter(r=>typeof(r.body||r.text)==="string"):[];
  return records.filter(r=>UUID.test(r.id||""));
}
export function gridItems(instance,data={},options={}){
  const kind=GRID_KINDS[instance.family],grid=instance.grid||defaultGrid(instance.family);
  if(!kind)return [];
  if(instance.items&&(kind==="images"||grid.source==="manual"))return structuredClone(instance.items);
  const records=gridRecords(instance,data,options).slice(0,grid.limit),used=new Set();
  if(kind==="images")return Array.from({length:grid.limit},(_,slot)=>({id:`cell-${slot.toString(16).padStart(32,"0")}`,slot}));
  return records.map(record=>{
    const old=instance.items?.find(i=>i.recordId===record.id);
    if(old){used.add(old.slot);return structuredClone(old);}
    let slot=Array.from({length:10},(_,i)=>i).find(i=>!used.has(i)&&!instance.items?.some(item=>item.slot===i));
    if(slot===undefined)slot=Array.from({length:10},(_,i)=>i).find(i=>!used.has(i)&&!records.some(r=>instance.items?.some(item=>item.recordId===r.id&&item.slot===i)));
    used.add(slot);
    return {id:`cell-${record.id.replace(/-/g,"")}`,slot,recordId:record.id,fresh:Boolean(instance.grid)};
  });
}
export function cellDefaults(instance,item,record,index){
  const kind=GRID_KINDS[instance.family];
  return {title:record?.title||record?.name||(instance.family==="before-after"?(item.slot===0?"Before":"After"):instance.family==="press-logos"?`Logo ${item.slot+1}`:instance.family==="customer-photos"?`Photograph ${item.slot+1}`:`Gallery image ${item.slot+1}`),
    body:kind==="collections"?(record?.description||"Explore this collection."):"A closer look at our collection.",label:kind==="collections"?"View collection":"Explore",link:item.link||"",alt:item.alt||"Section image",focus:item.focus||"center"};
}
export function gridSnapshot(model,page,id,data={},options={}){
  const instance=model.sections?.[page]?.instances?.find(i=>i.id===id);
  if(!instance||!GRID_KINDS[instance.family])return null;
  if(!instance.grid)return gridSnapshot(prepareGrid(model,page,id,data,options),page,id,data,options);
  const records=gridRecords(instance,data,options),kind=GRID_KINDS[instance.family];
  return {grid:{...(instance.grid||defaultGrid(instance.family))},kind,maxItems:GRID_MAX,fixedCount:instance.family==="before-after"?2:null,readOnlyContent:["products","reviews"].includes(kind)||kind==="collections"&&(instance.grid?.source||"automatic")==="automatic",configured:Boolean(instance.grid),
    records:records.map(r=>({id:r.id,label:r.title||r.name||r.author_name||"Customer review"})),
    items:gridItems(instance,data,options).map((item,index)=>{
      const keys=cellKeys(page,id,item.slot),defaults=cellDefaults(instance,item,records.find(r=>r.id===item.recordId),index);
      return {...item,...defaults,recordId:item.recordId,imageKey:keys.image,hasImage:Boolean(model.media?.[keys.image]?.media_id),...Object.fromEntries(["title","body","label"].map(k=>[k,!item.fresh&&Object.hasOwn(model.copy||{},keys[k])?model.copy[keys[k]]:defaults[k]]))};
    })};
}
export function newCell(slot,recordId){
  return {id:`cell-${crypto.randomUUID().replace(/-/g,"")}`,slot,...(recordId?{recordId}:{})};
}
/** Upgrade only on mutation. Existing ordinal edits are mapped before rows change. */
export function prepareGrid(model,page,id,data={},options={}){
  const next=structuredClone(model),instance=next.sections?.[page]?.instances?.find(i=>i.id===id);
  if(!instance||!GRID_KINDS[instance.family])throw new Error("Choose an added grid section.");
  next.copy||={};next.media||={};next.formatting||={};
  const kind=GRID_KINDS[instance.family],legacy=!instance.grid;
  instance.grid||=defaultGrid(instance.family);
  const actual=gridItems(instance,data,options);
  if(!instance.items||instance.grid.source==="automatic"){
    for(const item of actual)if(item.fresh)clearCellFields(next,page,id,item.slot);
    const kept=instance.grid.source==="automatic"?(instance.items||[]).filter(item=>
      !actual.some(x=>x.id===item.id||x.slot===item.slot)&&gridRecords(instance,data,options).some(r=>r.id===item.recordId)):[];
    instance.items=[...actual.map(({fresh,...item})=>item),...kept].slice(0,GRID_MAX);
  }
  if(legacy&&["images","collections"].includes(kind)){
    let ordinal=1;
    const records=gridRecords(instance,data,options);
    instance.items.forEach((item,index)=>{
      const keys=cellKeys(page,id,item.slot),record=records.find(r=>r.id===item.recordId);
      const fields=kind==="collections"?["title",...(instance.family==="related-collections"&&record?.description?["body"]:[])]:["title"];
      for(const field of fields){
        const old=`section.${page}.${id}.text${ordinal++}`;
        for(const bucket of ["copy","formatting"])if(Object.hasOwn(next[bucket],old)){next[bucket][keys[field]]=next[bucket][old];delete next[bucket][old];}
      }
    });
  }
  if(kind==="images"||kind==="collections"&&instance.grid.source==="manual"){
    const records=gridRecords(instance,data,options);
    instance.items.forEach((item,index)=>{
      const defaults=cellDefaults(instance,item,records.find(r=>r.id===item.recordId),index),keys=cellKeys(page,id,item.slot);
      for(const field of ["title","body","label"])if(!Object.hasOwn(next.copy,keys[field]))next.copy[keys[field]]=defaults[field];
    });
  }
  return next;
}
function clearCellFields(model,page,id,slot){
  const keys=cellKeys(page,id,slot);
  for(const bucket of ["copy","media","formatting"])for(const key of Object.values(keys))delete model[bucket]?.[key];
}
export function changeGrid(model,page,id,action,value,data={},options={}){
  const next=prepareGrid(model,page,id,data,options),instance=next.sections[page].instances.find(i=>i.id===id),kind=GRID_KINDS[instance.family];
  const items=instance.items;
  const seed=item=>{
    clearCellFields(next,page,id,item.slot);
    const defaults=cellDefaults(instance,item,gridRecords(instance,data,options).find(r=>r.id===item.recordId),items.indexOf(item));
    const keys=cellKeys(page,id,item.slot);
    if(!["products","reviews"].includes(kind))for(const field of ["title","body","label"])next.copy[keys[field]]=defaults[field];
  };
  if(action==="settings"){
    const oldSource=instance.grid.source;
    instance.grid={...instance.grid,...value};
    if(!Number.isInteger(instance.grid.limit)||instance.grid.limit<1||instance.grid.limit>10)throw new Error("Show between one and ten cells.");
    if(kind==="images"&&instance.family!=="before-after")while(items.length<instance.grid.limit){
      const cell=newCell(Array.from({length:10},(_,i)=>i).find(i=>!items.some(x=>x.slot===i)));
      items.push(cell);seed(cell);
    }
    if(oldSource==="manual"&&instance.grid.source==="automatic"){
      for(const item of items)clearCellFields(next,page,id,item.slot);
      delete instance.items;
    }
  }else{
    instance.grid.source="manual";
    const item=items.find(i=>i.id===value.id),fixed=instance.family==="before-after";
    if(action==="add"||action==="duplicate"){
      if(fixed||items.length>=10)throw new Error("This section has reached its cell limit.");
      if(action==="duplicate"&&kind!=="images")throw new Error("Choose a different catalogue record instead of duplicating it.");
      const slot=Array.from({length:10},(_,i)=>i).find(i=>!items.some(x=>x.slot===i));
      const recordId=value.recordId||gridRecords(instance,data,options).find(r=>!items.some(x=>x.recordId===r.id))?.id;
      if(kind!=="images"&&!recordId)throw new Error("Add an available record to your catalogue first.");
      const cell=newCell(slot,kind==="images"?undefined:recordId);
      items.splice(action==="duplicate"&&item?items.indexOf(item)+1:items.length,0,cell);seed(cell);
      if(action==="duplicate"&&item){
        const old=cellKeys(page,id,item.slot),keys=cellKeys(page,id,slot);
        for(const bucket of ["copy","media","formatting"])for(const field of Object.keys(old))if(Object.hasOwn(next[bucket],old[field]))next[bucket][keys[field]]=structuredClone(next[bucket][old[field]]);
        for(const key of ["link","alt","focus"])if(item[key]!==undefined)cell[key]=item[key];
      }
      instance.grid.limit=Math.max(instance.grid.limit,items.length);
    }else if(action==="reorder"){
      if(!Array.isArray(value.ids)||value.ids.length!==items.length||new Set(value.ids).size!==items.length||value.ids.some(key=>!items.some(x=>x.id===key)))throw new Error("Cell order changed. Try again.");
      instance.items=value.ids.map(key=>items.find(x=>x.id===key));
    }else{
      if(!item)throw new Error("Choose an existing cell.");
      if(action==="remove"){
        if(fixed||items.length<=1)throw new Error("Keep at least one cell in this section.");
        clearCellFields(next,page,id,item.slot);items.splice(items.indexOf(item),1);
        instance.grid.limit=Math.min(instance.grid.limit,items.length);
      }else if(action==="move"){
        const at=items.indexOf(item),to=at+value.delta;
        if(![-1,1].includes(value.delta)||to<0||to>=items.length)throw new Error("Choose an available position.");
        [items[at],items[to]]=[items[to],items[at]];
      }else if(action==="update"){
        const patch=value.patch;
        if(!only(patch,["title","body","label","link","alt","focus","recordId"]))throw new Error("Choose a supported cell field.");
        if(patch.recordId!==undefined){
          if(kind==="images"||!gridRecords(instance,data,options).some(r=>r.id===patch.recordId)||items.some(x=>x.id!==item.id&&x.recordId===patch.recordId))throw new Error("Choose a different available store record.");
          item.recordId=patch.recordId;seed(item);
        }
        const keys=cellKeys(page,id,item.slot);
        for(const field of ["title","body","label"])if(patch[field]!==undefined){
          if(["products","reviews"].includes(kind)||typeof patch[field]!=="string"||patch[field].length>2000)throw new Error("Catalogue and review content cannot be changed here.");
          next.copy[keys[field]]=patch[field];delete next.formatting[keys[field]];
        }
        for(const key of ["link","alt","focus"])if(patch[key]!==undefined)item[key]=patch[key];
      }else throw new Error("Choose a supported cell action.");
    }
  }
  if(!validGridData(instance))throw new Error("Choose valid grid settings and cell content.");
  return next;
}
export function gridBindingError(sections,data){
  const source=data.section_source||data;
  const sets={products:new Set((source.products||[]).filter(r=>r.status!=="archived").map(r=>r.id)),collections:new Set((source.collections||[]).filter(r=>r.status!=="archived").map(r=>r.id)),reviews:new Set((data.reviews||[]).map(r=>r.id))};
  for(const entry of Object.values(sections||{}))for(const instance of entry.instances||[]){
    const kind=GRID_KINDS[instance.family];
    if(kind&&kind!=="images")for(const item of instance.items||[])if(!sets[kind].has(item.recordId))return "Choose cells from this store's available records.";
  }
  return "";
}
