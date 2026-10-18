import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {migrationSelection} from "../db/migration-selection.js";

const source=await readFile(new URL("../db/staged/0037_platform_billing.sql",import.meta.url),"utf8");
const config=JSON.parse(await readFile(new URL("../docs/subscription-commercial.proposed.json",import.meta.url),"utf8"));
const tables=["billing_plans","billing_plan_prices","billing_features","billing_plan_features",
  "billing_accounts","billing_subscriptions","billing_subscription_events","billing_checkout_sessions",
  "billing_payments","billing_webhook_events","billing_invoices","billing_invoice_lines"];
const storeA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",storeB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner="11111111-1111-4111-8111-111111111111",editor="22222222-2222-4222-8222-222222222222",
  other="33333333-3333-4333-8333-333333333333";
const token="a".repeat(64),editorToken="b".repeat(64),otherToken="c".repeat(64),
  revokedToken="d".repeat(64),expiredToken="e".repeat(64);

test("billing is an explicit staged migration, not a regular migration",()=>{
  assert.deepEqual(migrationSelection(["--","--staged-platform-billing"]),{
    staged:true,filename:"0037_platform_billing.sql",requires:"0035_business_document_review.sql"
  });
  assert.deepEqual(migrationSelection([]),{staged:false});
});

test("platform billing schema, draft catalogue, financial constraints and owner isolation",async t=>{
  const pg=new PGlite();
  const query=async(sql,params=[])=>(await pg.query(sql,params)).rows;
  const one=async(sql,params=[])=>(await query(sql,params))[0];
  const app=async(sql,params=[],hash=token,store=storeA,role="lebrands_app")=>
    pg.transaction(async tx=>{
      // Role is a test allowlist, never application input.
      assert(["lebrands_app","anon","authenticated","service_role"].includes(role));
      await tx.exec(`SET LOCAL ROLE ${role}`);
      await tx.query("SELECT set_config('app.store_id',$1,true),set_config('app.account_session_hash',$2,true)",[store,hash]);
      return (await tx.query(sql,params)).rows;
    });
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.schema_migrations(filename text PRIMARY KEY,checksum text NOT NULL);`);
    // Real foundational DDL: never invent replacements for users, sessions,
    // stores, memberships or existing merchant financial tables.
    for(const file of ["0001_init.sql","0002_rls.sql","0003_accounts.sql"])
      await pg.exec(await readFile(new URL(`../db/migrations/${file}`,import.meta.url),"utf8"));
    await t.test("missing prerequisite fails closed without adding tables",async()=>{
      await assert.rejects(pg.transaction(tx=>tx.exec(source)),/0035_business_document_review/);
      assert.equal((await one("SELECT to_regclass('public.billing_plans') AS name")).name,null);
    });
    // Ordering marker only. This migration does not read business-review tables
    // or alter its guards; this fixture does not claim to test business approval.
    await pg.exec(`INSERT INTO public.schema_migrations VALUES('0035_business_document_review.sql','ordering fixture');
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
    await pg.query("INSERT INTO public.brands(id,name,legal_name) VALUES($1,'Example A','Example A'),($2,'Example B','Example B')",[storeA,storeB]);
    await pg.query("INSERT INTO public.stores(store_id,brand_id,subdomain,name) VALUES($1,$1,'billing-example-a','Example A'),($2,$2,'billing-example-b','Example B')",[storeA,storeB]);
    await pg.query("INSERT INTO public.users(id,name,email) VALUES($1,'Owner A','a@example.invalid'),($2,'Editor A','b@example.invalid'),($3,'Owner B','c@example.invalid')",[owner,editor,other]);
    await pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$3,'owner'),($1,$4,'editor'),($2,$5,'owner')",[storeA,storeB,owner,editor,other]);
    await pg.query("INSERT INTO public.sessions(user_id,token_hash) VALUES($1,$2),($3,$4),($5,$6),($1,$7)",[owner,token,editor,editorToken,other,otherToken,revokedToken]);
    await pg.query("UPDATE public.sessions SET revoked_at=now() WHERE token_hash=$1",[revokedToken]);
    await pg.query("INSERT INTO public.sessions(user_id,token_hash,created_at,expires_at) VALUES($1,$2,now()-interval '2 days',now()-interval '1 day')",[owner,expiredToken]);
    await pg.transaction(tx=>tx.exec(source));
    await t.test("all 12 tables use forced RLS, with no enrolment or merchant mutation",async()=>{
      const rows=await query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'billing_%'");
      assert.deepEqual(rows.map(r=>r.relname).sort(),[...tables].sort());
      assert(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
      for(const table of tables.slice(4))
        assert.equal(Number((await one(`SELECT count(*) AS n FROM public.${table}`)).n),0);
      assert.deepEqual((await query("SELECT status FROM public.stores ORDER BY store_id")).map(r=>r.status),["draft","draft"]);
      for(const table of ["orders","payments","invoices"])
        assert.equal(Number((await one(`SELECT count(*) AS n FROM public.${table}`)).n),0);
    });
    await t.test("seed matches approved planning prices, limits and paid-only Space",async()=>{
      const plans=await query("SELECT * FROM public.billing_plans");
      assert.equal(plans.length,5);
      const prices=await query("SELECT p.code,x.* FROM public.billing_plan_prices x JOIN public.billing_plans p ON p.id=x.plan_id");
      assert.equal(prices.length,8);
      assert(plans.every(p=>p.offer_state==="draft"));
      assert(prices.every(p=>!p.enabled&&!p.tax_inclusive&&p.country_code==="IN"&&p.currency==="INR"&&p.currency_exponent===2));
      const features=await query("SELECT p.code,f.* FROM public.billing_plan_features f JOIN public.billing_plans p ON p.id=f.plan_id");
      assert.equal(features.length,75);
      for(const p of config.plans){
        const current=features.filter(f=>f.code===p.code);
        for(const key of config.feature_sets[p.core_feature_set])
          assert.equal(current.find(f=>f.feature_key===key).included,true);
        const space=current.find(f=>f.feature_key==="lebrands_space_placement");
        assert.equal(space.included,p.code!=="free");
        assert.equal(space.value,p.lebrands_space_package);
        for(const key of ["published_products","published_skus","additional_staff_seats","monthly_order_soft_band","public_media_bytes"])
          assert.equal(current.find(f=>f.feature_key===key).value,p[key]??null,`${p.code} ${key}`);
        if(p.code==="flagship"){
          assert.equal(plans.find(r=>r.code===p.code).contract_required,true);
          assert.equal(prices.find(r=>r.code===p.code).amount_minor,null);
          assert.equal(prices.find(r=>r.code===p.code).advertised_from_minor,p.advertised_monthly_from_minor);
        }else{
          const month=prices.find(r=>r.code===p.code&&r.billing_interval===(p.code==="free"?"free":"monthly"));
          assert.equal(month.amount_minor,p.monthly_amount_minor);
          if(p.annual_amount_minor!==null)
            assert.equal(prices.find(r=>r.code===p.code&&r.billing_interval==="annual").amount_minor,p.annual_amount_minor);
        }
      }
      assert.equal(plans.find(p=>p.code==="free").free_live_days,30);
      assert.equal(features.find(f=>f.code==="free"&&f.feature_key==="custom_domain").included,false);
      const readiness=await query("SELECT * FROM public.billing_features");
      for(const feature of config.feature_catalog)
        assert.equal(readiness.find(f=>f.key===feature.key).implementation_readiness,feature.implementation_readiness);
    });
    const accounts=[];
    for(const [store,user] of [[storeA,owner],[storeB,other]])
      accounts.push(await one("INSERT INTO public.billing_accounts(store_id,billing_contact_user_id,country_code,legal_name) VALUES($1,$2,'IN','Synthetic billing account') RETURNING *",[store,user]));
    const price=await one("SELECT x.* FROM public.billing_plan_prices x JOIN public.billing_plans p ON p.id=x.plan_id WHERE p.code='launch' AND x.billing_interval='monthly'");
    const insertSub=(store,account,user,selected=price,mode="test",status="pending")=>one(`INSERT INTO public.billing_subscriptions
      (store_id,billing_account_id,plan_id,price_id,country_code,currency,billing_interval,mode,status,terms_version,accepted_at,accepted_by,entitlement_snapshot)
      VALUES($1,$2,$3,$4,'IN','INR',$5,$6,$7,'synthetic-terms',now(),$8,'{"fixture":true}') RETURNING *`,
      [store,account,selected.plan_id,selected.id,selected.billing_interval,mode,status,user]);
    const sub=await insertSub(storeA,accounts[0].id,owner);
    await insertSub(storeB,accounts[1].id,other);
    const checkout=await one(`INSERT INTO public.billing_checkout_sessions
      (store_id,subscription_id,mode,provider,provider_order_id,idempotency_key,purpose,currency,subtotal_minor,tax_minor,total_minor,tax_snapshot,entitlement_snapshot,expires_at)
      VALUES($1,$2,'test','razorpay','order_synthetic','checkout-synthetic','initial','INR',149900,0,149900,'{}','{}',now()+interval '1 hour') RETURNING *`,[storeA,sub.id]);
    const insertPayment=(mode="test",amount=149900,provider="razorpay",id="pay_synthetic")=>one(`INSERT INTO public.billing_payments
      (store_id,subscription_id,checkout_session_id,provider,mode,provider_payment_id,currency,amount_minor,status,verified_at,captured_at)
      VALUES($1,$2,$3,$4,$5,$6,'INR',$7,'captured',now(),now()) RETURNING *`,[storeA,sub.id,checkout.id,provider,mode,id,amount]);
    await t.test("cross-store, currency, provider and test/live mixing are rejected",async()=>{
      await assert.rejects(insertSub(storeA,accounts[1].id,owner),e=>e.code==="23503");
      await assert.rejects(insertPayment("live"),e=>e.code==="23503");
      await assert.rejects(insertPayment("test",149901),e=>e.code==="23503");
      await assert.rejects(insertPayment("test",149900,"other"),e=>e.code==="23503");
      await assert.rejects(pg.query("UPDATE public.billing_checkout_sessions SET currency='USD' WHERE id=$1",[checkout.id]),e=>e.code==="23503");
      await assert.rejects(pg.query("UPDATE public.billing_checkout_sessions SET total_minor=-1 WHERE id=$1",[checkout.id]),e=>e.code==="23514");
      await assert.rejects(pg.query("UPDATE public.billing_subscriptions SET automatic_renewal=true WHERE id=$1",[sub.id]),e=>e.code==="23514");
    });
    const payment=await insertPayment();
    const invoice=await one(`INSERT INTO public.billing_invoices
      (store_id,billing_account_id,subscription_id,payment_id,mode,currency,subtotal_minor,tax_minor,total_minor,issuer_snapshot,customer_snapshot,tax_snapshot)
      VALUES($1,$2,$3,$4,'test','INR',149900,0,149900,'{}','{}','{}') RETURNING *`,[storeA,accounts[0].id,sub.id,payment.id]);
    await pg.query("INSERT INTO public.billing_invoice_lines(store_id,invoice_id,position,description,quantity,unit_amount_minor,subtotal_minor,tax_minor,total_minor,tax_snapshot) VALUES($1,$2,1,'Synthetic plan line',1,149900,149900,0,149900,'{}')",[storeA,invoice.id]);
    await pg.query("INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type) VALUES($1,$2,'synthetic-event','fixture')",[storeA,sub.id]);
    await pg.query("INSERT INTO public.billing_webhook_events(store_id,provider,mode,provider_event_id,event_type,signature_verified_at,payload_sha256) VALUES($1,'razorpay','test','evt_synthetic','fixture',now(),$2)",[storeA,"f".repeat(64)]);
    await t.test("owners alone can read their billing; forged context and invalid sessions deny rows",async()=>{
      for(const table of tables.slice(4).filter(n=>n!=="billing_webhook_events")){
        assert((await app(`SELECT * FROM public.${table}`)).length>0,table);
        assert.equal((await app(`SELECT * FROM public.${table}`,[],token,storeB)).length,0,`${table}: forged tenant`);
        for(const hash of ["",editorToken,otherToken,revokedToken,expiredToken,"f".repeat(64)])
          assert.equal((await app(`SELECT * FROM public.${table}`,[],hash)).length,0,`${table}: unauthorized session`);
      }
      await pg.query("UPDATE public.users SET must_change_password=true WHERE id=$1",[owner]);
      assert.equal((await app("SELECT * FROM public.billing_accounts")).length,0);
      await pg.query("UPDATE public.users SET must_change_password=false WHERE id=$1",[owner]);
      assert.equal((await app("SELECT * FROM public.billing_plans",[],"","")).length,5);
      await assert.rejects(app("SELECT * FROM public.billing_webhook_events"),e=>e.code==="42501");
    });
    await t.test("application and Supabase API roles have no financial mutation privileges",async()=>{
      for(const table of tables){
        for(const statement of [`INSERT INTO public.${table} DEFAULT VALUES`,`UPDATE public.${table} SET id=id`,`DELETE FROM public.${table}`]){
          // Feature rows use composite/text keys, not id.
          const sql=statement.replace("SET id=id",table==="billing_features"?"SET key=key":table==="billing_plan_features"?"SET plan_id=plan_id":"SET id=id");
          await assert.rejects(app(sql),e=>e.code==="42501",`${table}: ${sql}`);
        }
        for(const role of ["anon","authenticated","service_role"])
          await assert.rejects(app(`SELECT * FROM public.${table}`,[],token,storeA,role),e=>e.code==="42501");
      }
      for(const role of ["anon","authenticated","service_role"])
        await assert.rejects(app("SELECT public.billing_can_read_store($1)",[storeA],token,storeA,role),e=>e.code==="42501");
    });
    await t.test("deduplication, invoice ancestry and append-only events protect records",async()=>{
      await assert.rejects(insertPayment(),e=>e.code==="23505");
      await assert.rejects(pg.query("UPDATE public.billing_invoices SET billing_account_id=$1 WHERE id=$2",[accounts[1].id,invoice.id]),e=>e.code==="23503");
      await assert.rejects(pg.query("UPDATE public.billing_invoices SET status='issued' WHERE id=$1",[invoice.id]),e=>e.code==="23514");
      await assert.rejects(pg.query("UPDATE public.billing_invoices SET currency='USD',payment_id=NULL WHERE id=$1",[invoice.id]),e=>e.code==="23503");
      await assert.rejects(pg.query("UPDATE public.billing_invoice_lines SET store_id=$1 WHERE invoice_id=$2",[storeB,invoice.id]),e=>e.code==="23503");
      await assert.rejects(pg.query("DELETE FROM public.billing_subscription_events WHERE store_id=$1",[storeA]),e=>e.code==="42501");
      await assert.rejects(pg.query("UPDATE public.billing_subscription_events SET event_type='changed' WHERE store_id=$1",[storeA]),e=>e.code==="42501");
      await assert.rejects(pg.query("INSERT INTO public.billing_webhook_events(provider,mode,provider_event_id,event_type,signature_verified_at,payload_sha256) VALUES('razorpay','test','evt_synthetic','duplicate',now(),$1)",["f".repeat(64)]),e=>e.code==="23505");
      await assert.rejects(pg.query("DELETE FROM public.stores WHERE store_id=$1",[storeA]),e=>e.code==="23503");
      await assert.rejects(pg.query("UPDATE public.billing_plan_prices SET amount_minor=1 WHERE id=$1",[price.id]),e=>e.code==="42501");
      await assert.rejects(pg.query("DELETE FROM public.billing_plan_prices WHERE id=$1",[price.id]),e=>e.code==="42501");
    });
    await t.test("Free enrolment cannot repeat or gain a fake restarted clock",async()=>{
      const freePrice=await one("SELECT * FROM public.billing_plan_prices WHERE billing_interval='free'");
      const free=await insertSub(storeA,accounts[0].id,owner,freePrice,"none","building");
      assert.equal(free.free_live_started_at,null);
      assert.equal(free.free_expires_at,null);
      await assert.rejects(insertSub(storeA,accounts[0].id,owner,freePrice,"none","building"),e=>e.code==="23505");
      await assert.rejects(pg.query("UPDATE public.billing_subscriptions SET free_live_started_at=now(),free_expires_at=now()+interval '31 days' WHERE id=$1",[free.id]),e=>e.code==="23514");
      await pg.query("UPDATE public.billing_subscriptions SET status='trialing',free_live_started_at=now(),free_expires_at=now()+interval '720 hours' WHERE id=$1",[free.id]);
      await assert.rejects(pg.query("UPDATE public.billing_subscriptions SET free_live_started_at=free_live_started_at+interval '1 day',free_expires_at=free_expires_at+interval '1 day' WHERE id=$1",[free.id]),e=>e.code==="42501");
      await assert.rejects(pg.query("UPDATE public.billing_subscriptions SET free_live_started_at=NULL,free_expires_at=NULL,status='building' WHERE id=$1",[free.id]),e=>e.code==="42501");
      await assert.rejects(pg.query("DELETE FROM public.billing_subscriptions WHERE id=$1",[free.id]),e=>e.code==="42501");
      await assert.rejects(pg.query("UPDATE public.billing_subscriptions SET status='active',period_start=now(),period_end=now()+interval '30 days' WHERE id=$1",[sub.id]),e=>e.code==="23505");
      await pg.query("UPDATE public.billing_subscriptions SET status='expired' WHERE id=$1",[free.id]);
      await assert.rejects(insertSub(storeA,accounts[0].id,owner,freePrice,"none","building"),e=>e.code==="23505");
    });
  } finally {await pg.close();}
});
