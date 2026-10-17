import {confirmCatalogueAction} from "./catalogue-confirm.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const kinds=new Set(["collections","products"]);

export function catalogueFormURL(root,kind,id="new",origin=location.origin,productContext={}){
  if(!kinds.has(kind)||!/^\/(?!\/)[A-Za-z0-9_/.-]+$/.test(root)||root.split("/").some(p=>p===".."||p==="."))throw Error("Invalid catalogue destination.");
  if(id!=="new"&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw Error("Invalid catalogue record.");
  const url=new URL(`${root.replace(/\/$/,"")}/${kind}/${id}`,origin);
  if(url.origin!==origin)throw Error("Invalid catalogue origin.");
  url.searchParams.set("ann_modal","1");
  if(kind==="products"&&id==="new"){
    for(const key of ["category_id","subcategory_id"]){
      const value=Number(productContext?.[key]);
      if(Number.isSafeInteger(value)&&value>0)url.searchParams.set(`ann_${key}`,String(value));
    }
  }
  return url;
}

export function isCatalogueMessage(event,frame,origin){
  return !!frame&&event.origin===origin&&event.source===frame.contentWindow
    &&event.data?.type==="lebrands:ann-catalogue"
    &&["ready","state","close","saved"].includes(event.data.action);
}

// Native dialog owns focus and makes the underlying Ann session inert.
// The frame runs the real dashboard form, controller and authenticated API.
export function attachAnnCatalogue({root,readOnly=false,getDraft,getProductContext=()=>({}),onSaved=()=>{},onError=()=>{}}){
  let dialog,frame,dirty=false,busy=false,loadingTimer,opener,kind,closePending=false;
  function remove(){
    clearTimeout(loadingTimer);dialog?.close();dialog?.remove();dialog=null;frame=null;
    dirty=false;busy=false;opener?.focus();opener=null;
  }
  async function close(){
    if(!dialog||closePending)return;
    if(busy){dialog.querySelector("[data-modal-status]").textContent="Finish the current action before closing this form.";return;}
    if(dirty){
      closePending=true;
      let discard;
      try{discard=await confirmCatalogueAction("Your unsaved changes in this form will be discarded. Your Ann conversation and saved store design will stay unchanged.",{title:"Discard unsaved changes?",confirmLabel:"Discard changes"});}
      finally{closePending=false;}
      if(!discard||!dialog)return;
      if(busy){dialog.querySelector("[data-modal-status]").textContent="Finish the current action before closing this form.";return;}
    }
    remove();
  }
  function open(nextKind,id="new"){
    if(readOnly||dialog)return false;
    const url=catalogueFormURL(root,nextKind,id,location.origin,getProductContext());
    kind=nextKind;opener=document.activeElement;dirty=false;busy=false;
    dialog=document.createElement("dialog");dialog.className="ann-catalogue-modal";
    const title=`${id==="new"?"Add":"Edit"} ${kind==="products"?"product":"collection"}`;
    dialog.setAttribute("aria-labelledby","ann-catalogue-title");
    dialog.innerHTML=`<header class="ann-catalogue-modal-head"><div><h2 id="ann-catalogue-title">${title}</h2><p>Saved to your store draft. Nothing is published.</p></div><button type="button" class="ann-btn alt" data-modal-close aria-label="Close ${title.toLowerCase()} form">Close</button></header><p data-modal-status role="status">Loading form...</p><iframe title="${title} form" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" hidden></iframe>`;
    frame=dialog.querySelector("iframe");
    frame.src=url.href;
    dialog.querySelector("[data-modal-close]").addEventListener("click",close);
    dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    document.body.append(dialog);dialog.showModal();
    loadingTimer=setTimeout(()=>{
      if(!dialog||!frame.hidden)return;
      const status=dialog.querySelector("[data-modal-status]");
      status.textContent="The form could not open. Close it and try again. You may need to sign in again.";
    },20000);
    return true;
  }
  window.addEventListener("message",async event=>{
    if(!isCatalogueMessage(event,frame,location.origin))return;
    const data=event.data;
    if(data.action==="ready"){
      clearTimeout(loadingTimer);frame.hidden=false;
      dialog.querySelector("[data-modal-status]").textContent="";
    }else if(data.action==="state"){dirty=data.dirty===true;busy=data.busy===true;}
    else if(data.action==="close")close();
    else if(data.action==="saved"){
      const savedKind=kind;remove();
      try{await onSaved(savedKind);}catch(error){onError(`Your ${savedKind==="products"?"product":"collection"} was saved, but Ann could not refresh. Reload Ann to see it. ${error.message||""}`);}
    }
  });
  window.addEventListener("beforeunload",event=>{if(dialog&&(dirty||busy)){event.preventDefault();event.returnValue="";}});
  function html(nextKind){
    if(!kinds.has(nextKind))return "";
    const records=(getDraft()?.[nextKind]||[]).filter(record=>record.status!=="archived"),single=nextKind==="products"?"product":"collection";
    return `<section class="ann-catalogue-tools" aria-label="Store ${nextKind}"><div class="ann-comp-row"><button type="button" class="ann-btn" data-ann-catalogue-open="${nextKind}"${readOnly?" disabled":""}>Add ${single}</button><span class="ann-note">${records.length} saved</span></div><p class="ann-note">Use the full form without leaving Ann. These are real draft records, separate from planning notes below.</p>${records.slice(0,6).map(record=>`<div class="ann-catalogue-record"><span data-ann-value>${esc(record.title||`Untitled ${single}`)}</span><button type="button" class="ann-link" data-ann-catalogue-open="${nextKind}" data-record-id="${esc(record.id)}" aria-label="Edit ${esc(record.title||single)}"${readOnly?" disabled":""}>Edit</button></div>`).join("")}${records.length>6?`<p class="ann-note">Showing 6 of ${records.length}. All are available in your dashboard.</p>`:""}</section>`;
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-ann-catalogue-open]");
    if(!button||button.disabled)return;
    event.preventDefault();
    try{open(button.dataset.annCatalogueOpen,button.dataset.recordId||"new");}catch(error){onError(error.message);}
  });
  return {open,html,isOpen:()=>!!dialog};
}

// Embed mode is opt-in and only works inside a same-origin Ann parent.
// Ordinary dashboard routes retain their normal layout and redirects.
export function attachCatalogueEmbed({root,storeRoot}){
  if(new URL(location.href).searchParams.get("ann_modal")!=="1"||window.parent===window)return null;
  try{if(window.parent.location.origin!==location.origin)return null;}catch{return null;}
  const form=root?.querySelector("[data-product-form],[data-collection-form]");
  if(!form)return null;
  document.documentElement.classList.add("ann-catalogue-embed");
  const style=document.createElement("style");
  style.textContent=`html.ann-catalogue-embed .lb-sidebar,html.ann-catalogue-embed .lb-header,html.ann-catalogue-embed .lb-help-popover{display:none!important}html.ann-catalogue-embed .lb-app,html.ann-catalogue-embed .lb-workspace{display:block!important;min-height:0!important;margin:0!important;width:100%!important}html.ann-catalogue-embed .lb-main{margin:0!important;padding:0!important}html.ann-catalogue-embed .lb-content{max-width:none!important;padding:20px!important}html.ann-catalogue-embed .lb-page-heading{margin-top:0}`;
  document.head.append(style);
  let dirty=false,saving=false;
  const send=(action,extra={})=>window.parent.postMessage({type:"lebrands:ann-catalogue",action,...extra},location.origin);
  const state=()=>send("state",{dirty,busy:saving||!!root.querySelector('[data-busy="true"],[data-upload-state="uploading"]')});
  const changed=event=>{
    if(event.target.matches('[name="stock_delta"],[name="stock_reason"]'))return;
    dirty=true;state();
  };
  form.addEventListener("input",changed);form.addEventListener("change",changed);
  form.addEventListener("lebrands:catalogue-change",changed);
  // Reference loading and status rendering are not merchant edits.
  // Media changes have no native input event; catalogue state emits its own.
  const observer=new MutationObserver(changes=>{
    if(changes.some(change=>change.type==="childList"&&form.contains(change.target)&&change.target.closest("[data-images],[data-cover-preview]"))){dirty=true;}
    state();
  });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["data-busy","data-upload-state"]});
  document.addEventListener("click",event=>{
    const link=event.target.closest("a[href]");
    if(!link)return;
    const url=new URL(link.href,location.href);
    if(url.origin===location.origin&&[`${storeRoot}/products`,`${storeRoot}/collections`].includes(url.pathname)){
      event.preventDefault();send("close");
    }else{
      event.preventDefault();
      if(window.confirm("Open this page in a new tab? Your form stays open in Ann."))window.open(url.href,"_blank","noopener");
    }
  },true);
  send("ready");state();
  return {
    hasUnsavedChanges:()=>dirty,
    saving(value){saving=value;state();},
    saved(){dirty=false;saving=false;send("saved");},
  };
}
