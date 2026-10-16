import { renderStylePreview } from "./style-preview.js";
import { attachStyleInteractions } from "./style-preview-interactions.js";
import { attachAuraSearch, attachAuraCatalog } from "./aura-ui.js";
import { safeImage } from "./aura-sections.js";

/** Only recognised, same-origin storefront links can change this private preview. */
export function browserPreviewLocation(href, data, origin) {
  try {
    const url=new URL(href,origin);
    if(url.origin!==new URL(origin).origin || !["http:","https:"].includes(url.protocol)) return null;
    const path=url.pathname;
    if(["/collections","/collections/","/collections/all"].includes(path)) return {page:"collection",collectionId:undefined};
    if(path.startsWith("/products/")) {
      const id=decodeURIComponent(path.split("/")[2]);
      return data.products.some(p=>p.id===id)?{page:"product",productId:id}:null;
    }
    if(path.startsWith("/collections/")) {
      const slug=decodeURIComponent(path.split("/")[2]);
      const collection=data.collections?.find(c=>c.id===slug || c.slug===slug);
      return collection?{page:"collection",collectionId:collection.id}:null;
    }
    if(path.startsWith("/policies/")) return {page:"policy",policyKind:path.split("/")[2]};
    const page={"/":"home","/cart":"cart","/checkout":"checkout","/pages/about":"about","/pages/contact":"contact"}[path];
    return page?{page}:null;
  } catch {return null;}
}

/** The child stays script-free. Trusted code in Ann binds its preview-only controls. */
export function openAnnBrowserPreview(snapshot,{openWindow=()=>window.open("about:blank","_blank")}={}) {
  const win=openWindow();
  if(!win) return false;
  win.opener=null;
  const data=structuredClone(snapshot.data),theme=structuredClone(snapshot.theme);
  const bag=new Map(snapshot.bag || []);
  let route={page:snapshot.page || "home",productId:snapshot.productId || data.products[0]?.id,
    collectionId:snapshot.collectionId,policyKind:snapshot.policyKind};
  const doc=win.document;
  doc.title=`${data.store?.name || "Your store"} | Private preview`;
  const base=doc.createElement("base");base.href=new URL("/",import.meta.url).href;
  // The about:blank window must size itself immediately and independently of
  // the editor's external stylesheet and inherited resource policy.
  const sheet=doc.createElement("style");sheet.textContent=`
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}
    body.ann-browser-shell{height:100dvh;display:flex;flex-direction:column;background:#f3f1f2;color:#30262b;font:14px system-ui,sans-serif}
    .ann-browser-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;background:#fff;border-bottom:1px solid #ddd5d9}
    .ann-browser-toolbar p{flex:1 1 240px;margin:0;font-size:12px;line-height:1.5}
    .ann-browser-toolbar button{font:inherit;cursor:pointer;border:1px solid #d7cdd2;border-radius:999px;padding:8px 14px;background:#fff;color:#30262b}
    .ann-browser-toolbar button[aria-pressed=true]{background:#30262b;color:#fff}
    .ann-browser-toolbar button:focus-visible{outline:3px solid #86566c;outline-offset:2px}
    .ann-browser-viewport{flex:1;min-height:0;display:flex;justify-content:center;overflow:hidden}
    .ann-browser-frame{display:block;flex:1;width:100%;height:100%;border:0;background:#fff;min-width:0}
    .ann-browser-frame[data-device=mobile]{flex:none;width:390px;max-width:100%}
  `;
  const viewport=doc.createElement("meta");viewport.name="viewport";viewport.content="width=device-width, initial-scale=1";
  doc.head.append(viewport,sheet);
  const logo=safeImage(theme.logo_url ?? data.settings?.logo_url);
  if(logo){const icon=doc.createElement("link");icon.rel="icon";icon.href=logo;doc.head.append(icon);}
  doc.body.className="ann-browser-shell";
  const toolbar=doc.createElement("header");toolbar.className="ann-browser-toolbar";
  const note=doc.createElement("p");
  note.textContent="Private preview. No orders or payments. Keep Ann open while browsing. Changes made later in Ann need a new preview.";
  toolbar.append(note);
  const main=doc.createElement("main");main.className="ann-browser-viewport";
  const frame=doc.createElement("iframe");frame.className="ann-browser-frame";
  frame.title="Interactive private store preview";
  frame.setAttribute("sandbox","allow-same-origin");
  frame.setAttribute("referrerpolicy","no-referrer");
  const buttons=[];
  const setDevice=device=>{
    frame.dataset.device=device;
    for(const [value,button] of buttons) button.setAttribute("aria-pressed",String(device===value));
  };
  for(const device of ["desktop","mobile"]) {
    const button=doc.createElement("button");button.type="button";
    button.textContent=device==="desktop"?"Desktop":"Mobile";
    button.addEventListener("click",()=>setDevice(device));
    buttons.push([device,button]);toolbar.append(button);
  }
  const close=doc.createElement("button");close.type="button";close.textContent="Close preview";
  close.addEventListener("click",()=>win.close());toolbar.append(close);
  setDevice(snapshot.device==="mobile"?"mobile":"desktop");
  const render=()=>{frame.srcdoc=renderStylePreview(data,theme,route);};
  frame.addEventListener("load",()=>{
    const child=frame.contentDocument;if(!child) return;
    child.addEventListener("submit",e=>e.preventDefault(),true);
    child.addEventListener("click",e=>{
      const link=e.target.closest("a");if(!link) return;
      e.preventDefault();
      const href=link.getAttribute("href") || "/";
      if(href.startsWith("#")) {
        try{child.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();}catch{/* Invalid fragment */}
        return;
      }
      const next=browserPreviewLocation(href,data,base.href);
      if(next){route={...route,...next};render();}
    });
    attachAuraSearch(child,data);
    attachAuraCatalog(child,data,route);
    attachStyleInteractions(child,data,bag,route.page,route.productId,page=>{
      route={...route,page};render();
    });
  });
  main.append(frame);doc.body.append(toolbar,main);render();
  return true;
}
