export function projectedCapacity(state,variantCount){
 const count=Math.max(1,Number.isSafeInteger(variantCount)?variantCount:1);
 return {products:state.used.products+(state.newProduct?1:0),
  skus:Math.max(0,state.used.skus+(state.newProduct?count:count-state.initialSkus))};
}
export function mountPlanCapacity(root=document){
 const panel=root.querySelector("[data-product-capacity]");
 if(!panel)return;
 let state;
 try{state=JSON.parse(panel.dataset.productCapacity);}catch{return;}
 const estimate=panel.querySelector("[data-capacity-estimate]");
 const paint=count=>{
  const next=projectedCapacity(state,count),n=value=>Number(value).toLocaleString("en-IN");
  const over=["products","skus"].filter(key=>state.limits[key]!=null&&next[key]>state.limits[key]&&next[key]>state.used[key]);
  estimate.textContent=`Estimated after save: ${n(next.products)} products and ${n(next.skus)} SKUs.${over.length?` This would exceed your ${over.join(" and ")} allowance.`:""} Final checks run when you save.`;
  estimate.dataset.over=String(over.length>0);
 };
 paint(state.initialSkus);
 root.addEventListener("lebrands:capacity-variants",event=>paint(event.detail?.count));
}
export function showCapacityFailure(result,root=document){
 if(!result?.quota)return;
 const notice=root.querySelector("[data-capacity-error]");
 if(notice){notice.textContent=result.error;notice.hidden=false;notice.scrollIntoView?.({behavior:"smooth",block:"center"});}
}
