import {commerceError} from "../public/commerce-rules.js";
export async function requireSkuCheckout(tx){
  const [row]=await tx`SELECT to_regprocedure('public.sku_checkout_ready()') IS NOT NULL AS enabled`;
  if(!row?.enabled)throw commerceError("Apply the SKU checkout database update before publishing or buying variants.",undefined,409);
}
export async function updateAggregateStock(tx,storeId,productId){
  await tx`UPDATE public.products SET stock=(SELECT COALESCE(sum(v.stock),0)::integer FROM public.product_options v
    WHERE v.store_id=${storeId} AND v.product_id=${productId}),track_inventory=true
    WHERE store_id=${storeId} AND id=${productId}`;
}
export async function restoreSkuStock(tx,storeId,item){
  await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND id=${item.product_id} FOR UPDATE`;
  const [restored]=await tx`UPDATE public.product_options SET stock=stock+${item.quantity}
    WHERE store_id=${storeId} AND product_id=${item.product_id} AND id=${item.product_option_id} RETURNING id`;
  if(!restored)throw commerceError("The ordered SKU is missing; stock restoration could not complete.",undefined,409);
  await updateAggregateStock(tx,storeId,item.product_id);
}
