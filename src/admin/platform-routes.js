import {createDb} from "../db.js";
import {accountRepository} from "../auth/repository.js";
import {assertPasswordPepper,hashPassword,needsPasswordRehash,randomToken,sha256,verifyPassword} from "../auth/passwords.js";
import {SECURITY_HEADERS,ipHash,isValidOrigin,readForm,readSessionToken,sessionCookie} from "../auth/security.js";
import {renderPlatformAdmin} from "../ui/platform-admin.js";

const UUID="[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
const DETAIL=new RegExp(`^/admin/stores/(${UUID})(/suspension)?$`,"i");
const SECTIONS=["integrations","domains","gst","subscriptions","payments","suspensions"];
const sectionFor=path=>SECTIONS.find(section=>path===`/admin/${section}`);
const decode=v=>typeof v==="string"?JSON.parse(v):v;
const HEADERS={...SECURITY_HEADERS,"x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer",
 "content-security-policy":"default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
export const isPlatformAdminRoute=path=>["/admin","/admin/login","/admin/logout"].includes(path)||!!sectionFor(path)||path.startsWith("/admin/stores/");
const fail=(message,status)=>Object.assign(new Error(message),{status});
const redirect=(location,cookie)=>new Response(null,{status:303,headers:{...HEADERS,location,...(cookie?{"set-cookie":cookie}:{})}});
const page=(view,data={},status=200)=>new Response(renderPlatformAdmin(view,data),{status,headers:{...HEADERS,"content-type":"text/html; charset=utf-8"}});
function exactForm(form,keys){
 if([...form.keys()].some(k=>!keys.includes(k)||form.getAll(k).length!==1))throw fail("Use the provided form.",400);
}
export async function handlePlatformAdmin(request,env,ctx,dependencies={}){
 const response=await dispatch(request,env,ctx,dependencies);
 return request.method==="HEAD"?new Response(null,{status:response.status,headers:response.headers}):response;
}
async function dispatch(request,env,ctx,dependencies){
 const url=new URL(request.url),path=url.pathname,read=["GET","HEAD"].includes(request.method);
 if(!read&&request.method!=="POST")return page("error",{error:"Method not allowed.",status:405},405);
 if(!read&&!isValidOrigin(request))return page("error",{error:"Invalid request origin.",status:403},403);
 if(path==="/admin/login"&&read)return page("login");
 if(read&&path.endsWith("/suspension"))return page("error",{error:"Use the store controls to record a decision.",status:405},405);
 const raw=readSessionToken(request);
 if(!raw&&path!=="/admin/login")return redirect("/admin/login");
 let db,admin,detailId;
 try{
  db=(dependencies.createDb||createDb)(env);
  const repo=dependencies.repository||accountRepository(db);
  const [schema]=await db.account(tx=>tx`SELECT to_regprocedure('public.platform_admin_access(text)') AS definition`);
  if(!schema?.definition)throw fail("The platform admin migration has not been applied. No store data has been changed.",503);
  if(path==="/admin/login"){
   if(read)return page("login");
   const form=await readForm(request);exactForm(form,["username","password"]);
   const username=String(form.get("username")||"").trim().toLowerCase(),password=form.get("password")||"";
   if(!/^[a-z][a-z0-9_.-]{2,39}$/.test(username)||new TextEncoder().encode(password).length>1024)
    return page("login",{error:"Username or password is incorrect.",username},400);
   await assertPasswordPepper(env);
   const [identity]=await db.account(tx=>tx`SELECT public.platform_admin_login_identity(${username}) AS email`);
   const email=identity?.email||"unknown-platform-admin@platform-admin.invalid";
   const ip=await ipHash(request,env.SESSION_SECRET);
   const result=await repo.login(email,ip,async record=>{
    const valid=await verifyPassword(password,record,env);
    if(!valid||!record||!identity?.email)return null;
    const token=randomToken();
    return {token,tokenHash:await sha256(token),userId:record.user_id,
     upgrade:needsPasswordRehash(record,env)?await hashPassword(password,env):null,
     userAgent:(request.headers.get("user-agent")||"").slice(0,500)};
   });
   if(!result)return page("login",{error:"Username or password is incorrect.",username},400);
   // Recheck live authorization after session creation; revoked staff cannot enter.
   await db.account(tx=>tx`SELECT public.platform_admin_access(${result.tokenHash})`);
   return redirect("/admin",sessionCookie(result.token));
  }
  const token=await sha256(raw);
  const [access]=await db.account(tx=>tx`SELECT public.platform_admin_access(${token}) AS data`);
  admin=decode(access.data);
  if(path==="/admin/logout"){
   if(read)return redirect("/admin");
   const form=await readForm(request);exactForm(form,[]);
   await repo.revoke(token);return redirect("/admin/login",sessionCookie("",true));
  }
  const match=path.match(DETAIL);
  const section=sectionFor(path);
  if(path==="/admin"||section){
   if(!read)throw fail("Method not allowed.",405);
   const query=url.searchParams.get("q")||"",status=url.searchParams.get("status")||"all",number=url.searchParams.get("page")||"0";
   if(query.length>100||!["all","draft","live","paused","suspended"].includes(status)||!/^\d{1,4}$/.test(number)||Number(number)>1000)
    throw fail("Choose a valid store filter.",400);
   const [row]=await db.account(tx=>tx`SELECT public.platform_admin_overview(${token},${query},${status},${Number(number)}) AS data`);
   return page(section?"section":"overview",{...decode(row.data),admin,...(section?{section}:{})});
  }
  if(!match)throw fail("Page not found.",404);
  const id=match[1];detailId=id;
  if(match[2]){
   if(read)throw fail("Method not allowed.",405);
   const form=await readForm(request);
   exactForm(form,["action","reason","expected_revision","confirmation"]);
   const revision=form.get("expected_revision")||"",action=form.get("action"),reason=(form.get("reason")||"").trim(),confirmation=form.get("confirmation");
   if(!/^\d{1,12}$/.test(revision)||!["suspend","restore"].includes(action)||reason.length<10||reason.length>1000)
    throw fail("Enter a reason of 10 to 1000 characters and confirm the store address.",400);
   await db.account(tx=>tx`SELECT public.platform_admin_suspension(${token},${id},${Number(revision)},${action},${reason},${confirmation})`);
   return redirect(`/admin/stores/${id}`);
  }
  if(!read)throw fail("Method not allowed.",405);
  const [row]=await db.account(tx=>tx`SELECT public.platform_admin_detail(${token},${id}) AS data`);
  return page("store",{...decode(row.data),admin});
 }catch(error){
  const status=error.status||(error.code==="42501"?403:error.code==="P0002"?404:error.code==="40001"?409:["22023","22P02","INVALID_FORM"].includes(error.code)?400:503);
  const message=status>=500?"Platform administration is unavailable. Check the admin migration and database configuration. No action was recorded.":status===403?"Platform administrator access is required. Sign in with an authorised platform account.":error.message;
  // A rejected request never causes a privileged re-read on a permission error.
  if(detailId&&[400,409].includes(status)&&admin&&db){
   try{
    const token=await sha256(raw);
    const [row]=await db.account(tx=>tx`SELECT public.platform_admin_detail(${token},${detailId}) AS data`);
    return page("store",{...decode(row.data),admin,error:message},status);
   }catch{}
  }
  return page("error",{admin,error:message,status},status);
 }finally{if(db)await db.close();}
}
