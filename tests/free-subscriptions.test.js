import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupBusinessReviewFixture} from "../src/business-review-preview-fixture.js";
import {handleBillingRoutes,isBillingRoute} from "../src/billing/routes.js";
import {migrationSelection} from "../db/migration-selection.js";

const origin="https://app.lebrands.store";
test("Free service is explicitly staged and subscription paths are exact",()=>{
  assert.deepEqual(migrationSelection(["--staged-free-subscriptions"]),{
    staged:true,filename:"0038_free_subscriptions.sql",requires:"0037_platform_billing.sql"
  });
  assert(isBillingRoute("/api/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/subscription"));
  assert(isBillingRoute("/api/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/subscription/free"));
  assert(!isBillingRoute("/api/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/subscription/free/extra"));
});

test("Free consent, persistence, authorization and publication clock use real business-review DDL",async t=>{
  const f=await setupBusinessReviewFixture();
  const {pg,store,owner,ownerToken,user,token}=f;
  // The Ann preview adapter intentionally accepts one fixture store. Exercise
  // this service against real authorization for every synthetic tenant instead.
  const db={...f.db,withMemberStore:async(id,hash,fn,{lockStore=true}={})=>
    pg.transaction(async trx=>{
      await trx.exec("SET LOCAL ROLE lebrands_app");
      const access=await trx.query("SELECT public.authorize_store_session($1,$2) allowed",[hash,id]);
      if(!access.rows[0]?.allowed)throw Object.assign(new Error("Store access denied."),{status:403});
      await trx.query("SELECT set_config('app.store_id',$1,true)",[id]);
      await trx.query(`SELECT store_id FROM public.stores WHERE store_id=$1 FOR ${lockStore?"UPDATE":"SHARE"}`,[id]);
      const tx=async(strings,...values)=>(await trx.query(
        strings.reduce((sql,part,i)=>sql+(i?`$${i}`:"")+part,""),values)).rows;
      return fn(tx);
    })};
  const root=`${origin}/api/stores/${store}/subscription`;
  const one=async(sql,values=[])=>(await pg.query(sql,values)).rows[0];
  const request=(method="GET",body,source=origin,url=root)=>new Request(url,{
    method,headers:{"content-type":"application/json",origin:source},...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const call=(req,actor=owner,hash=ownerToken)=>handleBillingRoutes(req,db,actor,hash);
  let offer,body,subscription;
  const actorSql=(sql,values=[],hash=ownerToken,target=store)=>pg.transaction(async tx=>{
    await tx.exec("SET LOCAL ROLE lebrands_app");
    await tx.query("SELECT set_config('app.store_id',$1,true)",[target]);
    return tx.query(sql,values.length?values:[store,hash]);
  });
  try {
    await t.test("missing service fails explicitly; reads never enrol",async()=>{
      const response=await call(request());
      assert.equal(response.status,503);
      assert.match((await response.json()).error,/not available yet/);
      assert.equal((await call(request(),null,null)).status,401);
    });
    await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0035_business_document_review.sql','real fixture DDL') ON CONFLICT DO NOTHING");
    await pg.exec(await readFile(new URL("../db/staged/0037_platform_billing.sql",import.meta.url),"utf8"));
    await t.test("Free migration refuses an unrecorded billing prerequisite",async()=>{
      const source=await readFile(new URL("../db/staged/0038_free_subscriptions.sql",import.meta.url),"utf8");
      await assert.rejects(pg.transaction(tx=>tx.exec(source)),/0037_platform_billing/);
    });
    await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0037_platform_billing.sql','real fixture DDL')");
    await pg.exec(await readFile(new URL("../db/staged/0038_free_subscriptions.sql",import.meta.url),"utf8"));
    await t.test("GET and HEAD show only the Free offer and cause no persistent writes",async()=>{
      for(let i=0;i<2;i++){
        const response=await call(request());
        assert.equal(response.status,200);
        assert.equal(response.headers.get("cache-control"),"no-store");
        const result=await response.json();
        assert.equal(result.subscription,null);assert.equal(result.can_enrol,true);
        offer=result.offer;
        assert.equal(offer.live_days,30);assert.equal(offer.amount_minor,0);
        assert.equal(offer.entitlements.published_products.value,100);
        assert.equal(offer.entitlements.published_skus.value,1000);
        assert.equal(offer.entitlements.lebrands_space_placement.included,false);
      }
      assert.equal((await (await call(request("HEAD"))).text()),"");
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_accounts")).n),0);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscriptions")).n),0);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_plan_prices WHERE enabled AND billing_interval<>'free'")).n),0);
      body={price_id:offer.price_id,terms_version:offer.terms_version,accepted:true};
    });
    await t.test("owner consent cannot be forged through browser fields or other sessions",async()=>{
      const endpoint=`${root}/free`;
      assert.equal((await call(request("POST",body,"https://evil.example",endpoint))).status,403);
      assert.equal((await call(request("GET",undefined,origin,endpoint))).status,405);
      assert.equal((await call(request("POST",{...body,accepted:false},origin,endpoint))).status,400);
      assert.equal((await call(request("POST",{...body,terms_version:"old"},origin,endpoint))).status,400);
      assert.equal((await call(request("POST",{...body,mode:"live"},origin,endpoint))).status,400);
      assert.equal((await call(request("POST",{...body,amount_minor:1},origin,endpoint))).status,400);
      assert.equal((await call(request("POST",{...body,price_id:"ffffffff-ffff-4fff-8fff-ffffffffffff"},origin,endpoint))).status,409);
      assert.equal((await call(request(),user,token)).status,403,"platform reviewers cannot manage brand billing");
      assert.equal((await call(request(),owner,"b".repeat(64))).status,403,"forged user metadata does not make an editor an owner");
      await assert.rejects(actorSql("SELECT public.billing_activate_free($1,$2,$3,'free-v1',true)",
        [store,"b".repeat(64),offer.price_id]),e=>e.code==="42501");
      await assert.rejects(actorSql("SELECT public.billing_activate_free($1,$2,$3,'free-v1',false)",
        [store,ownerToken,offer.price_id]),e=>e.code==="22023");
      await assert.rejects(actorSql("SELECT public.billing_activate_free($1,$2,$3,'free-v1',true)",
        [store,ownerToken,offer.price_id],ownerToken,"ffffffff-ffff-4fff-8fff-ffffffffffff"),e=>e.code==="42501");
      await assert.rejects(pg.transaction(async tx=>{
        await tx.query("UPDATE public.sessions SET revoked_at=now() WHERE token_hash=$1",[ownerToken]);
        await tx.exec("SET LOCAL ROLE lebrands_app");
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await tx.query("SELECT public.billing_activate_free($1,$2,$3,'free-v1',true)",[store,ownerToken,offer.price_id]);
      }),e=>e.code==="42501");
      await assert.rejects(pg.transaction(async tx=>{
        await tx.query("UPDATE public.sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_hash=$1",[ownerToken]);
        await tx.exec("SET LOCAL ROLE lebrands_app");
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await tx.query("SELECT public.billing_activate_free($1,$2,$3,'free-v1',true)",[store,ownerToken,offer.price_id]);
      }),e=>e.code==="42501");
      for(const role of ["anon","authenticated","service_role"])
        assert.equal((await one("SELECT has_function_privilege($1,'public.billing_activate_free(uuid,text,uuid,text,boolean)','EXECUTE') permitted",[role])).permitted,false);
      for(const name of ["public.billing_require_owner(uuid,text)","public.billing_start_free_on_publication()"])
        assert.equal((await one("SELECT has_function_privilege('lebrands_app',$1,'EXECUTE') permitted",[name])).permitted,false);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscriptions")).n),0);
    });
    await t.test("previously published stores require legacy transition without changing their service",async()=>{
      await assert.rejects(pg.transaction(async tx=>{
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await tx.query("SELECT public.business_review_decide($1,$2,1,'approved','Synthetic legacy transition fixture.',true)",[token,store]);
        await tx.query("INSERT INTO public.store_publications(store_id,snapshot) SELECT store_id,jsonb_build_object('settings',settings) FROM public.store_setup WHERE store_id=$1",[store]);
        await tx.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]);
        const state=(await tx.query("SELECT public.billing_free_state($1,$2) state",[store,ownerToken])).rows[0].state;
        assert.equal(state.reason,"legacy_transition_required");
        assert.equal(state.can_enrol,false);
        await tx.query("SELECT public.billing_activate_free($1,$2,$3,'free-v1',true)",[store,ownerToken,offer.price_id]);
      }),e=>e.code==="PBF02");
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscriptions")).n),0);
    });
    await t.test("explicit activation is atomic, repeat-safe and independent of pending business approval",async()=>{
      const before=await one("SELECT status FROM public.store_business_verifications WHERE store_id=$1",[store]);
      assert.equal(before.status,"pending_review");
      const first=await call(request("POST",body,origin,`${root}/free`));
      assert.equal(first.status,200);
      subscription=(await first.json()).subscription;
      assert.equal(subscription.plan,"free");assert.equal(subscription.status,"building");
      assert.equal(subscription.mode,"none");
      assert.equal(subscription.free_live_started_at,null);assert.equal(subscription.free_expires_at,null);
      assert.equal(subscription.remaining_live_seconds,2592000);
      const repeats=await Promise.all([call(request("POST",body,origin,`${root}/free`)),call(request("POST",body,origin,`${root}/free`))]);
      for(const response of repeats){
        assert.equal(response.status,200);
        assert.equal((await response.json()).subscription.id,subscription.id);
      }
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscriptions")).n),1);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscription_events")).n),1);
      assert.equal((await one("SELECT status FROM public.store_business_verifications WHERE store_id=$1",[store])).status,before.status);
      const account=await one("SELECT * FROM public.billing_accounts WHERE store_id=$1",[store]);
      assert.equal(account.legal_name,null);assert.equal(account.identity_status,"unconfirmed");
      for(const table of ["billing_checkout_sessions","billing_payments","billing_invoices","payments","payment_attempts"])
        assert.equal(Number((await one(`SELECT count(*) n FROM public.${table}`)).n),0,table);
    });
    const snapshot=async tx=>tx.query("INSERT INTO public.store_publications(store_id,snapshot) SELECT store_id,jsonb_build_object('settings',settings) FROM public.store_setup WHERE store_id=$1 ON CONFLICT(store_id) DO UPDATE SET published_at=now()",[store]);
    await t.test("failed or unapproved publication cannot start the clock",async()=>{
      await assert.rejects(pg.transaction(async tx=>{
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await snapshot(tx);
      }),e=>e.code==="42501");
      assert.equal((await one("SELECT free_live_started_at FROM public.billing_subscriptions WHERE id=$1",[subscription.id])).free_live_started_at,null);
      // Use the real isolated reviewer decision, not an owner or fabricated approval.
      await db.account(tx=>tx`SELECT public.business_review_decide(${token},${store},1,'approved','Synthetic manual review approval.',true)`);
      assert.equal((await one("SELECT free_live_started_at FROM public.billing_subscriptions WHERE id=$1",[subscription.id])).free_live_started_at,null,"approval alone never starts Free");
      await assert.rejects(pg.transaction(async tx=>{
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await snapshot(tx);
        await tx.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]);
        throw new Error("Synthetic failure after clock assignment");
      }),/Synthetic failure/);
      assert.equal((await one("SELECT free_live_started_at FROM public.billing_subscriptions WHERE id=$1",[subscription.id])).free_live_started_at,null);
      assert.equal((await one("SELECT status FROM public.stores WHERE store_id=$1",[store])).status,"draft");
    });
    let started,expires;
    await t.test("first successful publication starts exactly 30 live days and records one event",async()=>{
      await pg.transaction(async tx=>{
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await snapshot(tx);
        assert.equal((await tx.query("SELECT free_live_started_at FROM public.billing_subscriptions WHERE id=$1",[subscription.id])).rows[0].free_live_started_at,null,"snapshot while draft is not live publication");
        await tx.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]);
      });
      const result=await (await call(request())).json();
      assert.equal(result.subscription.status,"trialing");
      started=result.subscription.free_live_started_at;expires=result.subscription.free_expires_at;
      assert.equal(new Date(expires)-new Date(started),30*24*60*60*1000);
      const events=await one("SELECT count(*) n FROM public.billing_subscription_events WHERE event_type='free.live_started'");
      assert.equal(Number(events.n),1);
    });
    await t.test("unpublish, republish and duplicate activation cannot reset consent or the live clock",async()=>{
      await pg.transaction(async tx=>{
        await tx.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await tx.query("UPDATE public.stores SET status='draft' WHERE store_id=$1",[store]);
        await snapshot(tx);
        await tx.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]);
        await snapshot(tx);
      });
      const result=await (await call(request("POST",body,origin,`${root}/free`))).json();
      assert.equal(result.subscription.free_live_started_at,started);
      assert.equal(result.subscription.free_expires_at,expires);
      assert.equal(result.subscription.accepted_at,subscription.accepted_at);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscription_events")).n),2);
      await assert.rejects(actorSql("UPDATE public.billing_subscriptions SET status='building' WHERE store_id=$1",[store]),e=>e.code==="42501");
    });
    await t.test("unsupported countries cannot enrol or silently use India prices",async()=>{
      const createStore=async(name)=>{
        const row=await one("INSERT INTO public.stores(brand_id,name,subdomain) SELECT brand_id,$2,$2 FROM public.stores WHERE store_id=$1 RETURNING store_id",[store,name]);
        await pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[row.store_id,owner.id]);
        return row.store_id;
      };
      const target=await createStore("billing-country-test");
      await pg.query("UPDATE public.store_business_access SET business_country='US' WHERE store_id=$1",[target]);
      const countryRoot=`${origin}/api/stores/${target}/subscription`;
      const country=await (await call(request("GET",undefined,origin,countryRoot))).json();
      assert.equal(country.reason,"unsupported_country");
      assert.equal(country.can_enrol,false);
      assert.equal((await call(request("POST",body,origin,`${countryRoot}/free`))).status,409);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_accounts WHERE store_id=$1",[target])).n),0);
      await pg.query("UPDATE public.store_business_access SET business_country='IN' WHERE store_id=$1",[target]);
      const accepted=await (await call(request("POST",body,origin,`${countryRoot}/free`))).json();
      // First assignment of a synthetic past clock, not an edit of a started
      // clock. Production assignment is exclusively the publication trigger.
      await pg.query(`UPDATE public.billing_subscriptions SET status='trialing',
        free_live_started_at=now()-interval '31 days',free_expires_at=now()-interval '1 day'
        WHERE id=$1`,[accepted.subscription.id]);
      const expired=await (await call(request("GET",undefined,origin,countryRoot))).json();
      assert.equal(expired.subscription.effective_status,"expired");
      assert.equal(expired.subscription.remaining_live_seconds,0);
      const repeated=await (await call(request("POST",body,origin,`${countryRoot}/free`))).json();
      assert.equal(repeated.subscription.free_expires_at,expired.subscription.free_expires_at);
      assert.equal(repeated.can_enrol,false);
      assert.equal((await one("SELECT status FROM public.stores WHERE store_id=$1",[store])).status,"live");
    });
  }finally{await pg.close();}
});
