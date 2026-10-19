// Node-only, isolated synthetic data. Never imported into the deployed Worker.
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {setupBusinessReviewFixture} from "./business-review-preview-fixture.js";
import {hashPassword} from "./auth/passwords.js";
import {handleAccounts} from "./auth/routes.js";

export const ADMIN_FIXTURE_USERNAME="fixture-operator";
export const ADMIN_FIXTURE_PASSWORD="Synthetic_Operator_22!Only";
export const ADMIN_FIXTURE_PREFIX="/__platform-admin-preview";
export async function setupPlatformAdminFixture(){
 const f=await setupBusinessReviewFixture();
 try{
  await f.pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0035_business_document_review.sql','synthetic fixture') ON CONFLICT DO NOTHING");
  await f.pg.exec(await readFile(new URL("../db/staged/0037_platform_billing.sql",import.meta.url),"utf8"));
  await f.pg.exec(await readFile(new URL("../db/staged/0046_platform_admin.sql",import.meta.url),"utf8"));
  const env={...f.env,PASSWORD_PEPPER:Buffer.alloc(32,11).toString("base64"),SESSION_SECRET:"synthetic-operator-session-secret-32-plus"};
  const record=await hashPassword(ADMIN_FIXTURE_PASSWORD,env);
  await f.pg.query("UPDATE public.users SET password_hash=$1,password_algo=$2,password_iterations=$3,password_salt=$4,must_change_password=false WHERE id=$5",
   [record.password_hash,record.password_algo,record.password_iterations,record.password_salt,f.user.id]);
  await f.pg.query("INSERT INTO public.platform_administrators(user_id,username) VALUES($1,$2)",[f.user.id,ADMIN_FIXTURE_USERNAME]);
  const db={...f.db,close:async()=>{}};
  return {...f,db,env,credentials:{username:ADMIN_FIXTURE_USERNAME,password:ADMIN_FIXTURE_PASSWORD}};
 }catch(error){await f.pg.close();throw error;}
}
let fixture;
export async function platformAdminPreview(req,res){
 const url=new URL(req.url,"http://localhost");
 if(url.pathname!==ADMIN_FIXTURE_PREFIX&&!url.pathname.startsWith(ADMIN_FIXTURE_PREFIX+"/"))return false;
 try{
  const f=await(fixture||=setupPlatformAdminFixture().catch(e=>{fixture=null;throw e;}));
  const suffix=url.pathname.slice(ADMIN_FIXTURE_PREFIX.length);
  const target=new URL(`/admin${suffix}${url.search}`,"https://app.lebrands.store");
  const headers=new Headers(req.headers),localOrigin=headers.get("origin");
  const cookie=(headers.get("cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("__Host-lbs_admin_fixture="));
  headers.set("cookie",cookie?cookie.replace("__Host-lbs_admin_fixture=","__Host-lbs_session="):"");
  if(localOrigin&&new URL(localOrigin).host===headers.get("host"))headers.set("origin","https://app.lebrands.store");
  const init={method:req.method,headers};
  if(!["GET","HEAD"].includes(req.method))Object.assign(init,{body:Readable.toWeb(req),duplex:"half"});
  const response=await handleAccounts(new Request(target,init),f.env,{}, {createDb:()=>f.db});
  res.statusCode=response.status;
  for(const [key,value] of response.headers){
   if(key==="location")res.setHeader(key,value.replace(/^\/admin/,ADMIN_FIXTURE_PREFIX));
   else if(key==="set-cookie")res.setHeader(key,value.replace("__Host-lbs_session=","__Host-lbs_admin_fixture="));
   else res.setHeader(key,value);
  }
  if(response.headers.get("content-type")?.includes("text/html")){
   const html=(await response.text()).replaceAll('"/admin',`"${ADMIN_FIXTURE_PREFIX}`);
   res.end(req.method==="HEAD"?undefined:html);
  }else if(response.body)Readable.fromWeb(response.body).pipe(res);
  else res.end();
 }catch{
  res.statusCode=503;res.end("Isolated admin fixture is unavailable.");
 }
 return true;
}
