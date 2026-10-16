import {gstinError,INDIAN_STATES} from "/assets/commerce-rules.js";
const find=(root,key)=>root.querySelector(`[name="${key}"],[data-setting="${key}"]`);
const supplierKeys=["legal_name","trade_name","address","business_line1","business_line2","business_city","business_pincode","business_state"];
export function observeGSTINForms(root,storeId,options={}){
 if(!root||!storeId||options.readOnly)return;
 const install=()=>{
  const input=find(root,"gstin"),stateInput=find(root,"business_state");
  if(!input||!stateInput||input.dataset.gstinMounted)return;
  input.dataset.gstinMounted="true";
  const pane=document.createElement("section");pane.className="gstin-verification";pane.setAttribute("aria-label","GSTIN verification");
  // No flash of stage-2 controls, including while capability detection runs.
  // The existing manual GSTIN field remains required by the stage-1 rules.
  pane.hidden=true;pane.style.display="none";
  const status=document.createElement("p");status.setAttribute("role","status");
  const action=document.createElement("button");action.type="button";action.textContent="Verify GSTIN";
  const choices=document.createElement("div");pane.append(status,action,choices);input.closest("label,.field,.form-field,.lb-field")?.after(pane);
  if(!pane.isConnected)input.parentElement.after(pane);
  let enabled=false,busy=false,typingTimer,retryTimer,registration;
  const api=async(action,body)=>{
   const response=await fetch(`/api/stores/${storeId}/gstin/${action}`,{method:body?"POST":"GET",credentials:"same-origin",
    headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
   const data=await response.json();
   if(!response.ok)throw Object.assign(new Error(data.error||"Verification could not complete."),{retry_after:data.retry_after});
   return data;
  };
  const readonly=value=>{for(const key of supplierKeys){const field=find(root,key);if(!field)continue;
   if(field.tagName==="SELECT"){field.setAttribute("aria-disabled",String(value));field.dataset.gstinLocked=String(value);}
   else field.readOnly=value;
  }};
  stateInput.addEventListener("pointerdown",event=>{if(stateInput.dataset.gstinLocked==="true")event.preventDefault()});
  stateInput.addEventListener("keydown",event=>{if(stateInput.dataset.gstinLocked==="true"&&event.key!=="Tab")event.preventDefault()});
  const show=record=>{
   registration=record;choices.replaceChildren();
   status.textContent=record.message||(record.state==="verified"?(record.confirmed?"GSTIN verified. Registered supplier details are read-only.":"GSTIN verified. Confirm a registered address."):
    record.state==="blocked"?"Needs your attention: this registration is inactive or not a Regular taxpayer. New invoices are blocked.":
    "GSTIN is unverified. Manual details are allowed, but new invoices are blocked.");
   readonly(!!record.confirmed&&input.value.toUpperCase()===record.gstin);
   if(record.state!=="verified"||!record.registration)return;
   const r=record.registration,summary=document.createElement("p");summary.textContent=`${r.legal_name}${r.trade_name?` • ${r.trade_name}`:""}`;choices.append(summary);
   [r.principal_address,...r.additional_addresses].forEach((address,index)=>{
    const button=document.createElement("button");button.type="button";
    button.textContent=`Use ${index===0?"principal":"additional"} address: ${address.formatted_address||[address.line1,address.line2,address.city,address.state,address.pin].filter(Boolean).join(", ")}`;
    button.style.whiteSpace="normal";button.style.textAlign="left";button.style.overflowWrap="anywhere";button.style.height="auto";
    button.addEventListener("click",async()=>{
     if(busy)return;busy=true;button.disabled=true;const expectedGSTIN=input.value.toUpperCase();
     try{const stamp=await options.beforeConfirm?.();const saved=await api("confirm",{verification_id:record.id,address_index:index});
      if(!input.isConnected||input.value.toUpperCase()!==expectedGSTIN)return;
      for(const key of ["gstin",...supplierKeys]){const field=find(root,key);if(field&&saved.settings&&key in saved.settings)field.value=saved.settings[key]||"";}
      await options.onConfirmed?.(saved,stamp);readonly(true);status.textContent="GSTIN verified and registered supplier details saved. Republish to update the live store.";
     }catch(error){status.textContent=error.message}finally{busy=false;button.disabled=false}
    });choices.append(button);
   });
   if(r.warnings?.length){const warning=document.createElement("p");warning.textContent="Some additional addresses could not be read. Your principal address remains available.";choices.append(warning)}
  };
  const verify=async()=>{
   clearTimeout(retryTimer);
   if(!enabled||busy||!input.isConnected)return;
   const gstin=input.value.trim().toUpperCase(),code=stateInput.value;
   const invalid=gstinError(gstin);
   if(invalid||!INDIAN_STATES.some(s=>s.code===code)||gstin.slice(0,2)!==code){
    status.textContent=invalid||"Choose the registered business state matching the first two GSTIN digits.";return;
   }
   busy=true;action.disabled=true;status.textContent="Checking GSTIN registration…";
   try{const result=await api("verify",{gstin,state_code:code});
    if(!input.isConnected||input.value.toUpperCase()!==gstin)return;
    show(result);
    if(result.state==="unverified")retryTimer=setTimeout(verify,Math.max(60,result.retry_after||60)*1000);
   }catch(error){status.textContent=error.message;if(error.retry_after)retryTimer=setTimeout(verify,Math.max(60,error.retry_after)*1000)}
   finally{busy=false;action.disabled=false}
  };
  action.addEventListener("click",verify);
  input.addEventListener("input",()=>{readonly(false);clearTimeout(typingTimer);clearTimeout(retryTimer);choices.replaceChildren();typingTimer=setTimeout(verify,800)});
  stateInput.addEventListener("change",()=>{clearTimeout(typingTimer);typingTimer=setTimeout(verify,800)});
  api("state").then(result=>{if(!input.isConnected)return;enabled=!!result.enabled;action.disabled=!enabled;
   if(enabled){pane.hidden=false;pane.style.removeProperty("display");show(result);if(result.state==="unverified"&&input.value.trim())retryTimer=setTimeout(verify,1500)}
   else{clearTimeout(typingTimer);clearTimeout(retryTimer);pane.remove();}
  }).catch(()=>{pane.remove();action.disabled=true});
 };
 install();const observer=new MutationObserver(install);observer.observe(root,{childList:true,subtree:true});
 return()=>observer.disconnect();
}
