// Existing editors keep owning their validation and saves. Only text entry moves
// into Ann's shared composer; selects, uploads and explicit consent remain local.
export function attachAnnReplyFields({root=document.body,onChange=()=>{}}={}){
  let active=null,signature="",queued=false;
  const fields=new Map(),answered=new Set();
  const selector='textarea,input:not([type]),input[type="text"],input[type="number"],input[type="email"],input[type="url"],input[type="tel"],input[type="search"]';
  function insideClosedDetails(n){
    for(let d=n.parentElement?.closest("details");d;d=d.parentElement?.closest("details"))if(!d.open)return true;
    return false;
  }
  function keyFor(n){
    const scope=n.closest('[id]:not(html):not(body)')?.id||"ann";
    return scope+"|"+n.getAttributeNames().filter(k=>k==="id"||k==="name"||(k.startsWith("data-")&&!k.startsWith("data-reply"))).sort().map(k=>k+"="+n.getAttribute(k)).join("|");
  }
  function describe(n){
    const label=n.closest("label")?.cloneNode(true);
    label?.querySelectorAll("input,textarea,button,select").forEach(x=>x.remove());
    const title=label?.textContent.trim()||n.getAttribute("aria-label")||n.placeholder||"Your answer";
    const product=n.closest("fieldset")?.querySelector("legend")?.textContent.trim();
    return product?`${product}: ${title}`:title;
  }
  function current(){
    const n=fields.get(active);
    return n?.isConnected?{key:active,label:n.dataset.replyLabel,value:n.value,
      max:Number(n.getAttribute("maxlength"))>0?Number(n.getAttribute("maxlength")):n.tagName==="TEXTAREA"?4000:2048,
      placeholder:n.placeholder||`Type ${n.dataset.replyLabel.toLowerCase()}`,
      disabled:n.disabled||n.matches(":disabled")||n.readOnly,
      area:n.tagName==="TEXTAREA",inputMode:n.inputMode}:null;
  }
  function refresh(){
    fields.clear();
    for(const n of root.querySelectorAll(selector)){
      if(n.closest("#ann-composer, .ann-ctx, .aw, #ann-design")||n.readOnly||n.type==="password"||insideClosedDetails(n))continue;
      const key=keyFor(n);
      fields.set(key,n);
      if(!n.dataset.replyLabel)n.dataset.replyLabel=describe(n);
      n.hidden=true;n.tabIndex=-1;n.setAttribute("aria-hidden","true");
      let button=n.nextElementSibling;
      if(!button?.hasAttribute("data-ann-reply-field")){
        button=document.createElement("button");button.type="button";button.className="ann-reply-field";
        button.setAttribute("data-ann-reply-field",key);n.after(button);
      }
      const text=n.value?`${n.value} · Change in chat`:"Answer in the chat below";
      if(button.textContent!==text)button.textContent=text;
      const disabled=n.disabled||n.matches(":disabled");
      if(button.disabled!==disabled)button.disabled=disabled;
      button.setAttribute("aria-label",`Reply to ${n.dataset.replyLabel} in the chat box`);
    }
    if(!fields.has(active)||current()?.disabled)active=[...fields].find(([k,n])=>!answered.has(k)&&!n.disabled&&!n.matches(":disabled")&&n.closest("#ann-log"))?.[0]||null;
    const c=current(),next=JSON.stringify(c);
    if(next!==signature){signature=next;onChange(c);}
  }
  const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
  root.addEventListener("click",e=>{
    const button=e.target.closest("[data-ann-reply-field]");
    if(!button||button.disabled)return;
    e.preventDefault();active=button.getAttribute("data-ann-reply-field");signature="";refresh();
    document.getElementById("ann-input")?.focus();
  });
  const observer=new MutationObserver(schedule);
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["disabled","readonly","value","open"]});
  schedule();
  return {current,refresh,
    submit(value){
      const key=active,n=fields.get(key);
      if(!n?.isConnected||current()?.disabled)throw Error("Choose a question above before replying.");
      const before=n.value;n.value=value;
      if(!n.checkValidity()){const message=n.validationMessage;n.value=before;throw Error(message||"Check this answer and try again.");}
      n.dispatchEvent(new Event("input",{bubbles:true}));
      refresh();
      const target=fields.get(key);
      if(target?.isConnected)target.dispatchEvent(new Event("change",{bubbles:true}));
      answered.add(key);active=null;refresh();
    },
    hasUnsavedChanges:()=>false,
    disconnect:()=>observer.disconnect()};
}
