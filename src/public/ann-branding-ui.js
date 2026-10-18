import { safeImage } from "./aura-sections.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function attachAnnBranding({api,readOnly,initial={},inConversationStep=()=>true,onPreview,onSaved,onContinue}) {
  let data=null,loading=false,busy=false,error="",note="",attempted=false;
  let savedId=initial.logo_media_id || "",selected=savedId;
  const known=new Map(savedId?[[savedId,{id:savedId,url:initial.logo_url,label:"Current brand logo"}]]:[]);
  const slot=()=>document.querySelector("#ann-branding-slot");
  const dirty=()=>selected!==savedId;
  const logo=()=>selected?(known.get(selected)||{id:selected,url:""}):{id:"",url:""};
  const disabled=()=>readOnly||loading||busy;
  async function request(method,body) {
    const res=await fetch(`${api}/readiness`,{method,credentials:"same-origin",cache:"no-store",
      ...(body?{headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{})});
    const result=await res.json();
    if(!res.ok)throw new Error(result.error || "Your logo was not saved. Please refresh the logo list and try again.");
    return result;
  }
  function receive(result,keep=false) {
    data=result;
    for(const item of result.logo_media || [])known.set(item.id,item);
    savedId=result.settings?.logo_media_id || "";
    if(!keep)selected=savedId;
  }
  function html() {
    const image=safeImage(logo().url);
    return `<p class="ann-note">Choose an uploaded logo or add PNG, JPG or WebP, up to 5 MB. Transparent PNG or WebP works well.</p>
      ${image?`<img class="ann-branding-image" src="${esc(image)}" alt="Your selected brand logo">`:""}
      <label class="ann-field">Your logo<select data-brand-select${disabled()?" disabled":""}>
        <option value="" data-ann-copy>Use my brand name instead</option>${[...known.values()].map(m=>`<option value="${esc(m.id)}"${m.id===selected?" selected":""}>${esc(m.label || "Brand logo")}</option>`).join("")}</select></label>
      <label class="ann-field">Upload a logo<input type="file" data-brand-file accept="image/png,image/jpeg,image/webp"${disabled()?" disabled":""}></label>
      ${loading||busy?`<p class="ann-note" role="status">${loading?"Loading your logos":"Saving your logo"}...</p>`:""}
      ${error?`<p class="ann-error" role="alert">${esc(error)}</p>`:""}
      ${note?`<p class="ann-note" role="status">${esc(note)}</p>`:""}
      <div class="ann-actions"><button type="button" class="ann-btn" data-brand="continue"${loading||busy?" disabled":""}>${dirty()?(inConversationStep()?"Save logo and continue":"Save logo"):inConversationStep()?(selected?"Keep logo and continue":"Continue with brand name"):"Keep current branding"}</button>
      <button type="button" class="ann-btn alt" data-brand="refresh"${loading||busy?" disabled":""}>Refresh logo list</button>
      <button type="button" class="ann-link" data-brand="skip"${busy?" disabled":""}>Skip for now</button></div>
      <p class="ann-note">This changes your draft branding only. Your live store is unchanged. The same image is used for the browser tab icon.</p>`;
  }
  const draw=()=>{const n=slot();if(n)n.innerHTML=html();};
  async function load(keep=false) {
    if(loading)return;
    loading=true;attempted=true;error="";draw();
    try{receive(await request("GET"),keep);}
    catch(e){error=e.message;}
    finally{loading=false;draw();}
  }
  async function upload(file) {
    if(disabled()||!file)return;
    if(file.size>5*1024*1024 || (file.type&&!["image/png","image/jpeg","image/webp"].includes(file.type))) {
      error="Choose a PNG, JPG or WebP logo up to 5 MB.";draw();return;
    }
    busy=true;error="";draw();
    try {
      const form=new FormData();form.append("file",file);form.append("type","logo");form.append("alt",`Brand logo: ${file.name}`.slice(0,200));
      const res=await fetch(`${api}/media`,{method:"POST",credentials:"same-origin",body:form});
      const result=await res.json();
      if(!res.ok||!result.media?.id)throw new Error(result.error || "The upload did not finish. Please try again.");
      const m=result.media;known.set(m.id,{id:m.id,url:m.url,label:file.name});selected=m.id;
      // Uploads may change the shared draft fingerprint. Read it again before saving.
      receive(await request("GET"),true);
      note="Your logo is uploaded. Preview it now, then save it when you continue.";
      onPreview?.(logo());
    }catch(e){error=e.message;}
    finally{busy=false;draw();}
  }
  async function proceed() {
    if(loading||busy)return;
    if(readOnly||!dirty()){onContinue?.();return;}
    if(!data){error="Refresh the logo list before saving.";draw();return;}
    busy=true;error="";draw();
    try {
      const result=await request("PATCH",{action:"business",confirm:true,expected_draft:data.expected_draft,
        settings:{logo_media_id:selected || null}});
      receive(result);note="Your brand logo is saved to the draft.";
      onPreview?.(logo());onSaved?.(result);onContinue?.();
    }catch(e){error=e.message;}
    finally{busy=false;draw();}
  }
  document.addEventListener("change",e=>{
    if(!slot()?.contains(e.target)||disabled())return;
    if(e.target.hasAttribute("data-brand-file"))void upload(e.target.files?.[0]);
    else if(e.target.hasAttribute("data-brand-select")) {
      const id=e.target.value;if(id&&!known.has(id))return;
      selected=id;error="";note=dirty()?"Preview updated. Save your logo when you continue.":"Your saved branding is selected.";
      onPreview?.(logo());draw();
    }
  });
  document.addEventListener("click",e=>{
    const b=e.target.closest("button[data-brand]");if(!b||!slot()?.contains(b)||b.disabled)return;
    e.preventDefault();
    if(b.dataset.brand==="refresh"&&!busy)void load(true);
    else if(b.dataset.brand==="continue")void proceed();
    else if(b.dataset.brand==="skip"&&!busy){selected=savedId;onPreview?.(logo());onContinue?.();}
  });
  return {html,mount(){if(slot()&&!attempted)void load();},
    reply:()=>selected?(dirty()?"Logo chosen, not saved":"Brand logo selected"):"",
    hasUnsavedChanges:()=>busy||dirty()};
}
