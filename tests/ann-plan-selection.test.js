import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupBusinessReviewFixture} from "../src/business-review-preview-fixture.js";
import {handleBillingRoutes} from "../src/billing/routes.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
import {annPlanAccess,requireAnnPlan} from "../src/billing/build-access.js";
import {businessEditorAccess} from "../src/store/business-access.js";
import {migrationSelection} from "../db/migration-selection.js";

test("Ann plan selection is a separately staged rollout",()=>{
  assert.deepEqual(migrationSelection(["--staged-ann-plan-selection"]),{
    staged:true,filename:"0039_ann_plan_selection.sql",requires:"0038_free_subscriptions.sql"
  });
});

test("Ann gates new-store building after confirmed name without locking legacy stores",async t=>{
  const f=await setupBusinessReviewFixture();
  const {pg,db,store,owner,ownerToken}=f;
  const origin="https://app.lebrands.store",ann=`${origin}/api/stores/${store}/ann`,
    billing=`${origin}/api/stores/${store}/subscription`;
  const one=async(sql,values=[])=>(await pg.query(sql,values)).rows[0];
  const req=(url,method="GET",body)=>new Request(url,{method,headers:{origin,"content-type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const annCall=(url,method,body)=>handleAnnRoutes(req(url,method,body),{},db,owner,ownerToken);
  const billCall=(url,method,body)=>handleBillingRoutes(req(url,method,body),db,owner,ownerToken);
  const member=fn=>db.withMemberStore(store,ownerToken,fn);
  let offer;
  try{
    for(const file of ["0035_business_document_review.sql","0037_platform_billing.sql","0038_free_subscriptions.sql"]){
      if(file!=="0035_business_document_review.sql")
        await pg.exec(await readFile(new URL(`../db/staged/${file}`,import.meta.url),"utf8"));
      await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES($1,'isolated real DDL') ON CONFLICT DO NOTHING",[file]);
    }
    await pg.exec(await readFile(new URL("../db/staged/0039_ann_plan_selection.sql",import.meta.url),"utf8"));
    await t.test("existing stores are exempt while new stores default to requiring consent",async()=>{
      assert.equal((await member(tx=>annPlanAccess(tx,store,ownerToken))).allowed,true);
      assert.equal((await one("SELECT billing_enrolment_required FROM public.stores WHERE store_id=$1",[store])).billing_enrolment_required,false);
      const added=await one("INSERT INTO public.stores(brand_id,name,subdomain) SELECT brand_id,'New billing rollout','new-billing-rollout' FROM public.stores WHERE store_id=$1 RETURNING billing_enrolment_required",[store]);
      assert.equal(added.billing_enrolment_required,true);
      // Synthetic primary fixture now represents a newly created store so the
      // actual Ann and billing route adapters can run without production access.
      await pg.query("UPDATE public.stores SET billing_enrolment_required=true WHERE store_id=$1",[store]);
    });
    await t.test("direct editing and plan activation cannot bypass name then plan ordering",async()=>{
      const access=await member(tx=>annPlanAccess(tx,store,ownerToken));
      assert.equal(access.allowed,false);assert.equal(access.name_confirmed,false);
      await assert.rejects(member(tx=>requireAnnPlan(tx,store,ownerToken)),e=>e.status===403);
      const business=await member(tx=>businessEditorAccess(tx,store,ownerToken));
      assert.equal(business.allowed,false);assert.equal(business.reason,"plan_required");
      const response=await billCall(billing);
      offer=(await response.json()).offer;
      assert(offer?.price_id);
      const bypass=await billCall(`${billing}/free`,"POST",{price_id:offer.price_id,terms_version:offer.terms_version,accepted:true});
      assert.equal(bypass.status,409);assert.match((await bypass.json()).error,/Confirm your store name/);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_accounts")).n),0,"failed enrolment rolls back account creation");
      assert.equal((await annCall(`${ann}/session`,"PATCH",{expected_revision:0,current_step:"style",answers:{}})).status,403);
      assert.equal((await annCall(`${ann}/onboarding`,"PATCH",{confirm:true,expected_draft:"a".repeat(64),subdomain:"skip-plan"})).status,403);
      await assert.rejects(member(tx=>tx`SELECT public.ann_save_session(${store},${ownerToken},0,'business','{}'::jsonb)`),e=>e.code==="42501");
      await assert.rejects(member(tx=>tx`UPDATE public.stores SET billing_enrolment_required=false WHERE store_id=${store}`),e=>e.code==="42501");
    });
    await t.test("name confirmation persists separately and opens the acceptance stage",async()=>{
      const initial=await (await annCall(`${ann}/onboarding`)).json();
      const response=await annCall(`${ann}/onboarding`,"PATCH",{
        expected_draft:initial.expected_draft,confirm:true,brand_name:"Plan Test Studio"
      });
      assert.equal(response.status,200,await response.clone().text());
      const body=await response.json();
      assert.equal(body.settings.ann_store_name_confirmed,true);
      assert.equal(body.business_access.plan_access.name_confirmed,true);
      assert.equal(body.business_access.plan_access.allowed,false);
      const reloaded=await (await annCall(`${ann}/onboarding`)).json();
      assert.equal(reloaded.settings.ann_store_name_confirmed,true);
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_subscriptions")).n),0);
    });
    await t.test("accepted Free unlocks building without bypassing business publication approval",async()=>{
      const response=await billCall(`${billing}/free`,"POST",{price_id:offer.price_id,terms_version:offer.terms_version,accepted:true});
      assert.equal(response.status,200,await response.clone().text());
      assert.equal((await member(tx=>annPlanAccess(tx,store,ownerToken))).allowed,true);
      const initial=await (await annCall(`${ann}/onboarding`)).json();
      assert.equal(initial.business_access.plan_access.allowed,true);
      assert.equal((await member(tx=>tx`SELECT public.business_publication_access(${store}) AS approved`))[0].approved,false);
      assert.equal((await one("SELECT status FROM public.stores WHERE store_id=$1",[store])).status,"draft");
      assert.equal(Number((await one("SELECT count(*) n FROM public.billing_payments")).n),0);
    });
    await t.test("modal is hooked directly after name, with persisted boot state and recoverable close",async()=>{
      const [ui,client,modal]=await Promise.all([
        readFile(new URL("../src/ui/ann-builder.js",import.meta.url),"utf8"),
        readFile(new URL("../src/public/ann-builder.js",import.meta.url),"utf8"),
        readFile(new URL("../src/public/ann-plan-ui.js",import.meta.url),"utf8")
      ]);
      assert.match(ui,/planAccess:data\.business_access\?\.plan_access/);
      assert.match(client,/attachAnnPlanSelection/);
      assert.match(client,/data-ann-plan-open/);
      assert.match(client,/planAccess\.available\?\[\{id:"plan",step:"business"\}\]/,
        "the plan stage must also be visible to legacy stores without changing their enrolment requirement");
      assert.match(client,/billingUrl:`\$\{root\}\/billing`/,
        "Ann must link its plan modal to this store's plan cards and test checkout");
      assert.match(client,/planButton\.disabled=planLocked\(\)&&!planAccess\.name_confirmed/,
        "the persistent plan action must unlock as soon as name confirmation is saved");
      assert.match(client,/step === "business" && planAccess\.name_confirmed \? requiredBusinessPrompt\(\) \|\| "logo"/,
        "accepted onboarding must resume at the outstanding business requirement rather than asking for the store name again");
      assert.match(ui,/id="ann-store-plan"/,
        "stores that already passed Business must still be able to open the plan modal");
      assert.match(modal,/View plan cards and test checkout/);
      assert.doesNotMatch(modal,/Paid plans will be offered here later/);
      assert.match(client,/if\(planLocked\(\)\)\{promptId=requiredBusinessPrompt\(\);step="business"/,
        "reload must restore the plan stage even if the saved chat cursor is at the earlier name stage");
      assert.match(modal,/showModal/);
      assert.match(modal,/accepted: true/);
      assert.doesNotMatch(modal,/window\.confirm|window\.alert|checkout\.razorpay/);
    });
  }finally{await pg.close();}
});
