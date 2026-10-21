import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachAnnLaunch } from "../src/public/ann-launch-ui.js";

const flush=async()=>{await new Promise(setImmediate);await new Promise(r=>setTimeout(r,2));};
async function harness(readOnly=false,onStep,settingsMode=false,api="/isolated/api") {
  const previous={document:globalThis.document,fetch:globalThis.fetch};
  const events=new Map(),requests=[];
  const slot={innerHTML:"",scrollTop:0,contains:t=>Boolean(t),querySelector:()=>null,querySelectorAll:()=>[]};
  globalThis.document={activeElement:null,querySelector:()=>slot,addEventListener:(name,fn)=>{
    const list=events.get(name)||[];list.push(fn);events.set(name,list);
  }};
  let state={revision:0,can_edit:!readOnly,execution_available:true,included_address:"sample.lebrands.store",
    preferences:{address:"included",payments:"cod",delivery:"manual"},providers:{},platform:{domains_available:false},jobs:[]};
  let fail=false,done=0,saved=0;
  globalThis.fetch=async(url,options={})=>{
    if(options.method==="PATCH") {
      const body=JSON.parse(options.body);requests.push(body);
      if(fail) return Response.json({error:"Please retry. Your choices are kept."},{status:503});
      state={...state,revision:state.revision+1,preferences:body.preferences};
    }
    return Response.json(state);
  };
  const ui=attachAnnLaunch({api,readOnly,onStep,settingsMode,onSaved:()=>saved++,onDone:()=>done++});
  ui.mount();await flush();
  const click=async dataset=>{
    const target={dataset,disabled:false,closest(){return this;}};
    for(const fn of events.get("click")||[])fn({target,preventDefault(){}});
    await flush();
  };
  return {ui,slot,requests,click,ack:(key,checked)=>{for(const fn of events.get("change")||[])fn({target:{dataset:{lnAck:key},checked}});},input:(key,value)=>{for(const fn of events.get("input")||[])fn({target:{dataset:{ln:key},value}});},toggle:(provider,open)=>{for(const fn of events.get("toggle")||[])fn({target:{dataset:{lnProvider:provider},open}});},setFailure:v=>{fail=v;},setState:v=>{state={...state,...v};},get done(){return done;},get saved(){return saved;},
    async close(){await flush();globalThis.document=previous.document;globalThis.fetch=previous.fetch;}};
}
test("merchant settings omit diagnostics and display active payments as a clear green success",async()=>{
  const api="/api/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ann";
  const h=await harness(false,undefined,true,api);
  try{
    h.setState({providers:{razorpay:{verified:true,auth_type:"oauth",mode:"live",webhook_verified:true,runtime_ready:true}},
      platform:{razorpay_oauth_available:true}});
    await h.click({lnA:"reload"});
    h.ui.mount(2);
    assert.doesNotMatch(h.slot.innerHTML,/Read-only payment diagnostics|rz\.payment_id|Check payment<\/button>/);
    assert.match(h.slot.innerHTML,/class="ann-callout ann-success" role="status">Online payments are on\. Customers can now pay through Razorpay\./);
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.deepEqual(h.requests,[]);
    assert.equal(h.saved,0);assert.equal(h.done,0);
    h.setState({providers:{razorpay:{verified:true,auth_type:"oauth",mode:"live",webhook_verified:false,runtime_ready:false}}});
    await h.click({lnA:"reload"});
    assert.match(h.slot.innerHTML,/class="ann-callout" role="status">Your Razorpay account is connected\. We’re waiting/);
    assert.doesNotMatch(h.slot.innerHTML,/ann-success|Read-only payment diagnostics/);
    assert.match(h.slot.innerHTML,/data-ln-a="pay-on" disabled/);
  }finally{await h.close();}
});
test("read-only members are not offered owner payment diagnostics",async()=>{
  const h=await harness(true,undefined,true);
  try{
    h.setState({providers:{razorpay:{verified:true,auth_type:"oauth",mode:"live"}}});
    await h.click({lnA:"reload"});
    h.ui.mount(2);
    assert.doesNotMatch(h.slot.innerHTML,/Read-only payment diagnostics/);
  }finally{await h.close();}
});
test("success styles are green in both the dashboard and Ann without recolouring warnings or errors",async()=>{
  const [dashboard,ann]=await Promise.all([readFile("src/public/dashboard.css","utf8"),readFile("src/public/ann-builder.css","utf8")]);
  for(const css of [dashboard,ann]){
    assert.match(css,/\.ann-callout\.ann-success\{[^}]*background:#effaf3;[^}]*color:#166534/);
    assert.match(css,/\.ann-callout(?:,\.ann-error)?\{[^}]*border-left:3px solid #b45309/);
  }
});
test("unavailable domain choices stay readable, explain their prerequisite and cannot be selected",async()=>{
  const h=await harness();
  try {
    assert.match(h.slot.innerHTML,/data-v="custom"[^>]*aria-disabled="true"[^>]*disabled/);
    assert.match(h.slot.innerHTML,/Own website addresses are not available yet/);
    assert.match(h.slot.innerHTML,/sample\.lebrands\.store/);
    await h.click({pref:"address",v:"custom"});
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.equal(h.requests.length,0);
    assert.match(h.slot.innerHTML,/data-v="included" aria-pressed="true"/);
  } finally {await h.close();}
});
test("default choices can proceed address to payments to delivery and return to review without writes or activation",async()=>{
  const h=await harness();
  try {
    await h.click({lnA:"next",next:"2"});
    assert.match(h.slot.innerHTML,/data-step="2" open/);
    assert.doesNotMatch(h.slot.innerHTML,/data-step="1" open/);
    await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="3" open/);
    await h.click({lnA:"next",next:"4"});
    assert.equal(h.done,1);assert.equal(h.requests.length,0);
    assert.match(h.slot.innerHTML,/does not activate services/);
  } finally {await h.close();}
});
test("save-and-continue retains failed choices, advances only after commit, and never activates a provider",async()=>{
  const h=await harness();
  try {
    await h.click({lnA:"next",next:"2"});
    await h.click({pref:"payments",v:"razorpay"});
    h.setFailure(true);await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="2" open/);
    assert.match(h.slot.innerHTML,/Your choices are kept/);
    assert.equal(h.ui.hasUnsavedChanges(),true);assert.equal(h.saved,0);
    h.setFailure(false);await h.click({lnA:"next",next:"3"});
    assert.match(h.slot.innerHTML,/data-step="3" open/);
    assert.equal(h.ui.hasUnsavedChanges(),false);assert.equal(h.saved,1);
    assert.equal(h.requests.length,2);
    assert.ok(h.requests.every(r=>r.action==="choose" && r.confirm===true && r.expected_revision===0));
    assert.deepEqual(h.requests[1].preferences,{address:"included",payments:"both",delivery:"manual"});
  } finally {await h.close();}
});
test("readonly members cannot save or advance through owner actions",async()=>{
  const h=await harness(true);
  try {
    await h.click({pref:"payments",v:"razorpay"});
    await h.click({lnA:"next",next:"4"});
    assert.equal(h.requests.length,0);assert.equal(h.done,0);
  } finally {await h.close();}
});
test("COD and manual tracking remain selected alongside partners, persist and reload without activation",async()=>{
  const h=await harness();
  try{
    h.ui.mount(2);
    await h.click({pref:"payments",v:"razorpay"});
    assert.match(h.slot.innerHTML,/data-v="cod" aria-pressed="true"/);
    assert.match(h.slot.innerHTML,/data-v="razorpay" aria-pressed="true"/);
    assert.match(h.slot.innerHTML,/data-ln-provider="razorpay"><summary>/);
    h.toggle("razorpay",true);h.ui.mount(2);
    assert.match(h.slot.innerHTML,/data-ln-provider="razorpay" open/);
    await h.click({pref:"payments",v:"cod"});
    assert.match(h.slot.innerHTML,/data-v="cod" aria-pressed="false"/);
    await h.click({pref:"payments",v:"cod"});
    h.ui.mount(3);
    await h.click({pref:"delivery",v:"shiprocket"});
    assert.match(h.slot.innerHTML,/data-v="manual" aria-pressed="true"/);
    assert.match(h.slot.innerHTML,/data-v="shiprocket" aria-pressed="true"/);
    await h.click({lnA:"next",next:"4"});
    assert.deepEqual(h.requests.map(r=>r.action),["choose"]);
    assert.deepEqual(h.requests[0].preferences,{address:"included",payments:"both",delivery:"both"});
    await h.click({lnA:"reload"});
    assert.match(h.ui.summary(2),/Cash on Delivery \+ Razorpay.*pending/);
    assert.match(h.ui.summary(3),/Manual tracking \+ Shiprocket.*pending/);
    assert.equal(h.ui.hasUnsavedChanges(),false);
  }finally{await h.close();}
});
test("selected choice hover has an explicit contrasting state and launch options do not use a clipped scroll area",async()=>{
  const css=await readFile("src/public/ann-builder.css","utf8");
  assert.match(css,/\.ann-chip\[aria-pressed=true\]:hover:not\(:disabled\)/);
  assert.match(css,/\.ann-choice\[aria-pressed=true\]:hover:not\(:disabled\)/);
  assert.match(css,/\.ann-launch-step \.ann-chips\.stack\{max-height:none;overflow:visible\}/);
  assert.match(css,/\.ann-launch-step \.ann-launch-option:disabled\{opacity:1;color:#574e53;background:#f3f0f2/);
});
test("conversation steps show only their own controls and advance through the real setup callback without activation",async()=>{
  const transitions=[],h=await harness(false,n=>transitions.push(n));
  try {
    h.ui.mount(1);
    assert.match(h.slot.innerHTML,/data-step="1"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-step="[23]"/);
    await h.click({lnA:"next",next:"2"});assert.deepEqual(transitions,[2]);
    h.ui.mount(2);
    assert.match(h.slot.innerHTML,/data-step="2"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="rz.key_id"/);
    await h.click({pref:"payments",v:"razorpay"});
    assert.match(h.slot.innerHTML,/data-ln="rz.key_id"/);
    h.setFailure(true);await h.click({lnA:"next",next:"3"});
    assert.deepEqual(transitions,[2]);assert.equal(h.ui.hasUnsavedChanges(),true);
    h.setFailure(false);await h.click({lnA:"next",next:"3"});
    assert.deepEqual(transitions,[2,3]);
    h.ui.mount(3);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="sr.email"/);
    await h.click({pref:"delivery",v:"shiprocket"});
    assert.match(h.slot.innerHTML,/data-ln="sr.email"/);
    await h.click({lnA:"skip"});
    assert.deepEqual(transitions,[2,3,4]);assert.match(h.ui.summary(3),/Left unchanged/);
    assert.equal(h.ui.hasUnsavedChanges(),false);
    assert.ok(h.requests.every(r=>r.action==="choose"));
  }finally{await h.close();}
});
test("read-only members can skip optional conversation setup without changing provider settings",async()=>{
  const transitions=[],h=await harness(true,n=>transitions.push(n));
  try {
    h.ui.mount(1);await h.click({lnA:"skip"});
    assert.deepEqual(transitions,[2]);assert.equal(h.requests.length,0);
  }finally{await h.close();}
});
test("Ann replaces partner steps with an essentials summary while keeping plain-language build questions",async()=>{
  const js=await readFile("src/public/ann-builder.js","utf8");
  for(const [id,label,n] of [["domain","Own domain",1],["payments","Payments",2],["shipping","Delivery",3]]) {
    assert.ok(!js.includes(`["${id}", "${label}"`),`${label} must not appear in the progress steps`);
    assert.ok(!js.includes(`case "${id}": return {kind:"launch",launchStep:${n}`),`${label} now belongs in Settings`);
  }
  assert.ok(js.includes("What category of products do you sell?"));
  assert.ok(!js.includes("Nothing goes live here. What do you sell?"));
  assert.ok(js.includes("Let's group your products. Name your first collection"));
  assert.ok(js.includes('id="ann-essentials-slot"'));
  assert.ok(!js.includes('id="ann-launch-slot"'),"Ann must not mount provider forms");
  assert.ok(!js.includes('${x.hsn_note}'),"do not repeat long HSN explanations inside each suggestion");
  assert.ok(js.includes('["business", "Business"'));
  assert.ok(js.includes('["selling", "Store address"'));
  assert.ok(js.includes('!["domain","payments","shipping","review"].includes(k)'),"payment and delivery setup must not inflate design progress");
  assert.match(js,/if \(p\.id === "review"\) \{\s*if \(active\)/,"editing earlier questions must not mount a second launch widget in an inactive review");
  const css=await readFile("src/public/ann-builder.css","utf8");
  assert.match(css,/\.ann-rail\{display:flex;flex-wrap:wrap/);
});
test("custom domain Settings shows DNS names and values without premature activation",async()=>{
  const h=await harness(false,undefined,true);
  try{
    h.setState({platform:{domains_available:true,domain_activation_available:false},domain:{
      id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hostname:"www.brand.com",status:"pending",
      hostname_status:"pending",ssl_status:"pending",cname_verified:false,
      dns_records:[{type:"CNAME",name:"www.brand.com",value:"brands.lebrands.store"}]}});
    await h.click({lnA:"reload"});
    h.ui.mount(1,{customDomainOnly:true});await flush();
    assert.match(h.slot.innerHTML,/Update your domain records/);
    assert.match(h.slot.innerHTML,/role="columnheader">Name/);
    assert.match(h.slot.innerHTML,/role="columnheader">Value/);
    assert.match(h.slot.innerHTML,/data-ln-copy="brands\.lebrands\.store"/);
    assert.match(h.slot.innerHTML,/Check connection/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="dact"/);
    assert.match(h.slot.innerHTML,/Edit that existing record instead of adding a second one/);
    assert.match(h.slot.innerHTML,/Leave email records and records for other names unchanged/);
    assert.doesNotMatch(h.slot.innerHTML,/Cloudflare|Platform API|SaaS|Worker|Hostname:|SSL:|Verify DNS/);
  }finally{await h.close();}
});
test("domain copy keeps raw provider statuses and labels out of the merchant page",async()=>{
  const h=await harness(false,undefined,true);
  try{
    h.setState({platform:{domains_available:true,domain_activation_available:true,
      diagnostics:[{label:"Cloudflare SaaS fallback Worker",complete:true}]},domain:{
        id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hostname:"www.brand.com",status:"pending",
        hostname_status:"active",ssl_status:"pending_validation",cname_verified:true,
        dns_records:[{type:"CNAME",name:"www.brand.com",value:"brands.lebrands.store"},
          {type:"TXT",name:"_acme-challenge.www.brand.com",value:"verification-value"}]}});
    await h.click({lnA:"reload"});h.ui.mount(1,{customDomainOnly:true});
    assert.match(h.slot.innerHTML,/Setting up/);
    assert.match(h.slot.innerHTML,/Website address: <strong>Connected/);
    assert.match(h.slot.innerHTML,/Ownership: <strong>Confirmed/);
    assert.match(h.slot.innerHTML,/Secure connection: <strong>Being prepared/);
    assert.match(h.slot.innerHTML,/Add any missing TXT records/);
    assert.match(h.slot.innerHTML,/domain is not added twice/);
    assert.doesNotMatch(h.slot.innerHTML,/Cloudflare|SaaS|Worker|pending_validation|data-ln-ack="dom"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="dact"/);
    assert.deepEqual(h.requests,[]);
  }finally{await h.close();}
});
test("domain activation only asks connected-payment stores for website approval and never bypasses it",async()=>{
  const h=await harness(false,undefined,true);
  try{
    h.setState({payment_domain_confirmation_required:true,platform:{domains_available:true,domain_activation_available:true},
      domain:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hostname:"www.brand.com",status:"pending",
        hostname_status:"active",ssl_status:"active",cname_verified:true}});
    await h.click({lnA:"reload"});h.ui.mount(1,{customDomainOnly:true});
    assert.match(h.slot.innerHTML,/data-ln-ack="dom"/);
    assert.match(h.slot.innerHTML,/This does not turn payments on or reconnect your account/);
    assert.match(h.slot.innerHTML,/Razorpay has approved this website address/);
    assert.match(h.slot.innerHTML,/data-ln-a="dact" disabled/);
    await h.click({lnA:"dact"});assert.equal(h.requests.length,0);
    h.ack("dom",true);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="dact" disabled/);
    await h.click({lnA:"dact"});
    assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].provider_domain_confirmed,true);
    h.setState({payment_domain_confirmation_required:false});
    await h.click({lnA:"reload"});
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-ack="dom"|Your store has a Razorpay connection/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="dact" disabled/);
    await h.click({lnA:"dact"});
    assert.equal(h.requests.length,2);
    assert.equal(h.requests[1].action,"domain-activate");
    assert.equal(h.requests[1].provider_domain_confirmed,false);
  }finally{await h.close();}
});
test("domain setup groups progress and next action, revealing payment approval only when ready",async()=>{
  const h=await harness(false,undefined,true);
  try{
    const domain={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hostname:"www.brand.com",status:"pending",
      hostname_status:"active",ssl_status:"pending_validation",cname_verified:true,
      dns_records:[{type:"CNAME",name:"www.brand.com",value:"brands.lebrands.store"},
        {type:"TXT",name:"_acme-challenge.www.brand.com",value:"verification-value"}]};
    h.setState({payment_domain_confirmation_required:true,platform:{domains_available:true,domain_activation_available:true},domain});
    await h.click({lnA:"reload"});h.ui.mount(1,{customDomainOnly:true});
    const current=h.slot.innerHTML.split('<section aria-label="Domain connection">')[1].split("</section>")[0];
    assert.match(current,/Connection progress/);
    assert.match(current,/Next: add the verification record/);
    assert.match(current,/data-ln-copy="verification-value"/);
    assert.match(current,/data-ln-a="dchk"/);
    assert.doesNotMatch(current,/data-ln-copy="brands\.lebrands\.store"|data-ln-a="dact"|data-ln-ack="dom"/);
    assert.match(h.slot.innerHTML,/<details class="ann-domain-record-help"><summary>Need help/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="choose"|data-ln-a="reload"|latest status below/);
    await h.click({lnA:"dact"});assert.equal(h.requests.length,0,"hidden activation remains guarded");
    await h.click({lnA:"dchk"});
    assert.equal(h.requests[0].action,"domain-check");
    assert.match(h.slot.innerHTML,/Connection checked\. The current status is shown here/);
    h.setState({domain:{...domain,ssl_status:"active"}});
    await h.click({lnA:"reload"});
    assert.match(h.slot.innerHTML,/Next: confirm that Razorpay/);
    assert.match(h.slot.innerHTML,/data-ln-ack="dom"/);
    h.ack("dom",true);
    assert.match(h.slot.innerHTML,/Everything is ready/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="dact" disabled/);
    h.setState({domain:{...domain,status:"active",ssl_status:"active"}});
    await h.click({lnA:"reload"});
    assert.match(h.slot.innerHTML,/ann-callout ann-success[^>]*>Customers can now use this address/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-ack="dom"|data-ln-a="dact"/);
  }finally{await h.close();}
});
test("integration setup is available in Settings before changing COD or manual delivery",async()=>{
  const h=await harness(false,undefined,true);
  try{
    h.ui.mount(2);await flush();
    assert.match(h.slot.innerHTML,/Razorpay integration/);
    assert.match(h.slot.innerHTML,/<section[^>]*data-ln-provider="razorpay"/);
    assert.doesNotMatch(h.slot.innerHTML,/class="ann-launch-step"|class="ann-provider-setup|<h[23]>Razorpay/);
    assert.match(h.slot.innerHTML,/Connection status/);
    assert.doesNotMatch(h.slot.innerHTML,/<details[^>]*data-ln-provider=/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="sr\.email"|data-step="[13]"/);
    assert.match(h.slot.innerHTML,/data-ln-a="oauth-start"/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="rz\.key_id"|data-ln="rz\.webhook_secret"/);
    h.ui.mount(3);await flush();
    assert.match(h.slot.innerHTML,/Shiprocket integration/);
    assert.match(h.slot.innerHTML,/<section[^>]*data-ln-provider="shiprocket"/);
    assert.doesNotMatch(h.slot.innerHTML,/class="ann-launch-step"|class="ann-provider-setup/);
    assert.doesNotMatch(h.slot.innerHTML,/<details[^>]*data-ln-provider=/);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln="rz\.key_id"|data-step="[12]"/);
    assert.match(h.slot.innerHTML,/data-ln="sr\.email"/);
    assert.match(h.slot.innerHTML,/data-ln="sr\.password"/);
  }finally{await h.close();}
});
test("dedicated payment Settings is OAuth-only while delivery choices remain unchanged",async()=>{
  const h=await harness(false,undefined,true);
  try {
    h.ui.mount(2);
    assert.doesNotMatch(h.slot.innerHTML,/data-ln-a="skip"|data-ln-a="next"|data-step="[13]"/);
    assert.match(h.slot.innerHTML,/data-ln-a="oauth-start"/);
    assert.doesNotMatch(h.slot.innerHTML,/Use API keys instead|data-ln="rz\.|data-pref="payments"|data-v="cod"|Save choices|data-ln-a="choose"/);
    assert.equal(h.requests.length,0,"opening payment settings must not change COD or preferences");
    assert.equal(h.ui.hasUnsavedChanges(),false);
    h.ui.mount(3);
    await h.click({pref:"delivery",v:"shiprocket"});
    assert.match(h.slot.innerHTML,/data-ln="sr.email"/);
    assert.match(h.slot.innerHTML,/data-v="manual" aria-pressed="true"/);
    await h.click({lnA:"choose"});
    assert.equal(h.requests[0].preferences.payments,"cod");
    assert.equal(h.requests[0].preferences.delivery,"both");
    assert.doesNotMatch(h.slot.innerHTML,/data-step="[12]"/);
    assert.ok(h.requests.every(r=>r.action==="choose"),"saving preferences must not activate providers");
  }finally{await h.close();}
});
test("payment settings retain OAuth and legacy account controls without setup forms or duplicate choices",async()=>{
  const h=await harness(false,undefined,true);
  try{
    for(const provider of [
      {verified:true,auth_type:"oauth",mode:"test",account_id:"acc_SyntheticOnly",webhook_verified:false,runtime_ready:false},
      {verified:true,auth_type:"api_key",mode:"live",webhook_verified:true,runtime_ready:true}
    ]){
      h.setState({providers:{razorpay:provider},platform:{razorpay_oauth_available:true}});
      await h.click({lnA:"reload"});h.ui.mount(2);
      assert.match(h.slot.innerHTML,/data-ln-a="oauth-start"|data-ln-a="oauth-refresh"/);
      assert.match(h.slot.innerHTML,/data-ln-a="disc"/);
      assert.doesNotMatch(h.slot.innerHTML,/class="ann-launch-step"|class="ann-provider-setup|<h[23]>Razorpay/);
      assert.match(h.slot.innerHTML,new RegExp(`data-ln-a="${provider.runtime_ready?"pay-off":"pay-on"}"`));
      assert.doesNotMatch(h.slot.innerHTML,/Use API keys instead|data-ln="rz\.(?:key_id|key_secret|webhook_secret)"|data-v="cod"|data-pref="payments"|Save choices/);
      if(provider.auth_type==="api_key")assert.match(h.slot.innerHTML,/existing API-key connection is preserved/);
      else assert.match(h.slot.innerHTML,/data-ln-a="oauth-refresh"/);
    }
    assert.equal(h.requests.length,0);
  }finally{await h.close();}
});
