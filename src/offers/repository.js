import {commerceError} from "../public/commerce-rules.js";
import {offerInput,offerStatus,applyBestOffer} from "./rules.js";
export async function offersEnabled(tx){
  const [row]=await tx`SELECT to_regprocedure('public.store_offer_save(uuid,text,jsonb)') IS NOT NULL AS enabled`;
  return row?.enabled===true;
}
export async function readOffers(tx,id,{checkout=false,code=""}={}){
  const rows=checkout?await tx`SELECT o.*,c.code,
    (SELECT count(*)::int FROM public.offer_redemptions r WHERE r.store_id=o.store_id AND r.offer_id=o.id AND r.state<>'released') AS used_count,
    COALESCE((SELECT jsonb_agg(coalesce(t.product_id,t.collection_id)) FROM public.offer_targets t
      WHERE t.store_id=o.store_id AND t.offer_id=o.id AND NOT t.excluded),'[]'::jsonb) AS target_ids
    FROM public.offers o LEFT JOIN public.offer_codes c ON c.store_id=o.store_id AND c.offer_id=o.id AND c.active
    WHERE o.store_id=${id} AND o.status='active' AND (o.method='automatic' OR c.code=${code}) ORDER BY o.id`:
    await tx`SELECT o.*,c.code,
    (SELECT count(*)::int FROM public.offer_redemptions r WHERE r.store_id=o.store_id AND r.offer_id=o.id AND r.state<>'released') AS used_count,
    COALESCE((SELECT jsonb_agg(coalesce(t.product_id,t.collection_id)) FROM public.offer_targets t
      WHERE t.store_id=o.store_id AND t.offer_id=o.id AND NOT t.excluded),'[]'::jsonb) AS target_ids
    FROM public.offers o LEFT JOIN public.offer_codes c ON c.store_id=o.store_id AND c.offer_id=o.id AND c.active
    WHERE o.store_id=${id} ORDER BY o.created_at DESC,o.id LIMIT 500`;
  return rows.map(row=>({...row,value:Number(row.value),min_spend_paise:Number(row.min_spend_paise),
    max_discount_paise:row.max_discount_paise==null?null:Number(row.max_discount_paise),
    target_ids:typeof row.target_ids==="string"?JSON.parse(row.target_ids):row.target_ids,
    display_status:offerStatus(row)}));
}
export async function discountedQuote(tx,id,quote,snapshot,options={}){
  if(!await offersEnabled(tx)){
    if(options.code)throw commerceError("Offer codes are not available at this store yet.");
    return{...quote,discount_paise:0,offer:null,offers_available:false};
  }
  return applyBestOffer(quote,await readOffers(tx,id,{checkout:true,code:options.code}),snapshot,options);
}
export async function offerDashboard(tx,id){
  const [store]=await tx`SELECT store_id,name,subdomain,status,currency FROM public.stores WHERE store_id=${id}`;
  const available=await offersEnabled(tx);
  const products=await tx`SELECT id,title FROM public.products WHERE store_id=${id} AND status<>'archived' ORDER BY title LIMIT 2000`;
  const collections=await tx`SELECT id,title FROM public.collections WHERE store_id=${id} ORDER BY title LIMIT 2000`;
  return{store,offers:{available,items:available?await readOffers(tx,id):[],products,collections,currency:store.currency}};
}
export async function saveOffer(tx,id,token,body){
  if(!await offersEnabled(tx))throw commerceError("Apply the store offers database update before saving.",undefined,409);
  const input=offerInput(body);
  try{
    const [row]=await tx`SELECT public.store_offer_save(${id},${token},${JSON.stringify(input)}::text::jsonb) AS id`;
    return row.id;
  }catch(error){
    if(error.code==="40001")throw commerceError("This offer changed. Reload it before saving again.",undefined,409);
    if(error.code==="23505")throw commerceError("That code is already reserved by another offer.",{code:"Choose another code."},409);
    if(["22023","23514","23503"].includes(error.code))throw commerceError("Check the offer values and choose targets from this store.",undefined,400);
    throw error;
  }
}
export async function recordOffer(tx,id,orderId,customerId,quote,online){
  if(!quote.offer)return;
  const offer=quote.offer;
  // Store row is already locked by checkout; management takes the same lock.
  const [row]=await tx`SELECT usage_limit FROM public.offers WHERE store_id=${id} AND id=${offer.id}`;
  const [usage]=await tx`SELECT count(*)::int AS count FROM public.offer_redemptions
    WHERE store_id=${id} AND offer_id=${offer.id} AND state<>'released'`;
  if(row.usage_limit!=null&&usage.count>=row.usage_limit)
    throw commerceError("This offer has reached its usage limit. Review your bag.",undefined,409);
  await tx`INSERT INTO public.offer_redemptions(store_id,offer_id,order_id,customer_id,state,amount_paise)
    VALUES(${id},${offer.id},${orderId},${customerId},${online?"held":"committed"},${offer.amount_paise})`;
  const [saved]=await tx`INSERT INTO public.order_discounts(store_id,order_id,offer_id,amount_paise,snapshot)
    VALUES(${id},${orderId},${offer.id},${offer.amount_paise},${JSON.stringify(offer)}::text::jsonb) RETURNING id`;
  const items=await tx`SELECT id,product_id,product_option_id FROM public.order_items WHERE store_id=${id} AND order_id=${orderId}`;
  for(const line of quote.items.filter(l=>l.discount_paise>0)){
    const item=items.find(i=>i.product_id===line.product_id&&(i.product_option_id||null)===(line.product_option_id||null));
    await tx`INSERT INTO public.order_item_discounts(store_id,order_discount_id,order_item_id,amount_paise)
      VALUES(${id},${saved.id},${item.id},${line.discount_paise})`;
  }
}
