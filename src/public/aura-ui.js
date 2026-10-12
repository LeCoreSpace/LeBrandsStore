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
const catalog = document.querySelector("[data-catalog]");
if (catalog) {
  const cards = [...catalog.children];
  const sort = document.querySelector("[data-catalog-sort]");
  const count = document.querySelector("[data-catalog-count]");
  const none = document.querySelector("[data-catalog-empty]");
  let q = (new URLSearchParams(location.search).get("q") || "").trim().toLowerCase();
  document.querySelectorAll(".au-search input").forEach((i) => { i.value = q; });
  const apply = () => {
    const mode = sort?.value || "";
    const n = (el, k) => Number(el.dataset[k]) || 0;
    const ordered = [...cards].sort((a, b) => mode === "price-asc" ? n(a, "price") - n(b, "price") : mode === "price-desc" ? n(b, "price") - n(a, "price") : mode === "available" ? n(b, "available") - n(a, "available") || n(a, "index") - n(b, "index") : n(a, "index") - n(b, "index"));
    let shown = 0;
    for (const el of ordered) { const hit = !q || el.dataset.title.includes(q); el.hidden = !hit; if (hit) shown++; catalog.append(el); }
    if (count) count.textContent = `${shown} ${shown === 1 ? "product" : "products"}`;
    if (none) none.hidden = shown > 0;
  };
  sort?.addEventListener("change", apply);
  apply();
}
