import{sha256}from"../auth/passwords.js";
import{marketingError}from"./rules.js";
const NAME="__Host-lb-marketing",MAX_AGE=180*86400;
export const cookieValue=(request,name)=>{
  const part=(request.headers.get("cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(`${name}=`));
  try{return part?decodeURIComponent(part.slice(name.length+1)):"";}catch{return "";}
};
async function signingKey(env){
  if(typeof env.SESSION_SECRET!=="string"||env.SESSION_SECRET.length<32)throw marketingError("Privacy choices are temporarily unavailable. Please try again.",503);
  return crypto.subtle.importKey("raw",new TextEncoder().encode(`marketing-consent:${env.SESSION_SECRET}`),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function signConsent(id,visitor,env){
  const payload=`${id}:${visitor}:${Math.floor(Date.now()/1000)}`;
  return`${payload}:${hex(await crypto.subtle.sign("HMAC",await signingKey(env),new TextEncoder().encode(payload)))}`;
}
export async function consentVisitor(request,id,env){
  const value=cookieValue(request,NAME),parts=value.split(":");
  if(parts.length!==4||parts[0]!==id||!/^[a-f0-9-]{36}$/.test(parts[1])||!/^\d{10}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return null;
  const age=Date.now()/1000-Number(parts[2]);if(age<0||age>MAX_AGE)return null;
  const valid=await crypto.subtle.verify("HMAC",await signingKey(env),Uint8Array.from(parts[3].match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(parts.slice(0,3).join(":")));
  return valid?parts[1]:null;
}
export async function readConsent(request,db,id,row,env){
  const visitor=await consentVisitor(request,id,env);if(!visitor)return null;
  const[c]=await db.withStore(id,tx=>tx`SELECT visitor_id,analytics,ads,revision FROM public.store_marketing_consents
    WHERE store_id=${id} AND visitor_id=${visitor} AND revision=${row.revision}
      AND updated_at>now()-interval '180 days'`);
  if(!c)return null;
  const effective={...c,analytics:c.analytics&&request.headers.get("dnt")!=="1",
    ads:c.ads&&request.headers.get("sec-gpc")!=="1"&&request.headers.get("dnt")!=="1"};
  // An authenticated browser privacy signal also withdraws pending server events.
  if(effective.analytics!==c.analytics||effective.ads!==c.ads)
    await db.withStore(id,async tx=>{
      await tx`UPDATE public.store_marketing_consents SET analytics=${effective.analytics},ads=${effective.ads},updated_at=now()
        WHERE store_id=${id} AND visitor_id=${c.visitor_id}`;
      if(!effective.ads)await withdrawAds(tx,id,c.visitor_id);
    });
  return effective;
}
export async function saveConsent(request,db,id,row,body,env){
  if(!body||Object.keys(body).some(k=>!["analytics","ads","gpc","dnt"].includes(k))||
    typeof body.analytics!=="boolean"||typeof body.ads!=="boolean"||
    (body.gpc!==undefined&&typeof body.gpc!=="boolean")||(body.dnt!==undefined&&typeof body.dnt!=="boolean"))
    throw marketingError("Choose your privacy preferences.");
  const visitor=await consentVisitor(request,id,env)||crypto.randomUUID();
  const dnt=body.dnt===true||request.headers.get("dnt")==="1",gpc=body.gpc===true||request.headers.get("sec-gpc")==="1";
  const analytics=body.analytics&&!dnt&&row.google_enabled,ads=body.ads&&!gpc&&!dnt;
  // All choices are bound to this host, this store and the exact settings revision.
  await db.withStore(id,async tx=>{
    await tx`INSERT INTO public.store_marketing_consents(store_id,visitor_id,revision,analytics,ads)
      VALUES(${id},${visitor},${row.revision},${analytics},${ads})
      ON CONFLICT(store_id,visitor_id) DO UPDATE SET revision=EXCLUDED.revision,analytics=EXCLUDED.analytics,ads=EXCLUDED.ads,updated_at=now()`;
    if(!ads){
      await withdrawAds(tx,id,visitor);
    }
  });
  return{consent:{analytics,ads},cookie:`${NAME}=${encodeURIComponent(await signConsent(id,visitor,env))}; Path=/; Max-Age=${MAX_AGE}; Secure; HttpOnly; SameSite=Lax`};
}
async function withdrawAds(tx,id,visitor){
  await tx`UPDATE public.orders SET tracking_user_data=NULL,fbp=NULL,fbc=NULL,client_ip=NULL,user_agent=NULL
    WHERE store_id=${id} AND tracking_consent_id=${visitor}`;
  await tx`UPDATE public.store_marketing_jobs SET status='cancelled',lease_id=NULL,lease_until=NULL
    WHERE store_id=${id} AND status IN ('pending','sending') AND order_id IN
      (SELECT id FROM public.orders WHERE store_id=${id} AND tracking_consent_id=${visitor})`;
}
export async function purchaseContext(request,db,id,row,consent,body,ack=false){
  if(!consent||!consent.analytics&&!consent.ads)return null;
  if(!/^[a-f0-9]{64}$/.test(body?.receipt_token||""))throw marketingError("Order not found.",404);
  const hash=await sha256(`${id}:${body.receipt_token}`);
  return db.withStore(id,async tx=>{
    const[o]=await tx`SELECT o.* FROM public.orders o
      WHERE o.store_id=${id} AND o.confirmation_hash=${hash} AND o.tracking_consent_id=${consent.visitor_id}
        AND o.tracking_revision=${row.revision} AND o.tracking_confirmed_at>now()-interval '48 hours'
        AND public.marketing_purchase_eligible(${id},o.id)`;
    if(!o||o.browser_purchase_fired_at)return null;
    if(ack){
      if(body.event_id!==o.tracking_event_id)throw marketingError("Order not found.",404);
      await tx`UPDATE public.orders SET browser_purchase_fired_at=now()
        WHERE store_id=${id} AND id=${o.id} AND browser_purchase_fired_at IS NULL`;
      return{saved:true};
    }
    const items=await tx`SELECT tracking_product_id,product_id,to_jsonb(i)->>'product_option_id' AS product_option_id,title,quantity,total_paise,tax_paise,
      coalesce((to_jsonb(i)->>'discount_paise')::bigint,0) AS discount_paise
      FROM public.order_items i WHERE store_id=${id} AND order_id=${o.id} ORDER BY created_at,id`;
    return{order:o,items};
  });
}
