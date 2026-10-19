// Shared JSON-only text formatting. Neither HTML nor arbitrary CSS is accepted.
export const RICH_FONTS = Object.freeze([
  {value:"theme",label:"Theme font",css:"inherit"},
  {value:"sans",label:"System sans",css:"system-ui,sans-serif"},
  {value:"serif",label:"System serif",css:"ui-serif,Georgia,serif"},
  {value:"mono",label:"Monospace",css:"ui-monospace,monospace"},
  {value:"arial",label:"Arial",css:"Arial,Helvetica,sans-serif"},
  {value:"georgia",label:"Georgia",css:"Georgia,serif"},
  {value:"verdana",label:"Verdana",css:"Verdana,sans-serif"},
  {value:"trebuchet",label:"Trebuchet",css:'"Trebuchet MS",sans-serif'},
]);
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const only=(v,keys)=>plain(v)&&Object.keys(v).every(k=>keys.includes(k));
const COLOR=/^#[0-9a-f]{6}$/i;
const TEXT=/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const richTextPlain=doc=>Array.isArray(doc?.runs)?doc.runs.map(r=>r.text??"").join(""):"";
export function safeRichLink(value){
  if(typeof value!=="string"||value.length>2000||/[\s<>"'\u0000-\u001f\u007f]/.test(value))return false;
  try{return ["https:","http:","mailto:","tel:"].includes(new URL(value).protocol);}catch{return false;}
}
export function validRichTextDocument(doc,limit=2000){
  if(!only(doc,["version","runs","style"])||doc.version!==1||!Array.isArray(doc.runs)||
    doc.runs.length>120||!plain(doc.style))return false;
  const style=doc.style;
  if(!only(style,["font","size","align","lineHeight","letterSpacing","preset","list"]))return false;
  if(style.font!==undefined&&!RICH_FONTS.some(f=>f.value===style.font))return false;
  if(style.align!==undefined&&!["left","center","right","justify"].includes(style.align))return false;
  if(style.preset!==undefined&&!["body","title","subtitle","caption"].includes(style.preset))return false;
  if(style.list!==undefined&&!["none","bullet","number"].includes(style.list))return false;
  for(const [key,min,max]of [["size",8,120],["lineHeight",.8,3],["letterSpacing",-2,10]])
    if(style[key]!==undefined&&(typeof style[key]!=="number"||!Number.isFinite(style[key])||style[key]<min||style[key]>max))return false;
  for(const run of doc.runs){
    if(!only(run,["text","bold","italic","underline","strike","color","highlight","link"])||
      typeof run.text!=="string"||TEXT.test(run.text))return false;
    for(const key of ["bold","italic","underline","strike"])
      if(run[key]!==undefined&&typeof run[key]!=="boolean")return false;
    for(const key of ["color","highlight"])
      if(run[key]!==undefined&&(typeof run[key]!=="string"||!COLOR.test(run[key])))return false;
    if(run.link!==undefined&&!safeRichLink(run.link))return false;
  }
  return [...richTextPlain(doc)].length<=limit;
}
export function richTextStyle(style={}){
  const css=["text-transform:none!important","overflow-wrap:anywhere"];
  if(style.font)css.push(`font-family:${RICH_FONTS.find(f=>f.value===style.font)?.css||"inherit"}!important`);
  const preset={body:18,title:48,subtitle:28,caption:13};
  const size=style.size??preset[style.preset];
  if(size)css.push(`font-size:clamp(${Math.min(32,size)}px,${Number((size/12).toFixed(3))}vw,${size}px)!important`);
  if(style.lineHeight!==undefined)css.push(`line-height:${style.lineHeight}!important`);
  if(style.letterSpacing!==undefined)css.push(`letter-spacing:${style.letterSpacing}px!important`);
  if(style.align)css.push(`text-align:${style.align}!important`);
  return css.join(";");
}
function runHtml(run,links){
  const css=["display:inline!important","white-space:pre-wrap","font-size:inherit!important",
    "font-family:inherit!important","line-height:inherit!important","letter-spacing:inherit!important","text-transform:inherit!important"];
  if(run.bold!==undefined)css.push(`font-weight:${run.bold?700:400}!important`);
  if(run.italic!==undefined)css.push(`font-style:${run.italic?"italic":"normal"}!important`);
  if(run.underline!==undefined||run.strike!==undefined)
    css.push(`text-decoration:${[run.underline?"underline":"",run.strike?"line-through":""].filter(Boolean).join(" ")||"none"}!important`);
  if(run.color)css.push(`color:${run.color}!important`);
  if(run.highlight)css.push(`background-color:${run.highlight}!important`);
  const text=`<span style="${esc(css.join(";"))}">${esc(run.text)}</span>`;
  return links&&run.link?`<a href="${esc(run.link)}" style="color:inherit;text-decoration:underline">${text}</a>`:text;
}
export function renderRichText(doc,{allowBlocks=true,limit=2000}={}){
  if(!validRichTextDocument(doc,limit))return "";
  if(!allowBlocks||!["bullet","number"].includes(doc.style.list))return doc.runs.map(r=>runHtml(r,allowBlocks)).join("");
  const lines=[[]];
  for(const run of doc.runs){
    const parts=run.text.split("\n");
    parts.forEach((text,i)=>{if(i)lines.push([]);lines.at(-1).push({...run,text});});
  }
  return `<span role="list" style="display:block">${lines.map((runs,i)=>`<span role="listitem" style="display:block">${doc.style.list==="number"?`${i+1}. `:"&#8226; "}${runs.map(r=>runHtml(r,true)).join("")}</span>`).join("")}</span>`;
}
const VOID=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
/** Only markers emitted by trusted store renderers are eligible. Run after the
 * section scanner so added formatting cannot change section field numbering. */
export function applyRichDesignText(html,design){
  if(!plain(design?.formatting)||!Object.keys(design.formatting).length)return html;
  const changes=[],stack=[],tags=/<\/?([a-z][\w:-]*)\b[^>]*>/gi;let m;
  while((m=tags.exec(html))){
    const tag=m[1].toLowerCase();
    if(m[0][1]==="/"){
      const node=stack.pop();if(!node||node.tag!==tag||!node.key||node.blocked)continue;
      const doc=design.formatting[node.key];
      if(!validRichTextDocument(doc)||typeof design.copy?.[node.key]!=="string"||richTextPlain(doc)!==design.copy[node.key])continue;
      const allowBlocks=!/^(h[1-6]|a|button|summary)$/.test(tag);
      const style=`${richTextStyle(doc.style)};${doc.style.align&&allowBlocks?"display:block;":""}`;
      // Preserve the semantic heading/button/link and apply typography there.
      // All CSS originates from whitelisted JSON properties, never raw input.
      let open=node.open;
      const existing=/\sstyle=(["'])(.*?)\1/i.exec(open);
      if(existing)open=open.replace(existing[0],` style="${esc(existing[2])};${esc(style)}"`);
      else open=open.slice(0,-1)+` style="${esc(style)}">`;
      changes.push([node.start,node.end,open],[node.end,m.index,renderRichText(doc,{allowBlocks})]);
      continue;
    }
    const blocked=stack.some(n=>n.blocked)||tag==="form"||tag==="fieldset"||
      /\bdata-(?:product-id|showcase-buy|cart|preview-quantity|preview-remove)\b/.test(m[0])||
      /\bclass=["'][^"']*\b(?:sc-card|sc-buy|sc-price|sc-pprice|au-buy|au-card)\b/.test(m[0]);
    const key=/\bdata-(?:ann-copy-field|design-copy)="([^"]+)"/.exec(m[0])?.[1];
    if(!VOID.has(tag)&&!m[0].endsWith("/>"))stack.push({tag,blocked,key,start:m.index,end:tags.lastIndex,open:m[0]});
  }
  for(const [start,end,value]of changes.sort((a,b)=>b[0]-a[0]))html=html.slice(0,start)+value+html.slice(end);
  return html;
}
