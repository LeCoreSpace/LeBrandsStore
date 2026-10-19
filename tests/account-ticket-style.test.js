import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderAccount} from "../src/ui/accounts.js";

test("account entry views share one ticket stylesheet and preserve signup validation",()=>{
  for(const view of ["login","signup","forgot-password","account","new-store"]){
    const html=renderAccount(view,{user:{name:"Example owner"}});
    assert.equal((html.match(/href="\/assets\/account-home\.css"/g)||[]).length,1,view);
    assert.match(html,/class="wrap auth-shell account-ticket"/,view);
  }
  const signup=renderAccount("signup");
  assert.match(signup,/action="\/signup"/);
  assert.match(signup,/\/assets\/registration\.js/);
  assert.match(signup,/name="password"/);
  assert.ok(signup.indexOf("/assets/account-home.css")<signup.indexOf("/assets/registration.js"));
  const login=renderAccount("login",{error:"<invalid>"});
  assert.match(login,/action="\/login"/);
  assert.match(login,/role="alert"/);
  assert.match(login,/&lt;invalid&gt;/);
});

test("store tickets preserve store limits, statuses and password-reset restrictions",()=>{
  const stores=[
    {store_id:"11111111-1111-4111-8111-111111111111",name:"Example live",subdomain:"example-live",status:"live",role:"owner"},
    {store_id:"22222222-2222-4222-8222-222222222222",name:"Example draft",subdomain:"example-draft",status:"draft",role:"owner"}
  ];
  const html=renderAccount("dashboard",{user:{name:"Example owner"},stores});
  assert.match(html,/class="wrap dashboard-main account-ticket"/);
  assert.equal((html.match(/class="store-row"/g)||[]).length,2);
  assert.match(html,/Example live/);
  assert.match(html,/Example draft/);
  assert.doesNotMatch(html,/href="\/stores\/new"/);
  assert.match(html,/href="\/account"/);
  const locked=renderAccount("dashboard",{user:{must_change_password:true},stores});
  assert.match(locked,/Password reset required/);
  assert.doesNotMatch(locked,/class="store-row"|href="\/stores\/new"/);
  assert.match(renderAccount("dashboard",{stores:[]}),/class="empty-card"/);
});

test("account ticket decoration preserves hidden states and allows input interaction",async()=>{
  const css=await readFile("src/public/account-home.css","utf8");
  assert.match(css,/\.account-ticket \[hidden\]\{display:none!important/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/\.auth-card/);
  assert.match(css,/\.store-actions::before/);
  assert.match(css,/@media\(max-width:760px\)/);
});
