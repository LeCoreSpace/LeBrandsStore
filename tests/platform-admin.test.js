import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupPlatformAdminFixture} from "../src/platform-admin-preview-fixture.js";
import {handlePlatformAdmin,isPlatformAdminRoute} from "../src/admin/platform-routes.js";
import {handleBusinessReview} from "../src/admin/business-review-routes.js";
import {sha256} from "../src/auth/passwords.js";
import {migrationSelection} from "../db/migration-selection.js";
import worker from "../src/index.js";

const root="https://app.lebrands.store/admin";
const post=(path,data,cookie="",origin="https://app.lebrands.store")=>new Request(root+path,{method:"POST",headers:{origin,cookie},body:new URLSearchParams(data)});

test("real admin schema enforces staff access, login, sanitized data and reversible suspension",async()=>{
 const f=await setupPlatformAdminFixture();
 const call=request=>handlePlatformAdmin(request,f.env,{}, {createDb:()=>f.db});
 try{
  assert.deepEqual(migrationSelection(["--staged-platform-admin"]),{staged:true,filename:"0046_platform_admin.sql",requires:"0035_business_document_review.sql"});
  assert.equal((await call(new Request(root))).headers.get("location"),"/admin/login");
  const login=await call(new Request(root+"/login"));
  assert.equal(login.status,200);assert.match(await login.text(),/name="username"/);
  assert.equal((await call(post("/login",{username:f.credentials.username,password:"Incorrect_fixture_password"}))).status,400);
  assert.equal((await call(post("/login",f.credentials,"","https://evil.test"))).status,403);
  const accepted=await call(post("/login",f.credentials));
  assert.equal(accepted.status,303);
  const cookie=accepted.headers.get("set-cookie").split(";")[0],raw=cookie.split("=")[1],token=await sha256(raw);
  assert.match(accepted.headers.get("set-cookie"),/Secure; HttpOnly; SameSite=Lax/);
  assert.equal((await call(new Request(root,{headers:{cookie}}))).status,200);
  for(const section of ["integrations","domains","gst","subscriptions","payments","suspensions"]){
   assert.equal(isPlatformAdminRoute(`/admin/${section}`),true);
   assert.equal((await call(new Request(`${root}/${section}`))).headers.get("location"),"/admin/login");
   const response=await call(new Request(`${root}/${section}?q=Example&status=all&page=0`,{headers:{cookie}}));
   assert.equal(response.status,200,section);
   const html=await response.text();
   assert.match(html,new RegExp(`href="/admin/${section}" aria-current="page"`));
   assert.match(html,new RegExp(`action="/admin/${section}"`));
   assert.match(html,/Example Studio/);
   assert.match(html,/class="pa-side"/);
   assert.match(html,/class="pa-main"/);
   const invalid=await call(new Request(`${root}/${section}?page=-1`,{headers:{cookie}}));
   assert.equal(invalid.status,400);
  }
  for(const suffix of ["",`/${f.store}`]){
   const review=await handleBusinessReview(new Request(`${root}/business-reviews${suffix}`),f.env,f.db,f.user,token);
   assert.equal(review.status,200);
   const html=await review.text();
   assert.match(html,/href="\/admin\/business-reviews" aria-current="page"/);
   assert.match(html,/class="pa-side"/);
   assert.match(html,/business-review\.css/);
   assert.doesNotMatch(html,/<footer/);
  }
  const overview=await f.db.account(async tx=>(await tx`SELECT public.platform_admin_overview(${token},${""},${"all"},${0}) AS data`)[0].data);
  const data=typeof overview==="string"?JSON.parse(overview):overview;
  assert.ok(data.stores.some(s=>s.store_id===f.store));
  assert.doesNotMatch(JSON.stringify(data),/credentials_ciphertext|password_hash|raw_response|shipping_address|object_key/);
  await assert.rejects(f.db.account(tx=>tx`SELECT public.platform_admin_overview(${f.ownerToken},${""},${"all"},${0})`),e=>e.code==="42501");
  await assert.rejects(f.db.account(tx=>tx`SELECT public.platform_admin_store_record(${f.store})`),e=>e.code==="42501");
  await assert.rejects(f.db.account(tx=>tx`SELECT * FROM public.platform_administrators`),e=>e.code==="42501");
  const name=(await f.pg.query("SELECT subdomain FROM stores WHERE store_id=$1",[f.store])).rows[0].subdomain;
  const decision={action:"suspend",reason:"Synthetic suspension to verify operational safety.",expected_revision:"0",confirmation:name};
  const path=`/stores/${f.store}/suspension`;
  assert.equal((await call(post(path,{...decision,confirmation:"wrong-address"},cookie))).status,400);
  assert.equal((await call(post(path,decision,cookie,"https://evil.test"))).status,403);
  assert.equal((await call(post(path,decision,cookie))).status,303);
  assert.equal((await f.pg.query("SELECT status FROM stores WHERE store_id=$1",[f.store])).rows[0].status,"paused");
  await assert.rejects(f.pg.query("UPDATE stores SET status='live' WHERE store_id=$1",[f.store]),e=>e.code==="42501");
  assert.equal((await call(post(path,{...decision,action:"restore"},cookie))).status,409);
  assert.equal((await call(post(path,{...decision,action:"restore",expected_revision:"1"},cookie))).status,303);
  assert.equal((await f.pg.query("SELECT status FROM stores WHERE store_id=$1",[f.store])).rows[0].status,"draft");
  assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM platform_admin_events WHERE store_id=$1",[f.store])).rows[0].n,2);
  await f.pg.query("UPDATE platform_administrators SET active=false WHERE user_id=$1",[f.user.id]);
  assert.equal((await call(new Request(root,{headers:{cookie}}))).status,403);
 }finally{await f.pg.close();}
});

test("admin assets are served through the actual Worker gate and routes are not public marketing",async()=>{
 const env={ASSETS:{fetch:async req=>new Response(await readFile("src/public/"+new URL(req.url).pathname.split("/").pop()),{headers:{"content-type":req.url.endsWith(".css")?"text/css":"text/javascript"}})}};
 for(const file of ["platform-admin.css","platform-admin.js"])
  assert.equal((await worker.fetch(new Request("https://app.lebrands.store/assets/"+file),env)).status,200);
 assert.equal((await worker.fetch(new Request("https://lebrands.store/admin"),{})).status,404);
 const page=await handlePlatformAdmin(new Request(root+"/login"),{},{});
 assert.match(page.headers.get("x-robots-tag"),/noindex/);
 assert.equal(page.headers.get("cache-control"),"no-store");
 assert.doesNotMatch(await page.text(),/googletagmanager|dataLayer|password[^>]*value=/);
});
