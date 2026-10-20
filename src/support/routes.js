import {createDb} from "../db.js";
import {sha256} from "../auth/passwords.js";
import {readSessionToken,SECURITY_HEADERS,isValidOrigin} from "../auth/security.js";
import {accountRepository} from "../auth/repository.js";
import {platformDeliveryKey} from "../email/tokens.js";
import {renderSupport} from "../ui/support.js";
import {schedulePendingEmails} from "../email/worker.js";

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const BASE=/^\/(?:api\/)?(?:admin\/)?support(?:\/|$)/;
const STORE_SUPPORT=/^\/stores\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/support(?=\/|$)/i;
const HEADERS={...SECURITY_HEADERS,"cache-control":"no-store","x-robots-tag":"noindex, nofollow",
 "referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'"};
const decode=value=>typeof value==="string"?JSON.parse(value):value;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...HEADERS,"content-type":"application/json; charset=utf-8"}});
const sources=new Set(["account","onboarding","dashboard","ann","theme_editor"]);
const contextKeys=new Set(["pathname","theme_key","page_slug","section_id","provider"]);
export const isSupportRoute=path=>BASE.test(path)||STORE_SUPPORT.test(path);
function exact(value,allowed){
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))
 throw fail("Use the provided support form.");
}
function text(value,min,max,label){
 if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)throw fail(`${label} must be between ${min} and ${max} characters.`);
 return value.trim();
}
export function safeSupportContext(value){
 exact(value,[...contextKeys]);
 for(const [key,item] of Object.entries(value)){
  if(typeof item!=="string"||item.length>200||/[\r\n<>]/.test(item)||(key==="pathname"&&!/^\/[a-zA-Z0-9/_.,:~-]*$/.test(item)))
   throw fail("The page details contain an unsupported value.");
 }
 return value;
}
export async function readSupportBody(request){
 if(!(request.headers.get("content-type")||"").startsWith("application/json"))throw fail("Use the support form.",415);
 if(Number(request.headers.get("content-length"))>65536)throw fail("Your message is too long.",413);
 const reader=request.body?.getReader();if(!reader)throw fail("Enter the ticket details.");
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
 if(size>65536){await reader.cancel();throw fail("Your message is too long.",413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw fail("The support form could not be read. Please try again.");}
}
export async function handleSupport(request,env,ctx,dependencies={}){
 const url=new URL(request.url),api=url.pathname.startsWith("/api/"),admin=/^\/(?:api\/)?admin\//.test(url.pathname);
 const storePath=url.pathname.match(STORE_SUPPORT);
 const base=storePath?storePath[0]:`${api?"/api":""}${admin?"/admin":""}/support`;
 const suffix=url.pathname.slice(base.length);
 let db,user,dashboard=null,sessionStores=[];
 const page=(view,data={},status=200)=>{
  const nonce=crypto.randomUUID().replaceAll("-","");
  // Shared account CSS and navigation are trusted template blocks. Nonces keep
  // them working without permitting arbitrary inline script/style execution.
  const policy=`default-src 'none'; style-src 'self' https://fonts.googleapis.com 'nonce-${nonce}'; font-src 'self' https://fonts.gstatic.com; img-src 'self'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'`;
  return new Response(request.method==="HEAD"?null:renderSupport(view,{admin,...data,...(dashboard?{dashboard,base}: {})},user,nonce),
   {status,headers:{...HEADERS,"content-security-policy":policy,"content-type":"text/html; charset=utf-8"}});
 };
 try{
  if(!["GET","HEAD","POST"].includes(request.method))throw fail("This action is not supported.",405);
  if(request.method==="POST"&&(!api||!isValidOrigin(request)))throw fail("This request could not be verified. Reload the page and try again.",403);
  const raw=readSessionToken(request);
  if(!raw)return api?json({error:"Please sign in to get support."},401):new Response(null,{status:303,headers:{...HEADERS,location:admin?"/admin/login":"/login"}});
  const token=await sha256(raw);
  db=(dependencies.createDb||createDb)(env);
  user=await accountRepository(db).session(token);
  if(!user)throw Object.assign(fail("Your session has ended. Please sign in again.",401),{adminSignIn:admin});
  if(user.must_change_password)throw Object.assign(fail("Update your password in your account before continuing.",403),{adminSignIn:admin});
  sessionStores=Array.isArray(user.stores)?user.stores:[];
  if(storePath){
   const store=sessionStores.find(item=>item.store_id===storePath[1].toLowerCase());
   if(!store)throw fail("You do not have access to this store.",403);
   dashboard={store,role:store.role};
  }
  const [ready]=await db.account(tx=>tx`SELECT to_regprocedure('public.support_list(text,boolean,text,text,text,integer)') IS NOT NULL AS ready`);
  if(!ready?.ready)throw fail("Support tickets are not available yet. Please contact support@lebrands.store while setup is completed.",503);
  // Every admin request uses the existing independent platform-admin authority.
  if(admin){
   try{
    const [access]=await db.account(tx=>tx`SELECT public.platform_admin_access(${token}) AS data`);
    user={...user,...decode(access.data)};
   }catch(error){
    if(error.code==="42501")error.adminSignIn=true;
    throw error;
   }
  }
  if(["GET","HEAD"].includes(request.method)){
   const id=suffix.startsWith("/")?suffix.slice(1):"";
   let data,view;
   if(!id||id==="new"){
    if(admin&&id==="new")throw fail("Brands create support requests from their accounts.",404);
    const status=url.searchParams.get("status")||"all",q=url.searchParams.get("q")||"",category=url.searchParams.get("category")||"all",pageValue=url.searchParams.get("page")||"0";
    if(!["all","created","pending","closed"].includes(status)||q.length>100||!/^(?:all|[a-z][a-z0-9_]{1,49})$/.test(category)||!/^\d{1,5}$/.test(pageValue)||Number(pageValue)>10000)
     throw fail("Choose valid ticket filters.");
    const [row]=await db.account(tx=>tx`SELECT public.support_list(${token},${admin},${status},${q},${category},${Number(pageValue)}) AS data`);
    data=decode(row.data);view=id==="new"?"new":"list";
    const store=url.searchParams.get("store_id");
    if(store&&UUID.test(store)&&data.stores.some(item=>item.store_id===store))data.store_id=store;
    if(!data.store_id&&dashboard&&data.stores.some(item=>item.store_id===dashboard.store.store_id))data.store_id=dashboard.store.store_id;
    data.source=sources.has(url.searchParams.get("source"))?url.searchParams.get("source"):data.store_id?"dashboard":"account";
    const context={};for(const key of contextKeys)if(url.searchParams.has(key))context[key]=url.searchParams.get(key);
    data.context=safeSupportContext(context);
   }else{
    if(!UUID.test(id))throw fail("Ticket not found.",404);
    const [row]=await db.account(tx=>tx`SELECT public.support_detail(${token},${id},${admin}) AS data`);
    data={ticket:decode(row.data),admin};
    if(admin){const [list]=await db.account(tx=>tx`SELECT public.support_list(${token},true,'all','','all',0) AS data`);data.admins=decode(list.data).admins;}
    view="detail";
   }
   // Old account/email links remain valid. Existing brands use their real
   // dashboard; support before the first store keeps its account-level view.
   if(!api&&!admin&&!storePath&&sessionStores.length){
    const preferred=url.searchParams.get("store_id")||data.ticket?.store_id;
    const store=sessionStores.find(item=>item.store_id===preferred)||sessionStores.find(item=>item.status==="live")||sessionStores[0];
    const target=new URL(url);target.pathname=`/stores/${encodeURIComponent(store.store_id)}/support${suffix}`;
    return new Response(null,{status:303,headers:{...HEADERS,location:target.pathname+target.search}});
   }
   return api?json({data:view==="detail"?data.ticket:data}):page(view,data);
  }
  const value=await readSupportBody(request);
  if(!suffix){
   if(admin)throw fail("Create your ticket from your brand account.",405);
   exact(value,["subject","body","category_code","store_id","source","context","idempotency_key"]);
   value.subject=text(value.subject,5,160,"Subject");value.body=text(value.body,1,20000,"Message");
   if(!UUID.test(value.idempotency_key||"")||(value.store_id!==null&&!UUID.test(value.store_id||""))||!sources.has(value.source)||!/^[a-z][a-z0-9_]{1,49}$/.test(value.category_code||""))throw fail("Choose a topic and store, then try again.");
   value.context=safeSupportContext(value.context||{});
   const seed=crypto.randomUUID(),cap=await platformDeliveryKey(env,await sha256(`support:${seed}`));
   const [row]=await db.account(tx=>tx`SELECT public.support_create(${token},${JSON.stringify(value)}::text::jsonb,${seed},${cap}) AS id`);
   schedule(env,ctx,dependencies);return json({data:{id:row.id}},201);
  }
  const match=suffix.match(/^\/([^/]+)\/(messages|workflow)$/);
  if(!match||!UUID.test(match[1]))throw fail("Ticket action not found.",404);
  const id=match[1];let row;
  if(match[2]==="messages"){
   exact(value,["body","visibility","idempotency_key"]);
   value.body=text(value.body,1,20000,"Reply");
   if(!UUID.test(value.idempotency_key||"")||!["public","internal"].includes(value.visibility))throw fail("Check the reply details.");
   [row]=await db.account(tx=>tx`SELECT public.support_reply(${token},${id},${admin},${JSON.stringify(value)}::text::jsonb) AS data`);
  }else{
   exact(value,["revision","status","resolution","assigned_admin_user_id","priority","waiting_on"]);
   if(typeof value.revision!=="string"||!/^[1-9]\d{0,18}$/.test(value.revision))throw fail("Reload this ticket before updating it.",409);
   if(value.status!==undefined&&!["pending","closed"].includes(value.status))throw fail("Choose Pending or Closed.");
   if(value.resolution!==undefined&&value.resolution!=="")value.resolution=text(value.resolution,3,20000,"Resolution");
   if(value.assigned_admin_user_id!==undefined&&value.assigned_admin_user_id!==null&&!UUID.test(value.assigned_admin_user_id))throw fail("Choose a support administrator.");
   const seed=crypto.randomUUID(),cap=await platformDeliveryKey(env,await sha256(`support:${seed}`));
   [row]=await db.account(tx=>tx`SELECT public.support_workflow(${token},${id},${admin},${JSON.stringify(value)}::text::jsonb,${seed},${cap}) AS data`);
  }
  schedule(env,ctx,dependencies);return json({data:decode(row.data)});
 }catch(error){
  const status=error.status||(error.code==="42501"?403:error.code==="40001"?409:["22023","22P02","23514","23502"].includes(error.code)?400:error.code==="P0001"?429:503);
  if(error.adminSignIn){
   if(api)return json({error:"Sign in with your platform administrator account."},status);
   return new Response(null,{status:303,headers:{...HEADERS,location:`/admin/login?reason=${status===401?"expired":"access"}`}});
  }
  const message=error.status?error.message:status===403?"You do not have access to this ticket.":status===409?"This ticket has changed. Load the latest version, then try again.":status===429?"You have sent several requests. Please wait before trying again.":status===400?"Check your ticket details and try again.":"Support is temporarily unavailable. Your existing tickets are safe. Contact support@lebrands.store if you need help now.";
  return api?json({error:message},status):page("error",{error:message},status);
 }finally{if(db)await db.close();}
}
function schedule(env,ctx,dependencies){
 if(env.AI_BUILD_QUEUE&&ctx?.waitUntil)ctx.waitUntil((dependencies.schedulePendingEmails||schedulePendingEmails)(env).catch(()=>{}));
 // Queue failure is recovered by the scheduled durable-outbox dispatcher.
}
