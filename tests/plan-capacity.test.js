import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {capacityError,requireStorageCapacity} from "../src/billing/capacity.js";
import {renderCapacity} from "../src/ui/plan-capacity.js";
import {projectedCapacity,showCapacityFailure} from "../src/public/plan-capacity.js";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const table=(text,name)=>{
 const found=text.match(new RegExp(`CREATE TABLE public\\.${name}\\s*\\([\\s\\S]*?\\);`));
 if(!found)throw new Error(`Real DDL not found: ${name}`);
 return found[0];
};
test("capacity SQL uses real foundational DDL and rejects growth atomically while preserving existing records",async t=>{
 const pg=new PGlite();
 try{
  await pg.exec(await read("db/migrations/0001_init.sql"));
  await pg.exec("CREATE ROLE lebrands_app");
  const accounts=await read("db/migrations/0003_accounts.sql");
  const sessions=table(accounts,"sessions");
  await pg.exec(sessions);
  const flag=accounts.match(/ALTER TABLE public\.users[^;]*must_change_password[^;]*;/);
  if(flag)await pg.exec(flag[0]);
  const wizard=await read("db/migrations/0005_store_wizard.sql");
  await pg.exec(table(wizard,"store_publications"));
  const email=await read("db/staged/0014_transactional_email.sql");
  await pg.exec(table(email,"email_staff_invites"));
  for(const column of ["event_key","payload"]){
   const ddl=email.match(new RegExp(`ALTER TABLE public\\.email_log ADD COLUMN ${column}[^;]*;`));
   await pg.exec(ddl[0]);
  }
  const billing=await read("db/staged/0037_platform_billing.sql");
  for(const name of ["billing_plans","billing_plan_prices","billing_features","billing_plan_features","billing_accounts","billing_subscriptions"])
   await pg.exec(table(billing,name));
  for(const name of ["email_invite_staff","email_accept_invite"])
   await pg.exec(email.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
  const identities=(await pg.query("SELECT oid::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('email_invite_staff','email_accept_invite') ORDER BY proname")).rows;
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role");
  await pg.exec(await read("db/staged/0055_plan_capacity.sql"));
  assert.deepEqual((await pg.query("SELECT oid::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('email_invite_staff','email_accept_invite') ORDER BY proname")).rows,identities);
  const brand=(await pg.query("INSERT INTO brands(name,legal_name) VALUES('Fixture','Fixture') RETURNING id")).rows[0].id;
  const [a,b]=(await pg.query("INSERT INTO stores(brand_id,name,subdomain) VALUES($1,'A','capacity-a'),($1,'B','capacity-b') RETURNING store_id",[brand])).rows.map(s=>s.store_id);
  const plan=(await pg.query("INSERT INTO billing_plans(code,name,version,offer_state) VALUES('free','Free',1,'offered') RETURNING id")).rows[0].id;
  for(const [key,value] of Object.entries({published_products:2,published_skus:3,public_media_bytes:10,additional_staff_seats:1})){
   await pg.query("INSERT INTO billing_features(key,label,value_kind,implementation_readiness) VALUES($1,$1,'limit','enabled')",[key]);
   await pg.query("INSERT INTO billing_plan_features(plan_id,feature_key,included,value) VALUES($1,$2,true,$3)",[plan,key,JSON.stringify(value)]);
  }
  const capacity=async id=>(await pg.query("SELECT public.plan_capacity($1) AS c",[id])).rows[0].c;
  await pg.query("SELECT set_config('app.store_id',$1,false)",[a]);
  const addProduct=async(store,title)=>(await pg.query("INSERT INTO products(store_id,title,slug) VALUES($1,$2,$2) RETURNING id",[store,title])).rows[0].id;
  let first,second;
  await t.test("draft products count and the last allowed slot is accepted",async()=>{
   first=await addProduct(a,"first");second=await addProduct(a,"second");
   assert.equal((await capacity(a)).used.products,2);
   await assert.rejects(addProduct(a,"third"),e=>e.code==="PQU01"&&JSON.parse(e.detail).resource==="products");
   assert.equal((await capacity(a)).used.products,2);
   assert.equal((await pg.query("SELECT count(*) AS n FROM plan_capacity_transactions")).rows[0].n,0);
  });
  await t.test("base SKU counts once; variant growth checks final transaction state",async()=>{
   await pg.query("INSERT INTO product_options(store_id,product_id,name,value) VALUES($1,$2,'Size','S'),($1,$2,'Size','M')",[a,first]);
   assert.equal((await capacity(a)).used.skus,3);
   await assert.rejects(pg.query("INSERT INTO product_options(store_id,product_id,name,value) VALUES($1,$2,'Size','L')",[a,first]),e=>e.code==="PQU01");
   assert.equal((await capacity(a)).used.skus,3);
  });
  await t.test("other stores have their own usage, and a mismatched context is denied",async()=>{
   await addProduct(b,"separate");
   await assert.rejects(capacity(b),e=>e.code==="42501");
   assert.equal((await capacity(a)).used.products,2);
  });
  await t.test("storage boundary rejects the whole transaction without inserting an oversized record",async()=>{
   const key=`stores/${a}/00000000-0000-4000-8000-000000000001.png`;
   await pg.query("INSERT INTO media(store_id,object_key,kind,content_type,size_bytes) VALUES($1,$2,'image','image/png',10)",[a,key]);
   await assert.rejects(pg.query("INSERT INTO media(store_id,object_key,kind,content_type,size_bytes) VALUES($1,$2,'image','image/png',1)",[a,key.replace("0001.png","0002.png")]),e=>e.code==="PQU01"&&JSON.parse(e.detail).resource==="storage");
   assert.equal((await capacity(a)).used.storage,10);
  });
  await t.test("over-limit records remain editable and transactional SKU replacement may reduce usage",async()=>{
   await pg.query("UPDATE billing_plan_features SET value='1' WHERE plan_id=$1 AND feature_key='published_skus'",[plan]);
   await pg.query("UPDATE products SET title='Still editable' WHERE id=$1",[first]);
   await pg.exec("BEGIN");
   await pg.query("DELETE FROM product_options WHERE product_id=$1",[first]);
   await pg.query("INSERT INTO product_options(store_id,product_id,name,value) VALUES($1,$2,'Size','Replacement')",[a,first]);
   await pg.exec("COMMIT");
   assert.equal((await capacity(a)).used.skus,2);
   assert.equal((await capacity(a)).used.products,2);
  });
  await t.test("pending staff invitations reserve distinct seats; expiry releases the seat",async()=>{
   const actor=(await pg.query("INSERT INTO users(name,email) VALUES('Owner','owner@example.test') RETURNING id")).rows[0].id;
   await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[a,actor]);
   const invite=(email,hash)=>pg.query("INSERT INTO email_staff_invites(store_id,email,role,token_hash,invited_by) VALUES($1,$2,'editor',$3,$4)",[a,email,hash.repeat(64),actor]);
   await invite("one@example.test","a");await invite("one@example.test","b");
   assert.equal((await capacity(a)).used.staff,1);
   await assert.rejects(invite("two@example.test","c"),e=>e.code==="PQU01");
   await pg.query("UPDATE email_staff_invites SET expires_at=now()-interval '1 minute' WHERE store_id=$1",[a]);
   await invite("two@example.test","d");assert.equal((await capacity(a)).used.staff,1);
  });
  await t.test("published identities cannot hide extra draft products or SKU combinations",async()=>{
   await pg.query("UPDATE billing_plan_features SET value='3' WHERE plan_id=$1 AND feature_key='published_skus'",[plan]);
   const option=(await pg.query("SELECT id FROM product_options WHERE product_id=$1",[first])).rows[0].id;
   await pg.query("INSERT INTO store_publications(store_id,snapshot) VALUES($1,$2)",[a,JSON.stringify({products:[{id:first,variants:[{id:option,stock:0}]},{id:second,variants:[]}]})]);
   assert.equal((await capacity(a)).used.products,2);assert.equal((await capacity(a)).used.skus,2);
   await assert.rejects(pg.query("UPDATE store_publications SET snapshot=$2 WHERE store_id=$1",[a,JSON.stringify({products:[{id:first,variants:[{id:option},{id:"extra-one"},{id:"extra-two"}]},{id:second,variants:[]}]})]),e=>e.code==="PQU01");
   // Stock-only publication updates must not serialize checkout on a quota lock.
   await pg.query("UPDATE store_publications SET snapshot=jsonb_set(snapshot,'{products,0,variants,0,stock}','5') WHERE store_id=$1",[a]);
   assert.equal((await capacity(a)).used.skus,2);
   assert.equal((await pg.query("SELECT count(*) AS n FROM plan_capacity_transactions")).rows[0].n,0);
  });
  await t.test("real invitation function replaces earlier links without consuming a second seat; acceptance rechecks a downgrade",async()=>{
   const owner=(await pg.query("SELECT id FROM users WHERE email='owner@example.test'")).rows[0].id;
   const member=(await pg.query("INSERT INTO users(name,email) VALUES('Invited','two@example.test') RETURNING id")).rows[0].id;
   await pg.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$3,now()+interval '1 day'),($2,$4,now()+interval '1 day')",[owner,member,"e".repeat(64),"f".repeat(64)]);
   await pg.query("SELECT public.email_invite_staff($1,$2,'two@example.test','editor',$3,'{}')",[a,"e".repeat(64),"1".repeat(64)]);
   assert.equal((await capacity(a)).used.staff,1);
   assert.equal((await pg.query("SELECT count(*) AS n FROM email_staff_invites WHERE token_hash=$1 AND expires_at>now()",["d".repeat(64)])).rows[0].n,0);
   await pg.query("UPDATE billing_plan_features SET value='0' WHERE plan_id=$1 AND feature_key='additional_staff_seats'",[plan]);
   await assert.rejects(pg.query("SELECT public.email_accept_invite($1,$2)",["1".repeat(64),"f".repeat(64)]),e=>e.code==="PQU01");
   assert.equal((await pg.query("SELECT count(*) AS n FROM store_members WHERE store_id=$1 AND user_id=$2",[a,member])).rows[0].n,0);
   await pg.query("UPDATE billing_plan_features SET value='1' WHERE plan_id=$1 AND feature_key='additional_staff_seats'",[plan]);
   await pg.query("SELECT public.email_accept_invite($1,$2)",["1".repeat(64),"f".repeat(64)]);
   const used=(await capacity(a)).used;
   assert.equal(used.staff,1);assert.equal(used.staff_active,1);assert.equal(used.staff_pending,0);
   await assert.rejects(pg.query("SELECT public.email_accept_invite($1,$2)",["1".repeat(64),"f".repeat(64)]),e=>e.code==="42501");
  });
  await t.test("internal functions and transaction baselines are not callable by the app role",async()=>{
   assert.equal((await pg.query("SELECT has_function_privilege('lebrands_app','public._plan_capacity_usage(uuid)','execute') AS ok")).rows[0].ok,false);
   assert.equal((await pg.query("SELECT has_table_privilege('lebrands_app','public.plan_capacity_transactions','insert') AS ok")).rows[0].ok,false);
   for(const role of ["anon","authenticated","service_role"])
    assert.equal((await pg.query("SELECT has_function_privilege($1,'public._plan_capacity_usage(uuid)','execute') AS ok",[role])).rows[0].ok,false);
  });
 }finally{await pg.close();}
});
test("product estimates react to variants, while quota errors change only the notice and retain typed fields",()=>{
 const state={used:{products:2,skus:3},initialSkus:1,newProduct:true};
 assert.deepEqual(projectedCapacity(state,4),{products:3,skus:7});
 assert.deepEqual(projectedCapacity({...state,newProduct:false,initialSkus:2},1),{products:2,skus:2});
 const input={value:"My unsaved product"},notice={hidden:true,textContent:"",scrollIntoView(){}};
 showCapacityFailure({quota:{resource:"skus"},error:"Reduce the variants."},{querySelector:()=>notice});
 assert.equal(input.value,"My unsaved product");assert.equal(notice.hidden,false);
 assert.equal(notice.textContent,"Reduce the variants.");
});
test("capacity UI is readable, explains drafts and pending seats, and protects its markup",()=>{
 const c={enabled:true,used:{products:2,skus:3,storage:1048576,staff:2,staff_active:1,staff_pending:1},limits:{products:2,skus:10,storage:536870912,staff:2}};
 const html=renderCapacity(c,"example");
 assert.match(html,/Drafts and items currently live count/);assert.match(html,/Allowance reached/);assert.match(html,/1 MB/);
 assert.match(html,/data-capacity-error/);
 assert.match(renderCapacity(c,"example",{staff:true}),/1 active · 1 pending/);
 assert.doesNotMatch(renderCapacity(c,"example",{owner:false}),/>View plans</);
});
test("upload preflight rejects before the caller can write a file",async()=>{
 let calls=0;const tx=async()=>{calls++;return calls===1?[{}]:calls===2?[{enabled:true}]:[{capacity:{used:{storage:10},limits:{storage:10}}}];};
 await assert.rejects(requireStorageCapacity(tx,"store",1),e=>capacityError(e)?.quota.resource==="storage");
 assert.equal(calls,3);
 assert.equal(capacityError({code:"42501"}),null);
});
