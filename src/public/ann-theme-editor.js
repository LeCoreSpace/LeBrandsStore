import {attachAnnDesign} from "./ann-design-ui.js";
import {designPreviewData,renderStylePreview} from "./style-preview.js";
import {designSections} from "./ann-section-layout.js";
import {openAnnBrowserPreview,browserPreviewLocation} from "./ann-browser-preview.js";
import {annPreviewConfiguration,ANN_EXTRA_SECTIONS} from "./ann-config.js";
import {DESIGN_COPY_LIMITS,DESIGN_MEDIA_KEYS} from "./ann-design-model.js";
import {attachAuraSearch,attachAuraCatalog} from "./aura-ui.js";
import {attachStyleInteractions} from "./style-preview-interactions.js";
const $=s=>document.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let source=JSON.parse($("#ae-data").textContent),plan=structuredClone(source.settings.ann_design.plan||{}),page="home",productId,collectionId,policyKind,device="desktop",timer;
const initialDesign=structuredClone(source.settings.ann_design);
const initialVisualSettings=Object.fromEntries(["theme","brand_name","category","subcategory","style_preset","color_preset","accent_color","font_preset","button_style"].filter(k=>k in source.settings).map(k=>[k,source.settings[k]]));
const storeId=source.store.store_id,root=source.ann_root||`/stores/${storeId}`,api=source.ann_api_root||`/api/stores/${storeId}/ann`,frame=$("#ae-frame");
const readOnly=!["owner","admin"].includes(source.role),bag=new Map();
$("#ae-own").disabled=readOnly;
const FIELD_LABELS={kicker:"Intro line",title:"Main headline",description:"Introduction",button:"Main button text",statement:"Brand statement",products:"Products heading",collections:"Collections heading",about:"About page heading",story0:"Story paragraph 1",story1:"Story paragraph 2",story2:"Story paragraph 3",footer:"Footer text",hero:"Main photo",lifestyle:"Lifestyle photo",collection0:"First collection photo",collection1:"Second collection photo"};
const say=text=>{$("#ae-status").textContent=text;};
let controller;
const snapshot=()=>{
  const design=controller?.previewDesign()||source.settings.ann_design||initialDesign;
  const data=designPreviewData(source,design),theme=annPreviewConfiguration(plan,source.settings).theme;
  return {data,theme,route:{page,productId,collectionId,policyKind},bag};
};
function controls() {
  const ready=controller?.active()===true;
  $("#ae-content").hidden=!ready;
  $("#ae-sections").hidden=!ready;
  $("#ae-own").disabled=readOnly||!ready;
  for(const field of $("#ae-content").querySelectorAll("button,input,select"))field.disabled=readOnly||!ready;
  const s=snapshot(),design=s.data.settings.ann_design,base=structuredClone(s.data);base.settings.ann_design.sections={};
  const items=designSections(renderStylePreview(base,s.theme,{...s.route,designEdit:true}),page).sections;
  const cfg=design.sections?.[page]||{},order=[...(cfg.order||[]),...items.map(i=>i.id)].filter((id,i,a)=>a.indexOf(id)===i),map=new Map(items.map(i=>[i.id,i]));
  $("#ae-sections").innerHTML=`<h3>Page sections</h3><p class="ae-muted">Move sections or remove them from this page. Removed sections can be restored. Product purchase and contact forms are protected.</p>${order.filter(id=>map.has(id)).map(id=>{
    const x=map.get(id),hidden=cfg.hidden?.includes(id);
    return `<div class="ae-section"><span>${esc(x.label)}${hidden?" (removed)":""}</span><button data-ae-section="${id}" data-move="-1"${readOnly||x.required?" disabled":""}>Up</button><button data-ae-section="${id}" data-move="1"${readOnly||x.required?" disabled":""}>Down</button><button data-ae-section="${id}" data-toggle${readOnly||x.required?" disabled":""}>${hidden?"Restore":"Remove"}</button></div>`;
  }).join("")||'<p class="ae-muted">This page has a fixed shopping layout.</p>'}
  ${(ANN_EXTRA_SECTIONS[page]||[]).length?`<fieldset><legend>Add optional sections</legend>${ANN_EXTRA_SECTIONS[page].map(type=>`<label><input type="checkbox" data-ae-extra="${type}"${plan.section_options?.[page]?.includes(type)?" checked":""}${readOnly?" disabled":""}> ${esc(type.replace(/-/g," "))}</label>`).join("")}</fieldset>`:""}`;
  if(!ready)for(const field of $("#ae-sections").querySelectorAll("button,input"))field.disabled=true;
}
function fit(){const area=frame.parentElement,w=device==="mobile"?390:1280,scale=Math.min(1,(area.clientWidth-24)/w);Object.assign(frame.style,{position:"absolute",width:`${w}px`,maxWidth:"none",height:`${Math.max(450,(area.clientHeight-24)/scale)}px`,transform:`scale(${scale})`,transformOrigin:"top left",left:`${Math.max(12,(area.clientWidth-w*scale)/2)}px`});area.style.position="relative";area.style.overflow="hidden";}
function render() {clearTimeout(timer);const s=snapshot();frame.classList.toggle("is-mobile",device==="mobile");frame.srcdoc=renderStylePreview(s.data,s.theme,{...s.route,designEdit:controller?.editing()});controls();fit();}
function schedule(){clearTimeout(timer);timer=setTimeout(render,160);}
controller=attachAnnDesign({api,root,readOnly,themeEditor:true,mount:$("#ae-design-mount"),say,
  getPreviewMode:()=>"store",getStyle:()=>plan.style_preset||initialDesign.style,getAnswers:()=>plan,getBrand:()=>source.settings.brand_name||source.store.name,
  applyPlan:p=>{plan=structuredClone(p);},onDraft:d=>{source=d.settings?.ann_design?d:{...d,settings:{...d.settings,...initialVisualSettings}};},onChange:schedule,onActivated:schedule,onCatalogueConfirmed:()=>{say("Your own products are selected. Save draft to keep this choice.");render();},
  getPreview:()=>frame,});
$("#ae-content").innerHTML=`<h3>Edit text and images</h3>${Object.keys(DESIGN_COPY_LIMITS).map(k=>`<button type="button" class="ann-btn alt sm" data-ae-edit="copy" data-key="${k}"${readOnly?" disabled":""}>${esc(FIELD_LABELS[k]||k)}</button>`).join("")}<h3>Photos</h3>${DESIGN_MEDIA_KEYS.map(k=>`<button type="button" class="ann-btn alt sm" data-ae-edit="image" data-key="${k}"${readOnly?" disabled":""}>${esc(FIELD_LABELS[k]||k)}</button>`).join("")}
<fieldset><legend>Colours and fonts</legend><label>Background<select data-ae-plan="color_preset"${readOnly?" disabled":""}>${["white","ivory","stone","midnight"].map(v=>`<option${plan.color_preset===v?" selected":""}>${v}</option>`).join("")}</select></label><label>Font style<select data-ae-plan="font_preset"${readOnly?" disabled":""}>${["modern","serif","classic"].map(v=>`<option${plan.font_preset===v?" selected":""}>${v}</option>`).join("")}</select></label><label>Button and highlight colour<input type="color" data-ae-plan="accent_color" value="${esc(plan.accent_color||source.settings.accent_color||"#661329")}"${readOnly?" disabled":""}></label></fieldset>`;
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b||b.disabled)return;
  if(b.dataset.aePage){page=b.dataset.aePage;render();}
  if(b.dataset.aeDevice){device=b.dataset.aeDevice;render();}
  if(b.id==="ae-browser"){const s=snapshot();openAnnBrowserPreview({data:s.data,theme:s.theme,...s.route,bag,device,storeName:source.settings.brand_name||source.store.name});}
  if(b.id==="ae-own"&&!readOnly)controller.requestCatalogue();
  if(b.dataset.aeEdit)controller.selectContent(b.dataset.aeEdit,b.dataset.key);
  if(b.dataset.aeSection&&!readOnly) {
    const s=snapshot(),model=s.data.settings.ann_design,base=structuredClone(s.data);base.settings.ann_design.sections={};
    const items=designSections(renderStylePreview(base,s.theme,s.route),page).sections,map=new Map(items.map(x=>[x.id,x]));
    const all=structuredClone(model.sections||{}),cfg=all[page]||={order:[],hidden:[]};
    cfg.order=[...(cfg.order||[]),...items.map(x=>x.id)].filter((id,i,a)=>a.indexOf(id)===i&&map.has(id));
    cfg.hidden||=[];const id=b.dataset.aeSection;
    if(b.hasAttribute("data-toggle"))cfg.hidden=cfg.hidden.includes(id)?cfg.hidden.filter(x=>x!==id):[...cfg.hidden,id];
    else {const i=cfg.order.indexOf(id),j=i+Number(b.dataset.move);if(i>=0&&j>=0&&j<cfg.order.length&&!map.get(cfg.order[j])?.required)[cfg.order[i],cfg.order[j]]=[cfg.order[j],cfg.order[i]];}
    controller.setSections(all);
  }
});
document.addEventListener("change",e=>{
  if(readOnly)return;const n=e.target;
  if(n.dataset.aeExtra){plan.section_options||={};const values=new Set(plan.section_options[page]||[]);n.checked?values.add(n.dataset.aeExtra):values.delete(n.dataset.aeExtra);plan.section_options[page]=[...values];controller.planChanged();render();}
  if(n.dataset.aePlan){plan[n.dataset.aePlan]=n.value;controller.planChanged();render();}
});
frame.addEventListener("load",()=>{
  const doc=frame.contentDocument;if(!doc)return;controller.bindPreview(doc);
  const s=snapshot(),go=r=>{page=r.page;productId=r.productId;collectionId=r.collectionId;policyKind=r.policyKind;render();};
  doc.addEventListener("submit",e=>e.preventDefault(),true);
  attachAuraSearch(doc,s.data);attachAuraCatalog(doc,s.data,s.route);
  attachStyleInteractions(doc,s.data,bag,page,productId,p=>go({...s.route,page:p}));
  doc.addEventListener("click",e=>{const a=e.target.closest?.("a[href]");if(!a)return;const route=browserPreviewLocation(a.getAttribute("href"),s.data,location.origin);e.preventDefault();if(route)go(route);});
});
window.addEventListener("beforeunload",e=>{if(controller.hasUnsavedChanges()){e.preventDefault();e.returnValue="";}});
new ResizeObserver(fit).observe(frame.parentElement);
render();
