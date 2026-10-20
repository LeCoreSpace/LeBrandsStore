import {registerLeaveGuard} from "./catalogue-confirm.js";
import {attachAnnBusinessDocuments} from "./ann-business-documents-ui.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const labels={pending_review:"Pending review",changes_requested:"Changes requested",approved:"Approved"};
const when=value=>{
  const d=new Date(value);
  return value&&Number.isFinite(d.getTime())?d.toLocaleString():"Not recorded";
};

export function renderBusinessDocumentStatus(data,{api,storeRoot,annHref=`${storeRoot}/build/ann?business=1`}) {
  const v=data.verification;
  const country=(data.countries||[]).find(c=>c.code===(data.business_country||v?.country_code));
  const status=v?labels[v.status]||"Status unavailable":"Not submitted";
  const documents=(v?.documents||[]).map(d=>{
    // Only the authenticated, same-store API can serve private evidence.
    const href=String(d.download_url||"");
    const downloadable=d.scan_status==="clean"&&href.startsWith(`${api}/documents/`)&&
      /^[a-f0-9-]{36}$/i.test(href.slice(`${api}/documents/`.length));
    return `<li><strong>${esc(d.filename)}</strong> <small>${esc(when(d.uploaded_at))} · ${esc(d.scan_status==="clean"?"Security scan passed":"Security scan needs attention")}</small>${downloadable?` <a class="lb-inline-link" href="${esc(href)}" download>Download</a>`:""}</li>`;
  }).join("");
  return `<p><span class="abd-status" data-s="${esc(v?.status||"not_submitted")}">${esc(status)}</span></p>
    <dl class="lb-definition"><div><dt>Business country</dt><dd>${esc(country?.name||data.business_country||v?.country_code||"Confirm in Ann")}</dd></div>
    <div><dt>Legal business name</dt><dd>${esc(v?.legal_name||data.gst?.legal_name||"Not submitted")}</dd></div>
    ${v?`<div><dt>Last submitted</dt><dd>${esc(when(v.submitted_at))}</dd></div>`:""}</dl>
    ${v?.feedback?`<p class="abd-warn"><strong>Reviewer feedback:</strong> ${esc(v.feedback)}</p>`:""}
    <p>${v?.status==="approved"?"Your business evidence is approved and read only. This does not change your GST, invoice or payment status.":v?.status==="changes_requested"?"Review the feedback and submit a corrected document. A replacement returns to pending review; it does not automatically reinstate a suspended store.":v?.status==="pending_review"?`Your submission is waiting for manual review. ${data.business_access?.allowed===false?"Continue in Ann to complete any remaining setup requirements.":"You can continue building your draft or submit a corrected version."} Submission is not approval.`:"Submit your business registration evidence for manual review. Indian businesses must first verify GSTIN and confirm their registered address in Ann."}</p>
    ${documents?`<h3>Current submission</h3><ul class="abd-docs">${documents}</ul>`:""}
    <p class="lb-muted">Documents are private and retained during onboarding and your subscription, including earlier submissions. Only documents in the current submission are available here.</p>
    ${!data.retention?.configured?'<p class="abd-warn">Submissions are paused until the document retention policy is configured.</p>':!data.uploads_available?`<p class="abd-warn">${esc(data.upload_message||"Document uploads are unavailable right now.")}</p>`:""}
    <div class="lb-export-buttons"><button type="button" class="lb-button lb-button-outline" data-business-documents-open>${v?.status==="approved"?"View business documents":v?"Update submission":"Submit business documents"}</button>
    <button type="button" class="lb-text-button" data-business-documents-refresh>Refresh status</button>
    <a class="lb-inline-link" href="${esc(annHref)}">Continue in Ann</a></div>`;
}

export function mountSettingsBusinessDocuments({root,role,api,storeRoot}) {
  const panel=root?.querySelector("[data-business-documents-panel]");
  if(!panel||!["owner","admin"].includes(role))return;
  if(root.dataset.preview==="true"){
    panel.setAttribute("aria-busy","false");
    panel.innerHTML='<p>This read-only sample is not connected to private business records.</p>';
    return;
  }
  const endpoint=`${api}/business-verification`;
  const context={api:endpoint,storeRoot,...(root.dataset.annHref?{annHref:root.dataset.annHref}:{})};
  let busy=false,lastLoad=0,generation=0;
  const show=data=>{panel.innerHTML=renderBusinessDocumentStatus(data,context);};
  const modal=attachAnnBusinessDocuments({api:endpoint,onSubmitted:data=>{generation++;show(data);lastLoad=Date.now();}});
  async function refresh() {
    if(busy)return;
    const version=++generation;
    busy=true;panel.setAttribute("aria-busy","true");
    const button=panel.querySelector("[data-business-documents-refresh]");
    if(button)button.disabled=true;
    try {
      const res=await fetch(endpoint,{credentials:"same-origin",cache:"no-store",headers:{accept:"application/json"}});
      const body=await res.json();
      if(!res.ok||body.available!==true)throw new Error(body.error||"Business documents are unavailable.");
      if(version===generation){show(body);lastLoad=Date.now();}
    } catch(e) {
      // Preserve a previously loaded status, but never disguise a refresh failure.
      if(version!==generation)return;
      panel.querySelector("[data-business-documents-error]")?.remove();
      panel.insertAdjacentHTML("afterbegin",`<p role="alert" data-business-documents-error>${esc(e.message||"Could not load business documents.")} <button type="button" class="lb-text-button" data-business-documents-refresh>Try again</button></p>`);
      const loading=panel.querySelector("[data-business-documents-loading]");
      loading?.remove();
    } finally {
      busy=false;panel.setAttribute("aria-busy","false");
      const current=panel.querySelector("[data-business-documents-refresh]");
      if(current)current.disabled=false;
    }
  }
  panel.addEventListener("click",e=>{
    if(e.target.closest("[data-business-documents-open]"))modal.open();
    if(e.target.closest("[data-business-documents-refresh]"))void refresh();
  });
  // Other sessions/reviewers may change status. Never overwrite modal edits.
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&Date.now()-lastLoad>5000)void refresh();
  });
  registerLeaveGuard(()=>modal.hasUnsavedChanges());
  void refresh();
}
