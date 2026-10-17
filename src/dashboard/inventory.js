import {commerceError} from "../public/commerce-rules.js";
import {UUID} from "../public/validation.js";
import {audit} from "./repository.js";
import {updateAggregateStock} from "../checkout/sku-inventory.js";

export const MAX_INVENTORY_STOCK=2147483647;
export const INVENTORY_PAGE_SIZE=50;
export const LOW_STOCK_THRESHOLD=5;
export const inventoryCanEdit=role=>["owner","admin","editor"].includes(role);
const fail=(message,status=400)=>{throw commerceError(message,undefined,status);};
export function inventoryFilters(params){
  const search=(params.get("search")||"").trim(),availability=params.get("availability")||"all",status=params.get("status")||"all",page=params.get("page")||"1";
  if(search.length>120||/[\u0000-\u001f\u007f]/.test(search))fail("Search using up to 120 characters.");
  if(!["all","in_stock","low","out","untracked"].includes(availability)||!["all","active","draft"].includes(status))fail("Choose a valid inventory filter.");
  if(!/^[1-9]\d{0,5}$/.test(page))fail("Choose a valid inventory page.");
  return{search,availability,status,page:Number(page)};
}
export function inventoryInput(body){
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["reason","items"].includes(k)))fail("Use the inventory update form.");
  const reason=typeof body.reason==="string"?body.reason.trim():"";
  if(reason.length<3||reason.length>200||/[\u0000-\u001f\u007f]/.test(reason))fail("Add a stock adjustment reason of 3 to 200 characters.");
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)fail("Update between 1 and 100 SKU rows at once.");
  const seen=new Set();
  const items=body.items.map(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).some(k=>!["product_id","product_option_id","expected_stock","expected_revision","stock"].includes(k))||
      !UUID.test(item.product_id||"")||(item.product_option_id!=null&&!UUID.test(item.product_option_id)))fail("Choose saved products and SKU rows.");
    for(const key of ["expected_stock","stock"])if(!Number.isSafeInteger(item[key])||item[key]<0||item[key]>MAX_INVENTORY_STOCK)fail("Use whole stock quantities between 0 and 2,147,483,647.");
    if(typeof item.expected_revision!=="string"||!Number.isFinite(Date.parse(item.expected_revision))||item.expected_revision.length>64||
      !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(item.expected_revision))fail("Reload the current SKU revisions before saving.");
    const product_id=item.product_id.toLowerCase(),product_option_id=item.product_option_id?.toLowerCase()||null,key=`${product_id}:${product_option_id||"base"}`;
    if(seen.has(key))fail("Choose each SKU row only once.");
    seen.add(key);
    return{key,product_id,product_option_id,stock:item.stock,expected_stock:item.expected_stock,expected_revision:item.expected_revision};
  });
  return{reason,items};
}

// This CTE and filter fragments are server-owned constants; user values are
// always passed as parameters. No native PG array boundary is needed.
const inventoryCTE=`WITH inventory AS (
 SELECT p.id AS product_id,v.id AS product_option_id,p.title,p.status,p.slug,
   COALESCE(v.sku,p.sku,'') AS sku,
   CASE WHEN v.id IS NOT NULL THEN v.stock WHEN p.track_inventory THEN p.stock ELSE NULL END AS stock,
   (v.id IS NOT NULL OR p.track_inventory) AS track_inventory,
   COALESCE(v.price_paise,p.price_paise) AS price_paise,
   CASE WHEN v.id IS NOT NULL THEN v.updated_at::text ELSE p.updated_at::text END AS revision,
   CASE WHEN v.id IS NULL THEN '[]'::jsonb
     WHEN jsonb_array_length(CASE WHEN jsonb_typeof(p.catalogue->'axes')='array' THEN p.catalogue->'axes' ELSE '[]'::jsonb END)=0
       THEN jsonb_build_array(jsonb_build_object('name',v.name,'value',v.value))
     ELSE (SELECT jsonb_agg(jsonb_build_object('name',a.axis->>'name','value',v.attributes->>((a.n-1)::integer)) ORDER BY a.n)
       FROM jsonb_array_elements(p.catalogue->'axes') WITH ORDINALITY a(axis,n)) END AS option_values,
   COALESCE(v.sort_order,0) AS sort_order
 FROM public.products p LEFT JOIN public.product_options v ON v.store_id=p.store_id AND v.product_id=p.id
 WHERE p.store_id=$1::uuid AND p.status<>'archived'
)`;
function inventoryRow(row,storeId){
  return{...row,key:`${row.product_id}:${row.product_option_id||"base"}`,
    stock:row.stock==null?null:Number(row.stock),price_paise:Number(row.price_paise),
    product_url:`/stores/${storeId}/products/${row.product_id}`,option_values:row.option_values||[]};
}
export async function listInventory(tx,storeId,filters,role){
  const where=`WHERE ($2='' OR position(lower($2) in lower(title))>0 OR position(lower($2) in lower(sku))>0 OR position(lower($2) in lower(option_values::text))>0)
    AND ($3='all' OR status=$3)
    AND ($4='all' OR $4='in_stock' AND stock>0 OR $4='low' AND stock BETWEEN 1 AND ${LOW_STOCK_THRESHOLD}
      OR $4='out' AND stock=0 OR $4='untracked' AND NOT track_inventory)`;
  const params=[storeId,filters.search,filters.status,filters.availability];
  const [count]=await tx.unsafe(`${inventoryCTE} SELECT count(*)::integer AS total FROM inventory ${where}`,params);
  const rows=await tx.unsafe(`${inventoryCTE} SELECT * FROM inventory ${where} ORDER BY lower(title),product_id,sort_order,product_option_id
    LIMIT $5::integer OFFSET $6::integer`,[...params,INVENTORY_PAGE_SIZE,(filters.page-1)*INVENTORY_PAGE_SIZE]);
  const [summary]=await tx.unsafe(`${inventoryCTE} SELECT count(*) FILTER(WHERE track_inventory)::integer AS tracked_skus,
    count(*) FILTER(WHERE stock>0)::integer AS in_stock_skus,
    count(*) FILTER(WHERE stock BETWEEN 1 AND ${LOW_STOCK_THRESHOLD})::integer AS low_stock_skus,
    count(*) FILTER(WHERE stock=0)::integer AS out_of_stock_skus,
    count(*) FILTER(WHERE NOT track_inventory)::integer AS untracked_skus FROM inventory`,[storeId]);
  return{store_id:storeId,rows:rows.map(r=>inventoryRow(r,storeId)),page:filters.page,page_size:INVENTORY_PAGE_SIZE,total:count.total,
    summary,low_stock_threshold:LOW_STOCK_THRESHOLD,can_edit:inventoryCanEdit(role)};
}
export async function bulkInventory(tx,storeId,actorId,body){
  const {reason,items}=inventoryInput(body);
  // Same lock order as checkout/catalogue writes: store, parents, then SKUs.
  await tx`SELECT store_id FROM public.stores WHERE store_id=${storeId} FOR UPDATE`;
  const productIds=[...new Set(items.map(i=>i.product_id))].sort(),optionIds=items.map(i=>i.product_option_id).filter(Boolean).sort();
  const products=await tx`SELECT p.id,p.stock,p.track_inventory,p.status,p.updated_at::text AS revision,
    (SELECT count(*)::integer FROM public.product_options v WHERE v.store_id=p.store_id AND v.product_id=p.id) AS variant_count
    FROM public.products p WHERE p.store_id=${storeId}
      AND p.id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(productIds)}::jsonb))
    ORDER BY p.id FOR UPDATE`;
  const options=optionIds.length?await tx`SELECT id,product_id,stock,updated_at::text AS revision FROM public.product_options
    WHERE store_id=${storeId} AND product_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(productIds)}::jsonb))
      AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(optionIds)}::jsonb))
    ORDER BY product_id,id FOR UPDATE`:[];
  for(const item of items){
    const product=products.find(p=>p.id===item.product_id);
    const row=item.product_option_id?options.find(v=>v.id===item.product_option_id&&v.product_id===item.product_id):product;
    if(!product||product.status==="archived"||!row)fail("A selected SKU is no longer available in this store. Reload inventory.",404);
    if(!item.product_option_id&&product.variant_count)fail("Update the individual variant quantities, not the product total.",409);
    if(!item.product_option_id&&!product.track_inventory)fail("Stock tracking is disabled for this product. Enable it in the product form first.",409);
    if(Number(row.stock)!==item.expected_stock||row.revision!==item.expected_revision)fail("Stock changed since you loaded inventory. No changes were saved. Reload quantities and review your update.",409);
  }
  const changed=items.filter(i=>i.stock!==i.expected_stock);
  if(!changed.length)return{updated:0,rows:[]};
  const variantProducts=[...new Set(changed.filter(i=>i.product_option_id).map(i=>i.product_id))].sort();
  for(const productId of variantProducts){
    const [total]=await tx`SELECT COALESCE(sum(stock),0)::text AS stock FROM public.product_options WHERE store_id=${storeId} AND product_id=${productId}`;
    const next=changed.filter(i=>i.product_id===productId).reduce((n,i)=>n+BigInt(i.stock)-BigInt(i.expected_stock),BigInt(total.stock));
    if(next>BigInt(MAX_INVENTORY_STOCK)||next<0n)fail("The combined variant stock for a product must not exceed 2,147,483,647.");
  }
  for(const item of changed){
    const updated=item.product_option_id?await tx`UPDATE public.product_options SET stock=${item.stock}
      WHERE store_id=${storeId} AND product_id=${item.product_id} AND id=${item.product_option_id}
        AND stock=${item.expected_stock} AND updated_at=${item.expected_revision}::timestamptz RETURNING id`:
      await tx`UPDATE public.products SET stock=${item.stock} WHERE store_id=${storeId} AND id=${item.product_id}
        AND stock=${item.expected_stock} AND updated_at=${item.expected_revision}::timestamptz RETURNING id`;
    if(!updated.length)fail("Stock changed while saving. No changes were saved. Reload inventory.",409);
  }
  for(const productId of variantProducts)await updateAggregateStock(tx,storeId,productId);
  // Preserve all published metadata, prices and draft boundaries; stock only.
  await syncInventoryPublication(tx,storeId,[...new Set(changed.map(i=>i.product_id))].sort());
  await audit(tx,storeId,actorId,"inventory.bulk_adjusted","store",storeId,{reason,items:changed.map(i=>({
    product_id:i.product_id,product_option_id:i.product_option_id,before:i.expected_stock,after:i.stock,
  }))});
  const rows=await tx.unsafe(`${inventoryCTE} SELECT * FROM inventory
    WHERE EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) selected(product_id uuid,product_option_id uuid)
      WHERE inventory.product_id=selected.product_id AND inventory.product_option_id IS NOT DISTINCT FROM selected.product_option_id)
    ORDER BY product_id,sort_order`,[storeId,JSON.stringify(changed.map(i=>({product_id:i.product_id,product_option_id:i.product_option_id})))]);
  const keys=new Set(changed.map(i=>i.key));
  return{updated:changed.length,rows:rows.map(r=>inventoryRow(r,storeId)).filter(r=>keys.has(r.key))};
}
export async function syncInventoryPublication(tx,storeId,productIds){
  const [publication]=await tx`SELECT p.snapshot FROM public.store_publications p JOIN public.stores s ON s.store_id=p.store_id
    WHERE p.store_id=${storeId} AND s.status='live' FOR UPDATE OF p`;
  if(!publication)return;
  const products=await tx`SELECT id,stock,track_inventory FROM public.products WHERE store_id=${storeId}
    AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(productIds)}::jsonb))`;
  const options=await tx`SELECT id,product_id,stock FROM public.product_options WHERE store_id=${storeId}
    AND product_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(productIds)}::jsonb))`;
  const current=new Map(products.map(p=>[p.id,p])),stock=new Map(options.map(v=>[v.id,v]));
  const published=(publication.snapshot.products||[]).map(previous=>{
    const product=current.get(previous.id);
    if(!product)return previous;
    const variants=Array.isArray(previous.variants)?previous.variants.map(v=>({...v,stock:stock.get(v.id)?.stock??0})):null;
    // Private, not-yet-published SKUs must not inflate the live product total.
    const publishedStock=variants?.length?variants.reduce((n,v)=>n+Number(v.stock),0):product.track_inventory?Number(product.stock):null;
    return{...previous,stock:publishedStock,...(variants?{variants}:{})};
  });
  await tx`UPDATE public.store_publications SET snapshot=${tx.json({...publication.snapshot,products:published})} WHERE store_id=${storeId}`;
}
