import test from "node:test";
import assert from "node:assert/strict";
import {sealCredentials} from "../src/connections/providers.js";
import {handleRazorpayOAuth,isRazorpayOAuthRoute} from "../src/connections/razorpay-oauth.js";
import {diagnosticPaymentId} from "../src/connections/razorpay-diagnostics.js";
import {razorpayOAuthWebhook} from "../src/connections/razorpay-oauth-webhook.js";
import {paymentDiagnosticNotice} from "../src/public/ann-launch-ui.js";

const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",uid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",hash="a".repeat(64);
const path=`/api/stores/${id}/integrations/razorpay/inspect-payment`;
const env={SESSION_SECRET:"fixture-encryption-key-not-real-and-long-enough",RAZORPAY_OAUTH_MODE:"live",
  RAZORPAY_OAUTH_CLIENT_ID:"fixture-client",RAZORPAY_OAUTH_CLIENT_SECRET:"fixture-client-secret-not-real",
  RAZORPAY_OAUTH_WEBHOOK_SECRET:"fixture-signing-secret-not-real"};
const credentials={auth_type:"oauth",client_id:env.RAZORPAY_OAUTH_CLIENT_ID,mode:"live",account_id:"acc_FakeAccount123",
  expires_at:Date.now()+3600000,access_token:"PRIVATE_TEST_TOKEN",refresh_token:"PRIVATE_TEST_REFRESH"};
const payment={id:"pay_FakeReceipt123",entity:"payment",amount:100,currency:"INR",status:"captured",captured:true,
  created_at:1792492000,email:"PRIVATE_CUSTOMER_EMAIL",contact:"PRIVATE_CUSTOMER_CONTACT",notes:{private:"PRIVATE_NOTES"}};
const request=(body={confirm:true,payment_id:"FakeReceipt123"},origin="https://app.lebrands.store")=>
  new Request(`https://app.lebrands.store${path}`,{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});
async function fixture({role="owner",grant=credentials,metadata={}}={}){
  const ciphertext=await sealCredentials(env.SESSION_SECRET,id,"razorpay",grant),queries=[];
  const tx=async(strings,...values)=>{
    const sql=strings.join("?");
    assert.match(sql,/^\s*SELECT\b/,"Diagnostics must not write or lock data");
    assert.doesNotMatch(sql,/FOR UPDATE|FOR SHARE/i);
    queries.push(sql);
    if(sql.includes("store_members"))return [{role}];
    if(sql.includes("integrations"))return [{status:"connected",credentials_ciphertext:ciphertext,
      metadata:JSON.stringify({auth_type:"oauth",mode:"live",account_id:grant.account_id,webhook_verified:false,enabled:false,...metadata})}];
    if(sql.includes("webhook_events"))return [];
    assert.fail("Unexpected diagnostics query");
  };
  const db={withMemberStore:async(store,session,fn)=>{
    assert.equal(store,id);assert.equal(session,hash);return fn(tx);
  }};
  return {db,queries};
}
test("receipt normalization rejects injection, URLs, missing and oversized identifiers",()=>{
  assert.equal(diagnosticPaymentId(" FakeReceipt123 "),"pay_FakeReceipt123");
  assert.equal(diagnosticPaymentId("pay_FakeReceipt123"),"pay_FakeReceipt123");
  for(const input of [null,{},123,"","pay_short","https://evil.invalid/payments","../refund","x".repeat(81)])
    assert.throws(()=>diagnosticPaymentId(input),{status:400});
  assert.equal(isRazorpayOAuthRoute(path),true);
});
test("owner diagnostics make only a bounded provider GET and return whitelisted information without changing gates",async()=>{
  const f=await fixture();let calls=0;
  const response=await handleRazorpayOAuth(request(),env,f.db,{id:uid},hash,{fetcher:async(url,options)=>{
    calls++;assert.equal(url,`https://api.razorpay.com/v1/payments/${payment.id}`);
    assert.equal(options.method,"GET");assert.equal(options.redirect,"manual");
    assert.equal(options.headers.authorization,`Bearer ${credentials.access_token}`);
    assert.equal(options.body,undefined);assert.ok(options.signal instanceof AbortSignal);
    return Response.json(payment);
  }});
  assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/no-store/);
  const raw=await response.text(),body=JSON.parse(raw);
  assert.equal(body.result,"found");assert.equal(body.payment.amount_paise,100);
  assert.equal(body.webhook_verified,false);assert.equal(body.checkout_enabled,false);
  assert.equal(body.last_recorded_event,null);assert.equal(calls,1);
  assert.doesNotMatch(raw,/PRIVATE_|credentials|access_token|email|contact|notes/);
  assert.match(paymentDiagnosticNotice(body),/₹1\.00, captured/);
  assert.match(paymentDiagnosticNotice(body),/not webhook delivery/);
});
test("owner, origin, session and body boundaries are enforced before any provider call",async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error("must not be called");};
  for(const role of ["editor","manager"]){
    const f=await fixture({role});const r=await handleRazorpayOAuth(request(),env,f.db,{id:uid},hash,{fetcher});
    assert.equal(r.status,403);assert.equal(f.queries.length,1);
  }
  const f=await fixture();
  assert.equal((await handleRazorpayOAuth(request(),env,f.db,null,hash,{fetcher})).status,401);
  assert.equal((await handleRazorpayOAuth(request(),env,f.db,{id:uid,must_change_password:true},hash,{fetcher})).status,401);
  assert.equal((await handleRazorpayOAuth(request(undefined,"https://evil.invalid"),env,f.db,{id:uid},hash,{fetcher})).status,403);
  for(const body of [{confirm:false,payment_id:"FakeReceipt123"},{confirm:true,payment_id:"../capture"},
    {confirm:true,payment_id:"FakeReceipt123",enabled:true}]){
    assert.equal((await handleRazorpayOAuth(request(body),env,f.db,{id:uid},hash,{fetcher})).status,400);
  }
  const denied={withMemberStore:async()=>{throw Object.assign(new Error("Membership denied"),{status:403});}};
  assert.equal((await handleRazorpayOAuth(request(),env,denied,{id:uid},hash,{fetcher})).status,403);
  assert.equal(calls,0);
});
test("expired and cross-environment grants cannot refresh, mutate or contact the provider",async()=>{
  for(const grant of [{...credentials,mode:"test"},{...credentials,client_id:"other-client"},
    {...credentials,expires_at:Date.now()-1000}]){
    const f=await fixture({grant});let called=false;
    const r=await handleRazorpayOAuth(request(),env,f.db,{id:uid},hash,{fetcher:()=>{called=true;}});
    assert.equal(r.status,409);assert.equal(called,false);
  }
});
test("provider refusals and bad payloads remain inconclusive, sanitized and non-mutating",async()=>{
  for(const status of [302,401,403,404,429,503]){
    const f=await fixture();const r=await handleRazorpayOAuth(request(),env,f.db,{id:uid},hash,{
      fetcher:async()=>Response.json({error:"PRIVATE_PROVIDER_DETAIL"},{status})
    });
    assert.equal(r.status,200);const text=await r.text(),body=JSON.parse(text);
    assert.equal(body.result,status===404?"not_visible":"provider_rejected");
    assert.equal(body.webhook_verified,false);assert.equal(body.checkout_enabled,false);
    assert.doesNotMatch(text,/PRIVATE_/);
    if(status===404)assert.match(paymentDiagnosticNotice(body),/does not prove an account mismatch/);
  }
  for(const body of [{...payment,id:"pay_OtherPayment"},{...payment,currency:"<script>"},
    {...payment,status:"<script>"},{...payment,amount:"100"}]){
    const f=await fixture();assert.equal((await handleRazorpayOAuth(request(),env,f.db,{id:uid},hash,{
      fetcher:async()=>Response.json(body)
    })).status,502);
  }
});
test("receiver diagnostics log fixed stages only; invalid signatures never touch the database",async()=>{
  const previous=console.info,logs=[];console.info=(...args)=>logs.push(args);
  try{
    const db={account:async()=>assert.fail("Unsigned data must not route")};
    const r=await razorpayOAuthWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/oauth",{
      method:"POST",headers:{"x-razorpay-signature":"PRIVATE_BAD_SIGNATURE"},body:'{"email":"PRIVATE_CUSTOMER"}'
    }),env,db);
    assert.equal(r.status,400);assert.equal(logs[0][0],"razorpay_partner_webhook");
    assert.deepEqual(logs[0][1],{stage:"signature_check",result:"rejected",http_status:400,matched_stores:0});
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|signature.*PRIVATE|email/);
  }finally{console.info=previous;}
});
test("signed unmatched deliveries and routing failures are distinguished without logging payload or account identifiers",async()=>{
  const previous=console.info,logs=[];console.info=(...args)=>logs.push(args);
  try{
    const raw=JSON.stringify({event:"payment.captured",account_id:"acc_FakeAccount123",payload:{private:"PRIVATE_PAYLOAD"}});
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.RAZORPAY_OAUTH_WEBHOOK_SECRET),
      {name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=Buffer.from(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw))).toString("hex");
    const req=()=>new Request("https://app.lebrands.store/webhooks/razorpay/oauth",{
      method:"POST",headers:{"x-razorpay-signature":signature},body:raw
    });
    const db={account:async fn=>fn(async strings=>strings.join("").includes("to_regprocedure")?[{ready:true}]:[])};
    const r=await razorpayOAuthWebhook(req(),env,db);
    assert.equal(r.status,200);
    assert.deepEqual(logs[0][1],{stage:"account_routing",result:"unmatched_account",http_status:200,
      matched_stores:0,event_type:"payment.captured",mode:"live"});
    const fail=await razorpayOAuthWebhook(req(),env,{account:async()=>{throw Error("PRIVATE_DB_ERROR");}});
    assert.equal(fail.status,503);assert.equal(logs[1][1].stage,"account_routing");
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|acc_Fake|payload|secret|signature":/);
  }finally{console.info=previous;}
});
