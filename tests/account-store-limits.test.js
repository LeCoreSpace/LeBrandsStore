import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupBusinessReviewFixture} from "../src/business-review-preview-fixture.js";
import {ownedStorePolicy} from "../src/auth/store-policy.js";
import {renderAccount} from "../src/ui/accounts.js";
import {migrationSelection} from "../db/migration-selection.js";

test("owned slots and account actions exclude staff memberships",()=>{
 assert.equal(ownedStorePolicy([]).creationLabel,"Create a store");
 const owned={store_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"First",subdomain:"first",role:"owner",status:"live"};
 const second={...owned,store_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Second",subdomain:"second",status:"draft"};
 const member={...second,role:"editor"};
 assert.equal(ownedStorePolicy([owned,member]).canCreate,true);
 assert.equal(ownedStorePolicy([owned]).creationLabel,"Create a draft store");
 const html=renderAccount("dashboard",{user:{name:"Synthetic owner"},stores:[owned,second]});
 assert.doesNotMatch(html,/href="\/stores\/new"/);
 const conflict=renderAccount("dashboard",{user:{name:"Synthetic owner"},stores:[owned,{...second,status:"live"}]});
 assert.match(conflict,/name="account_action" value="choose_live_store"/);
 assert.match(conflict,/name="confirm_drafts" value="1" required/);
 assert.match(conflict,/other live stores will go offline/);
});

test("real schema guards two owned stores, one live, owner selection and historical Free transition",async()=>{
 const f=await setupBusinessReviewFixture(),{pg,store,owner,ownerToken}=f;
 const one=async(sql,values=[])=>(await pg.query(sql,values)).rows[0];
 try{
  for(const file of ["0035_business_document_review.sql","0037_platform_billing.sql","0038_free_subscriptions.sql","0039_ann_plan_selection.sql"]){
   if(file!=="0035_business_document_review.sql")await pg.exec(await readFile(new URL(`../db/staged/${file}`,import.meta.url),"utf8"));
   await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'synthetic real schema') ON CONFLICT DO NOTHING",[file]);
  }
  const second=(await one("INSERT INTO public.stores(brand_id,name,subdomain,billing_enrolment_required) SELECT brand_id,'Second store','second-store',false FROM public.stores WHERE store_id=$1 RETURNING store_id",[store])).store_id;
  await pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[second,owner.id]);
  // Existing conflicting live records are a legitimate migration input. Only
  // synthetic pre-migration fixture setup bypasses unrelated publication gates.
  await pg.exec("ALTER TABLE public.stores DISABLE TRIGGER USER");
  await pg.query("UPDATE public.stores SET status='live' WHERE store_id=ANY($1::uuid[])",[[store,second]]);
  await pg.exec("ALTER TABLE public.stores ENABLE TRIGGER USER");
  await pg.exec(await readFile(new URL("../db/staged/0047_account_store_limits.sql",import.meta.url),"utf8"));
  assert.deepEqual(migrationSelection(["--staged-account-store-limits"]),{staged:true,filename:"0047_account_store_limits.sql",requires:"0039_ann_plan_selection.sql"});
  await assert.rejects(f.db.account(tx=>tx`SELECT public.platform_transition_free(${store},${null}::timestamptz)`),e=>e.code==="42501");
  await assert.rejects(f.db.account(tx=>tx`SELECT public.account_choose_live_store(${f.token},${store},${true})`),e=>e.code==="42501");
  await assert.rejects(f.db.account(tx=>tx`SELECT public.account_choose_live_store(${ownerToken},${store},${false})`),e=>e.code==="22023");
  await f.db.account(tx=>tx`SELECT public.account_choose_live_store(${ownerToken},${store},${true})`);
  assert.equal((await one("SELECT status FROM stores WHERE store_id=$1",[second])).status,"draft");
  assert.equal((await one("SELECT status FROM stores WHERE store_id=$1",[store])).status,"live");
  assert.equal((await one("SELECT count(*)::int AS n FROM audit_log WHERE store_id=$1 AND action='account.live_store_selected'",[second])).n,1);
  const third=(await one("INSERT INTO public.stores(brand_id,name,subdomain) SELECT brand_id,'Third store','third-store' FROM public.stores WHERE store_id=$1 RETURNING store_id",[store])).store_id;
  await assert.rejects(pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[third,owner.id]),e=>e.code==="PSL01");
  await pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'editor')",[third,owner.id]);
  const historical="2026-01-01T00:00:00.123456Z";
  assert.equal((await one("SELECT public.platform_transition_free($1,$2::timestamptz) AS result",[store,historical])).result,"free_assigned_expired");
  const sub=await one("SELECT free_live_started_at::text AS start,free_expires_at::text AS end,legacy_concession,status,entitlement_snapshot FROM billing_subscriptions WHERE store_id=$1",[store]);
  assert.match(sub.start,/2026-01-01 00:00:00.123456/);
  assert.match(sub.end,/2026-01-31 00:00:00.123456/);
  assert.equal(sub.legacy_concession,true);
  assert.equal(sub.status,"expired");
  assert.equal(sub.entitlement_snapshot.published_products.value,100);
  assert.equal(sub.entitlement_snapshot.published_skus.value,1000);
  assert.equal((await one("SELECT public.platform_transition_free($1,now()) AS result",[store])).result,"free_preserved");
  assert.deepEqual(await one("SELECT free_live_started_at::text AS start,free_expires_at::text AS end,legacy_concession,status,entitlement_snapshot FROM billing_subscriptions WHERE store_id=$1",[store]),sub);
  // The account limit guard sorts before other independent publication guards.
  await assert.rejects(pg.query("UPDATE stores SET status='live' WHERE store_id=$1",[second]),e=>e.code==="PSL02");
  await pg.query("UPDATE stores SET status='draft' WHERE store_id=$1",[store]);
  assert.equal((await one("SELECT public.platform_transition_free($1,NULL) AS result",[second])).result,"free_assigned_building");
  assert.equal((await one("SELECT free_live_started_at IS NULL AS unstarted FROM billing_subscriptions WHERE store_id=$1",[second])).unstarted,true);
  // A separate owner's paid account is never downgraded or re-enrolled.
  await pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[third,f.user.id]);
  await pg.query("UPDATE public.stores SET billing_enrolment_required=false WHERE store_id=$1",[third]);
  const account=(await one("INSERT INTO billing_accounts(store_id,billing_contact_user_id,country_code) VALUES($1,$2,'IN') RETURNING id",[third,f.user.id])).id;
  await pg.query(`INSERT INTO billing_subscriptions(store_id,billing_account_id,plan_id,price_id,country_code,currency,
   billing_interval,mode,status,terms_version,accepted_at,accepted_by,period_start,period_end,entitlement_snapshot)
   SELECT $1,$2,p.id,x.id,'IN',x.currency,x.billing_interval,'live','active','synthetic-paid',now(),$3,now(),now()+interval '1 month','{}'::jsonb
   FROM billing_plan_prices x JOIN billing_plans p ON p.id=x.plan_id
   WHERE p.code='launch' AND x.country_code='IN' AND x.currency='INR' AND x.billing_interval='monthly' LIMIT 1`,[third,account,f.user.id]);
  assert.equal((await one("SELECT public.platform_transition_free($1,NULL) AS result",[third])).result,"paid_preserved");
  assert.equal((await one("SELECT count(*)::int AS n FROM billing_subscriptions WHERE store_id=$1 AND billing_interval='free'",[third])).n,0);
 }finally{await pg.close();}
});
