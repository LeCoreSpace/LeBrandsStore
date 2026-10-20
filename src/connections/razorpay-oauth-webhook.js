import {oauthConfig} from "./razorpay-oauth.js";
import {boundedText,verifyHmac,failure} from "./runtime-client.js";
import {razorpayWebhook} from "./payments.js";

export async function razorpayOAuthWebhook(request,env,db,fetcher=fetch){
  let stage="request",eventType,mode,matchedStores=0;
  const finish=(response,result)=>{
    // Fixed enums/counts only. Never log raw bodies, headers, account IDs,
    // signatures, credentials, customer data, SQL text or exception messages.
    console.info("razorpay_partner_webhook",{
      stage,result,http_status:response.status,matched_stores:matchedStores,
      ...(eventType?{event_type:eventType}:{}),...(mode?{mode}:{})
    });
    return response;
  };
  try{
    if(request.method!=="POST")return finish(new Response("Method not allowed",{status:405}),"rejected");
    stage="body_read";
    const raw=await boundedText(request),secret=env.RAZORPAY_OAUTH_WEBHOOK_SECRET;
    stage="signing_configuration";
    if(typeof secret!=="string"||secret.length<16)throw failure("Partner webhook signing is not configured.",503);
    stage="signature_check";
    if(!await verifyHmac(secret,raw,request.headers.get("x-razorpay-signature")))throw failure("Invalid webhook signature.",400);
    stage="payload_validation";
    const body=JSON.parse(raw),cfg=oauthConfig(env),account=body.account_id;
    const events=["payment.captured","payment.authorized","payment.failed","order.paid","refund.processed","account.app.authorization_revoked"];
    if(!events.includes(body.event)||!/^acc_[A-Za-z0-9]{5,80}$/.test(account||"")||
      body.event==="account.app.authorization_revoked"&&(!Number.isInteger(body.created_at)||body.created_at<1))
      throw failure("Invalid partner webhook.",400);
    eventType=body.event;mode=cfg.mode;stage="account_routing";
    const order=body.payload?.payment?.entity?.order_id||body.payload?.order?.entity?.id||"";
    const payment=body.payload?.refund?.entity?.payment_id||body.payload?.payment?.entity?.id||"";
    const stores=await db.account(async tx=>{
      const [r]=await tx`SELECT to_regprocedure('public.resolve_razorpay_oauth_webhook(text,text,text,text)') IS NOT NULL AS ready`;
      if(!r?.ready)throw failure("Partner webhook routing needs its database migration.",503);
      return tx`SELECT store_id FROM public.resolve_razorpay_oauth_webhook(${account},${cfg.mode},${order},${payment})`;
    });
    matchedStores=stores.length;
    if(!stores.length)return finish(Response.json({received:true}),"unmatched_account");
    for(const {store_id:id} of stores){
      stage=body.event==="account.app.authorization_revoked"?"revocation_processing":"payment_processing";
      if(body.event==="account.app.authorization_revoked"){
        await db.withStore(id,async tx=>{
          await tx`SELECT store_id FROM public.stores WHERE store_id=${id} FOR UPDATE`;
          const [row]=await tx`SELECT status,metadata::text FROM public.integrations WHERE store_id=${id} AND provider='razorpay' FOR UPDATE`;
          const meta=row?JSON.parse(row.metadata):{};
          // A delayed revocation for an old account cannot disable its replacement.
          if(meta.auth_type!=="oauth"||meta.account_id!==account||meta.mode!==cfg.mode)return;
          if(meta.revoked===true&&row.status==="disconnected")return;
          if(body.created_at<Math.floor(Date.parse(meta.checked_at||"")/1000))return;
          meta.enabled=false;meta.runtime_ready=false;meta.credentials_verified=false;meta.revoked=true;meta.revocation_pending=false;
          delete meta.oauth_pending;
          await tx`UPDATE public.integrations SET status='disconnected',credentials_ciphertext='',metadata=${JSON.stringify(meta)}::text::jsonb,
            updated_at=now() WHERE store_id=${id} AND provider='razorpay'`;
          await tx`UPDATE public.store_launch_setup SET preferences=jsonb_set(preferences,'{payments}','"cod"'::jsonb),
            revision=revision+1,updated_at=now() WHERE store_id=${id}`;
          await tx`INSERT INTO public.audit_log(store_id,actor_type,action,entity_type,entity_id,metadata)
            VALUES(${id},'system','integration.oauth_revoked','store',${id},'{"provider":"razorpay"}'::jsonb)`;
        });
      }else{
        const forwarded=new Request(request.url,{method:"POST",headers:request.headers,body:raw});
        const response=await razorpayWebhook(forwarded,env,db,id,fetcher,true);
        if(!response.ok)return finish(response,"processing_failed");
      }
    }
    stage="completed";
    return finish(Response.json({received:true}),"acknowledged");
  }catch(e){return finish(Response.json({error:e.status?e.message:"Partner webhook processing is temporarily unavailable."},{status:e.status||503}),"rejected");}
}
