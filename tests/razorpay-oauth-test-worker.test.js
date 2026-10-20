import test from "node:test";
import assert from "node:assert/strict";
import {testWebhookWorker} from "../src/razorpay-oauth-test-worker.js";
const env={RAZORPAY_OAUTH_MODE:"test",RAZORPAY_OAUTH_CLIENT_ID:"fake-client",
  RAZORPAY_OAUTH_CLIENT_SECRET:"fake-client-secret-only",SESSION_SECRET:"fake-session-secret-for-fixtures-only",
  RAZORPAY_OAUTH_WEBHOOK_SECRET:"fake-webhook-secret-for-fixtures-only"};
const request=(path,method="GET",body,signature)=>new Request("https://example.invalid"+path,{
  method,...(body?{body,headers:{"x-razorpay-signature":signature||"0".repeat(64)}}:{})});
test("the separate receiver cannot serve storefronts, enable Live mode or access data before a valid signature",async()=>{
  const worker=testWebhookWorker({database:()=>{throw Error("must not access a database");}});
  assert.equal((await worker.fetch(request("/health"),env,{})).status,200);
  assert.equal((await worker.fetch(request("/health"),{...env,RAZORPAY_OAUTH_MODE:"live"},{})).status,503);
  assert.equal((await worker.fetch(request("/stores/anything"),env,{})).status,404);
  assert.equal((await worker.fetch(request("/webhooks/razorpay/oauth"),env,{})).status,405);
  assert.equal((await worker.fetch(request("/webhooks/razorpay/oauth","POST","{}"),env,{})).status,400);
  assert.equal((await worker.fetch(request("/webhooks/razorpay/oauth","POST","{}"),{...env,RAZORPAY_OAUTH_MODE:"live"},{})).status,503);
});
test("a valid signature preserves exact bytes and uses only the shared Test-mode handler",async()=>{
  const raw=' { "event": "payment.authorized" } ';
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.RAZORPAY_OAUTH_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=Buffer.from(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw))).toString("hex");
  let called=0,closed=0;
  const db={close:async()=>{closed++;}};
  const worker=testWebhookWorker({database:()=>db,handle:async(req,cfg,actualDb)=>{
    called++;assert.equal(cfg.RAZORPAY_OAUTH_MODE,"test");assert.equal(actualDb,db);
    assert.equal(await req.text(),raw);return Response.json({received:true});
  }});
  const response=await worker.fetch(request("/webhooks/razorpay/oauth","POST",raw,signature),env,{waitUntil:p=>p});
  assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(called,1);assert.equal(closed,1);
});
