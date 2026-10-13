import {createDb} from "../db.js";
async function authenticate(request,env,raw,now=Date.now()){
  const key=env.RESEND_WEBHOOK_SECRET,id=request.headers.get("svix-id")||request.headers.get("webhook-id"),
    time=request.headers.get("svix-timestamp")||request.headers.get("webhook-timestamp"),
    signatures=request.headers.get("svix-signature")||request.headers.get("webhook-signature")||"";
  if(!key||!id||!/^\d+$/.test(time||"")||Math.abs(now/1000-Number(time))>300)return false;
  try{
    const bytes=Uint8Array.from(atob(key.replace(/^whsec_/,"")),c=>c.charCodeAt(0));
    const imported=await crypto.subtle.importKey("raw",bytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const expected=new Uint8Array(await crypto.subtle.sign("HMAC",imported,new TextEncoder().encode(`${id}.${time}.${raw}`)));
    return signatures.split(/\s+/).some(signature=>{
      const[version,value]=signature.split(",");if(version!=="v1")return false;
      const actual=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(actual.length!==expected.length)return false;
      let difference=0;actual.forEach((v,i)=>difference|=v^expected[i]);return difference===0;
    });
  }catch{return false;}
}
export {authenticate as authenticateWebhook};
export async function handleEmailWebhook(request,env){
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  if(Number(request.headers.get("content-length")||0)>100000)return new Response("Too large",{status:413});
  const raw=await request.text();
  if(raw.length>100000||!await authenticate(request,env,raw))return new Response("Invalid signature",{status:401});
  let event;
  try{event=JSON.parse(raw);}catch{return new Response("Invalid event",{status:400});}
  const status={"email.delivered":"delivered","email.bounced":"bounced","email.complained":"complained"}[event.type];
  if(!status)return new Response("OK");
  if(typeof event.data?.email_id!=="string")return new Response("Invalid event",{status:400});
  const at=new Date(event.created_at||event.data.created_at);
  if(!Number.isFinite(at.getTime()))return new Response("Invalid event time",{status:400});
  const db=createDb(env);
  try{
    const[row]=await db.account(tx=>tx`SELECT public.email_webhook_target(${event.data.email_id}) AS id`);
    if(!row?.id){
      const[platform]=await db.account(tx=>tx`SELECT public.email_platform_event(${event.data.email_id},${status},${at}) AS found`);
      return platform?.found?new Response("OK"):new Response("Delivery is not recorded yet",{status:503});
    }
    await db.withStore(row.id,async tx=>{
      const[log]=await tx`SELECT * FROM public.email_log WHERE store_id=${row.id} AND provider_message_id=${event.data.email_id} FOR UPDATE`;
      if(!log)return;
      if(log.last_event_at&&new Date(log.last_event_at)>=at)return;
      if(["bounced","complained"].includes(log.status)&&status==="delivered")return;
      await tx`UPDATE public.email_log SET status=${status},last_event_at=${at} WHERE store_id=${row.id} AND id=${log.id}`;
      if(status==="bounced")await tx`UPDATE public.customers SET email_bounced_at=${at} WHERE store_id=${row.id} AND lower(email)=lower(${log.recipient})`;
      if(status==="complained")await tx`UPDATE public.customers SET email_complained_at=${at} WHERE store_id=${row.id} AND lower(email)=lower(${log.recipient})`;
    });
    return new Response("OK");
  }catch{return new Response("Temporary failure",{status:503});}
  finally{await db.close();}
}
