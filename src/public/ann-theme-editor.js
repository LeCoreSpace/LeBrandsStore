import {attachAnnDesign} from "./ann-design-ui.js";
import {instanceOnlySections} from "./section-instance-model.js";
import {designPreviewData,renderStylePreview} from "./style-preview.js";

import {openAnnBrowserPreview,browserPreviewLocation} from "./ann-browser-preview.js";
import {annPreviewConfiguration,ANN_SECTION_LABELS} from "./ann-config.js";
import {attachAnnWorkspace,sectionMeta,nextSections} from "./ann-design-workspace.js";
import {attachAuraSearch,attachAuraCatalog} from "./aura-ui.js";
import {attachStyleInteractions} from "./style-preview-interactions.js";
const $=s=>document.querySelector(s),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let source=JSON.parse($("#ae-data").textContent),plan=structuredClone(source.settings.ann_design.plan||{}),page="home",productId,collectionId,policyKind,device="desktop",timer;
const initialDesign=structuredClone(source.settings.ann_design);
const initialVisualSettings=Object.fromEntries(["theme","brand_name","category","subcategory","style_preset","color_preset","accent_color","font_preset","button_style"].filter(k=>k in source.settings).map(k=>[k,source.settings[k]]));
const storeId=source.store.store_id,root=source.ann_root||`/stores/${storeId}`,api=source.ann_api_root||`/api/stores/${storeId}/ann`,frame=$("#ae-frame");
const readOnly=!["owner","admin"].includes(source.role),bag=new Map();
const say=text=>{$("#ae-status").textContent=text;};
let controller,workspace;

let addedSection=null,previewScroll=0;
let wsCache={key:"",value:{meta:new Map(),map:new Map()}};
function baseHtml(){const s=snapshot(),b=structuredClone(s.data);b.settings.ann_design.sections=instanceOnlySections(b.settings.ann_design.sections);return renderStylePreview(b,s.theme,{...s.route,designEdit:true});}
function sectionInfo(){
  const d=snapshot().data.settings.ann_design,key=JSON.stringify([page,productId,collectionId,d?.style,d?.sections,plan.section_options,plan.style_preset]);
  if(wsCache.key!==key)wsCache={key,value:sectionMeta(baseHtml(),d?.sections||{},page)};
  return wsCache.value;
}
function syncActions(){
  $("#ae-undo").disabled=!controller?.canUndo();
  $("#ae-save").disabled=!controller?.canSave();
  $("#ae-publish").disabled=!controller?.canPublish();
}
const snapshot=()=>{
  const design=controller?.previewDesign()||source.settings.ann_design||initialDesign;
  const data=designPreviewData(source,design),theme=annPreviewConfiguration(plan,source.settings).theme;
  return {data,theme,route:{page,productId,collectionId,policyKind},bag};
};
function controls(){
  syncActions();
  workspace?.refresh();
}
function fit(){const area=frame.parentElement,w=device==="mobile"?390:1280,scale=Math.min(1,(area.clientWidth-24)/w);Object.assign(frame.style,{position:"absolute",width:`${w}px`,maxWidth:"none",height:`${Math.max(450,(area.clientHeight-24)/scale)}px`,transform:`scale(${scale})`,transformOrigin:"top left",left:`${Math.max(12,(area.clientWidth-w*scale)/2)}px`});area.style.position="relative";area.style.overflow="hidden";}
function render() {clearTimeout(timer);previewScroll=frame.contentDocument?.scrollingElement?.scrollTop||0;const s=snapshot();frame.classList.toggle("is-mobile",device==="mobile");frame.srcdoc=renderStylePreview(s.data,s.theme,{...s.route,designEdit:controller?.editing()});controls();fit();}
function schedule(){clearTimeout(timer);timer=setTimeout(render,160);}
workspace=attachAnnWorkspace({mount:$("#ae-tools"),variant:"sidebar",readOnly,controller:()=>controller,canEdit:()=>true,
  getSectionContext:()=>({productId,collectionId}),
  getPage:()=>page,setPage:p=>{page=p;render();},getData:()=>source,getNote:()=>source.ann_design_pending?"Your saved Ann plan is shown here. Save it as a draft to start editing. Your live site stays unchanged.":"",
  getPlan:()=>({color_preset:plan.color_preset||source.settings.color_preset||"white",font_preset:plan.font_preset||source.settings.font_preset||"modern",accent_color:plan.accent_color||source.settings.accent_color||"#661329",section_options:plan.section_options||{}}),
  setPlan:(k,v)=>{plan[k]=v;controller.planChanged();render();},setExtra,sectionInfo,onSectionAction:sectionAction,onOwn:()=>{if(!readOnly)controller.requestCatalogue();}});
controller=attachAnnDesign({api,root,readOnly,themeEditor:true,mount:workspace.slot(),say,
  getSectionContext:()=>({productId,collectionId}),
  getPreviewMode:()=>"store",contextual:true,sectionState:id=>sectionInfo().meta.get(id)||null,onSectionAction:(id,act)=>sectionAction(id,act),getStyle:()=>plan.style_preset||initialDesign.style,getAnswers:()=>plan,getBrand:()=>source.settings.brand_name||source.store.name,
  applyPlan:p=>{plan=structuredClone(p);},onDraft:d=>{source=d.settings?.ann_design?d:{...d,settings:{...d.settings,...initialVisualSettings}};},onChange:schedule,onActivated:schedule,onCatalogueConfirmed:()=>{say("Your own products are selected. Save draft to keep this choice.");render();},
  getPreview:()=>frame,});
function sectionAction(id,act){
  if(readOnly||!id||!controller?.active())return;
  const next=nextSections(baseHtml(),controller.previewDesign()?.sections||{},page,id,act);
  if(next){controller.setSections(next);workspace.refresh();}
}
function setExtra(type,on){
  if(readOnly)return;
  plan.section_options||={};const values=new Set(plan.section_options[page]||[]);
  on?values.add(type):values.delete(type);plan.section_options[page]=[...values];
  if(on){addedSection=type;const sections=structuredClone(controller.previewDesign()?.sections||{});if(sections[page]?.hidden){sections[page].hidden=sections[page].hidden.filter(id=>id!==`slot-${type}-0`);controller.setSections(sections);}}
  say(`${ANN_SECTION_LABELS[type]||type} ${on?"added to":"removed from"} this page. Save draft to keep this change.`);
  controller.planChanged();render();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b||b.disabled)return;
  if(b.dataset.aeDevice){device=b.dataset.aeDevice;render();}
  if(b.id==="ae-browser"){const s=snapshot();openAnnBrowserPreview({data:s.data,theme:s.theme,...s.route,bag,device,storeName:source.settings.brand_name||source.store.name});}
  if(b.id==="ae-save"){const pending=controller.save();syncActions();void pending.finally(syncActions);}
  if(b.id==="ae-publish"){void controller.publish();syncActions();}
  if(b.id==="ae-undo"){controller.undo();syncActions();}
});
document.addEventListener("input",()=>queueMicrotask(syncActions));
document.addEventListener("click",()=>queueMicrotask(syncActions));
document.addEventListener("change",()=>queueMicrotask(syncActions));
frame.addEventListener("load",()=>{
  const doc=frame.contentDocument;if(!doc)return;controller.bindPreview(doc);controller.refresh();
  if(addedSection){
    const section=doc.querySelector(`[data-section-type="${addedSection}"]`);
    section?.scrollIntoView({block:"start"});
    if(section?.dataset.designSection)controller.selectContent("section",section.dataset.designSection);
    addedSection=null;
  }else if(doc.scrollingElement)doc.scrollingElement.scrollTop=previewScroll;
  const s=snapshot(),go=r=>{page=r.page;productId=r.productId;collectionId=r.collectionId;policyKind=r.policyKind;render();};
  doc.addEventListener("submit",e=>e.preventDefault(),true);
  attachAuraSearch(doc,s.data);attachAuraCatalog(doc,s.data,s.route);
  attachStyleInteractions(doc,s.data,bag,page,productId,p=>go({...s.route,page:p}));
  doc.addEventListener("click",e=>{const a=e.target.closest?.("a[href]");if(!a)return;const route=browserPreviewLocation(a.getAttribute("href"),s.data,location.origin);e.preventDefault();if(route)go(route);});
});
window.addEventListener("beforeunload",e=>{if(controller.hasUnsavedChanges()){e.preventDefault();e.returnValue="";}});
new ResizeObserver(fit).observe(frame.parentElement);
render();