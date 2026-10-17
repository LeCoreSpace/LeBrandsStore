import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {essentialsMarkup,connectionHref} from "../src/public/store-essentials.js";
import {buildProgress,openingChecks,setupProgressCard} from "../src/ui/store-setup-progress.js";
import {renderDashboard} from "../src/ui/dashboard.js";
import {localDashboardFixture} from "../src/local-dashboard-fixture.js";
import worker from "../src/index.js";

const ID="11111111-1111-4111-8111-111111111111";
test("essentials link directly to Settings with no forms or activation requests",()=>{
  const html=essentialsMarkup(ID,null,"Status unavailable");
  for(const kind of ["domain","payments","delivery"])assert.ok(html.includes(connectionHref(ID,kind)));
  assert.doesNotMatch(html,/<input|<textarea|data-ln-a=|build\/ann\?launch/);
  assert.match(html,/enable|whether it is enabled/);
  assert.match(html,/optional/);
  assert.match(html,/Retry status/);
});
test("essentials show real COD, domain and provider activation, never preference as activation",()=>{
  const inactive=essentialsMarkup(ID,{included_address:"brand.lebrands.store",cod_enabled:false,preferences:{payments:"razorpay"},providers:{razorpay:{verified:true,runtime_ready:false}}});
  assert.match(inactive,/Online payments are not active/);
  assert.match(inactive,/enable it in checkout/);
  const active=essentialsMarkup(ID,{included_address:"brand.lebrands.store",cod_enabled:true,domain:{hostname:"www.brand.com",status:"active"},providers:{razorpay:{runtime_ready:true},shiprocket:{runtime_ready:true}}});
  for(const text of ["Cash on Delivery is enabled","Razorpay online payments are active","Automatic Shiprocket shipping is active","www.brand.com (active)"])assert.ok(active.includes(text),text);
  assert.doesNotMatch(essentialsMarkup(ID,{included_address:'<img src=x onerror=alert(1)>'}),/<img/);
});
test("build progress reads saved answers and confirmed identity, not current step",()=>{
  const data={store:{subdomain:"brand"},draft:{settings:{brand_name:"Brand",subdomain:"brand"},gstinVerification:{state:"verified",confirmed:true}},annSession:{current_step:"review",answers:{style_preset:"minimal"}}};
  const stages=buildProgress(data);
  assert.equal(stages.length,9);
  assert.ok(stages.find(s=>s.key==="business").complete);
  assert.ok(stages.find(s=>s.key==="selling").complete);
  assert.ok(stages.find(s=>s.key==="style").complete);
  assert.equal(stages.find(s=>s.key==="products").complete,false);
  assert.ok(stages.every(s=>!["domain","payments","shipping"].includes(s.key)));
  data.draft.gstinVerification.confirmed=false;
  assert.equal(buildProgress(data).find(s=>s.key==="business").complete,false);
  assert.equal(buildProgress({...data,annProgressAvailable:false}),null);
});
test("opening checks exclude optional connections and require actual checkout configuration",()=>{
  const data={store:{subdomain:"brand"},draft:{settings:{},products:[],policies:[]},checkoutSettings:{cod_enabled:true,store_state:"33"},checkoutSaved:true};
  const checks=openingChecks(data);
  assert.ok(checks.find(c=>c.label==="Cash on Delivery or online checkout enabled").complete);
  assert.ok(checks.find(c=>c.label==="Checkout and delivery settings saved").complete);
  assert.ok(checks.every(c=>!/domain|Shiprocket|Razorpay/.test(c.label)));
  assert.equal(checks.find(c=>c.label==="At least one complete product").complete,false);
  data.checkoutSettings.cod_enabled=false;
  assert.equal(openingChecks(data).at(-1).complete,false);
  assert.equal(openingChecks({...data,onlineAvailable:true}).at(-1).complete,true);
});
test("Today separates saved Ann progress from opening requirements and collapses for live stores",()=>{
  const data=localDashboardFixture();
  const draft=setupProgressCard(data);
  assert.match(draft,/Build with Ann/);
  assert.match(draft,/Ready to open/);
  assert.match(draft,/Continue with Ann/);
  assert.match(draft,/setup\?step=4/);
  const live=setupProgressCard({...data,store:{...data.store,status:"live",approval_revoked_at:null}});
  assert.match(live,/<details><summary>Your store setup/);
  assert.doesNotMatch(live,/<details open/);
});
test("connection pages preserve the dashboard shell and mount real provider controls",()=>{
  for(const kind of ["domain","payments","delivery"]){
    const html=renderDashboard("settings",{...localDashboardFixture(),connectionKind:kind});
    assert.match(html,new RegExp(`data-connection-kind="${kind}"`));
    assert.match(html,/id="ann-launch-slot"/);
    assert.match(html,/data-nav-group="settings"/);
    assert.match(html,/Return to Ann/);
    assert.match(html,/ann-builder\.css/);
  }
});
test("new browser modules are served through the Worker asset allowlist",async()=>{
  for(const name of ["store-essentials.js","settings-connections.js"]){
    let target;
    const res=await worker.fetch(new Request(`https://app.lebrands.store/assets/${name}`),{ASSETS:{fetch:async r=>{target=new URL(r.url).pathname;return new Response("export{};");}}},{});
    assert.equal(res.status,200);
    assert.equal(target,`/${name}`);
  }
});
test("Today loads tenant-scoped saved progress, and connection visits avoid paid GST rechecks",async()=>{
  const route=await readFile("src/dashboard/routes.js","utf8");
  assert.match(route,/loadAnnSession\(tx,id\)/);
  assert.match(route,/annReference\(tx\)/);
  assert.match(route,/section==="settings"&&read&&!connectionKind/);
  assert.match(route,/withMemberStore\(id,tokenHash/);
});
