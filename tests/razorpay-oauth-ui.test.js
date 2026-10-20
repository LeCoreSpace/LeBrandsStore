import test from "node:test";
import assert from "node:assert/strict";
import {oauthCallbackNotice,razorpayPaymentNotice,launchSavedMessage} from "../src/public/ann-launch-ui.js";
test("callback success is reconciled with the actual grant, including disconnect and read-only reload",()=>{
  assert.equal(oauthCallbackNotice("connected",{verified:true,auth_type:"oauth"}),"Your Razorpay account is connected.");
  assert.equal(oauthCallbackNotice("connected",{verified:false,auth_type:"oauth"}),"");
  assert.equal(oauthCallbackNotice("connected",{verified:true,auth_type:"api_key"}),"");
  assert.equal(oauthCallbackNotice("connected"),"");
  assert.equal(oauthCallbackNotice("__proto__"),"");
  assert.match(oauthCallbackNotice("cancelled"),/cancelled/);
  assert.match(oauthCallbackNotice("failed"),/Check the account details/);
});
test("payment notices use plain words and do not mark pending checks as successful",()=>{
  assert.deepEqual(razorpayPaymentNotice({runtime_ready:true}),{ok:true,text:"Online payments are on. Customers can now pay through Razorpay."});
  assert.equal(razorpayPaymentNotice({mode:"test",webhook_verified:true}).ok,false);
  assert.equal(razorpayPaymentNotice({mode:"live",webhook_verified:false}).ok,false);
  const ready=razorpayPaymentNotice({mode:"live",webhook_verified:true});
  assert.equal(ready.ok,true);assert.match(ready.text,/currently off/);
  for(const provider of [{runtime_ready:true},{mode:"test"},{mode:"live"},{mode:"live",webhook_verified:true}])
    assert.doesNotMatch(razorpayPaymentNotice(provider).text,/webhook|OAuth|captured|HTTP|runtime|authorisation/i);
  assert.match(launchSavedMessage({action:"activate",provider:"razorpay",enabled:true},{providers:{razorpay:{runtime_ready:true}}}),/Customers can now pay/);
  assert.doesNotMatch(launchSavedMessage({action:"activate",provider:"razorpay",enabled:true},{}),/Customers can now pay/);
  assert.match(launchSavedMessage({action:"activate",provider:"razorpay",enabled:false}),/payments are off/);
  assert.equal(launchSavedMessage({action:"shipping-settings"}),"Your shipping preferences have been saved.");
});
