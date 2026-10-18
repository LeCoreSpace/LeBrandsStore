import {SECURITY_HEADERS} from "../auth/security.js";
import {dashboardAccess} from "../dashboard/repository.js";
import {businessEditorAccess,protectedEditorLinks} from "../store/business-access.js";
import {annPlanAccess} from "./build-access.js";
import {freeSubscriptionState} from "./free.js";
import {billingSelection,billingDestination,isBillingPagePath} from "./entry.js";
import {renderDashboard} from "../ui/dashboard.js";
import {renderAccount} from "../ui/accounts.js";
import {renderPlanStorePicker} from "../ui/plan-billing.js";
const decode=v=>typeof v==="string"?JSON.parse(v):v;
const headers={...SECURITY_HEADERS,"cache-control":"no-store","content-type":"text/html; charset=utf-8","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
const html=(request,body,status=200)=>new Response(request.method==="HEAD"?null:body,{status,headers});

export async function billingPageData(tx,id,user,tokenHash,selection={}){
  const role=await dashboardAccess(tx,id,user.id);
  if(role!=="owner")throw Object.assign(new Error("Only the store owner can access Plan & billing."),{status:403});
  const [store]=await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
  const business_access=await businessEditorAccess(tx,id,tokenHash);
  let billing;
  try{
    const state=await freeSubscriptionState(tx,id,tokenHash);
    const access=await annPlanAccess(tx,id,tokenHash);
    const plans=await tx`SELECT p.code,p.name,p.offer_state,p.contract_required,p.free_live_days,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',x.id,'country_code',x.country_code,'currency',x.currency,'currency_exponent',x.currency_exponent,
        'billing_interval',x.billing_interval,'price_kind',x.price_kind,'amount_minor',x.amount_minor,
        'advertised_from_minor',x.advertised_from_minor,'tax_inclusive',x.tax_inclusive,'enabled',x.enabled)
        ORDER BY x.billing_interval)
        FROM public.billing_plan_prices x WHERE x.plan_id=p.id AND x.country_code=${state.country_code}::text
        AND x.version=(SELECT max(v.version) FROM public.billing_plan_prices v
          WHERE v.plan_id=x.plan_id AND v.country_code=x.country_code AND v.currency=x.currency AND v.billing_interval=x.billing_interval)
      ),'[]'::jsonb) AS prices,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',f.key,'name',f.label,
        'availability',f.implementation_readiness,'included',pf.included,'value',pf.value) ORDER BY f.key)
        FROM public.billing_plan_features pf JOIN public.billing_features f ON f.key=pf.feature_key
        WHERE pf.plan_id=p.id),'[]'::jsonb) AS features
      FROM public.billing_plans p WHERE p.version=(SELECT max(v.version) FROM public.billing_plans v WHERE v.code=p.code)
      ORDER BY CASE p.code WHEN 'free' THEN 0 WHEN 'launch' THEN 1 WHEN 'grow' THEN 2 WHEN 'scale' THEN 3 ELSE 4 END`;
    const payments=await tx`SELECT id,mode,currency,amount_minor,status,captured_at
      FROM public.billing_payments WHERE store_id=${id} ORDER BY captured_at DESC,id DESC LIMIT 50`;
    const invoices=await tx`SELECT id,mode,invoice_number,status,currency,total_minor,issued_at,created_at
      FROM public.billing_invoices WHERE store_id=${id} AND status IN ('issued','void')
      ORDER BY created_at DESC,id DESC LIMIT 50`;
    billing={state,access,catalogue:plans.map(p=>({...p,prices:decode(p.prices),features:decode(p.features)})),
      payments,invoices,requestedPlan:selection.plan,requestedInterval:selection.interval};
  }catch(error){
    // Expected staged deployment only. A present but failing DB function never
    // becomes an invented empty subscription or a synthetic Free offer.
    if(error.status!==503)throw error;
    billing={error:error.message,requestedPlan:selection.plan,requestedInterval:selection.interval};
  }
  return {store,role,business_access,billing};
}
export async function handleBillingPages(request,db,user,tokenHash,stores=[]){
  const url=new URL(request.url),selection=billingSelection(url.searchParams);
  if(!isBillingPagePath(url.pathname))return html(request,renderAccount("error",{error:"Page not found."}),404);
  if(!["GET","HEAD"].includes(request.method))return html(request,renderAccount("error",{error:"Method not allowed."}),405);
  if(!user||user.must_change_password)return html(request,renderAccount("error",{error:"Sign in and complete any required password change first."}),401);
  if(url.pathname==="/plans"){
    const owned=(decode(stores)||[]).filter(s=>s.role==="owner").map(s=>({
      store_id:s.store_id,name:s.name,subdomain:s.subdomain,status:s.status,
      href:billingDestination(selection.plan,selection.interval,s.store_id),
    }));
    if(owned.length===1)return new Response(null,{status:303,headers:{...headers,location:owned[0].href}});
    return html(request,renderPlanStorePicker({stores:owned,requestedPlan:selection.plan,requestedInterval:selection.interval},user));
  }
  try{
    const id=url.pathname.split("/")[2];
    const data=await db.withMemberStore(id,tokenHash,tx=>billingPageData(tx,id,user,tokenHash,selection),{lockStore:false});
    return html(request,protectedEditorLinks(renderDashboard("billing",data,user),id,data.business_access),data.billing.error?503:200);
  }catch(error){
    const denied=error.status===403||error.code==="42501";
    if(!denied)console.error("Platform billing page unavailable",{code:error.code||"UNKNOWN"});
    return html(request,renderAccount("error",{error:denied?"Only the store owner can access Plan & billing.":"Plan & billing is temporarily unavailable. Your subscription is unchanged."}),denied?403:503);
  }
}
