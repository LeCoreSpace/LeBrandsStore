import {escapeHtml as esc} from "./layout.js";
import {mediaSize} from "./billing-usage.js";
export function renderCapacity(capacity,storeId,{staff=false,owner=true,newProduct=false,product}={}){
 if(!capacity?.enabled)return "";
 const keys=staff?["staff"]:["products","skus","storage"];
 const labels={products:"Products",skus:"SKUs",storage:"Media storage",staff:"Staff seats"};
 const projection=product!==undefined?` data-product-capacity="${esc(JSON.stringify({used:capacity.used,limits:capacity.limits,newProduct,initialSkus:Math.max(1,product.variants?.length||0)}))}"`:"";
 return `<section class="lb-capacity" aria-label="Plan capacity"${projection}><div class="lb-capacity-heading"><div><h2>Your plan capacity</h2><p>${staff?"Owners do not use a seat. Pending invitations reserve a seat.":"Drafts and items currently live count. A product without variants uses one SKU. Uploaded files count even when they are not used on a page."}</p></div>${owner?`<a class="lb-inline-link" href="/stores/${encodeURIComponent(storeId)}/billing">View plans</a>`:"<span>Contact your store owner for a larger allowance.</span>"}</div><div class="lb-capacity-grid">${keys.map(key=>{
  const used=capacity.used[key],limit=capacity.limits[key],fmt=key==="storage"?mediaSize:n=>Number(n).toLocaleString("en-IN");
  return `<div class="lb-capacity-item" data-capacity-state="${limit==null?"unknown":used>=limit?"full":"available"}"><span>${labels[key]}</span><strong>${esc(fmt(used))}${limit==null?" used":` / ${esc(fmt(limit))}`}</strong>${limit==null?"<small>Allowance needs confirmation</small>":`<progress aria-label="${esc(labels[key])} used" value="${Math.min(used,Math.max(1,limit))}" max="${Math.max(1,limit)}"></progress><small>${used>limit?"Above allowance. Existing records are kept.":used===limit?"Allowance reached":`${esc(fmt(limit-used))} available`}</small>`}${key==="staff"?`<small>${esc(capacity.used.staff_active)} active · ${esc(capacity.used.staff_pending)} pending</small>`:""}</div>`;
 }).join("")}</div>${projection?'<p class="lb-capacity-estimate" aria-live="polite" data-capacity-estimate></p>':""}<p class="lb-capacity-error" role="alert" data-capacity-error hidden></p></section>`;
}
