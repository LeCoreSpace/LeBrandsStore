const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderTodayStock(data,storeRoot){
  if(!data?.summary||!Array.isArray(data.rows))return '<p class="lb-muted">Stock warnings are unavailable. Choose Refresh to try again.</p>';
  const {low_stock_skus:low,out_of_stock_skus:out,tracked_skus:tracked}=data.summary;
  const inventory=`${storeRoot}/inventory`;
  const counts=`<div class="lb-action-list"><p><a href="${escape(inventory)}?availability=out"><strong>${Number(out)} sold-out ${out===1?"SKU":"SKUs"}</strong></a> · <a href="${escape(inventory)}?availability=low"><strong>${Number(low)} low-stock ${low===1?"SKU":"SKUs"}</strong></a></p></div>`;
  const rows=data.rows.map(row=>{
    const options=(row.option_values||[]).map(v=>`${v.name}: ${v.value}`).join(" · ");
    const href=`${inventory}?availability=${row.stock===0?"out":"low"}&search=${encodeURIComponent(row.sku||row.title)}`;
    return `<a class="lb-action-row" href="${escape(href)}"><span class="lb-action-mark"></span><span><strong>${escape(row.title)}</strong><small>${escape(row.sku)}${options?` · ${escape(options)}`:""}${row.status==="draft"?" · Draft":""}</small></span><span class="lb-status" data-status="${row.stock===0?"cancelled":"pending"}">${row.stock===0?"Sold out":`${Number(row.stock)} left`}</span></a>`;
  }).join("");
  const empty=!tracked?'<div class="lb-clear-state"><strong>No tracked SKUs yet</strong><p>Enable inventory tracking in your product forms to see stock warnings.</p></div>':'<div class="lb-clear-state"><strong>No stock warnings</strong><p>Your tracked SKUs are above the low-stock threshold.</p></div>';
  return`${counts}<div class="lb-action-list">${rows||empty}</div><div class="lb-action-list"><p class="lb-muted">Low stock: 1 to ${Number(data.low_stock_threshold)} units. Current active and draft inventory, independent of the sales date range.</p><a href="${escape(inventory)}">${low+out>data.rows.length?`View all ${Number(low+out)} stock warnings`:"Manage stock"}</a></div>`;
}
export function mountTodayStock(){
  const box=document.querySelector("[data-today-stock]"),app=document.querySelector(".lb-app");
  if(!box||!app)return;
  const api=app.dataset.apiRoot||`/api/stores/${encodeURIComponent(app.dataset.storeId)}`;
  const root=app.dataset.storeRoot||`/stores/${encodeURIComponent(app.dataset.storeId)}`;
  const content=box.querySelector("[data-stock-content]"),status=box.querySelector("[data-stock-status]"),button=box.querySelector("[data-stock-refresh]");
  let busy=false;
  async function refresh(){
    if(busy||document.visibilityState==="hidden")return;
    busy=true;button.disabled=true;status.hidden=false;status.textContent="Updating stock warnings…";
    try{
      const response=await fetch(`${api}/inventory/alerts`,{credentials:"same-origin",headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(!response.ok||!body.summary||!Array.isArray(body.rows)||!["tracked_skus","low_stock_skus","out_of_stock_skus"].every(key=>Number.isInteger(body.summary[key])&&body.summary[key]>=0))throw Error("Stock warnings unavailable");
      content.innerHTML=renderTodayStock(body,root);status.hidden=true;
    }catch{
      status.textContent="Could not refresh stock warnings. Showing the last loaded information. Choose Refresh to try again.";
    }finally{busy=false;button.disabled=false;}
  }
  button.addEventListener("click",refresh);
  window.addEventListener("focus",refresh);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh();});
  setInterval(refresh,60000);
  refresh();
}
