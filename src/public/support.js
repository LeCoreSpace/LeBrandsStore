import {registerLeaveGuard,confirmCatalogueAction} from "./catalogue-confirm.js";

const boot=(()=>{try{return JSON.parse(document.getElementById("support-data")?.textContent||"{}");}catch{return {};}})();
const root=document.querySelector("[data-support-root]");
const STATUS={created:"Created",pending:"Pending",closed:"Closed"};
const PRIORITY={low:"Low",normal:"Normal",high:"High",urgent:"Urgent"};
const WAIT_B={brand:"Waiting on you",support:"Waiting on support"},WAIT_A={brand:"Waiting on brand",support:"Waiting on support"};
const SOURCES={account:"Account",onboarding:"Store setup",dashboard:"Dashboard",ann:"Ann",theme_editor:"Theme editor"};
const NOTE_TYPE={ticket_created:"Ticket created email",ticket_closed:"Ticket closed email",ticket_reply:"Reply email"};
const EVENTS={created:"Ticket created",assigned:"Assignment changed",priority_changed:"Priority changed",message_added:"Message added",participant_changed:"Participants changed",attachment_added:"Attachment added",redacted:"Message redacted"};
const key=()=>crypto.randomUUID();
const when=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST":"Not recorded";};
const ticketNo=n=>{const s=String(n??"").replace(/\D/g,"");return s?`SUP-${s.padStart(6,"0")}`:"Ticket";};
function h(tag,attrs={},...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v===false||v==null)continue;if(k==="text")e.textContent=v;else e.setAttribute(k,v===true?"":v);}for(const kid of kids.flat())if(kid!=null)e.append(kid);return e;}
const timeEl=v=>h("time",{datetime:v||"",text:when(v)});
const chip=s=>h("span",{class:"sp-status","data-status":STATUS[s]?s:"unknown",text:STATUS[s]||"Unknown status"});
let busy=0,lastInput=Date.now(),toastTimer;
function toast(msg){const t=root?.querySelector("[data-toast]");if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},4500);}
const dirtyForms=new Set();
registerLeaveGuard(()=>busy>0||dirtyForms.size>0);
document.addEventListener("input",e=>{lastInput=Date.now();const f=e.target.closest?.("form[data-new-form],form[data-reply-form],form[data-workflow-form]");if(f)dirtyForms.add(f);});
function liveBox(){return root.querySelector("[data-live]");}
function showAlert(msg){const box=liveBox();if(!box)return;box.replaceChildren(msg?h("div",{class:"sp-alert",role:"alert",text:msg}):"");}
async function api(path,opts={}){
  let res;
  try{res=await fetch(path,{credentials:"include",headers:{accept:"application/json",...(opts.body?{"content-type":"application/json"}:{})},...opts});}
  catch{throw {message:"We could not reach the server. Your text is kept; try again."};}
  let json=null;try{json=await res.json();}catch{}
  if(!res.ok)throw {message:json?.error||"Something went wrong. Please try again.",errors:json?.errors,status:res.status};
  return json?.data;
}
function clearErrors(form){form.querySelectorAll("[data-error]").forEach(e=>{e.hidden=true;e.textContent="";});form.querySelectorAll("[aria-invalid]").forEach(e=>e.removeAttribute("aria-invalid"));}
function setError(form,name,msg){
  const el=form.querySelector(`[data-error="${name}"]`),input=form.elements[name];
  if(input?.setAttribute)input.setAttribute("aria-invalid","true");
  if(el){el.textContent=msg;el.hidden=false;return true;}return false;
}
function applyErrors(form,err,fallback="workflow"){
  let shown=false;
  for(const[k,v]of Object.entries(err.errors||{}))shown=setError(form,k,String(v))||shown;
  if(!shown&&!setError(form,fallback,err.message))showAlert(err.message);
  else if(!err.errors)showAlert("");
  form.querySelector("[aria-invalid]")?.focus();
}
function lock(form,on){busy+=on?1:-1;form.querySelectorAll("[data-submit]").forEach(b=>{b.disabled=on;});form.setAttribute("aria-busy",on?"true":"false");}

// ---- safe context
const safeVal=v=>typeof v==="string"&&/^[A-Za-z0-9_\-\/.]{1,120}$/.test(v)&&!v.includes("..");
function safeContext(){
  const out={};
  for(const k of ["pathname","theme_key","page_slug","section_id","provider"]){const v=boot.context?.[k];if(safeVal(v))out[k]=v;}
  if(!out.pathname){try{const u=new URL(document.referrer);if(u.origin===location.origin&&safeVal(u.pathname)&&!u.pathname.startsWith("/support"))out.pathname=u.pathname;}catch{}}
  return out;
}

// ---- new ticket
const newForm=root?.querySelector("[data-new-form]");
if(newForm){
  const ctx=safeContext(),dl=root.querySelector("[data-context-list]");
  const entries=[["Opened from",SOURCES[boot.source]||"Account"],...Object.entries(ctx).map(([k,v])=>[({pathname:"Page path",theme_key:"Theme",page_slug:"Page",section_id:"Section",provider:"Provider"})[k],v])];
  dl.replaceChildren(...entries.flatMap(([k,v])=>[h("dt",{text:k}),h("dd",{text:v})]));
  let opKey=null,opPayload="";
  newForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(newForm.getAttribute("aria-busy")==="true")return;
    clearErrors(newForm);showAlert("");
    const f=newForm.elements;
    const payload={subject:f.subject.value.trim(),body:f.body.value.trim(),category_code:f.category_code.value,store_id:f.store_id.value||null,source:boot.source||"account",context:ctx};
    let bad=false;
    if(!payload.category_code){setError(newForm,"category_code","Choose a topic.");bad=true;}
    if(payload.subject.length<5){setError(newForm,"subject","Enter a subject of at least 5 characters.");bad=true;}
    if(!payload.body){setError(newForm,"body","Describe what you need help with.");bad=true;}
    if(bad){newForm.querySelector("[aria-invalid]")?.focus();return;}
    const sig=JSON.stringify(payload);
    if(sig!==opPayload){opPayload=sig;opKey=key();}
    lock(newForm,true);
    let createdId=null;
    try{
      const data=await api(boot.apiRoot,{method:"POST",body:JSON.stringify({...payload,idempotency_key:opKey})});
      dirtyForms.delete(newForm);
      createdId=data.id;
    }catch(err){applyErrors(newForm,err,"subject");}
    finally{lock(newForm,false);}
    // The in-app navigation guard must see a completed request, not busy=true.
    if(createdId)location.assign(`${boot.base}/${encodeURIComponent(createdId)}`);
  });
}

// ---- detail
const state={ticket:boot.ticket||null,flowRev:boot.ticket?.revision};
const replyForm=root?.querySelector("[data-reply-form]"),flowForm=root?.querySelector("[data-workflow-form]");
function renderTicket(t){
  state.ticket=t;
  const admin=boot.admin===true;
  const thread=root.querySelector("[data-thread]");
  if(thread){
    thread.replaceChildren(...(t.messages||[]).map(m=>{
      const internal=m.visibility==="internal",mine=admin?m.author_role==="platform_admin":m.author_role==="brand";
      return h("li",{class:"sp-msg","data-role":m.author_role,"data-visibility":m.visibility,...(mine?{"data-mine":true}:{})},
        h("div",{class:"sp-msg-head"},h("strong",{text:m.author_name||"Unknown"}),h("span",{class:"sp-badge",text:m.author_role==="platform_admin"?"LeBrands support":"Brand"}),internal?h("span",{class:"sp-badge sp-internal",text:"Internal note, not sent to the brand"}):null,timeEl(m.created_at)),
        h("p",{class:"sp-body",text:m.body}));
    }));
  }
  const subj=root.querySelector("[data-subject]");if(subj)subj.textContent=t.subject;
  root.querySelector("[data-status-chip]")?.replaceChildren(chip(t.status));
  const assignee=(boot.admins||[]).find(a=>a.user_id===t.assigned_admin_user_id);
  const wait=t.status==="pending"&&t.waiting_on?(admin?WAIT_A:WAIT_B)[t.waiting_on]:"";
  const row=(k,v)=>h("div",{},h("dt",{text:k}),h("dd",{},v));
  const meta=root.querySelector("[data-meta]");
  if(meta)meta.replaceChildren(...[row("Status",chip(t.status)),wait?row("Waiting",wait):null,...(admin?[row("Priority",PRIORITY[t.priority]||t.priority||""),row("Brand",t.requester_name||""),row("Assigned",assignee?.name||(t.assigned_admin_user_id?"Another admin":"Unassigned"))]:[]),row("Store",t.store_name||"Account only"),row("Opened from",SOURCES[t.source]||"Account"),row("Created",timeEl(t.created_at)),row("Last activity",timeEl(t.last_activity_at))].filter(Boolean));
  const ev=root.querySelector("[data-events]");
  if(ev)ev.replaceChildren(...((t.events||[]).length?t.events.map(e=>h("li",{},h("span",{text:e.event_type==="status_changed"?`Status changed${e.old_status?` from ${STATUS[e.old_status]||e.old_status}`:""} to ${STATUS[e.new_status]||e.new_status||"unknown"}`:EVENTS[e.event_type]||String(e.event_type||"Event").replace(/_/g," ")}),timeEl(e.created_at))):[h("li",{class:"sp-sub",text:"No activity recorded."})]));
  const nt=root.querySelector("[data-notes]");
  if(nt)nt.replaceChildren(...((t.notifications||[]).length?t.notifications.map(n=>{const d=n.delivery_status;const st=d?String(d).replace(/_/g," "):n.state==="enqueued"?"queued with the email service":n.state==="cancelled"?"cancelled":"queued, not yet handed over";return h("li",{},h("span",{text:`${NOTE_TYPE[n.notification_type]||"Email"} for ${n.audience==="admin"?"support":"the brand"}: ${st}`}),timeEl(n.created_at));}):[h("li",{class:"sp-sub",text:"No email activity recorded yet."})]));
  if(flowForm&&!dirtyForms.has(flowForm)){rebuildFlow(t);state.flowRev=t.revision;}
}
function rebuildFlow(t){
  if(!flowForm)return;
  const f=flowForm.elements;
  if(boot.admin){
    if(f.assigned_admin_user_id)f.assigned_admin_user_id.value=t.assigned_admin_user_id||"";
    if(f.priority)f.priority.value=t.priority||"normal";
    if(f.waiting_on)f.waiting_on.value=t.waiting_on||"";
    if(f.status){[...f.status.options].forEach(o=>{if(o.value&&o.value===t.status)o.remove();});
      for(const s of ["pending","closed"])if(s!==t.status&&![...f.status.options].some(o=>o.value===s))f.status.append(h("option",{value:s,text:STATUS[s]}));
      f.status.options[0].textContent=`Keep ${STATUS[t.status]||"current"}`;}
  }else{
    const closed=t.status==="closed";
    flowForm.replaceChildren(
      h("h2",{text:closed?"This ticket is closed":"Is this resolved?"}),
      closed?h("p",{class:"sp-sub",text:"Need more help? Reopen it and we will pick it up again."}):h("label",{class:"sp-field"},h("span",{text:"Resolution note"}),h("textarea",{name:"resolution",rows:"4",maxlength:"20000",required:true,placeholder:"What fixed it?"})),
      h("input",{type:"hidden",name:"status",value:closed?"pending":"closed"}),
      h("button",{class:closed?"sp-btn sp-primary":"sp-btn",type:"submit","data-submit":true,text:closed?"Reopen ticket":"Close ticket"}),
      h("small",{class:"sp-err","data-error":"workflow",hidden:true}));
  }
}
function toggleResolution(){
  const sel=flowForm?.elements.status,field=flowForm?.querySelector("[data-resolution-field]");
  if(sel&&field)field.hidden=sel.value!=="closed"&&!flowForm.elements.resolution?.value.trim();
}
flowForm?.addEventListener("change",toggleResolution);flowForm?.addEventListener("input",toggleResolution);
function conflict(){
  const c=root.querySelector("[data-conflict]");if(!c)return;
  const btn=h("button",{type:"button",class:"sp-btn",text:"Load latest"});
  btn.addEventListener("click",async()=>{
    try{const t=await api(`${boot.apiRoot}/${encodeURIComponent(state.ticket.id)}`);
      renderTicket({...t});state.flowRev=t.revision;flowForm&&dirtyForms.add(flowForm);c.replaceChildren(h("div",{class:"sp-notice",role:"status",text:"Latest version loaded. Your unsaved changes are still in the form; review them and save again."}));}
    catch(e){toast(e.message);}
  });
  c.replaceChildren(h("div",{class:"sp-alert sp-conflict",role:"alert"},h("span",{text:"This ticket changed while you were editing. Your changes were not saved."}),btn));
}
if(replyForm){
  let opKey=null,opSig="";
  replyForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(replyForm.getAttribute("aria-busy")==="true")return;
    clearErrors(replyForm);
    const body=replyForm.elements.body.value.trim(),visibility=replyForm.elements.visibility.value||"public";
    if(!body){setError(replyForm,"body","Write a message first.");replyForm.elements.body.focus();return;}
    const sig=body+"\u0000"+visibility;if(sig!==opSig){opSig=sig;opKey=key();}
    lock(replyForm,true);
    try{
      const t=await api(`${boot.apiRoot}/${encodeURIComponent(state.ticket.id)}/messages`,{method:"POST",body:JSON.stringify({body,visibility,idempotency_key:opKey})});
      replyForm.elements.body.value="";dirtyForms.delete(replyForm);opSig="";opKey=null;
      renderTicket(t);toast(visibility==="internal"?"Internal note added.":"Message sent.");
    }catch(err){applyErrors(replyForm,err,"body");}finally{lock(replyForm,false);}
  });
}
if(flowForm){
  flowForm.addEventListener("submit",async e=>{
    e.preventDefault();
    if(flowForm.getAttribute("aria-busy")==="true")return;
    clearErrors(flowForm);
    const t=state.ticket,f=flowForm.elements,payload={revision:String(state.flowRev)};
    const status=f.status?.value;
    if(boot.admin){
      const a=f.assigned_admin_user_id.value||null;if(a!==(t.assigned_admin_user_id||null))payload.assigned_admin_user_id=a;
      if(f.priority.value!==t.priority)payload.priority=f.priority.value;
      const w=f.waiting_on.value||null;if(w!==(t.waiting_on||null))payload.waiting_on=w;
    }
    if(status)payload.status=status;
    const res=f.resolution?.value.trim();
    if(status==="closed"&&t.status!=="closed"){
      if(!res){setError(flowForm,"workflow","A public resolution is required to close a ticket.");f.resolution.focus();return;}
      payload.resolution=res;
      if(!await confirmCatalogueAction("Closing sends your resolution to the brand. The ticket can be reopened later.",{title:"Close this ticket?",confirmLabel:"Close ticket",cancelLabel:"Keep open"}))return;
    }
    if(Object.keys(payload).length===1){setError(flowForm,"workflow","Nothing has changed.");return;}
    lock(flowForm,true);
    try{
      const nt=await api(`${boot.apiRoot}/${encodeURIComponent(t.id)}/workflow`,{method:"POST",body:JSON.stringify(payload)});
      root.querySelector("[data-conflict]")?.replaceChildren();const closing=payload.status==="closed";if(f.resolution&&closing)f.resolution.value="";if(!f.resolution?.value.trim())dirtyForms.delete(flowForm);if(f.status)f.status.value="";toggleResolution();
      renderTicket(nt);state.flowRev=nt.revision;toast(status==="closed"?"Ticket closed.":status==="pending"&&!boot.admin?"Ticket reopened.":"Ticket updated.");
    }catch(err){
      if(err.status===409)conflict();else applyErrors(flowForm,err);
    }finally{lock(flowForm,false);}
  });
}

// ---- idle refetch, never touches form drafts
async function refresh(){
  if(document.hidden||busy>0||Date.now()-lastInput<20000)return;
  try{
    if(boot.view==="detail"&&state.ticket){
      const t=await api(`${boot.apiRoot}/${encodeURIComponent(state.ticket.id)}`);
      const old=state.ticket;
      if(String(t.revision)!==String(old.revision)||t.last_activity_at!==old.last_activity_at||(t.messages||[]).length!==(old.messages||[]).length||JSON.stringify(t.notifications)!==JSON.stringify(old.notifications))renderTicket(t);
    }else if(boot.view==="list"){
      const body=root.querySelector("[data-ticket-body]");if(!body)return;
      const q=new URLSearchParams(location.search);
      const data=await api(`${boot.apiRoot}?${q}`);
      const rows=data?.tickets||[];
      body.replaceChildren(...rows.map(t=>{
        const link=h("a",{class:"sp-ticket-link",href:`${boot.base}/${encodeURIComponent(t.id)}`},h("span",{class:"sp-no",text:ticketNo(t.ticket_number)}),h("span",{class:"sp-subject",text:t.subject}));
        return h("tr",{"data-ticket-row":true,"data-ticket-id":t.id},h("th",{scope:"row"},link),h("td",{"data-l":"Status"},chip(t.status)),
          ...(boot.admin?[h("td",{"data-l":"Priority"},h("span",{class:"sp-pri","data-priority":t.priority,text:PRIORITY[t.priority]||t.priority||""})),h("td",{"data-l":"Brand",text:t.requester_name||""})]:[]),
          h("td",{"data-l":"Store",text:t.store_name||"Account only"}),h("td",{"data-l":"Last activity"},timeEl(t.last_activity_at)));
      }));
    }
  }catch{/* silent: next tick retries */}
}
if(["detail","list"].includes(boot.view))setInterval(refresh,45000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
