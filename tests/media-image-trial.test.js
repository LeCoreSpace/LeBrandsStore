import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {imagePlacements,imageInput} from "../src/media-images/placements.js";
import {requestMediaImage,IMAGE_MODEL} from "../src/media-images/provider.js";
import {handleMediaImages,isMediaImagePath} from "../src/media-images/routes.js";
import {processMediaImage} from "../src/media-images/worker.js";
import {migrationSelection} from "../db/migration-selection.js";
import worker from "../src/index.js";
const read=p=>readFile(new URL(`../${p}`,import.meta.url),"utf8");
const table=(sql,name)=>sql.match(new RegExp(`CREATE TABLE public\\.${name}\\s*\\([\\s\\S]*?\\);`))[0];
const id="00000000-0000-4000-8000-000000000001",requestId="00000000-0000-4000-8000-000000000002";
const endpoint=`https://app.lebrands.store/api/stores/${id}/media-library/ai`;
test("trial migration is explicit and all placement profiles are server-owned, exact and bounded",()=>{
 assert.equal(migrationSelection(["--staged-media-image-trial"]).filename,"0058_media_image_trial.sql");
 const placements=imagePlacements({},id);assert(placements.length>10);
 for(const p of placements){assert(p.width%16===0&&p.height%16===0);assert(p.width*p.height<=1600000);}
 const body={placement_id:placements[0].id,prompt:"Create a product photograph.",request_id:requestId,reference_id:null};
 assert.equal(imageInput(body,placements).prompt,body.prompt);
 for(const patch of [{model:"expensive"},{width:4096},{prompt:"short"},{reference_id:"https://evil.invalid"},{request_id:"bad"}])
  assert.throws(()=>imageInput({...body,...patch},placements),e=>e.status===400);
});
test("generation routes fail before DB/provider access on unauthenticated, cross-origin or invalid requests",async()=>{
 const db={withMemberStore(){throw Error("DB should not be reached");}};
 assert(isMediaImagePath(new URL(endpoint).pathname));
 assert.equal((await handleMediaImages(new Request(endpoint),{},db,null)).status,401);
 assert.equal((await handleMediaImages(new Request(endpoint,{method:"POST",headers:{origin:"https://evil.invalid"}}),{},db,{id})).status,403);
 assert.equal((await handleMediaImages(new Request(endpoint,{method:"DELETE"}),{},db,{id})).status,405);
});
test("provider uses only the platform secret, one image, and no automatic retry or raw provider error disclosure",async()=>{
 let calls=0;
 const r=()=>requestMediaImage({OPENAI_API:"server-only"},{prompt:"A product photo",width:1024,height:1024},async(url,opts)=>{
  calls++;assert.equal(url,"https://api.openai.com/v1/images/generations");
  assert.equal(opts.headers.authorization,"Bearer server-only");
  const body=JSON.parse(opts.body);assert.equal(body.model,IMAGE_MODEL);assert.equal(body.n,1);
  assert.equal(body.quality,"low");assert.equal(body.size,"1024x1024");
  return Response.json({error:{message:"private provider diagnostic",code:"insufficient_quota"}},{status:429});
 });
 await assert.rejects(r(),e=>e.status===503&&!e.message.includes("private provider diagnostic"));
 assert.equal(calls,1);
 await assert.rejects(requestMediaImage({},{}),e=>e.status===503);
});
test("queue redelivery cannot call the provider after an already claimed job",async()=>{
 let called=false;
 const db={async withStore(id,fn){const tx=async()=>[];return fn(tx);}};
 await processMediaImage({store_id:id,job_id:requestId},{OPENAI_API:"server-only",MEDIA_IMAGE_TRIAL_ENABLED:"true",
  MEDIA:{get(){called=true;throw Error("must not load reference");}}},db);
 assert.equal(called,false);
});
test("the Worker allows only registered generation browser assets on the account host",async()=>{
 for(const filename of ["media-image-generation.css","media-image-generation.js"]){
  let path;const r=await worker.fetch(new Request(`https://app.lebrands.store/assets/${filename}`),
   {ASSETS:{fetch(req){path=new URL(req.url).pathname;return new Response("asset");}}},{});
  assert.equal(r.status,200);assert.equal(path,`/${filename}`);
 }
});
test("real foundation SQL enforces ownership, quota reservation, idempotency, save and shared budget",async t=>{
 const pg=new PGlite();
 try{
  await pg.exec(await read("db/migrations/0001_init.sql"));
  await pg.exec("CREATE ROLE lebrands_app; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role");
  const accounts=await read("db/migrations/0003_accounts.sql");
  await pg.exec(table(accounts,"sessions"));
  await pg.exec(accounts.match(/ALTER TABLE public\.users[^;]*must_change_password[^;]*;/)[0]);
  const wizard=await read("db/migrations/0005_store_wizard.sql");
  await pg.exec(table(wizard,"store_publications"));
  for(const ddl of wizard.match(/ALTER TABLE public\.media[\s\S]*?;/g)||[])await pg.exec(ddl);
  const pages=await read("db/migrations/0010_store_pages.sql");
  for(const ddl of pages.match(/ALTER TABLE public\.media[\s\S]*?;/g)||[])await pg.exec(ddl);
  const email=await read("db/staged/0014_transactional_email.sql");
  await pg.exec(table(email,"email_staff_invites"));
  for(const col of ["event_key","payload"])await pg.exec(email.match(new RegExp(`ALTER TABLE public\\.email_log ADD COLUMN ${col}[^;]*;`))[0]);
  for(const name of ["email_invite_staff","email_accept_invite"])await pg.exec(email.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
  const billing=await read("db/staged/0037_platform_billing.sql");
  for(const name of ["billing_plans","billing_plan_prices","billing_features","billing_plan_features","billing_accounts","billing_subscriptions"])await pg.exec(table(billing,name));
  await pg.exec(await read("db/staged/0055_plan_capacity.sql"));
  const ai=await read("db/staged/0013_ai_builder.sql");
  for(const name of ["ai_generation_jobs","ai_usage","ai_platform_settings"])await pg.exec(table(ai,name));
  await pg.exec("INSERT INTO ai_platform_settings VALUES(true,20)");
  await pg.exec(ai.match(/CREATE FUNCTION public\.ai_budget_reserve\([\s\S]*?\$\$;/)[0]);
  const identities=(await pg.query("SELECT oid::text FROM pg_proc WHERE proname IN('_plan_capacity_usage','ai_budget_reserve') ORDER BY proname")).rows;
  await pg.exec(await read("db/staged/0058_media_image_trial.sql"));
  assert.deepEqual((await pg.query("SELECT oid::text FROM pg_proc WHERE proname IN('_plan_capacity_usage','ai_budget_reserve') ORDER BY proname")).rows,identities);
  const brand=(await pg.query("INSERT INTO brands(name,legal_name)VALUES('Trial','Trial') RETURNING id")).rows[0].id;
  const stores=(await pg.query("INSERT INTO stores(brand_id,name,subdomain)VALUES($1,'A','trial-a'),($1,'B','trial-b') RETURNING store_id",[brand])).rows;
  const a=stores[0].store_id,b=stores[1].store_id;
  const u=(await pg.query("INSERT INTO users(name,email)VALUES('Owner','owner@example.invalid') RETURNING id")).rows[0].id;
  const token="a".repeat(64);
  await pg.query("INSERT INTO store_members(store_id,user_id,role)VALUES($1,$2,'owner')",[a,u]);
  await pg.query("INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 day')",[token,u]);
  const plan=(await pg.query("INSERT INTO billing_plans(code,name,version,offer_state)VALUES('free','Free',1,'offered') RETURNING id")).rows[0].id;
  for(const[key,value]of Object.entries({published_products:100,published_skus:1000,public_media_bytes:10485760,additional_staff_seats:0})){
   await pg.query("INSERT INTO billing_features(key,label,value_kind,implementation_readiness)VALUES($1,$1,'limit','enabled')",[key]);
   await pg.query("INSERT INTO billing_plan_features(plan_id,feature_key,included,value)VALUES($1,$2,true,$3)",[plan,key,JSON.stringify(value)]);
  }
  await pg.query("SELECT set_config('app.store_id',$1,false)",[a]);
  const create=async(req=requestId,prompt="Create an attractive serum photograph.")=>(await pg.query(
   "SELECT to_jsonb(public.media_image_create($1,$2,$3,'product-gallery',$4,1024,1280,NULL)) AS job",[a,token,req,prompt])).rows[0].job;
  let job;
  await t.test("owner and tenant isolation are required in the database, not just the UI",async()=>{
   await assert.rejects(pg.query("SELECT public.media_image_create($1,$2,$3,'product-gallery','Create a photograph',1024,1280,NULL)",[b,token,requestId]),e=>e.code==="42501");
   await assert.rejects(pg.query("SELECT public.media_image_create($1,$2,$3,'product-gallery','Create a photograph',1024,1280,NULL)",[a,"b".repeat(64),requestId]),e=>e.code==="42501");
  });
  await t.test("queued jobs reserve plan storage and retries reuse the same paid operation",async()=>{
   job=await create();assert.equal(job.status,"queued");
   assert.equal((await create()).id,job.id);
   await assert.rejects(create(requestId,"A different creative request."),e=>e.code==="22023");
   assert.equal((await pg.query("SELECT public._plan_capacity_usage($1) AS u",[a])).rows[0].u.storage,10485760);
   await assert.rejects(pg.query("INSERT INTO media(store_id,kind,object_key,content_type,size_bytes)VALUES($1,'image',$2,'image/webp',1)",[a,`stores/${a}/${requestId}.webp`]),e=>e.code==="PQU01");
  });
  await t.test("queue claiming is one-time and previews are not public",async()=>{
   assert.equal((await pg.query("SELECT * FROM public.media_image_claim($1,$2)",[a,job.id])).rows.length,1);
   assert.equal((await pg.query("SELECT * FROM public.media_image_claim($1,$2)",[a,job.id])).rows.length,0);
   assert.equal((await pg.query("SELECT public.media_image_is_saved($1,$2) AS ok",[a,job.object_key])).rows[0].ok,false);
   await pg.query("SELECT public.media_image_finish($1,$2,$3::jsonb)",[a,job.id,JSON.stringify({status:"ready",size_bytes:100,content_type:"image/webp",provider_ms:12345,total_ms:13000,usage:{input_tokens:10,output_tokens:20}})]);
  });
  await t.test("explicit save transfers reserved storage atomically and is idempotent",async()=>{
   const saved=(await pg.query("SELECT to_jsonb(public.media_image_save($1,$2,$3)) AS j",[a,token,job.id])).rows[0].j;
   assert.equal(saved.status,"saved");
   assert.equal((await pg.query("SELECT public._plan_capacity_usage($1) AS u",[a])).rows[0].u.storage,100);
   await pg.query("SELECT public.media_image_save($1,$2,$3)",[a,token,job.id]);
   assert.equal((await pg.query("SELECT count(*)::integer AS n FROM media WHERE id=$1",[job.id])).rows[0].n,1);
   assert.equal((await pg.query("SELECT alt_text FROM media WHERE id=$1",[job.id])).rows[0].alt_text,"Store creative");
   assert.equal((await pg.query("SELECT public.media_image_is_saved($1,$2) AS ok",[a,job.object_key])).rows[0].ok,true);
  });
  await t.test("trial cannot grow past the shared platform budget, even when prior requests failed",async()=>{
   await pg.query("UPDATE billing_plan_features SET value='52428800' WHERE plan_id=$1 AND feature_key='public_media_bytes'",[plan]);
   await pg.exec("UPDATE ai_platform_settings SET monthly_cap_usd=1");
   await assert.rejects(create(crypto.randomUUID()),e=>e.code==="P0001");
   const f=(await pg.query("SELECT has_function_privilege('anon','public.media_image_save(uuid,text,uuid)','EXECUTE') AS allowed")).rows[0];
   assert.equal(f.allowed,false);
  });
  await t.test("busy and daily request limits include failed jobs, preventing repeated paid retries",async()=>{
   await pg.exec("UPDATE ai_platform_settings SET monthly_cap_usd=20");
   const second=await create(crypto.randomUUID());
   await assert.rejects(create(crypto.randomUUID()),e=>e.code==="P0001");
   await pg.query("SELECT * FROM public.media_image_claim($1,$2)",[a,second.id]);
   await pg.query("SELECT public.media_image_finish($1,$2,$3::jsonb)",[a,second.id,JSON.stringify({status:"failed",error:"Provider unavailable"})]);
   const third=await create(crypto.randomUUID());
   await pg.query("SELECT * FROM public.media_image_claim($1,$2)",[a,third.id]);
   await pg.query("SELECT public.media_image_finish($1,$2,$3::jsonb)",[a,third.id,JSON.stringify({status:"failed",error:"Provider unavailable"})]);
   await assert.rejects(create(crypto.randomUUID()),e=>e.code==="P0001");
  });
  await t.test("bare tenant context cannot read prompts from private jobs",async()=>{
   await pg.exec("SET ROLE lebrands_app");
   assert.equal((await pg.query("SELECT count(*)::integer AS n FROM media_image_jobs")).rows[0].n,0);
   await pg.query("SELECT set_config('app.media_image_token',$1,false)",[token]);
   assert.equal((await pg.query("SELECT count(*)::integer AS n FROM media_image_jobs")).rows[0].n,3);
   await pg.exec("RESET ROLE");
  });
 }finally{await pg.close();}
});
