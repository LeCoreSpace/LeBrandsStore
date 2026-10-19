import test from "node:test";
import assert from "node:assert/strict";
import { renderDashboard } from "../src/ui/dashboard.js";
import { localDashboardFixture } from "../src/local-dashboard-fixture.js";
import { paymentState, fulfilmentState, matchesOrderTab, loadedSalesSummary } from "../src/public/dashboard-view-model.js";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";

test("admin shell keeps real navigation, account logout, search and mutation hooks",()=>{
  const data=localDashboardFixture();
  for(const view of ["overview","orders","order","products","product","customers","invoices","settings"]){
    const html=renderDashboard(view,data,{name:"<img src=x onerror=alert(1)>"});
    assert.match(html,/data-sidebar-collapse/);
    assert.match(html,/data-menu-toggle/);
    assert.match(html,/data-global-search/);
    assert.match(html,/data-open-order-count/);
    assert.match(html,/\/logout/);
    assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(html,/lb-eyebrow|The day, in view\.|Orders, without the guesswork\./);
  }
  assert.match(renderDashboard("order",data,{}),/data-order-status="packed"/);
  assert.match(renderDashboard("product",data,{}),/data-product-form/);
  assert.match(renderDashboard("products",data,{}),/<table/);
  assert.match(renderDashboard("customers",data,{}),/<table/);
  assert.match(renderDashboard("orders",data,{}),/data-order-tab="unfulfilled"/);
});
test("financial settings keep readonly prefix in the real form, required GSTIN errors and role restrictions",()=>{
  const data=localDashboardFixture();
  data.draft.invoice_prefix_locked=true;
  const owner=renderDashboard("settings",data,{});
  assert.match(owner,/name="invoice_prefix"[^>]*value="DEMO"[^>]*readonly/);
  assert.doesNotMatch(owner,/name="invoice_prefix"[^>]*disabled/);
  assert.match(owner,/data-tax-settings-form/);
  assert.match(owner,/data-contact-settings-form/);
  assert.match(owner,/name="support_email"/);
  assert.match(owner,/name="support_phone"/);
  assert.match(owner,/data-tax-error="gstin"/);
  assert.match(owner,/data-signature-upload/);
  const viewer=renderDashboard("settings",{...data,role:"viewer"},{});
  assert.match(viewer,/<fieldset disabled>/);
  assert.doesNotMatch(renderDashboard("order",{...data,role:"viewer"},{}),/<button[^>]*data-order-status=/);
});
test("payment and fulfilment badges do not claim cancelled or unknown payments are paid",()=>{
  assert.equal(paymentState({status:"cancelled"}),"unknown");
  assert.equal(paymentState({status:"pending_payment",payment_method:"card"}),"pending_payment");
  assert.equal(paymentState({status:"confirmed_cod",payment_method:"cod"}),"cod");
  assert.equal(paymentState({status:"delivered",payment_method:"cod",payment_collected_at:"2026-10-11"}),"paid");
  assert.equal(paymentState({status:"delivered",payment_method:"cod"}),"unpaid");
  assert.equal(paymentState({payment_status:"failed"}),"failed");
  assert.equal(fulfilmentState("paid"),"unfulfilled");
  assert.equal(fulfilmentState("delivered"),"delivered");
  assert.equal(matchesOrderTab("cancelled","cod","open"),false);
  assert.equal(matchesOrderTab("cancelled","cod","unpaid"),false);
  assert.equal(matchesOrderTab("returned","cod","cancelled"),false);
  assert.equal(matchesOrderTab("delivered","cod","open"),true);
  assert.equal(matchesOrderTab("delivered","paid","open"),false);
  assert.equal(matchesOrderTab("packed","cod","unfulfilled"),true);
});
test("loaded-range KPI calculations preserve integer paise and exclude terminal sales without dropping order count",()=>{
  assert.deepEqual(loadedSalesSummary([{total_paise:101,status:"paid"},{total_paise:202,status:"delivered"},{total_paise:999,status:"cancelled"}]),
    {orders:3,revenue_paise:303,aov_paise:152});
  assert.deepEqual(loadedSalesSummary([{total_paise:999,status:"refunded"}]),{orders:1,revenue_paise:0,aov_paise:null});
  assert.deepEqual(loadedSalesSummary(),{orders:0,revenue_paise:0,aov_paise:null});
});
test("new presentation helper is actually served, and table rows cannot trigger status mutations",async()=>{
  let assetPath="";
  const response=await worker.fetch(new Request("https://app.lebrands.store/assets/dashboard-view-model.js"),{
    ASSETS:{fetch:async request=>{assetPath=new URL(request.url).pathname;return new Response("export const helper=true;",{headers:{"content-type":"text/javascript"}});}},
  },{});
  assert.equal(response.status,200);
  assert.equal(assetPath,"/dashboard-view-model.js");
  const js=await readFile("src/public/dashboard.js","utf8");
  assert.match(js,/querySelectorAll\("button\[data-order-status\]"\)/);
  assert.doesNotMatch(js,/querySelectorAll\("\[data-order-status\]"\)/);
});
