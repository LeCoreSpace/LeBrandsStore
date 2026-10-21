import test from "node:test";
import assert from "node:assert/strict";
import {renderPlanUsage,mediaSize} from "../src/ui/billing-usage.js";
import {billingPageData} from "../src/billing/pages.js";
import {withSocialAdIntegration} from "../src/billing/features.js";
import {renderPlanBillingContent} from "../src/ui/plan-billing.js";
import {pricingMain} from "../src/ui/pricing.js";

const entitlements = {
  published_products:{included:true,value:100},published_skus:{included:true,value:1000},
  public_media_bytes:{included:true,value:536870912},additional_staff_seats:{included:true,value:0},
  custom_domain:{included:false},payment_partner_integration:{included:true},
  delivery_partner_integration:{included:true},
};
const usage = {available:true,published_products:12,published_skus:35,public_media_bytes:52428800,
  additional_staff_seats:0,monthly_order_soft_band:8,social_available:true,social:{meta:true,google:true},
  payment:{status:"connected",mode:"test",enabled:true},delivery:null,domain:null};
test("real counts, human-readable storage, zero-seat limits and connection statuses render together",()=>{
  const html=renderPlanUsage(entitlements,usage);
  for(const text of ["12 of 100 used","35 of 1,000 used","50 MB of 512 MB used","0 of 0 used",
    "5,24,28,800 of 53,68,70,912 bytes","Connected · Test mode","Not connected","Meta + Google configured"]){
    assert.ok(html.includes(text),text);
  }
  assert.doesNotMatch(html,/NaN|Infinity/);
  assert.equal(mediaSize(0),"0 bytes");
  assert.equal(mediaSize(1073741824),"1 GB");
});
test("owner billing page exposes live usage and a read-only refresh; all public pricing plans advertise social integration",()=>{
  const html=renderPlanBillingContent({store:{store_id:"store-id",name:"Fixture"},
    billing:{state:{subscription:{plan:"free",entitlements}},usage,catalogue:[],access:{}}});
  assert.match(html,/Current plan usage and connections/);
  assert.match(html,/12 of 100 used/);
  assert.match(html,/data-billing-reload>Refresh usage<\/button>/);
  assert.match(html,/<details class="pb-card" open>/);
  const pricing=pricingMain();
  assert.equal((pricing.match(/<dt>Social media Ad Integration<\/dt><dd>Included<\/dd>/g)||[]).length,4);
  assert.match(pricing,/<li>Social media Ad Integration included\.<\/li>/);
});
test("over-limit usage is shown honestly and missing usage is never invented as zero",()=>{
  const html=renderPlanUsage(entitlements,{...usage,published_products:120,additional_staff_seats:2});
  assert.match(html,/120 of 100 used/);assert.match(html,/2 of 0 used/);
  assert.equal((html.match(/Above your plan allowance/g)||[]).length,2);
  const missing=renderPlanUsage(entitlements);
  assert.match(missing,/Usage unavailable/);assert.match(missing,/Status unavailable/);
  assert.doesNotMatch(missing,/0 of 100|Not connected/);
});
test("Meta, Google, both, disabled and unavailable configurations stay distinct",()=>{
  for(const [social,social_available,text] of [
    [{meta:true},true,"Meta configured"],[{google:true},true,"Google configured"],
    [{meta:true,google:true},true,"Meta + Google configured"],
    [{meta_saved:true},true,"Saved · Switched off"],[{},true,"Not configured"],[null,false,"Status unavailable"],
  ])assert.ok(renderPlanUsage(entitlements,{...usage,social,social_available}).includes(text));
});
test("active connections remain visible even when an old plan snapshot excludes a feature",()=>{
  const html=renderPlanUsage(entitlements,{...usage,payment:{status:"connected",mode:"live",enabled:true,verified:true},
    delivery:{status:"connected",enabled:false},domain:{status:"active",hostname:'www.example.test<script>'}});
  assert.match(html,/Connected · Live/);assert.match(html,/Connected · Switched off/);
  assert.match(html,/Not included in this plan/);assert.match(html,/www\.example\.test&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.ok(renderPlanUsage(entitlements,{...usage,domain:{status:"pending",hostname:"www.example.test"}}).includes("Connecting"));
  assert.ok(renderPlanUsage(entitlements,{...usage,payment:{status:"error"}}).includes("Connection error"));
  assert.ok(renderPlanUsage(entitlements,{...usage,payment:{status:"connected",enabled:true,mode:"live",verified:false}}).includes("Verification incomplete"));
});
test("unknown and negotiated limits are not presented as unlimited or zero",()=>{
  const html=renderPlanUsage({published_products:{included:true,value:null}},usage);
  assert.match(html,/12 used/);assert.match(html,/No fixed limit recorded/);
  assert.doesNotMatch(html,/12 of 0|Unlimited/);
});
test("universal social feature projection is idempotent and never mutates saved entitlements",()=>{
  const original=[{key:"custom_domain",included:false}];
  assert.deepEqual(withSocialAdIntegration(withSocialAdIntegration(original)),withSocialAdIntegration(original));
  assert.deepEqual(original,[{key:"custom_domain",included:false}]);
});
test("billing denies non-owners before reading usage, provider settings or catalogue",async()=>{
  for(const role of ["admin","editor",null]){
    let calls=0;const tx=async()=>{calls++;return role?[{role}]:[];};
    await assert.rejects(billingPageData(tx,"store-id",{id:"user-id"},"a".repeat(64)),error=>error.status===403);
    assert.equal(calls,1);
  }
});
