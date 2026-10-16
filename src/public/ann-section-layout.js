// Shared draft/live section arrangement. Only trusted renderer output is parsed;
// merchants send bounded identifiers, never HTML.
const PAGES=["home","collection","product","about","contact"];
const VOID=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const SLOT=/^(?:main-(?:[0-9]|[12][0-9]|3[0-9])|slot-[a-z][a-z0-9-]{0,60}-[0-9]{1,2})$/;
function sectionEntry(body,index,page,seen){
  const root=/^<[^>]+>/.exec(body)?.[0]||"";
  const heading=/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body)?.[1];
  const label=(heading?.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#39;/g,"'")||`Section ${index+1}`).slice(0,100);
  const required=index===0&&["product","contact"].includes(page);
  const type=/(?:data-section-type|data-niche-section|data-rich-section|data-type)=["']([^"']+)["']/.exec(root)?.[1];
  const classes=/class=["']([^"']+)["']/.exec(root)?.[1]?.split(/\s+/)||[];
  const name=String(type||classes.find(c=>!["sc-sec","au-section","rv"].includes(c)&&/^[a-z][a-z0-9_-]+$/.test(c))||"").toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,48);
  const n=seen.get(name)||0;seen.set(name,n+1);
  return {id:required?`slot-core-${page}-0`:name?`slot-${name}-${n}`:`main-${index}`,label,html:body,required};
}
export function designSections(html,page="home") {
  if(!PAGES.includes(page))return {sections:[],before:html,after:""};
  const start=/<main\b[^>]*>/i.exec(html),end=html.lastIndexOf("</main>");
  if(!start||end<start.index)return {sections:[],before:html,after:""};
  const from=start.index+start[0].length,content=html.slice(from,end),sections=[],seen=new Map();
  const tags=/<\/?([a-z][\w:-]*)\b[^>]*>/gi;let depth=0,begin=-1,m;
  while((m=tags.exec(content))){
    const close=m[0][1]==="/",tag=m[1].toLowerCase();
    if(close){depth=Math.max(0,depth-1);if(depth===0&&begin>=0){const body=content.slice(begin,tags.lastIndex);
      sections.push(sectionEntry(body,sections.length,page,seen));begin=-1;}}
    else {if(depth===0)begin=m.index;if(!VOID.has(tag)&&!m[0].endsWith("/>"))depth++;else if(depth===0&&begin>=0){sections.push(sectionEntry(m[0],sections.length,page,seen));begin=-1;}}
  }
  return {sections,before:html.slice(0,from),after:html.slice(end)};
}
export function validDesignSections(value) {
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!PAGES.includes(k)))return false;
  return Object.entries(value).every(([page,entry])=>entry&&typeof entry==="object"&&!Array.isArray(entry)&&
    Object.keys(entry).every(k=>["order","hidden"].includes(k))&&["order","hidden"].every(k=>entry[k]===undefined||
      Array.isArray(entry[k])&&entry[k].length<=40&&new Set(entry[k]).size===entry[k].length&&entry[k].every(id=>typeof id==="string"&&SLOT.test(id)))&&
    (!["product","contact"].includes(page)||!entry.hidden?.some(id=>["main-0",`slot-core-${page}-0`].includes(id))&&(!entry.order?.length||["main-0",`slot-core-${page}-0`].includes(entry.order[0]))));
}
export function applyDesignSections(html,value,page="home") {
  if(!value?.[page]||!validDesignSections(value)||html.includes('data-ann-arranged="true"'))return html;
  const parts=designSections(html,page),cfg=value[page],map=new Map(parts.sections.map(s=>[s.id,s]));
  if(!parts.sections.length)return html;
  const ids=[...parts.sections.filter(s=>s.required).map(s=>s.id),...(cfg.order||[]),...parts.sections.map(s=>s.id)].filter((id,i,a)=>a.indexOf(id)===i);
  return parts.before.replace(/<main\b/i,'<main data-ann-arranged="true"')+
    ids.filter(id=>map.has(id)&&(!cfg.hidden?.includes(id)||map.get(id).required)).map(id=>map.get(id).html).join("")+parts.after;
}
