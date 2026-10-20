// Shared, accessible confirmations for catalogue actions in Ann and the dashboard.
let sequence=0;
export function confirmCatalogueAction(message,{title="Confirm changes",confirmLabel="Continue",cancelLabel="Keep editing",input=null}={}){
  const doc=document,previous=doc.activeElement,id=`catalogue-confirm-${++sequence}`;
  if(!doc.querySelector("[data-catalogue-confirm-style]")){
    const style=doc.createElement("style");
    style.setAttribute("data-catalogue-confirm-style","");
    style.textContent=`.lb-catalogue-confirm{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:26px;border:1px solid #ded7da;border-radius:16px;background:#fff;color:#30242b;box-shadow:0 24px 80px #20161e40;font:14px/1.6 system-ui,sans-serif}.lb-catalogue-confirm::backdrop{background:#20161e80;backdrop-filter:blur(2px)}.lb-catalogue-confirm h2{margin:0 0 10px;font:600 21px/1.3 system-ui,sans-serif}.lb-catalogue-confirm p{margin:0;color:#6e6268;white-space:pre-line}.lb-catalogue-confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:24px}.lb-catalogue-confirm button{padding:10px 16px;border:1px solid #d8cbd1;border-radius:8px;background:#fff;color:#4c2636;font:600 14px system-ui,sans-serif;cursor:pointer}.lb-catalogue-confirm button[data-confirm-accept]{background:#711b3b;border-color:#711b3b;color:#fff}.lb-catalogue-confirm button:focus-visible{outline:3px solid #c99cac;outline-offset:3px}`;
    style.textContent+=`.lb-catalogue-confirm{border-top:3px solid #711b3b;border-radius:8px}.lb-catalogue-confirm h2{padding-bottom:14px;border-bottom:1px dashed #d8cbd1}.lb-catalogue-confirm label{display:block;margin-top:18px;font-weight:600}.lb-catalogue-confirm input{box-sizing:border-box;display:block;width:100%;min-width:0;margin-top:7px;padding:11px;border:1px solid #d8cbd1;border-radius:5px;font:inherit}.lb-catalogue-confirm [role=alert]{display:block;margin-top:7px;color:#9c2538}`;
    doc.head.append(style);
  }
  return new Promise(resolve=>{
    const dialog=doc.createElement("dialog");
    dialog.className="lb-catalogue-confirm";
    dialog.setAttribute("aria-labelledby",`${id}-title`);
    dialog.setAttribute("aria-describedby",`${id}-message`);
    dialog.innerHTML=`<h2 id="${id}-title"></h2><p id="${id}-message"></p><div class="lb-catalogue-confirm-actions"><button type="button" data-confirm-cancel autofocus></button><button type="button" data-confirm-accept></button></div>`;
    dialog.querySelector("h2").textContent=title;
    dialog.querySelector("p").textContent=message;
    dialog.querySelector("[data-confirm-cancel]").textContent=cancelLabel;
    dialog.querySelector("[data-confirm-accept]").textContent=confirmLabel;
    let field,error;
    if(input){
      const label=doc.createElement("label");label.textContent=input.label||"Value";
      field=doc.createElement("input");field.type=input.type||"text";field.value=input.value||"";
      field.required=true;field.step="1";field.id=`${id}-input`;
      error=doc.createElement("span");error.id=`${id}-error`;error.setAttribute("role","alert");
      field.setAttribute("aria-describedby",error.id);label.append(field,error);
      dialog.querySelector(".lb-catalogue-confirm-actions").before(label);
    }
    let settled=false;
    const finish=result=>{
      if(settled)return;
      settled=true;dialog.close();dialog.remove();
      if(previous?.isConnected)previous.focus();
      resolve(result);
    };
    const cancel=()=>finish(input?null:false);
    const accept=()=>{
      if(field&&(!field.value.trim()||!field.checkValidity())){
        error.textContent="Enter a valid value to continue.";field.setAttribute("aria-invalid","true");field.focus();return;
      }
      finish(field?field.value:true);
    };
    dialog.querySelector("[data-confirm-cancel]").addEventListener("click",cancel);
    dialog.querySelector("[data-confirm-accept]").addEventListener("click",accept);
    field?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();accept();}});
    dialog.addEventListener("cancel",event=>{event.preventDefault();cancel();});
    dialog.addEventListener("close",cancel);
    doc.body.append(dialog);dialog.showModal();field?.focus();
  });
}

export function promptCatalogueValue(message,{title="Enter details",label="Value",value="",type="text",confirmLabel="Continue"}={}){
  return confirmCatalogueAction(message,{title,confirmLabel,cancelLabel:"Cancel",input:{label,value,type}});
}

// Never register a blocking unload handler. Browser-owned tab closing cannot
// display an application dialog; these guards protect actual app navigation.
export function registerLeaveGuard(check){
  const key=Symbol.for("lebrands.application.navigation-guards");
  const state=window[key]||=( {guards:new Set(),listening:false,pending:false,approved:false} );
  const leaveGuards=state.guards;
  leaveGuards.add(check);
  if(!state.listening){
    state.listening=true;
    const dirty=()=>[...leaveGuards].some(fn=>{try{return !!fn();}catch{return true;}});
    const leave=async run=>{
      if(state.pending)return;
      state.pending=true;
      try{
        if(await confirmCatalogueAction("You have unsaved changes or an action is still running. Stay here to save or finish your work. Leaving may lose unsaved changes.",{
          title:"Leave this page?",confirmLabel:"Leave without saving",cancelLabel:"Keep editing"
        })){
          state.approved=true;
          try{run();}catch{state.approved=false;}finally{setTimeout(()=>{state.approved=false;},0);}
        }
      }finally{state.pending=false;}
    };
    window.addEventListener("click",event=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||state.approved||!dirty())return;
      const link=event.target.closest?.("a[href]");
      if(!link||link.hasAttribute("download")||link.getAttribute("href").startsWith("#"))return;
      const target=link.getAttribute("target")||document.querySelector("base[target]")?.getAttribute("target");
      if(target&&target.toLowerCase()!=="_self")return;
      const url=new URL(link.href,location.href);
      if(!["http:","https:"].includes(url.protocol))return;
      event.preventDefault();void leave(()=>location.assign(url.href));
    });
    window.addEventListener("submit",event=>{
      if(event.defaultPrevented||state.approved||!dirty())return;
      const form=event.target,button=event.submitter;
      const target=button?.getAttribute("formtarget")||form.getAttribute("target");
      const method=button?.getAttribute("formmethod")||form.getAttribute("method")||"get";
      if(target&&target.toLowerCase()!=="_self"||method.toLowerCase()==="dialog")return;
      event.preventDefault();
      void leave(()=>form.requestSubmit(button||undefined));
    });
    // Chromium can also cancel some programmatic/back/reload navigations.
    // Other browsers still get the link/form protection above.
    window.navigation?.addEventListener("navigate",event=>{
      if(state.approved||event.defaultPrevented||!event.cancelable||event.hashChange||event.downloadRequest||event.destination.sameDocument||!dirty())return;
      event.preventDefault();
      void leave(()=>{
        if(event.navigationType==="traverse")window.navigation.traverseTo(event.destination.key);
        else if(event.navigationType==="reload")location.reload();
        else if(event.navigationType==="replace")location.replace(event.destination.url);
        else location.assign(event.destination.url);
      });
    });
    window.addEventListener("pageshow",()=>{state.approved=false;state.pending=false;});
  }
  return()=>leaveGuards.delete(check);
}
