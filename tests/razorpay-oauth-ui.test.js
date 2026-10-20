import test from "node:test";
import assert from "node:assert/strict";
import {oauthCallbackNotice} from "../src/public/ann-launch-ui.js";
test("callback success is reconciled with the actual grant, including disconnect and read-only reload",()=>{
  assert.match(oauthCallbackNotice("connected",{verified:true,auth_type:"oauth"}),/authorised successfully/);
  assert.equal(oauthCallbackNotice("connected",{verified:false,auth_type:"oauth"}),"");
  assert.equal(oauthCallbackNotice("connected",{verified:true,auth_type:"api_key"}),"");
  assert.equal(oauthCallbackNotice("connected"),"");
  assert.equal(oauthCallbackNotice("__proto__"),"");
  assert.match(oauthCallbackNotice("cancelled"),/cancelled/);
  assert.match(oauthCallbackNotice("failed"),/Review the integration status/);
});
