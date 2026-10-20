import {oauthConfig} from "./razorpay-oauth.js";
import {boundedText,verifyHmac,failure} from "./runtime-client.js";
import {razorpayWebhook} from "./payments.js";

export async function razorpayOAuthWebhook(request,env,db,fetcher=fetch){
  try{
    if(request.method!=="POST")return new Response("Method not allowed",{status:405});
    const raw=await boundedText(request),secret=env.RAZORPAY_OAUTH_WEBHOOK_SECRET;
    if(typeof secret!=="string"||secret.length<16)throw failure("Partner webhook signing is not configured.",503);
    if(!await verifyHmac(secret,raw,request.headers.get("x-razorpay-signature")))throw failure("Invalid webhook signature.",400);
    const body=JSON.parse(raw),cfg=oauthConfig(env),account=body.account_id;
    const events=["payment.captured","payment.authorized","payment.failed","order.paid","refund.processed","account.app.authorization_revoked"];
    if(!events.includes(body.event)||!/^acc_[A-Za-z0-9]{5,80}$/.test(account||"")||
      body.event==="account.app.authorization_revoked"&&(!Number.isInteger(body.created_at)||body.created_at<1))
      throw failure("Invalid partner webhook.",400);
    const order=body.payload?.payment?.entity?.order_id||body.payload?.order?.entity?.id||"";
    const payment=body.payload?.refund?.entity?.payment_id||body.payload?.payment?.entity?.id||"";
    const stores=await db.account(async tx=>{
      const [r]=await tx`SELECT to_regprocedure('public.resolve_razorpay_oauth_webhook(text,text,text,text)') IS NOT NULL AS ready`;
      if(!r?.ready)throw failure("Partner webhook routing needs its database migration.",503);
      return tx`SELECT store_id FROM public.resolve_razorpay_oauth_webhook(${account},${cfg.mode},${order},${payment})`;
    });
    if(!stores.length)return Response.json({received:true});
    for(const {store_id:id} of stores){
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
        if(!response.ok)return response;
      }
    }
    return Response.json({received:true});
  }catch(e){return Response.json({error:e.status?e.message:"Partner webhook processing is temporarily unavailable."},{status:e.status||503});}
}
