// Inline so navigation feedback never waits for another browser module fetch.
export function navigationHead(){
  return `<style>
  #lb-navigation{display:none;position:fixed;inset:0 0 auto;min-height:100px;overflow:hidden;z-index:2147483000;pointer-events:none;font:500 13px/1.4 system-ui,sans-serif}
  html[data-navigation-loading] #lb-navigation{display:block}
  #lb-navigation::before{content:"";display:block;height:3px;background:var(--accent,#711b3b);width:35%;animation:lb-navigation-progress 1.2s ease-in-out infinite}
  #lb-navigation span{box-sizing:border-box;max-width:calc(100vw - 32px);float:right;margin:10px 16px;padding:9px 14px;border:1px solid #e5dce0;border-radius:9px;background:#fff;color:#4c2636;box-shadow:0 4px 18px #22111b14}
  @keyframes lb-navigation-progress{from{transform:translateX(-100%)}to{transform:translateX(386%)}}
  @media(prefers-reduced-motion:reduce){#lb-navigation::before{animation:none;width:65%}}
  @media print{#lb-navigation{display:none!important}}
  </style><script>(${navigationController.toString()})();</script>`;
}
export const NAVIGATION_BODY='<div id="lb-navigation" role="status" aria-live="polite" aria-atomic="true"><span>Loading page…</span></div>';
export function withNavigation(html){
  if(html.includes('id="lb-navigation"'))return html;
  return html.replace(/<\/head>/i,`${navigationHead()}</head>`).replace(/<body\b[^>]*>/i,body=>body+NAVIGATION_BODY);
}

export function navigationController(){
  const root=document.documentElement;
  let timer;
  const finish=()=>{
    clearTimeout(timer);
    delete root.dataset.navigationLoading;
  };
  const start=()=>{
    clearTimeout(timer);
    root.dataset.navigationLoading="true";
    const label=document.querySelector("#lb-navigation span");
    if(label)label.textContent="Loading page…";
    timer=setTimeout(()=>{
      const label=document.querySelector("#lb-navigation span");
      if(label)label.textContent="Still loading. You can try opening the page again.";
    },12000);
  };
  start();
  document.addEventListener("DOMContentLoaded",finish,{once:true});
  window.addEventListener("pageshow",finish);
  window.addEventListener("click",event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.("a[href]");
    if(!link||link.hasAttribute("download")||link.getAttribute("aria-disabled")==="true")return;
    const target=link.getAttribute("target")||document.querySelector("base[target]")?.getAttribute("target");
    if(target&&target.toLowerCase()!=="_self")return;
    const url=new URL(link.href,location.href),current=new URL(location.href);
    if(!["http:","https:"].includes(url.protocol))return;
    if(url.origin===current.origin&&url.pathname===current.pathname&&url.search===current.search&&url.hash)return;
    start();
    queueMicrotask(()=>{if(event.defaultPrevented)finish();});
  });
  window.addEventListener("submit",event=>{
    if(event.defaultPrevented)return;
    const form=event.target;
    const target=event.submitter?.getAttribute("formtarget")||form.getAttribute("target");
    if(target&&target.toLowerCase()!=="_self")return;
    if((event.submitter?.getAttribute("formmethod")||form.getAttribute("method"))?.toLowerCase()==="dialog")return;
    start();
    queueMicrotask(()=>{if(event.defaultPrevented)finish();});
  });
  // Covers programmatic location changes too. Never leave a cancelled
  // unsaved-changes navigation looking as if it is still loading.
  window.addEventListener("beforeunload",event=>{
    queueMicrotask(()=>{if(event.defaultPrevented||event.returnValue)finish();else start();});
  });
  if(window.navigation){
    window.navigation.addEventListener("navigateerror",finish);
  }
}
