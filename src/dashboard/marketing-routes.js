import{SECURITY_HEADERS}from"../auth/security.js";
import{readJson}from"../store/input.js";
import{UUID}from"../public/validation.js";
import{dashboardAccess}from"./repository.js";
import{documentPage}from"../ui/dashboard.js";
import{renderMarketingIntegrations}from"../ui/marketing-integrations.js";
import{marketingAvailable,readMarketing,saveMarketing,settingsResult,metaToken}from"../marketing/service.js";
import{marketingError}from"../marketing/rules.js";
import{sendMetaEvent}from"../marketing/meta.js";
import{sha256}from"../auth/passwords.js";
export const isMarketingDashboard=path=>/^\/stores\/[^/]+\/settings\/marketing$/.test(path)||/^\/api\/stores\/[^/]+\/marketing-integrations(?:\/test-meta)?$/.test(path);
export async function handleMarketingDashboard(request,db,user,tokenHash,env){
  const url=new URL(request.url),id=url.pathname.split("/")[url.pathname.startsWith("/api/")?3:2];
  const headers={...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
  const json=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try{
    if(!UUID.test(id||""))throw marketingError("Store not found.",404);
    const api=url.pathname.startsWith("/api/"),test=url.pathname.endsWith("/test-meta");
    const read=["GET","HEAD"].includes(request.method);
    if((test&&request.method!=="POST")||(!read&&(!api||request.method!=="POST")))throw marketingError("Method not allowed.",405);
    if(!read&&request.headers.get("origin")!==url.origin)throw marketingError("Open these settings in your dashboard and try again.",403);
    if(!user||user.must_change_password)throw marketingError("Sign in to manage your store.",401);
    const body=!read?await readJson(request):null;
    const result=await db.withMemberStore(id,tokenHash,async tx=>{
      const role=await dashboardAccess(tx,id,user.id),canEdit=["owner","admin"].includes(role);
      if(!read&&!canEdit)throw marketingError("Only store owners and admins can change marketing settings.",403);
      if(!await marketingAvailable(tx))throw marketingError("Marketing setup is not available yet. Your store is unchanged.",503);
      const[store]=await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
      const row=read||test?await readMarketing(tx,id):await saveMarketing(tx,id,body,env);
      if(test){
        if(Object.keys(body||{}).length)throw marketingError("Use the saved settings to send a test.");
        if(!row.meta_enabled||!row.meta_pixel_id||!row.meta_test_event_code)throw marketingError("Save your Pixel ID and test event code before testing.");
        // Rate-limit synthetic events through the existing tenant IP limiter.
        const[limited]=await tx`SELECT count(*)::int AS n FROM public.audit_log
          WHERE store_id=${id} AND action='marketing.meta_test' AND created_at>now()-interval '1 minute'`;
        if(limited.n>=3)throw marketingError("Wait a minute before sending another test.",429);
        await tx`INSERT INTO public.audit_log(store_id,actor_type,action,entity_type,entity_id,metadata)
          VALUES(${id},'system','marketing.meta_test','store',${id},'{}'::jsonb)`;
        return{test:true,pixel:row.meta_pixel_id,token:await metaToken(row,env),code:row.meta_test_event_code,url:`https://${store.subdomain}.lebrands.store/`};
      }
      return{store,role,marketing:settingsResult(row,canEdit,store)};
    },{lockStore:!read});
    if(result.test){
      await sendMetaEvent(result.pixel,result.token,{event_name:"PageView",event_time:Math.floor(Date.now()/1000),
        event_id:crypto.randomUUID(),action_source:"website",event_source_url:result.url,
        user_data:{external_id:[await sha256(`marketing-test:${id}`)]}},result.code);
      return json({message:"Your test event was sent. Open Meta Events Manager → Test events to see it."});
    }
    return api?json(result.marketing):new Response(request.method==="HEAD"?null:documentPage("marketing",result,user,renderMarketingIntegrations(result)),{
      headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  }catch(e){return json({error:e.status?e.message:"Marketing settings are temporarily unavailable. Try again.",...(e.fields?{fields:e.fields}:{})},e.status||503);}
}
