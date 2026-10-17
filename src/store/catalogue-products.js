import {validateCatalogue,validateVariants} from "../public/catalogue-model.js";
import {badInput} from "./input.js";
import {resolveClassification,writeClassification} from "./catalogue-classification.js";

export async function catalogueFormsEnabled(tx){
  const [row]=await tx`SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='catalogue') AS enabled`;
  return row?.enabled===true;
}
export async function saveProductCatalogue(tx,storeId,productId,patch,existing,tokenHash){
  if(patch.catalogue===undefined&&patch.variants===undefined&&patch.collection_ids===undefined&&patch.classification===undefined)return;
  if(patch.catalogue!==undefined||patch.variants!==undefined||patch.classification!==undefined){
    if(!await catalogueFormsEnabled(tx))throw Object.assign(new Error("Apply the catalogue forms database update before saving variants or catalogue details."),{status:409});
    let catalogue=validateCatalogue(patch.catalogue??existing?.catalogue??{});
    let classification=patch.classification;
    if(classification===undefined&&existing?.product_type_id){
      const [row]=await tx`SELECT public.catalogue_product_selection(${storeId},${productId})::text AS selection_json`;
      classification=typeof row?.selection_json==="string"?JSON.parse(row.selection_json):row?.selection_json;
    }
    if(classification!==undefined){
      const resolved=await resolveClassification(tx,storeId,productId,classification,catalogue);
      catalogue=resolved.catalogue;classification=resolved.selection;
      await writeClassification(tx,storeId,productId,tokenHash,classification,"prepare");
    }
    const saved=await tx`SELECT * FROM public.product_options WHERE store_id=${storeId} AND product_id=${productId} ORDER BY sort_order,id FOR UPDATE`;
    if(patch.variants===undefined&&JSON.stringify(catalogue.axes)!==JSON.stringify(existing?.catalogue?.axes||[]))throw badInput("Generate and save the variants together.");
    if(patch.variants!==undefined){
      const variants=validateVariants(patch.variants,catalogue),ids=new Set();
      for(const row of variants){
        if(!row.id)continue;
        const old=saved.find(v=>v.id===row.id);
        if(!old)throw badInput("Choose variants belonging to this product.");
        if(row.expected_stock===undefined||row.expected_stock!==old.stock)throw Object.assign(new Error("Variant stock changed in another window or order. Reload before saving."),{status:409});
        if(JSON.stringify(old.attributes?.length?old.attributes:[old.value])!==JSON.stringify(row.values))throw badInput("A saved variant cannot be reassigned to a different combination.");
        ids.add(row.id);
      }
      for(const old of saved){
        if(ids.has(old.id))continue;
        const [used]=await tx`SELECT id FROM public.order_items WHERE store_id=${storeId} AND product_option_id=${old.id} LIMIT 1`;
        if(used)throw badInput("A variant with order history cannot be removed. Keep it with zero stock instead.");
        await tx`DELETE FROM public.product_options WHERE store_id=${storeId} AND product_id=${productId} AND id=${old.id}`;
      }
      // Temporarily release this product's old SKUs so legitimate row renames/swaps work.
      await tx`UPDATE public.product_options SET sku=NULL WHERE store_id=${storeId} AND product_id=${productId}`;
      for(const [index,row] of variants.entries()){
        const [duplicate]=await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND lower(sku)=lower(${row.sku})
          UNION ALL SELECT id FROM public.product_options WHERE store_id=${storeId} AND lower(sku)=lower(${row.sku}) LIMIT 1`;
        if(duplicate)throw badInput(`SKU ${row.sku} is already used in this store.`);
        const name=catalogue.axes.map(a=>a.name).join(" / "),value=row.values.join(" / ");
        if(row.id)await tx`UPDATE public.product_options SET name=${name},value=${value},sku=${row.sku},
          attributes=${tx.json(row.values)},stock=${row.stock},price_paise=${row.price_paise},sort_order=${index},updated_at=now()
          WHERE store_id=${storeId} AND product_id=${productId} AND id=${row.id}`;
        else await tx`INSERT INTO public.product_options(id,store_id,product_id,name,value,sku,attributes,stock,price_paise,sort_order)
          VALUES(${crypto.randomUUID()},${storeId},${productId},${name},${value},${row.sku},${tx.json(row.values)},${row.stock},${row.price_paise},${index})`;
      }
      if(variants.length)await tx`UPDATE public.products SET stock=${variants.reduce((sum,row)=>sum+row.stock,0)},track_inventory=true WHERE store_id=${storeId} AND id=${productId}`;
    }
    await tx`UPDATE public.products SET catalogue=${tx.json(catalogue)},updated_at=now() WHERE store_id=${storeId} AND id=${productId}`;
    if(classification!==undefined)await writeClassification(tx,storeId,productId,tokenHash,classification,classification.clear?"clear":"save");
  }
  if(patch.collection_ids!==undefined){
    const owned=await tx`SELECT id FROM public.collections WHERE store_id=${storeId}
      AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(patch.collection_ids)}) x(value))`;
    if(owned.length!==patch.collection_ids.length)throw badInput("Choose collections belonging to this store.");
    const previous=await tx`SELECT collection_id FROM public.collection_products WHERE store_id=${storeId} AND product_id=${productId}`;
    await tx`DELETE FROM public.collection_products WHERE store_id=${storeId} AND product_id=${productId}
      AND collection_id NOT IN(SELECT value::uuid FROM jsonb_array_elements_text(${tx.json(patch.collection_ids)}) x(value))`;
    for(const collectionId of patch.collection_ids.filter(id=>!previous.some(row=>row.collection_id===id)))await tx`INSERT INTO public.collection_products(store_id,collection_id,product_id,sort_order)
      SELECT ${storeId}::uuid,${collectionId}::uuid,${productId}::uuid,COALESCE(max(sort_order),-1)+1
      FROM public.collection_products WHERE store_id=${storeId} AND collection_id=${collectionId}`;
  }
}
