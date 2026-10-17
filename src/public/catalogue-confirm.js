// Shared, accessible confirmations for catalogue actions in Ann and the dashboard.
let sequence=0;
export function confirmCatalogueAction(message,{title="Confirm changes",confirmLabel="Continue",cancelLabel="Keep editing"}={}){
  const doc=document,previous=doc.activeElement,id=`catalogue-confirm-${++sequence}`;
  if(!doc.querySelector("[data-catalogue-confirm-style]")){
    const style=doc.createElement("style");
    style.setAttribute("data-catalogue-confirm-style","");
    style.textContent=`.lb-catalogue-confirm{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:26px;border:1px solid #ded7da;border-radius:16px;background:#fff;color:#30242b;box-shadow:0 24px 80px #20161e40;font:14px/1.6 system-ui,sans-serif}.lb-catalogue-confirm::backdrop{background:#20161e80;backdrop-filter:blur(2px)}.lb-catalogue-confirm h2{margin:0 0 10px;font:600 21px/1.3 system-ui,sans-serif}.lb-catalogue-confirm p{margin:0;color:#6e6268;white-space:pre-line}.lb-catalogue-confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:24px}.lb-catalogue-confirm button{padding:10px 16px;border:1px solid #d8cbd1;border-radius:8px;background:#fff;color:#4c2636;font:600 14px system-ui,sans-serif;cursor:pointer}.lb-catalogue-confirm button[data-confirm-accept]{background:#711b3b;border-color:#711b3b;color:#fff}.lb-catalogue-confirm button:focus-visible{outline:3px solid #c99cac;outline-offset:3px}`;
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
    let settled=false;
    const finish=result=>{
      if(settled)return;
      settled=true;dialog.close();dialog.remove();
      if(previous?.isConnected)previous.focus();
      resolve(result);
    };
    dialog.querySelector("[data-confirm-cancel]").addEventListener("click",()=>finish(false));
    dialog.querySelector("[data-confirm-accept]").addEventListener("click",()=>finish(true));
    dialog.addEventListener("cancel",event=>{event.preventDefault();finish(false);});
    dialog.addEventListener("close",()=>finish(false));
    doc.body.append(dialog);dialog.showModal();
  });
}
