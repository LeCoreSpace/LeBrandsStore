import {attachAnnLaunch} from "./ann-launch-ui.js";
import {CONNECTION_KINDS} from "./store-essentials.js";
const host=document.querySelector("[data-connection-kind]");
if(host) {
  const storeId=document.querySelector(".lb-app")?.dataset.storeId;
  const kind=host.dataset.connectionKind;
  if(storeId&&Object.hasOwn(CONNECTION_KINDS,kind)) {
    const ui=attachAnnLaunch({api:`/api/stores/${encodeURIComponent(storeId)}/ann`,readOnly:false,settingsMode:true});
    ui.mount(CONNECTION_KINDS[kind],{customDomainOnly:kind==="domain"});
    window.addEventListener("beforeunload",e=>{if(ui.hasUnsavedChanges()){e.preventDefault();e.returnValue="";}});
  }
}
