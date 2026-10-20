import { designSections } from "./ann-section-layout.js";
import { safeImage } from "./aura-sections.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const VOID=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const TEXT=/^(h[1-6]|p|span|b|strong|em|small|figcaption|summary|a|button)$/;
const PROTECTED=/\b(?:data-(?:product-id|showcase-buy|cart|preview-quantity|preview-remove)|class=["'][^"']*(?:sc-card|sc-buy|sc-price|sc-pprice|au-buy|au-card))/;
const VIDEO=/^https:\/\/media\.lebrands\.store\/stores\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:mp4|webm)$/i;

/** Annotate trusted renderer output, never merchant HTML. All stored overrides
 * remain plain text or tenant-resolved media. Inventory and forms stay separate. */
function sectionContent(section,design,page,edit) {
  const html=section.html, changes=[],stack=[],tags=/<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  const prefix=`section.${page}.${section.id}.`;
  let textIndex=0,imageIndex=0,m;
  while((m=tags.exec(html))){
    const tag=m[1].toLowerCase(),close=m[0][1]==="/";
    if(close){
      const node=stack.pop();
      if(!node||node.tag!==tag)continue;
      if(node.textKey){
        const text=html.slice(node.end,m.index);
        // Leaf text only: retain existing typography and interactive children.
        if(!text.includes("<") && text.trim() && textIndex<60){
          const key=prefix+`text${textIndex++}`;
          if(edit||design.formatting?.[key])changes.push([node.start,node.end,node.open.slice(0,-1)+` data-ann-copy-field="${key}"${edit?` data-design-copy="${key}"`:""}>`]);
          if(Object.hasOwn(design.copy||{},key))changes.push([node.end,m.index,esc(design.copy[key])]);
        }
      }
      continue;
    }
    const blocked=(design.catalogue_mode==="own"&&page==="product"&&section.required)||/\bdata-section-item-fresh=["']true["']/.test(m[0])||
      stack.some(n=>n.blocked)||tag==="form"||tag==="fieldset"||PROTECTED.test(m[0]);
    const inheritedCopy=stack.some(n=>n.copy);
    const copy=/\bdata-(?:design-copy|ann-copy-field)=/.test(m[0]);
    if(tag==="img"&&!blocked&&imageIndex<10){
      const slot=/\bdata-section-item-slot=["']([0-9])["']/.exec(m[0]);
      const index=slot?Number(slot[1]):imageIndex++,key=prefix+`image${index}`,videoKey=prefix+`video${index}`;
      const image=design.media?.[key],video=design.media?.[videoKey];
      const cell=slot?design.sections?.[page]?.instances?.find(i=>i.id===section.id)?.items?.find(i=>i.slot===index):null;
      let open=m[0];
      if(video?.media_id&&VIDEO.test(video.url)){
        open=`<video src="${esc(video.url)}" controls playsinline preload="metadata" aria-label="${esc(video.alt||"Section video")}" style="display:block;width:100%;height:100%;object-fit:cover"${edit?` data-design-video="${videoKey}" data-design-image-slot="${key}"`:""}></video>`;
      }else{
        if(image?.media_id&&safeImage(image.url)){
          open=open.replace(/\s(?:src|srcset|sizes|alt)=["'][^"']*["']/g,"");
          open=open.replace(/\/?>$/,` src="${esc(safeImage(image.url))}" alt="${esc(cell?.alt??image.alt??"")}">`);
        }
        if(edit){
          // A field is individual to this section, not a shared global image.
          open=open.replace(/\sdata-design-image=["'][^"']*["']/g,"");
          open=open.replace(/\/?>$/,` data-design-image="${key}" data-design-video-slot="${videoKey}">`);
        }
      }
      if(open!==m[0])changes.push([m.index,tags.lastIndex,open]);
    }
    if(!VOID.has(tag)&&!m[0].endsWith("/>"))stack.push({
      tag,blocked,copy:copy||inheritedCopy,start:m.index,end:tags.lastIndex,open:m[0],
      textKey:!blocked&&!copy&&!inheritedCopy&&TEXT.test(tag),
    });
  }
  if(edit){
    const root=/^<[^>]+>/.exec(html)?.[0];
    if(root)changes.push([0,root.length,root.slice(0,-1)+` data-design-section="${section.id}" data-design-section-label="${esc(section.label)}">`]);
  }
  // Root and text edits can share an opening tag (a root paragraph). Combine
  // annotations rather than letting one overwrite the other.
  const unique=new Map();
  for(const change of changes){
    const id=`${change[0]}:${change[1]}`,previous=unique.get(id);
    if(previous&&change[0]===0){
      previous[2]=previous[2].slice(0,-1)+change[2].slice(change[2].indexOf(" data-design-section"));
    }else unique.set(id,change);
  }
  let result=html;
  for(const [start,end,value] of [...unique.values()].sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+value+result.slice(end);
  return result;
}

export function applyDesignContent(html,design,page="home",edit=false){
  if(!design||html.includes('data-design-content="true"'))return html;
  const parts=designSections(html,page);
  if(!parts.sections.length)return html;
  return parts.before.replace(/<main\b/,'<main data-design-content="true"')+
    parts.sections.map(s=>sectionContent(s,design,page,edit)).join("")+parts.after;
}
