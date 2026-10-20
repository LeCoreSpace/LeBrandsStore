import {GRID_KINDS,defaultGrid,gridRecords,gridItems,cellDefaults,cellKeys} from "./section-grid-model.js";
import {safeImage} from "./aura-sections.js";
import {productHref} from "./commerce-options.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const PIXEL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
export const SECTION_GRID_CSS=`
.lb-section[data-grid] .lb-grid{display:grid;grid-template-columns:repeat(var(--g-desktop),minmax(0,1fr));gap:var(--g-gap);align-items:start;columns:auto}
.lb-section[data-grid]{text-align:var(--g-align)}
.lb-section[data-grid] .lb-cell{min-width:0;overflow-wrap:anywhere;break-inside:avoid;color:inherit}
.lb-section[data-grid] .lb-cell h3{font:inherit;font-size:18px;font-weight:600;margin:12px 0 6px}
.lb-section[data-grid] .lb-cell p{font-size:14px;line-height:1.6;margin:6px 0}
.lb-section[data-grid] .lb-cell a{color:inherit}
.lb-section[data-grid] .lb-photo{margin:0;min-height:0;border-radius:inherit}
.lb-section[data-grid] .lb-photo img,.lb-section[data-grid] .lb-photo video{width:100%;height:auto!important;aspect-ratio:var(--g-ratio);object-fit:var(--g-fit)!important;object-position:var(--g-focus,center)}
.lb-section[data-card="outlined"] .lb-cell{border:1px solid currentColor;padding:14px}
.lb-section[data-card="filled"] .lb-cell{background:color-mix(in srgb,currentColor 6%,transparent);padding:14px}
.lb-section[data-grid="featured"] .lb-cell:first-child{grid-column:1/-1}
.lb-section[data-grid="masonry"] .lb-grid{display:block;columns:var(--g-desktop);column-gap:var(--g-gap)}
.lb-section[data-grid="masonry"] .lb-cell{display:block;margin-bottom:var(--g-gap)}
.lb-section[data-grid="strip"] .lb-grid{display:grid;grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:calc((100% - (var(--g-desktop) - 1)*var(--g-gap))/var(--g-desktop));overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:12px}
.lb-section[data-grid="strip"] .lb-cell{scroll-snap-align:start}
@media(max-width:1024px){.lb-section[data-grid] .lb-grid{grid-template-columns:repeat(var(--g-tablet),minmax(0,1fr))}.lb-section[data-grid="masonry"] .lb-grid{columns:var(--g-tablet)}.lb-section[data-grid="strip"] .lb-grid{grid-template-columns:none;grid-auto-columns:calc((100% - (var(--g-tablet) - 1)*var(--g-gap))/var(--g-tablet))}}
@media(max-width:640px){.lb-section[data-grid] .lb-grid{grid-template-columns:repeat(var(--g-mobile),minmax(0,1fr))}.lb-section[data-grid="masonry"] .lb-grid{columns:var(--g-mobile)}.lb-section[data-grid="strip"] .lb-grid{grid-template-columns:none;grid-auto-columns:calc((100% - (var(--g-mobile) - 1)*var(--g-gap))/var(--g-mobile))}}
`;
export function gridAttributes(instance){
  if(!instance.grid)return "";
  const g=instance.grid,ratio={portrait:"3/4",square:"1/1",wide:"16/9",natural:"auto"}[g.ratio];
  return ` data-grid="${g.arrangement}" data-card="${g.card}" style="--g-desktop:${g.desktop};--g-tablet:${g.tablet};--g-mobile:${g.mobile};--g-gap:${{compact:8,normal:16,relaxed:24}[g.gap]}px;--g-ratio:${ratio};--g-fit:${g.fit};--g-align:${g.align}"`;
}
export function renderSectionGrid(instance,data,options={}){
  if(!instance.grid||!GRID_KINDS[instance.family])return null;
  const page=options.page||"home",design=data.settings?.ann_design||{},records=gridRecords(instance,data,options),kind=GRID_KINDS[instance.family];
  const field=(tag,key,value,editable=true,useCopy=true)=>`<${tag} data-ann-copy-field="${key}"${options.designEdit&&editable?` data-design-copy="${key}"`:""}>${esc(useCopy&&Object.hasOwn(design.copy||{},key)?design.copy[key]:value)}</${tag}>`;
  const prefix=`section.${page}.${instance.id}.`,titles={"product-grid":"Explore our products","collection-cards":"Explore our collections","related-products":"Explore more products","related-collections":"More collections","product-set":"Explore the set","image-gallery":"Gallery","before-after":"Before & After","customer-photos":"Customer Photos","press-logos":"Press & Logos","customer-reviews":"Customer Reviews"};
  const heading=field("h2",prefix+"text0",titles[instance.family]);
  const intro=field("p",prefix+"text10","Explore our collection.");
  const cells=gridItems(instance,data,options).slice(0,instance.grid.limit).map((item,index)=>{
    const record=records.find(r=>r.id===item.recordId);
    if(kind!=="images"&&!record)return "";
    const defaults=cellDefaults(instance,item,record,index),keys=cellKeys(page,instance.id,item.slot);
    const img=(url,alt)=>`<figure class="lb-photo"><img src="${esc(safeImage(url)||PIXEL)}" alt="${esc(item.alt??alt)}" loading="lazy"${["images","collections"].includes(kind)?` data-section-item-slot="${item.slot}"${item.fresh?' data-section-item-fresh="true"':""}`:""}></figure>`;
    let content;
    if(kind==="products")content=`<a class="sc-card" href="${esc(productHref(record))}">${img(record.images?.[0]?.url,record.title||record.name||"Product")}<h3>${esc(record.title||record.name)}</h3><p>${esc(new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(record.price_paise||0)/100))}</p></a>`;
    else if(kind==="reviews")content=`<blockquote class="sc-card"><p>${esc(record.body||record.text)}</p><footer>${esc(record.author_name||record.name||"Customer")}</footer></blockquote>`;
    else{
      const editable=kind==="images"||instance.grid.source==="manual";
      const text=field("h3",keys.title,defaults.title,editable,!item.fresh)+field("p",keys.body,defaults.body,editable,!item.fresh);
      if(kind==="collections")content=`<a href="/collections/${encodeURIComponent(record.slug||record.id)}">${img(record.image?.url,record.title||record.name||"Collection")}${text}</a>`;
      else content=img("",defaults.alt)+text+(item.link?`<a href="${esc(item.link)}" data-ann-copy-field="${keys.label}"${options.designEdit?` data-design-copy="${keys.label}"`:""}>${esc(Object.hasOwn(design.copy||{},keys.label)?design.copy[keys.label]:defaults.label)}</a>`:"");
    }
    return `<article class="lb-cell" data-cell-id="${item.id}" style="--g-focus:${item.focus||"center"}">${content}</article>`;
  }).join("");
  const empty=options.designEdit&&!cells?'<p class="lb-empty" data-ann-copy-field="">Add cells or choose available store records in grid settings.</p>':"";
  const subtotal=instance.family==="product-set"?gridItems(instance,data,options).slice(0,instance.grid.limit).reduce((sum,item)=>sum+Number(records.find(r=>r.id===item.recordId)?.price_paise||0),0):0;
  return heading+intro+`<div class="lb-grid">${cells}</div>`+empty+(instance.family==="product-set"?`<p data-ann-copy-field="">Product total: ${esc(new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(subtotal/100))}. Products are purchased individually.</p>`:"");
}
