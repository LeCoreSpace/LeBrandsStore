import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {getAnnPlanFixture} from "../src/ann-plan-preview-fixture.js";
import {handleBillingPages} from "../src/billing/pages.js";
import {billingContinuation,billingDestination} from "../src/billing/entry.js";
import {handleAccounts} from "../src/auth/routes.js";
import {hashPassword} from "../src/auth/passwords.js";
import {navigationModel} from "../src/ui/dashboard-navigation.js";
import {pricingMain} from "../src/ui/pricing.js";
import {renderPlanBillingContent} from "../src/ui/plan-billing.js";

const origin="https://app.lebrands.store";
test("billing continuations are strictly local, allowlisted and never create subscriptions",()=>{
  assert.equal(billingContinuation("/plans?plan=grow&interval=annual"),"/plans?plan=grow&interval=annual");
  for(const path of ["https://evil.test/plans","//evil.test/plans","/\\evil.test","/plans#fragment",
    "/plans?next=https://evil.test","/plans?plan=grow&plan=scale","/plans?plan=unknown","/plans?interval=weekly","/account","/plans%0d%0a"]){
    assert.equal(billingContinuation(path),null,path);
  }
  assert.equal(billingDestination("free",null),"/plans?plan=free");
  assert.match(pricingMain(),/https:\/\/app\.lebrands\.store\/plans\?plan=free/);
  for(const p of ["launch","grow","scale","flagship"])assert.match(pricingMain(),new RegExp(`\\/plans\\?plan=${p}`));
});
test("isolated billing preview imports without touching production or failing startup",async()=>{
  assert.equal(typeof (await import("../src/billing-preview-fixture.js")).billingPreview,"function");
});

test("pricing login preserves intent through validation without trusting external destinations",async()=>{
  const env={PASSWORD_PEPPER:Buffer.alloc(32,0x42).toString("base64"),SESSION_SECRET:"public-billing-test-session-secret"};
  const pass=await hashPassword("Billing test password 73!",env);
  const current={user_id:"11111111-1111-4111-8111-111111111111",must_change_password:false,stores:[]};
  let activeHash;
  const repository={
    session:async hash=>hash===activeHash?current:null,
    login:async(_email,_ip,verify)=>{
      const result=await verify({...pass,user_id:current.user_id});
      if(result)activeHash=result.tokenHash;return result;
    }
  };
  const deps={createDb:()=>({close:async()=>{}}),repository};
  const next="/plans?plan=grow&interval=annual";
  const page=await handleAccounts(new Request(`${origin}/plans?plan=grow&interval=annual`),env,{},deps);
  assert.equal(page.status,303);assert.equal(page.headers.get("location"),`/login?next=${encodeURIComponent(next)}`);
  const loginPage=await handleAccounts(new Request(origin+page.headers.get("location")),env,{},deps);
  assert.match(await loginPage.text(),/name="next" value="\/plans\?plan=grow&amp;interval=annual"/);
  const post=async(password,dest)=>handleAccounts(new Request(`${origin}/login`,{
    method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({email:"billing-owner@example.test",password,next:dest})
  }),env,{},deps);
  const bad=await post("Wrong password 99!",next);
  assert.equal(bad.status,400);assert.match(await bad.text(),/name="next" value="\/plans\?plan=grow&amp;interval=annual"/);
  const ok=await post("Billing test password 73!",next);
  assert.equal(ok.status,303);assert.equal(ok.headers.get("location"),next);
  assert.match(ok.headers.get("set-cookie"),/HttpOnly/);
  const malicious=await post("Billing test password 73!","https://evil.test/");
  assert.equal(malicious.headers.get("location"),"/");
  current.must_change_password=true;
  const forced=await post("Billing test password 73!",next);
  assert.equal(forced.headers.get("location"),`/account?next=${encodeURIComponent(next)}`);
  const cookie=forced.headers.get("set-cookie").split(";")[0];
  const account=await handleAccounts(new Request(origin+forced.headers.get("location"),{headers:{cookie}}),env,{},deps);
  assert.match(await account.text(),/name="next" value="\/plans\?plan=grow&amp;interval=annual"/);
});
test("synthetic HTTP authentication creates a real persisted session and reaches owner billing",async()=>{
  const {billingPreview}=await import("../src/billing-preview-fixture.js");
  async function call(url,body="",cookie="",options={}){
    const req=Readable.from(body?[Buffer.from(body)]:[]);
    Object.assign(req,{url,method:options.method||(body?"POST":"GET"),headers:{
      cookie,origin:"http://localhost","content-type":options.contentType||"application/x-www-form-urlencoded"
    }});
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
    assert.equal(await billingPreview(req,res),true);return res;
  }
  const login=await call("/__billing-preview/login",new URLSearchParams({
    email:"billing-owner@example.test",password:"Billing preview password 73!",next:"/plans?plan=grow&interval=annual"
  }).toString());
  assert.equal(login.status,303);
  assert.equal(login.headers.location,"/__billing-preview/plans?plan=grow&interval=annual");
  const cookie=login.headers["set-cookie"].split(";")[0];
  assert.match(cookie,/^__Host-lb_billing_fixture=/);
  const picker=await call(login.headers.location,"",cookie);
  assert.equal(picker.status,200);assert.match(picker.body,/Which store is this for/);assert.match(picker.body,/Second Studio/);
  const f=await getAnnPlanFixture();
  const billing=await call(`/__billing-preview/stores/${f.store}/billing?plan=grow`,"",cookie);
  assert.equal(billing.status,200);assert.match(billing.body,/Plan &amp; billing/);assert.match(billing.body,/Choose Free in Ann/);
  const endpoint=`/__billing-preview/api/stores/${f.store}/ann/onboarding`;
  const initial=JSON.parse((await call(endpoint,"",cookie)).body);
  const saved=await call(endpoint,JSON.stringify({expected_draft:initial.expected_draft,confirm:true,brand_name:"Example Studio"}),cookie,{
    method:"PATCH",contentType:"application/json"
  });
  assert.equal(saved.status,200,saved.body);
  assert.equal(JSON.parse(saved.body).settings.ann_store_name_confirmed,true);
});

test("owner billing reads real state, protects other tenants, and keeps every paid checkout disabled",async t=>{
  const f=await getAnnPlanFixture(),{pg,db,store,owner,ownerToken}=f;
  const request=(path,method="GET")=>new Request(origin+path,{method});
  const stores=[{store_id:store,name:"Example Studio",role:"owner",subdomain:"example-studio",status:"draft"}];
  const page=path=>handleBillingPages(request(path),db,owner,ownerToken,stores);
  const count=async name=>Number((await pg.query(`SELECT count(*) n FROM public.${name}`)).rows[0].n);
  try{
    await t.test("single-store entry redirects and multiple stores require a real owner selection",async()=>{
      const single=await page("/plans?plan=grow&interval=annual");
      assert.equal(single.status,303);
      assert.equal(single.headers.get("location"),`/stores/${store}/billing?plan=grow&interval=annual`);
      const picker=await handleBillingPages(request("/plans?plan=grow"),db,owner,ownerToken,[
        ...stores,{store_id:"22222222-2222-4222-8222-222222222222",name:"Other owned studio",role:"owner"},
        {store_id:"33333333-3333-4333-8333-333333333333",name:"Private staff store",role:"editor"}
      ]);
      const body=await picker.text();
      assert.match(body,/Other owned studio/);assert.doesNotMatch(body,/Private staff store/);
      assert.match(body,/plan=grow/);assert.equal(picker.headers.get("cache-control"),"no-store");
      const empty=await handleBillingPages(request("/plans"),db,owner,ownerToken,[]);
      assert.match(await empty.text(),/Create a store/);
    });
    await t.test("new stores are directed to the Ann modal rather than silently enrolled",async()=>{
      const result=await page(`/stores/${store}/billing?plan=grow&interval=annual`);
      assert.equal(result.status,200,await result.clone().text());
      const body=await result.text();
      assert.match(body,/Plan &amp; billing/);
      assert.match(body,/Choose Free in Ann/);
      assert.match(body,/You asked about the Grow plan/);
      assert.match(body,/paid checkout is not available/i);
      assert.match(body,/Quotation required/);assert.match(body,/₹1,499/);
      assert.doesNotMatch(body,/From ₹0|data-billing-choose-free|checkout\.razorpay/);
      assert.equal(await count("billing_subscriptions"),0);assert.equal(await count("billing_payments"),0);
      assert.equal((await page(`/stores/${store}/billing`)).headers.get("cache-control"),"no-store");
      assert.equal((await handleBillingPages(request(`/stores/${store}/billing`,"HEAD"),db,owner,ownerToken,stores)).status,200);
    });
    await t.test("staff, forged owners and mutations cannot read or change private billing",async()=>{
      assert.equal((await handleBillingPages(request(`/stores/${store}/billing`),db,owner,"b".repeat(64),stores)).status,403);
      assert.equal((await handleBillingPages(request("/stores/ffffffff-ffff-4fff-8fff-ffffffffffff/billing"),db,owner,ownerToken,stores)).status,403);
      assert.equal((await handleBillingPages(request(`/stores/${store}/billing`,"POST"),db,owner,ownerToken,stores)).status,405);
      const find=model=>model.groups.flatMap(g=>g.items).find(i=>i.label==="Plan & billing");
      assert.equal(find(navigationModel(`/stores/${store}`,{role:"owner"})).href,`/stores/${store}/billing`);
      assert.equal(find(navigationModel(`/stores/${store}`,{role:"admin"})).href,null);
      assert.equal(await count("billing_subscriptions"),0);
    });
    await t.test("a non-Indian authoritative billing country never inherits Indian prices",async()=>{
      const foreignDb={withMemberStore:(id,hash,fn,options)=>db.withMemberStore(id,hash,tx=>fn(async(strings,...values)=>{
        if(strings.join("").includes("billing_free_state("))return [{state:{
          subscription:null,country_code:"US",reason:"unsupported_country",can_enrol:false,offer:null
        }}];
        return tx(strings,...values);
      }),options)};
      const response=await handleBillingPages(request(`/stores/${store}/billing`),foreignDb,owner,ownerToken,stores);
      assert.equal(response.status,200);
      const body=await response.text();
      assert.match(body,/Free plan not offered in this country/);
      assert.match(body,/No price is listed for this store(?:'|&#39;)s country/);
      assert.doesNotMatch(body,/₹1,499|₹999/);
    });
    await t.test("actual Free subscription snapshots and timer survive page reload",async()=>{
      await pg.query("UPDATE public.store_setup SET settings=settings||'{\"ann_store_name_confirmed\":true}'::jsonb WHERE store_id=$1",[store]);
      await db.withMemberStore(store,ownerToken,async tx=>{
        const [state]=await tx`SELECT public.billing_free_state(${store},${ownerToken}) state`;
        const d=typeof state.state==="string"?JSON.parse(state.state):state.state;
        await tx`SELECT public.billing_activate_free(${store},${ownerToken},${d.offer.price_id},'free-v1',true)`;
      });
      const response=await page(`/stores/${store}/billing`);
      const body=await response.text();
      assert.match(body,/Your 30 live days have not started/);
      assert.match(body,/Published products/);assert.match(body,/Up to 100/);assert.match(body,/Up to 1,000/);
      assert.match(body,/LeBrands.Space placement/);assert.match(body,/Not included/);
      assert.match(body,/No payments recorded/);assert.match(body,/No tax invoices issued/);
      assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("billing_payments"),0);
    });
    await t.test("nullable quotation amounts and test histories are never mislabelled as live zero-price charges",async()=>{
      const html=renderPlanBillingContent({store:{store_id:store},role:"owner",billing:{
        state:{subscription:null,reason:"unsupported_country"},access:{},
        payments:[{mode:"test",amount_minor:null,currency:"INR",status:"captured"}],
        invoices:[{mode:"test",total_minor:null,currency:"INR",status:"issued",invoice_number:"TEST-ONLY"}],
        catalogue:[{code:"flagship",name:"Flagship",prices:[{price_kind:"accepted_quote_required",amount_minor:null,advertised_from_minor:1999900,currency:"INR",enabled:false}],features:[]}]
      }});
      assert.match(html,/Quotation required/);assert.doesNotMatch(html,/₹0\.00/);
      assert.match(html,/TEST-ONLY/);assert.match(html,/<td>Test<\/td>/);
      const client=await readFile(new URL("../src/public/plan-billing.js",import.meta.url),"utf8");
      assert.match(client,/attachAnnPlanSelection/);assert.match(client,/location\.reload/);
    });
  }finally{await pg.close();}
});
