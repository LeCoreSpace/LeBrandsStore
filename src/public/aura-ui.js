import {facetCounts} from "./collection-filters.js";
// The saved design uses the same progressive motion enhancement as its preview.
// Cart actions remain owned by commerce.js, not by the demonstration layer.
if (typeof document !== "undefined" && document.body?.dataset.designPage) {
  import("./aura-showcase-interactions.js").then(({ attachShowcaseInteractions }) => {
    document.body.dataset.showcase = document.body.dataset.style;
    attachShowcaseInteractions(document, [], new Map(), href => location.assign(href));
  }).catch(() => document.body.classList.remove("sc-motion-ready"));
}
// Storefront-only vanilla interactions: mobile menu, catalog search and sort.
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
function respectVideoMotion(){if(reduced.matches)for(const video of document.querySelectorAll("video[autoplay]")){video.pause();video.removeAttribute("autoplay");video.preload="none";video.load();}}
respectVideoMotion();reduced.addEventListener("change",respectVideoMotion);
const photos=[...document.querySelectorAll("img[data-gallery-image]")];
if(photos.length){
 const dialog=document.createElement("dialog"),image=document.createElement("img"),close=document.createElement("button");
 dialog.className="au-zoom";dialog.setAttribute("aria-label","Product photo");close.type="button";close.textContent="Close";dialog.append(close,image);document.body.append(dialog);
 let active,overflow="";
 const open=photo=>{active=photo;image.src=photo.currentSrc||photo.src;image.alt=photo.alt;overflow=document.body.style.overflow;document.body.style.overflow="hidden";dialog.showModal();};
 close.addEventListener("click",()=>dialog.close());dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
 dialog.addEventListener("close",()=>{document.body.style.overflow=overflow;active?.focus();});
 for(const photo of photos){photo.tabIndex=0;photo.setAttribute("role","button");photo.setAttribute("aria-label",`Enlarge ${photo.alt||"product photo"}`);photo.addEventListener("click",()=>open(photo));photo.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(photo);}});}
}
const menu = document.getElementById("au-menu");
// Trusted parent code also binds these controls in sandboxed editor/wizard frames.
// No scripts or form submissions need to be enabled inside those frames.
export function attachAuraSearch(doc, {products} = {}) {
  const searchOpener = doc.querySelector("[data-search-open]");
  const searchDialog = doc.getElementById(searchOpener?.getAttribute("aria-controls") || "");
  if (!searchOpener || !searchDialog || searchOpener.dataset.searchBound) return;
  searchOpener.dataset.searchBound = "true";
  let overflow = "";
  searchOpener.addEventListener("click", () => {
    if (searchDialog.open) return;
    const frameMenu = doc.getElementById("au-menu");
    if (frameMenu && !frameMenu.hidden) {
      frameMenu.hidden = true;
      doc.querySelector("[data-menu-open]")?.setAttribute("aria-expanded","false");
      doc.body.style.overflow = "";
    }
    overflow = doc.body.style.overflow;doc.body.style.overflow = "hidden";
    searchDialog.showModal();searchDialog.querySelector("input")?.focus();
  });
  searchDialog.querySelector("[data-search-close]")?.addEventListener("click",()=>searchDialog.close());
  searchDialog.addEventListener("click",event=>{if(event.target===searchDialog)searchDialog.close();});
  searchDialog.addEventListener("close",()=>{doc.body.style.overflow=overflow;searchOpener.focus();});
  if (Array.isArray(products)) {
    const results = doc.createElement("ul");
    results.className="au-search-results";results.setAttribute("aria-live","polite");
    searchDialog.append(results);
    const search = ()=>{
      results.replaceChildren();
      const query=searchDialog.querySelector("input").value.trim().toLocaleLowerCase();
      const matches=products.filter(product=>String(product.title||"").toLocaleLowerCase().includes(query));
      for(const product of matches.slice(0,30)){const item=doc.createElement("li");item.textContent=String(product.title||"");results.append(item);}
      if(!matches.length){const item=doc.createElement("li");item.textContent="No matching products.";results.append(item);}
    };
    const form=searchDialog.querySelector("form"), button=form?.querySelector('[type="submit"]'), input=searchDialog.querySelector("input");
    // Sandboxed forms are blocked before a submit event is dispatched.
    // Use explicit controls in previews; live stores retain their native GET form.
    if(button){button.type="button";button.addEventListener("click",search);}
    input?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();search();}});
    form?.addEventListener("submit",event=>event.preventDefault());
  }
}
attachAuraSearch(document);
const opener = document.querySelector("[data-menu-open]");
function setMenu(open) {
  if (!menu) return;
  menu.hidden = !open;
  opener?.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) menu.querySelector("input")?.focus(); else opener?.focus();
}
opener?.addEventListener("click", () => setMenu(true));
menu?.querySelector("[data-menu-close]")?.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu && !menu.hidden) setMenu(false); });
import { catalogPage } from "./catalog-page.js";
// Also bound by trusted parent code for sandboxed previews. Without scripts every card stays visible.
export function attachAuraCatalog(doc) {
  const catalog = doc.querySelector("[data-catalog]");
  if (!catalog || catalog.dataset.bound) return;
  catalog.dataset.bound = "true";
  const cards = [...catalog.children].filter((el) => el.matches(".au-card"));
  const sort = doc.querySelector("[data-catalog-sort]"), count = doc.querySelector("[data-catalog-count]"), none = doc.querySelector("[data-catalog-empty]");
  const pager = doc.querySelector("[data-catalog-pagination]"), status = pager?.querySelector("[data-page-status]");
  const prev = pager?.querySelector("[data-page-prev]"), next = pager?.querySelector("[data-page-next]");
  const pageSize = Number(catalog.dataset.pageSize) || 0;
  let stockOnly = false, col = "", page = 1, filters={};
  const facetPanel=doc.querySelector("[data-catalog-facets]");
  let facetConfig=null;
  if(facetPanel){
    try{facetConfig=JSON.parse(facetPanel.dataset.catalogFacets);}
    catch{facetPanel.textContent="Filters could not be loaded. All products are still shown.";}
    facetPanel.hidden=false;
  }
  const records=new Map((facetConfig?.records||[]).map(r=>[r.href,r.facts]));
  const facetInputs=[...(facetPanel?.querySelectorAll("[data-facet-group]")||[])];
  const facetActive=facetPanel?.querySelector("[data-facet-active]");
  const facetClear=facetPanel?.querySelector("[data-facet-clear]");
  if(doc.defaultView?.matchMedia?.("(max-width:600px)")?.matches)facetPanel?.querySelector("details")?.removeAttribute("open");
  const q = (new URLSearchParams(doc.defaultView?.location?.search || "").get("q") || "").trim().toLowerCase();
  doc.querySelectorAll(".au-search input").forEach((i) => { i.value = q; });
  const items = cards.map((el, i) => ({ el, title: String(el.dataset.title || ""), price: Number(el.dataset.price) || 0, available: el.dataset.available === "1", index: Number(el.dataset.index) || i, collections: (el.dataset.collections || "").split(" ").filter(Boolean),facets:records.get(el.getAttribute("href"))||facetConfig?.records?.[i]?.facts }));
  const emptyText=none?.textContent;
  const paintFacets=()=>{
    if(!facetConfig)return;
    const base=catalogPage(items,{stockOnly,collection:col,q}).ordered;
    const counts=facetCounts(base,facetConfig.groups,filters,stockOnly);
    for(const input of facetInputs){
      const n=counts[input.dataset.facetGroup]?.[input.value]||0;
      const label=input.closest("label");
      label.querySelector("[data-facet-count]").textContent=String(n);
      input.disabled=!n&&!input.checked;label.hidden=!n&&!input.checked;
    }
    facetPanel.querySelectorAll("[data-facet-field]").forEach(field=>{
      field.hidden=![...field.querySelectorAll("label")].some(label=>!label.hidden);
    });
    if(facetActive){
      facetActive.replaceChildren();
      for(const input of facetInputs.filter(input=>input.checked)){
        const group=facetConfig.groups.find(g=>g.key===input.dataset.facetGroup);
        const name=group?.values.find(v=>v.value===input.value)?.label||input.value;
        const button=doc.createElement("button");button.type="button";
        button.textContent=`${group?.label}: ${name} ×`;
        button.setAttribute("aria-label",`Remove ${group?.label}: ${name}`);
        button.addEventListener("click",()=>{input.checked=false;input.dispatchEvent(new doc.defaultView.Event("change",{bubbles:true}));});
        facetActive.append(button);
      }
    }
    const tally=facetInputs.filter(input=>input.checked).length;
    const label=facetPanel.querySelector("[data-facet-tally]");
    if(label)label.textContent=tally?`${tally} selected`:"";
    if(facetClear)facetClear.disabled=!tally&&!stockOnly;
  };
  const apply = () => {
    const r = catalogPage(items, { sort: sort?.value || "", stockOnly, collection: col, q, page, pageSize,filters });
    page = r.page;
    const shown = new Set(r.visible);
    for (const it of items) it.el.hidden = !shown.has(it);
    for (const it of r.ordered) catalog.append(it.el);
    if (count) count.textContent = `${r.total} ${r.total === 1 ? "product" : "products"}`;
    const facetResults=facetPanel?.querySelector("[data-facet-results]");
    if(facetResults){facetResults.textContent=`${r.total} ${r.total===1?"product":"products"}`;if(count)facetResults.removeAttribute("role");}
    if (none){none.hidden = r.total > 0;none.textContent=Object.values(filters).some(values=>values.length)?"No products match these filters. Try removing a filter.":emptyText;}
    if (pager) { pager.hidden = r.pages < 2; if (status) status.textContent = `Page ${r.page} of ${r.pages}`; if (prev) prev.disabled = r.page <= 1; if (next) next.disabled = r.page >= r.pages; }
    paintFacets();
  };
  const reset = (fn) => (e) => { fn(e); page = 1; apply(); };
  sort?.addEventListener("change", reset(() => {}));
  facetInputs.forEach(input=>input.addEventListener("change",reset(()=>{
    filters=Object.create(null);
    for(const checked of facetInputs.filter(input=>input.checked))
      (filters[checked.dataset.facetGroup]??=[]).push(checked.value);
  })));
  facetClear?.addEventListener("click",reset(()=>{
    filters={};facetInputs.forEach(input=>{input.checked=false;});stockOnly=false;
    const stock=doc.querySelector("[data-catalog-stock]");if(stock)stock.checked=false;
  }));
  doc.querySelector("[data-catalog-stock]")?.addEventListener("change", reset((e) => { stockOnly = e.target.checked; }));
  prev?.addEventListener("click", () => { page -= 1; apply(); });
  next?.addEventListener("click", () => { page += 1; apply(); });
  const chips = [...doc.querySelectorAll("button[data-catalog-collection]")];
  chips.forEach((chip) => chip.addEventListener("click", reset(() => { col = chip.dataset.catalogCollection; chips.forEach((o) => o.setAttribute("aria-pressed", String(o === chip))); })));
  apply();
}
attachAuraCatalog(document);
import { attachAuraMotion } from "./aura-motion.js";
attachAuraMotion(document);
