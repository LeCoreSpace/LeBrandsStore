import {createDb} from "../db.js";
import {loadDraft} from "../store/repository.js";
import {orderDetail} from "../dashboard/repository.js";
import {sendResend} from "./service.js";
import {platformDeliveryKey} from "./tokens.js";
import {renderEmail,maskRecipient} from "./templates.js";
export async function emailsEnabled(tx){
  const[row]=await tx`SELECT to_regprocedure('public.email_pending_stores()') IS NOT NULL AS enabled`;
  return row?.enabled===true;
}
export async function schedulePendingEmails(env){
  if(!env.AI_BUILD_QUEUE||!env.HYPERDRIVE)return;
  const db=createDb(env);
  try{
    if(!await db.account(emailsEnabled))return;
    const stores=await db.account(tx=>tx`SELECT public.email_pending_stores() AS id`);
    for(const store of stores)await env.AI_BUILD_QUEUE.send({type:"email",store_id:store.id});
    const pending=await db.account(tx=>tx`SELECT * FROM public.email_platform_pending()`);
    for(const row of pending)await env.AI_BUILD_QUEUE.send({type:"platform-email",id:row.id,delivery_key:await platformDeliveryKey(env,row.token_hash)});
  }finally{await db.close();}
}
export async function emailHistory(tx,storeId,orderId){
  if(!await emailsEnabled(tx))return [];
  const rows=await tx`SELECT id,recipient,template,status,attempts,error_code,provider_message_id,sent_at,created_at
    FROM public.email_log WHERE store_id=${storeId} AND order_id=${orderId} ORDER BY created_at`;
  return rows.map(({recipient,...row})=>({...row,recipient:maskRecipient(recipient)}));
}
const name=value=>String(value||"Your store").replace(/[\r\n<>"]/g,"").slice(0,120);
export async function processEmailMessage(body,env){
  if(!body||!["email","platform-email"].includes(body.type))throw new Error("Invalid email queue message");
  const db=createDb(env);
  try{
    if(body.type==="platform-email"){
      if(!/^[a-f0-9-]{36}$/i.test(body.id||"")||!/^[a-f0-9]{64}$/i.test(body.delivery_key||""))throw new Error("Invalid delivery capability");
      const[job]=await db.account(tx=>tx`SELECT public.email_claim_platform(${body.id},${body.delivery_key}) AS job`);
      if(!job?.job)return;
      let providerId=null;
      try{providerId=await sendResend(env,job.job.payload,`platform-${body.id}`);}
      finally{await db.account(tx=>tx`SELECT public.email_finish_platform(${body.id},${body.delivery_key},${providerId},${providerId?null:"provider_unavailable"})`);}
      if(!providerId)throw new Error("Retry email");
      return;
    }
    if(!/^[a-f0-9-]{36}$/i.test(body.store_id||""))throw new Error("Invalid store");
    const id=body.store_id;
    const job=await db.withStore(id,async tx=>{
      await tx`UPDATE public.email_log e SET status='failed',error_code='recipient_suppressed'
        WHERE e.store_id=${id} AND e.status IN('pending','sending') AND e.template NOT IN('new_order','invite')
        AND EXISTS(SELECT 1 FROM public.customers c WHERE c.store_id=e.store_id AND lower(c.email)=lower(e.recipient)
          AND(c.email_bounced_at IS NOT NULL OR c.email_complained_at IS NOT NULL))`;
      await tx`UPDATE public.email_log SET status='failed',error_code='delivery_unknown'
        WHERE store_id=${id} AND status IN('pending','sending') AND attempts>0 AND first_attempt_at<now()-interval '23 hours'`;
      const[row]=await tx`SELECT * FROM public.email_log WHERE store_id=${id} AND event_key IS NOT NULL AND attempts<8
        AND next_attempt_at<=now() AND (status='pending' OR(status='sending' AND lease_until<now()))
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if(!row)return null;
      await tx`UPDATE public.email_log SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+interval '1 minute'
        WHERE store_id=${id} AND id=${row.id}`;
      return {...row,attempts:row.attempts+1};
    });
    if(!job)return;
    let providerId=null;
    try{
      let message=job.payload;
      if(!message.html){
        const details=await db.withStore(id,async tx=>({draft:await loadDraft(tx,id),order:await orderDetail(tx,id,job.order_id)}));
        const s=details.draft.settings,o=details.order;
        const origin=`https://${details.draft.store.subdomain}.lebrands.store`;
        const shipment=o.shipments?.[0]||{};
        const content=renderEmail(job.template,{brand_name:s.brand_name,accent_colour:s.accent_color,font:s.font_preset,logo_url:s.logo_url,
          contact_email:s.support_email,policy_url:`${origin}/policies/terms`,...o,address:o.shipping_address,
          ...shipment,credit_note_number:o.invoice?.credit_note_number,
          credit_amount_paise:o.invoice?.credit_note_number?o.invoice.total_paise:null,
          refund_paise:o.refund_paise,
          action_url:job.template==="new_order"?`https://app.lebrands.store/stores/${id}/orders/${o.id}`:
            job.template==="shipped"&&shipment.tracking_url?shipment.tracking_url:`${origin}/track?order=${encodeURIComponent(o.order_number)}`});
        message={from:`${JSON.stringify(name(s.brand_name))} <orders@notify.lebrands.store>`,to:[job.recipient],...(s.support_email?{reply_to:s.support_email}:{}),...content};
        await db.withStore(id,tx=>tx`UPDATE public.email_log SET payload=${tx.json(message)} WHERE store_id=${id} AND id=${job.id} AND status='sending'`);
      }
      providerId=await sendResend(env,message,`store-email-${job.id}`);
    }finally{
      await db.withStore(id,tx=>tx`UPDATE public.email_log SET provider_message_id=${providerId},
        status=CASE WHEN ${providerId}::text IS NOT NULL THEN 'sent' WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,
        error_code=${providerId?null:"provider_unavailable"},sent_at=CASE WHEN ${providerId}::text IS NOT NULL THEN now() ELSE sent_at END,
        lease_until=NULL,next_attempt_at=now()+make_interval(secs=>LEAST(900,10*power(2,attempts)::integer))
        WHERE store_id=${id} AND id=${job.id} AND status='sending'`);
    }
    if(!providerId)throw new Error("Retry email");
    await env.AI_BUILD_QUEUE.send({type:"email",store_id:id});
  }finally{await db.close();}
}
