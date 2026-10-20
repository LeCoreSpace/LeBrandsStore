import {sha256} from "../auth/passwords.js";
import {APP_ORIGIN} from "../auth/security.js";
import {platformDeliveryKey} from "../email/tokens.js";
import {renderEmail} from "../email/templates.js";

// Enumerate only opaque IDs/seeds. Private content and addresses require a
// server-derived capability and are never put into queue messages or logs.
export async function prepareSupportEmails(env,db){
 const [ready]=await db.account(tx=>tx`SELECT to_regprocedure('public.support_email_pending()') IS NOT NULL AS ready`);
 if(!ready?.ready)return;
 const pending=await db.account(tx=>tx`SELECT * FROM public.support_email_pending()`);
 for(const item of pending){
  const cap=await platformDeliveryKey(env,await sha256(`support:${item.delivery_seed}`));
  try{
   const [row]=await db.account(tx=>tx`SELECT public.support_email_details(${item.id},${cap}) AS data`);
   const data=typeof row.data==="string"?JSON.parse(row.data):row.data;if(!data)continue;
   const recipient=data.recipient||(env.SUPPORT_EMAIL||"support@lebrands.store");
   const path=`${data.audience==="admin"?"/admin":""}/support/${data.ticket_id}`;
   const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:[recipient],
    ...renderEmail(data.notification_type,{ticket_number:data.ticket_number,audience:data.audience,action_url:`${APP_ORIGIN}${path}`})};
   const fingerprint=await platformDeliveryKey(env,await sha256(`support-recipient:${recipient.trim().toLowerCase()}`));
   await db.account(tx=>tx`SELECT public.support_email_enqueue(${item.id},${cap},${JSON.stringify(message)}::text::jsonb,${fingerprint})`);
  }catch{
   // A failed preparation remains recoverable independently of queue delivery.
   try{await db.account(tx=>tx`SELECT public.support_email_retry(${item.id},${cap})`);}catch{}
  }
 }
}
