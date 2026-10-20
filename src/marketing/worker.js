import{createDb}from"../db.js";
import{marketingAvailable,readMarketing,metaToken}from"./service.js";
import{purchasePayload}from"./rules.js";
import{sendMetaEvent}from"./meta.js";
export async function processMarketingStore(db,id,env,fetcher=fetch){
  const jobs=await db.withStore(id,async tx=>{
    await tx`UPDATE public.orders SET tracking_user_data=NULL,fbp=NULL,fbc=NULL,client_ip=NULL,user_agent=NULL
      WHERE store_id=${id} AND created_at<now()-interval '7 days'
        AND (tracking_user_data IS NOT NULL OR client_ip IS NOT NULL OR fbp IS NOT NULL OR fbc IS NOT NULL OR user_agent IS NOT NULL)`;
    await tx`DELETE FROM public.store_marketing_consents WHERE store_id=${id} AND updated_at<now()-interval '180 days'`;
    const rows=await tx`SELECT order_id,attempts FROM public.store_marketing_jobs
      WHERE store_id=${id} AND ((status='pending' AND next_attempt_at<=now()) OR (status='sending' AND lease_until<now()))
      ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED`;
    const claimed=[];
    for(const job of rows){const lease=crypto.randomUUID();
      await tx`UPDATE public.store_marketing_jobs SET status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_id=${lease}
        WHERE store_id=${id} AND order_id=${job.order_id}`;
      claimed.push({...job,lease,attempts:job.attempts+1});
    }return claimed;
  });
  for(const job of jobs){
    const finish=async status=>db.withStore(id,tx=>tx`UPDATE public.store_marketing_jobs SET status=${status},lease_until=NULL,lease_id=NULL,
      next_attempt_at=now()+${Math.min(60,2**job.attempts)}*interval '1 minute'
      WHERE store_id=${id} AND order_id=${job.order_id} AND lease_id=${job.lease}`);
    try{
      const data=await db.withStore(id,async tx=>{
        const config=await readMarketing(tx,id);
        const[o]=await tx`SELECT o.* FROM public.orders o JOIN public.stores s ON s.store_id=o.store_id
          JOIN public.store_marketing_consents c ON c.store_id=o.store_id AND c.visitor_id=o.tracking_consent_id
          WHERE o.store_id=${id} AND o.id=${job.order_id} AND s.status='live' AND c.ads
            AND c.revision=${config.revision} AND o.tracking_revision=c.revision AND c.updated_at>now()-interval '180 days'
            AND o.tracking_confirmed_at>now()-interval '24 hours' AND o.meta_capi_sent_at IS NULL
            AND public.marketing_purchase_eligible(${id},o.id)`;
        if(!o||!config.meta_enabled||!config.meta_capi_token_encrypted)return null;
        const items=await tx`SELECT tracking_product_id,product_id,to_jsonb(i)->>'product_option_id' AS product_option_id,title,quantity,total_paise,tax_paise,
          coalesce((to_jsonb(i)->>'discount_paise')::bigint,0) AS discount_paise
          FROM public.order_items i WHERE store_id=${id} AND order_id=${o.id} ORDER BY created_at,id`;
        return{config,order:o,items};
      });
      if(!data){await finish("cancelled");continue;}
      const{config,order,items}=data,payload=purchasePayload(order,items);
      await sendMetaEvent(config.meta_pixel_id,await metaToken(config,env),{
        event_name:"Purchase",event_id:order.tracking_event_id,event_time:Math.floor(new Date(order.tracking_confirmed_at).getTime()/1000),
        action_source:"website",event_source_url:order.tracking_source_url,
        user_data:{...order.tracking_user_data?.meta,...(order.fbp?{fbp:order.fbp}:{}),...(order.fbc?{fbc:order.fbc}:{}),
          ...(order.client_ip?{client_ip_address:order.client_ip}:{}),...(order.user_agent?{client_user_agent:order.user_agent}:{})},
        custom_data:{currency:"INR",value:payload.value,content_type:"product",content_ids:payload.items.map(i=>i.item_id),
          contents:payload.items.map(i=>({id:i.item_id,quantity:i.quantity})),num_items:payload.items.reduce((n,i)=>n+i.quantity,0),order_id:order.order_number}
      },config.meta_test_event_code,fetcher);
      await db.withStore(id,async tx=>{
        const[owned]=await tx`SELECT 1 AS ok FROM public.store_marketing_jobs WHERE store_id=${id} AND order_id=${job.order_id} AND lease_id=${job.lease} FOR UPDATE`;
        if(!owned)return;
        await tx`UPDATE public.orders SET meta_capi_sent_at=now() WHERE store_id=${id} AND id=${job.order_id} AND meta_capi_sent_at IS NULL`;
        await tx`UPDATE public.store_marketing_jobs SET status='sent',lease_until=NULL,lease_id=NULL WHERE store_id=${id} AND order_id=${job.order_id}`;
      });
    }catch{console.error("Marketing delivery deferred",{code:"META_EVENT_RETRY"});await finish(job.attempts>=8?"failed":"pending");}
  }
}
export async function scheduleMarketing(env){
  const db=createDb(env);
  try{
    if(!await db.account(marketingAvailable))return;
    const stores=await db.account(tx=>tx`SELECT store_id FROM public.list_marketing_work()`);
    for(const s of stores)await processMarketingStore(db,s.store_id,env);
  }catch{console.error("Marketing delivery unavailable",{code:"MARKETING_WORKER_UNAVAILABLE"});}
  finally{await db.close();}
}
