import {filterFacts,buildFacetGroups} from "./collection-filters.js";
import {productFilterProjection} from "./product-details.js";
import {productHref} from "./commerce-options.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function collectionFilterPanel(products){
 const records=products.map(p=>({href:productHref(p),facts:filterFacts({...p,product_filters:productFilterProjection(p)})}));
 const groups=buildFacetGroups(records.map(r=>r.facts));
 if(!groups.length)return "";
 const config=JSON.stringify({records:records.map(r=>({href:r.href,facts:{groups:r.facts.groups,combinations:r.facts.combinations}})),groups});
 const fields=groups.map(group=>`<fieldset data-facet-field="${esc(group.key)}"><legend class="au-facet-sr">${esc(group.label)}</legend><details open><summary>${esc(group.label)}</summary><div class="au-facet-options">${group.values.map(v=>`<label><input type="checkbox" data-facet-group="${esc(group.key)}" value="${esc(v.value)}"><span>${esc(v.label)}</span><small data-facet-count></small></label>`).join("")}</div></details></fieldset>`).join("");
  const bar=`<div class="au-facet-bar" data-facet-bar hidden><button type="button" data-facet-open aria-controls="au-collection-filters" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></svg>Filters<span data-facet-bar-tally></span></button><span data-facet-bar-count></span></div>`;
  return bar+`<div class="au-facet-backdrop" data-facet-backdrop hidden></div><section id="au-collection-filters" class="au-facets" data-catalog-facets="${esc(config)}" hidden aria-label="Product filters"><div class="au-facet-head"><strong>Filters</strong><span data-facet-tally></span><button type="button" data-facet-close>Close</button></div><div class="au-facet-body"><div class="au-facet-active" data-facet-active aria-label="Selected filters"></div><div class="au-facet-groups">${fields}</div></div><div class="au-facet-bottom"><span data-facet-results role="status"></span><button type="button" data-facet-clear>Clear</button><button type="button" data-facet-done>Show results</button></div></section>`;
}
export function addCollectionFilters(body,products){
  const panel=collectionFilterPanel(products);
  if(!panel)return body;
  const open=/<(div|section)\b[^>]*\sdata-catalog(?=[\s=>])[^>]*>/.exec(body);
  if(!open)return body;
  const tag=open[1],re=new RegExp(`<(/?)${tag}\\b[^>]*>`,"gi");
  re.lastIndex=open.index+open[0].length;
  let depth=1,m,end=-1;
  while((m=re.exec(body))){depth+=m[1]?-1:(m[0].endsWith("/>")?0:1);if(!depth){end=m.index+m[0].length;break;}}
  if(end<0)return body.slice(0,open.index)+panel+body.slice(open.index);
  return body.slice(0,open.index)+`<div class="au-shop">${panel}${body.slice(open.index,end)}</div>`+body.slice(end);
}
export const COLLECTION_FILTER_CSS=`
body [data-catalog]>.au-card[hidden]{display:none!important}
body .au-facets[hidden],body .au-facet-bar[hidden],body .au-facet-backdrop[hidden]{display:none!important}
body .au-shop{display:grid;grid-template-columns:248px minmax(0,1fr);gap:32px;align-items:start;width:min(1280px,100% - 40px);margin:24px auto;box-sizing:border-box}
body .au-shop:not(:has(.au-facets:not([hidden]))){display:block}
body .au-facet-bar,body .au-facet-backdrop{display:none}
body .au-facet-head{display:flex;align-items:center;gap:10px;padding:14px 0 10px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);font-size:15px}
body .au-facet-head [data-facet-close]{display:none}
body .au-facet-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
body .au-facets{grid-column:1;grid-row:1;position:sticky;top:16px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;box-sizing:border-box;color:inherit;font-family:inherit;text-transform:none;letter-spacing:normal;border-top:1px solid color-mix(in srgb,currentColor 22%,transparent)}
body .au-shop>[data-catalog]{grid-column:2;grid-row:1;min-width:0}
body .au-facet-body{overflow:auto;overscroll-behavior:contain;flex:1}
body .au-facets details{border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);padding:2px 0}
body .au-facets summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;min-height:44px;font-size:13px;font-weight:700;list-style:none}
body .au-facets summary::-webkit-details-marker{display:none}
body .au-facets summary::after{content:"+";font-size:18px;font-weight:400}body .au-facets details[open]>summary::after{content:"\\2212"}
body .au-facets fieldset{min-width:0;padding:0;border:0;margin:0;position:relative}body .au-facets fieldset[hidden]{display:none!important}
body .au-facet-options{max-height:240px;overflow:auto;overscroll-behavior:contain;padding-bottom:10px}
body .au-facet-options label{display:flex;align-items:center;gap:10px;min-height:34px;font-size:13px;cursor:pointer;overflow-wrap:anywhere}
body .au-facet-options label[hidden]{display:none!important}
body .au-facet-options input{width:16px;height:16px;flex:0 0 16px;accent-color:var(--accent,currentColor);margin:0}
body .au-facet-options small{margin-left:auto;opacity:.6;font-variant-numeric:tabular-nums}
body .au-facet-active{display:flex;flex-wrap:wrap;gap:6px;padding:12px 0 4px}body .au-facet-active:empty{display:none}
body .au-facets button,body .au-facet-bar button{font:inherit;font-size:13px;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:var(--radius,8px);padding:7px 12px;cursor:pointer;min-height:44px;text-transform:none}
body .au-facet-bar button{display:inline-flex;align-items:center;gap:8px}
body .au-facet-active button{min-height:32px;padding:4px 10px;font-size:12px}
body .au-facets button:disabled{opacity:.45;cursor:default}
body .au-facets [data-facet-done]{display:none;background:var(--accent,currentColor);color:var(--accent-ink,Canvas);border-color:transparent}
body .au-facet-bottom{display:flex;align-items:center;gap:10px;padding-top:14px;font-size:13px}body .au-facet-bottom [data-facet-results]{margin-right:auto}
body .au-facet-bar [data-facet-bar-tally]:not(:empty)::before{content:" (";white-space:pre}body .au-facet-bar [data-facet-bar-tally]:not(:empty)::after{content:")"}
body .au-facets :focus-visible,body .au-facet-bar :focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media(max-width:860px){
body .au-shop{display:block;width:min(1280px,100% - 28px);margin:14px auto}
body .au-facet-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:20;padding:10px 0;margin-bottom:12px;font-size:13px;background:var(--au-facet-bg,var(--paper,Canvas));border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}
body .au-facet-bar[hidden]{display:none}
body .au-facet-backdrop{display:block;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45)}body .au-facet-backdrop[hidden]{display:none}
body .au-facets{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:10001;max-height:88dvh;display:none;padding:0 18px 14px;border:0;border-radius:var(--radius,14px) var(--radius,14px) 0 0;background:var(--au-facet-bg,var(--paper,Canvas));box-shadow:0 -10px 30px rgba(0,0,0,.25)}
body .au-facets[data-open]{display:flex}
body .au-facet-head [data-facet-close]{display:inline-block;margin-left:auto}
body .au-facet-options label{min-height:44px}
body .au-facets [data-facet-done]{display:inline-block;flex:1}
body .au-facet-bottom [data-facet-results]{display:none}
}
@media(prefers-reduced-motion:no-preference){body .au-facets[data-open]{animation:au-facet-in .22s ease-out}}
@keyframes au-facet-in{from{transform:translateY(24px);opacity:0}}
`;
