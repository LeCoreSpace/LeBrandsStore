// Publication owns catalogue metadata. Only availability is refreshed here.
export function mergeAvailability(products,inventory){
  const current=new Map(inventory.map(row=>[row.id,row]));
  return products.map(product=>{
    const row=current.get(product.id);
    const skuRows=Array.isArray(row?.sku_stock)?row.sku_stock:JSON.parse(row?.sku_stock||"[]");
    const stock=new Map(skuRows.map(item=>[item.id,item.stock]));
    const variants=(product.variants||[]).map(variant=>({...variant,stock:stock.has(variant.id)?stock.get(variant.id):0}));
    return {...product,stock:variants.length
      ?variants.some(v=>v.stock==null)?null:variants.reduce((total,v)=>total+Number(v.stock||0),0)
      :row?row.stock:0,...(product.variants?{variants}:{})};
  });
}

export async function liveAvailability(tx,storeId,products=[]){
  if(!products.length)return products;
  const ids=JSON.stringify(products.map(product=>product.id));
  const rows=await tx`
    SELECT p.id,CASE WHEN p.track_inventory THEN p.stock ELSE NULL END AS stock,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'stock',v.stock))
        FROM public.product_options v WHERE v.store_id=p.store_id AND v.product_id=p.id),'[]'::jsonb) AS sku_stock
    FROM public.products p
    JOIN jsonb_array_elements_text(${ids}::text::jsonb) AS wanted(id) ON p.id=wanted.id::uuid
    WHERE p.store_id=${storeId}
  `;
  return mergeAvailability(products,rows);
}
