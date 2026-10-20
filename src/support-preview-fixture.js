// Node-only synthetic identities and isolated PostgreSQL. Never import in Worker.
import {readFile} from "node:fs/promises";
import {setupPlatformAdminFixture} from "./platform-admin-preview-fixture.js";
import {sha256} from "./auth/passwords.js";
import {Readable} from "node:stream";
import {handleSupport,isSupportRoute} from "./support/routes.js";

export const SUPPORT_PREVIEW_PREFIX="/__support-preview";
export async function setupSupportFixture(){
 const f=await setupPlatformAdminFixture();
 try{
  const current=await f.pg.query("SELECT to_regclass('public.platform_email_jobs') AS definition");
  if(!current.rows[0].definition)await f.pg.exec(await readFile(new URL("../db/staged/0014_transactional_email.sql",import.meta.url),"utf8"));
  const verification=await f.pg.query("SELECT to_regclass('public.ai_email_verifications') AS definition");
  if(!verification.rows[0].definition){
   const source=await readFile(new URL("../db/staged/0013_ai_builder.sql",import.meta.url),"utf8");
   const ddl=source.match(/CREATE TABLE public\.ai_email_verifications\s*\([\s\S]*?\n\);/);
   if(!ddl)throw new Error("Real verification DDL not found");
   await f.pg.exec(ddl[0]);
  }
  // Match Supabase's direct default API-role grants as well as PUBLIC grants.
  await f.pg.exec("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon,authenticated;");
  const oldClaim=await f.pg.query("SELECT 'public.email_claim_platform(uuid,text)'::regprocedure::oid AS oid");
  await f.pg.exec(await readFile(new URL("../db/staged/0051_support_tickets.sql",import.meta.url),"utf8"));
  const brandId="12121212-1212-4121-8121-121212121212",otherId="34343434-3434-4343-8343-343434343434";
  await f.pg.query("INSERT INTO public.users(id,external_user_id,name,email) VALUES($1,'support-pre-store','Example brand','brand-support@example.invalid'),($2,'support-unrelated','Other brand','other-support@example.invalid')",[brandId,otherId]);
  const owner=(await f.pg.query("SELECT user_id,store_id FROM public.store_members WHERE role='owner' ORDER BY created_at LIMIT 1")).rows[0];
  const tokens={brand:"8".repeat(64),admin:"9".repeat(64),other:"7".repeat(64),owner:"6".repeat(64)};
  for(const [kind,id]of[["brand",brandId],["admin",f.user.id],["other",otherId],["owner",owner.user_id]])
   await f.pg.query("INSERT INTO public.sessions(user_id,token_hash) VALUES($1,$2)",[id,await sha256(tokens[kind])]);
  return {...f,env:{...f.env,AI_BUILD_QUEUE:undefined,SUPPORT_EMAIL:"admin-support@example.invalid"},tokens,
   brandId,otherId,ownerId:owner.user_id,storeId:owner.store_id,oldClaimOid:oldClaim.rows[0].oid};
 }catch(error){await f.pg.close();throw error;}
}
let fixture;
export async function supportPreview(req,res){
 const url=new URL(req.url,"http://localhost");
 const cookie=(req.headers.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("__Host-lbs_support_fixture="));
 const entry=url.pathname.startsWith(SUPPORT_PREVIEW_PREFIX+"/");
 const storeApi=/^\/api\/stores\//.test(url.pathname);
 if(!entry&&(!cookie||(!isSupportRoute(url.pathname)&&!storeApi)))return false;
 const f=await(fixture||=setupSupportFixture().catch(e=>{fixture=null;throw e;}));
 if(entry){
  const kind=url.pathname.slice(SUPPORT_PREVIEW_PREFIX.length+1);
  const actor=kind==="as-admin"?"admin":kind==="as-owner"?"owner":"brand";
  const clear=kind==="exit";
  if(!["as-admin","as-brand","as-owner","exit"].includes(kind)){res.writeHead(404);res.end("Fixture not found");return true;}
  res.writeHead(303,{"set-cookie":`__Host-lbs_support_fixture=${clear?"":f.tokens[actor]}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:3600}`,
   location:clear?"/":actor==="admin"?"/admin/support":"/support","cache-control":"no-store"});res.end();return true;
 }
 const raw=cookie.slice(cookie.indexOf("=")+1);
 if(!Object.values(f.tokens).includes(raw)){res.writeHead(403);res.end("Invalid synthetic session");return true;}
 if(storeApi){
  // Dashboard chrome may request counts/search. This ticket-only fixture must
  // never fall through to a shared database, even if a real cookie also exists.
  res.writeHead(403,{"content-type":"application/json","cache-control":"no-store","x-lebrands-preview-data":"synthetic-support-fixture"});
  res.end(JSON.stringify({error:"Store data is not available in this isolated support preview."}));return true;
 }
 const headers=new Headers(req.headers);headers.set("cookie",`__Host-lbs_session=${raw}`);
 const origin=headers.get("origin");
 if(origin&&new URL(origin).host===req.headers.host)headers.set("origin","https://app.lebrands.store");
 const hasBody=!["GET","HEAD"].includes(req.method);
 const request=new Request(`https://app.lebrands.store${url.pathname}${url.search}`,{method:req.method,headers,
 ...(hasBody?{body:Readable.toWeb(req),duplex:"half"}:{})});
 const response=await handleSupport(request,f.env,{}, {createDb:()=>f.db});
 const out=new Headers(response.headers);out.delete("x-frame-options");
 out.set("content-security-policy",(out.get("content-security-policy")||"").replace(/frame-ancestors[^;]*/,"frame-ancestors *"));
 out.set("x-lebrands-preview-data","synthetic-support-fixture");
 res.writeHead(response.status,Object.fromEntries(out));res.end(Buffer.from(await response.arrayBuffer()));return true;
}
