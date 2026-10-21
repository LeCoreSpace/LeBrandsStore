import test from "node:test";
import assert from "node:assert/strict";
import {renderPlanCards} from "../src/ui/billing-plan-cards.js";
import {renderPlanBillingContent} from "../src/ui/plan-billing.js";

const state = {
  can_enrol:true, reason:"available",
  offer:{amount_minor:0,currency:"INR",live_days:30,entitlements:{
    published_products:{included:true,value:100},
    published_skus:{included:true,value:1000},
    lebrands_space_placement:{included:false},
    public_media_bytes:{included:true,value:53687091200},
  }},
};
const catalogue = [
  {code:"launch",name:"Launch",offer_state:"draft",prices:[
    {id:"monthly-price-id",billing_interval:"monthly",price_kind:"fixed",amount_minor:149900,currency:"INR"},
    {id:"annual-price-id",billing_interval:"annual",price_kind:"fixed",amount_minor:1499000,currency:"INR"},
  ],features:[
    {key:"published_products",included:true,value:500,availability:"enforcement_not_implemented"},
    {key:"data_export",included:true,availability:"csv_exports_exist_media_archive_not_implemented"},
  ]},
  {code:"flagship",name:"Flagship",contract_required:true,prices:[],features:[]},
];
const billing = {catalogue,testCheckout:{available:true,eligible:true}};
const render = (b=billing,s=state,access={}) => renderPlanCards(b,s,access,"store-id",s.can_enrol===true);

test("plan cards initialise requested yearly total and preserve exact server price identities",()=>{
  const html=render({...billing,requestedPlan:"launch",requestedInterval:"annual"});
  assert.match(html,/data-billing-interval="annual" aria-pressed="true"/);
  assert.match(html,/data-billing-interval="monthly" aria-pressed="false"/);
  assert.match(html,/data-plan-interval="monthly" hidden/);
  assert.match(html,/data-plan-interval="annual"><div class="pb-price-line"><strong>₹14,990\.00/);
  assert.match(html,/data-test-price="annual-price-id" data-test-label="Launch, annual" data-test-amount="1499000"/);
  assert.match(html,/data-test-price="monthly-price-id" data-test-label="Launch, monthly" data-test-amount="149900"/);
  assert.match(html,/paid upfront/);
  assert.match(html,/Razorpay test mode only/);
  assert.match(html,/class="pb-plan is-asked" data-plan="launch"/);
});

test("Free selection is rendered only once and active Free keeps its snapshot card",()=>{
  assert.equal((render().match(/data-billing-choose-free/g)||[]).length,1);
  const enforced=render(billing,state,{enforced:true});
  assert.match(enforced,/Choose Free in Ann/);
  assert.doesNotMatch(enforced,/data-billing-choose-free/);
  const active=render(billing,{subscription:{plan:"free",currency:"INR",entitlements:state.offer.entitlements}});
  assert.match(active,/data-plan="free"/);
  assert.match(active,/Current plan/);
  assert.match(active,/up to 100/);
  assert.match(active,/up to 1,000/);
  assert.match(active,/<li data-on="no"><span class="pb-sr">Not included: <\/span>LeBrands\.Space placement<\/li>/);
  assert.match(active,/50 GB/);
  assert.doesNotMatch(active,/data-billing-choose-free/);
});

test("disabled and foreign-country cards never expose an actionable checkout price",()=>{
  for(const testCheckout of [{available:false},{available:true,eligible:false}]){
    const html=render({...billing,testCheckout});
    assert.doesNotMatch(html,/data-test-price=/);
    assert.match(html,/disabled aria-describedby/);
    assert.match(html,testCheckout.available?/Approved Indian business documents/:/Test checkout is not configured/);
  }
  const foreign=render({...billing,catalogue:catalogue.map(p=>({...p,prices:[]}))},{});
  assert.match(foreign,/No price is listed for this store's country/);
  assert.doesNotMatch(foreign,/₹|data-test-price=/);
  assert.match(foreign,/Request a quote/);
});

test("features show names and limits without readiness or draft labels, while checkout safeguards remain",()=>{
  const html=render();
  assert.match(html,/Published products: up to 500/);
  assert.doesNotMatch(html,/pb-planned|Not enabled|Verification pending|Setup required|>Draft<|>Proposal<|Features marked/);
  assert.match(html,/Quotation required/);
  assert.match(html,/Razorpay test mode only/);
  assert.match(html,/Test payment only\. No real money moves\./);
  const escaped=render({...billing,catalogue:[{code:"flagship",name:'<script>alert("unsafe")</script>',contract_required:true,features:[]}]});
  assert.doesNotMatch(escaped,/<script>/);
  assert.match(escaped,/&lt;script&gt;/);
});

test("all feature readiness states remain presentation-free without changing inclusion or limits",()=>{
  const availability=["planned","upcoming","conditional_on_domain","verification_pending","acceptance_required","available"];
  const features=availability.map((value,index)=>({key:`feature_${index}`,name:`Feature ${index}`,included:index!==1,value:42,availability:value}));
  const html=render({...billing,catalogue:[{...catalogue[0],features}]});
  const items=[...html.matchAll(/<li data-on="(yes|no)">([\s\S]*?)<\/li>/g)].slice(-features.length);
  assert.equal(items.length,features.length);
  items.forEach(([,on,content],index)=>{
    assert.equal(on,index===1?"no":"yes");
    assert.ok(content.includes(`Feature ${index}`));
    if(index!==1)assert.match(content,/up to 42/);
    assert.doesNotMatch(content,/<small|pb-planned|Setup required|Not enabled|Verification pending/);
  });
});

test("dashboard has a single card catalogue, one Free acceptance and one consent dialog",()=>{
  const html=renderPlanBillingContent({store:{store_id:"store-id"},billing:{...billing,state,access:{}}});
  assert.equal((html.match(/id="plans"/g)||[]).length,1);
  assert.equal((html.match(/data-billing-choose-free/g)||[]).length,1);
  assert.equal((html.match(/data-test-dialog aria-labelledby/g)||[]).length,1);
  assert.doesNotMatch(html,/What Free would include|Try a paid-plan payment/);
});
