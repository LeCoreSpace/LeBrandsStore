import {filterFacts,buildFacetGroups} from "./collection-filters.js";
import {productFilterProjection} from "./product-details.js";
import {productHref} from "./commerce-options.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function collectionFilterPanel(products){
 const records=products.map(p=>({href:productHref(p),facts:filterFacts({...p,product_filters:productFilterProjection(p)})}));
 const groups=buildFacetGroups(records.map(r=>r.facts));
 if(!groups.length)return "";
 const config=JSON.stringify({records:records.map(r=>({href:r.href,facts:{groups:r.facts.groups,combinations:r.facts.combinations}})),groups});
 return `<section class="au-facets" data-catalog-facets="${esc(config)}" hidden aria-label="Product filters"><details open><summary><strong>Filter products</strong><span data-facet-tally></span></summary><div class="au-facet-groups">${groups.map((group,index)=>`<fieldset data-facet-field="${esc(group.key)}"><legend>${esc(group.label)}</legend><div class="au-facet-options">${group.values.map((v,n)=>`<label><input type="checkbox" data-facet-group="${esc(group.key)}" value="${esc(v.value)}"><span>${esc(v.label)}</span><small data-facet-count></small></label>`).join("")}</div></fieldset>`).join("")}</div></details><div class="au-facet-active" data-facet-active aria-label="Selected filters"></div><div class="au-facet-bottom"><span data-facet-results role="status"></span><button type="button" data-facet-clear>Clear filters</button></div></section>`;
}
export function addCollectionFilters(body,products){
 const panel=collectionFilterPanel(products);
 return panel?body.replace(/<(?:div|section)\b[^>]*\sdata-catalog(?=[\s=>])[^>]*>/,match=>panel+match):body;
}
export const COLLECTION_FILTER_CSS=`
body [data-catalog]>.au-card[hidden]{display:none!important}
body .au-facets[hidden]{display:none!important}
body .au-facets{margin:22px auto;width:100%;box-sizing:border-box;padding:18px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:var(--radius,12px);color:inherit;font-family:inherit;text-transform:none;letter-spacing:normal}
body .au-facets summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;min-height:44px;font-size:15px;list-style:none}
body .au-facets summary::after{content:"+";font-size:22px}body .au-facets details[open]>summary::after{content:"−"}
body .au-facet-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:22px;margin:18px 0}
body .au-facets fieldset{min-width:0;padding:0;border:0;margin:0}body .au-facets legend{font-size:13px;font-weight:700;margin-bottom:10px;text-transform:none}
body .au-facet-options{max-height:220px;overflow:auto;overscroll-behavior:contain}
body .au-facet-options label{display:flex;align-items:center;gap:9px;min-height:36px;font-size:13px;font-weight:400;cursor:pointer;overflow-wrap:anywhere}
body .au-facet-options label[hidden],body .au-facets fieldset[hidden]{display:none!important}
body .au-facet-options input{width:16px;height:16px;flex:0 0 16px;accent-color:currentColor;margin:0}
body .au-facet-options small{margin-left:auto;opacity:.65;font-variant-numeric:tabular-nums}
body .au-facet-active{display:flex;flex-wrap:wrap;gap:8px}body .au-facet-active:empty{display:none}
body .au-facets button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--radius,8px);padding:8px 12px;cursor:pointer;min-height:40px;text-transform:none}
body .au-facet-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:12px;font-size:13px}
body .au-facets :focus-visible{outline:2px solid currentColor;outline-offset:3px}
@media(max-width:600px){body .au-facets{padding:12px}body .au-facet-groups{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}body .au-facet-options label{min-height:44px}body .au-facet-bottom{align-items:flex-start}}
@media(max-width:360px){body .au-facet-groups{grid-template-columns:1fr}}
`;
