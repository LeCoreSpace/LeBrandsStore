import {openCredentials} from "./providers.js";
import {boundedText,failure} from "./runtime-client.js";

export function diagnosticPaymentId(value){
  if(typeof value!=="string")throw failure("Enter the payment ID from your Razorpay receipt.",400);
  const input=value.trim(),id=input.startsWith("pay_")?input:`pay_${input}`;
  if(!/^pay_[A-Za-z0-9]{8,80}$/.test(id))throw failure("Enter a valid Razorpay payment ID.",400);
  return id;
}

// The caller must enforce owner membership. Only SELECTs and a provider GET are
// permitted here: no token refresh, payment capture, grant or webhook mutation.
export async function inspectRazorpayPayment(tx,id,env,cfg,paymentId,fetcher=fetch){
  const normalized=diagnosticPaymentId(paymentId);
  const [row]=await tx`SELECT status,credentials_ciphertext,metadata::text FROM public.integrations
    WHERE store_id=${id} AND provider='razorpay'`;
  const meta=typeof row?.metadata==="string"?JSON.parse(row.metadata):row?.metadata||{};
  if(row?.status!=="connected"||meta.auth_type!=="oauth")throw failure("Connect Razorpay through authorisation before inspecting a payment.",409);
  const credentials=await openCredentials(env.INTEGRATION_ENCRYPTION_KEY||env.SESSION_SECRET,id,"razorpay",row.credentials_ciphertext);
  if(credentials.auth_type!=="oauth"||credentials.mode!==cfg.mode||credentials.client_id!==cfg.client_id||
    credentials.account_id!==meta.account_id||meta.mode!==cfg.mode)
    throw failure("The saved authorisation does not match this application environment.",409);
  if(!Number.isFinite(credentials.expires_at)||credentials.expires_at<=Date.now())
    throw failure("Authorisation has expired. This check will not refresh it automatically.",409);
  const [last]=await tx`SELECT event_type,created_at FROM public.webhook_events
    WHERE store_id=${id} AND provider='razorpay' ORDER BY created_at DESC LIMIT 1`;
  const response=await fetcher(`https://api.razorpay.com/v1/payments/${normalized}`,{
    method:"GET",headers:{authorization:`Bearer ${credentials.access_token}`},
    redirect:"manual",signal:AbortSignal.timeout(12000)
  });
  const result={
    payment_id:normalized,mode:cfg.mode,checked_at:new Date().toISOString(),provider_http_status:response.status,
    webhook_verified:meta.webhook_verified===true,checkout_enabled:meta.enabled===true,
    last_recorded_event:last?{event_type:last.event_type,received_at:last.created_at}:null
  };
  if(!response.ok){
    await response.body?.cancel();
    return {...result,result:response.status===404?"not_visible":"provider_rejected"};
  }
  let payment;try{payment=JSON.parse(await boundedText(response,65536));}catch{
    throw failure("Razorpay returned an unreadable payment response. Nothing was changed.",502);
  }
  const statuses=["created","authorized","captured","refunded","failed"];
  if(payment.id!==normalized||payment.entity!=="payment"||!Number.isSafeInteger(payment.amount)||payment.amount<0||
    !/^[A-Z]{3}$/.test(payment.currency)||!statuses.includes(payment.status)||
    !Number.isSafeInteger(payment.created_at)||payment.created_at<1||payment.created_at>8640000000000)
    throw failure("Razorpay returned inconsistent payment information. Nothing was changed.",502);
  // Deliberately omit customer details, provider notes, order IDs and secrets.
  return {...result,result:"found",payment:{
    amount_paise:payment.amount,currency:payment.currency,status:payment.status,
    captured:payment.captured===true,created_at:new Date(payment.created_at*1000).toISOString()
  }};
}
