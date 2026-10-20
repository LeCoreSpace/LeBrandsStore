import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {beginOAuth,consumeOAuth,completeOAuth,handleRazorpayOAuth,tokenCredentials,oauthConfig,refreshOAuth,rotateOAuth,oauthSignatureSecret} from "../src/connections/razorpay-oauth.js";
import {razorpayOAuthWebhook} from "../src/connections/razorpay-oauth-webhook.js";
import {prepareAnnLaunch} from "../src/store/ann-launch.js";
import {sealCredentials,openCredentials} from "../src/connections/providers.js";
import {reservePayment,verifyCheckout} from "../src/connections/payments.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",editor="cccccccc-cccc-4ccc-8ccc-cccccccccccc",hash="a".repeat(64);
const env={SESSION_SECRET:"isolated-oauth-fixture-encryption-secret-only",RAZORPAY_OAUTH_MODE:"test",
  RAZORPAY_OAUTH_CLIENT_ID:"fake-client-id",RAZORPAY_OAUTH_CLIENT_SECRET:"fake-client-secret-for-tests-only",
  RAZORPAY_OAUTH_WEBHOOK_SECRET:"fake-webhook-secret-for-tests-only"};
const token=(suffix="One")=>({token_type:"Bearer",expires_in:7862400,razorpay_account_id:"acc_FakeAccount123",
  public_token:"rzp_test_oauth_FakePublic"+suffix,access_token:"fake-access-token-only-"+suffix,refresh_token:"fake-refresh-token-only-"+suffix});
const req=(path,body,origin="https://app.lebrands.store")=>new Request("https://app.lebrands.store"+path,{
  method:body?"POST":"GET",...(body?{headers:{"content-type":"application/json",origin},body:JSON.stringify(body)}:{})});
const sign=async(raw)=>{
  const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.RAZORPAY_OAUTH_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(raw))).toString("hex");
};
test("OAuth configuration and token boundaries fail closed",()=>{
  assert.throws(()=>oauthConfig({}),{status:503});
  assert.throws(()=>oauthConfig({...env,RAZORPAY_OAUTH_MODE:"automatic"}),{status:503});
  assert.throws(()=>oauthConfig({...env,RAZORPAY_OAUTH_REDIRECT_URI:"https://app.lebrands.store/wrong"}),{status:503});
  assert.equal(tokenCredentials(token(),oauthConfig(env)).mode,"test");
  assert.throws(()=>tokenCredentials({...token(),public_token:"rzp_live_oauth_FakeOnly"},oauthConfig(env)),{status:502});
  assert.throws(()=>tokenCredentials({...token(),razorpay_account_id:"other"},oauthConfig(env)),{status:502});
  assert.equal(oauthSignatureSecret({auth_type:"api_key",key_secret:"legacy"},{}),"legacy");
  assert.equal(oauthSignatureSecret({auth_type:"oauth",client_id:env.RAZORPAY_OAUTH_CLIENT_ID,mode:"test"},env),env.RAZORPAY_OAUTH_CLIENT_SECRET);
});
test("OAuth checkout verifies the application secret and sends Bearer authorisation, never merchant Basic credentials",async()=>{
  const live={...env,RAZORPAY_OAUTH_MODE:"live"},credentials=tokenCredentials({...token(),public_token:"rzp_live_oauth_FakePublicOnly"},oauthConfig(live));
  const ciphertext=await sealCredentials(env.SESSION_SECRET,id,"razorpay",credentials);
  let calls=0;
  const tx=async(strings)=>{
    if(strings.join("").includes("FROM public.orders"))return [{id:crypto.randomUUID(),status:"pending_payment",credentials_ciphertext:ciphertext,provider_order_id:"order_Fake123"}];
    return [{status:"connected",metadata:JSON.stringify({auth_type:"oauth",account_id:credentials.account_id}),credentials_ciphertext:ciphertext}];
  };
  const secretKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(live.RAZORPAY_OAUTH_CLIENT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=Buffer.from(await crypto.subtle.sign("HMAC",secretKey,new TextEncoder().encode("order_Fake123|pay_Fake123"))).toString("hex");
  const body={receipt_token:"f".repeat(64),razorpay_order_id:"order_Fake123",razorpay_payment_id:"pay_Fake123",razorpay_signature:signature};
  const fetcher=async(url,opts)=>{
    calls++;assert.equal(url,"https://api.razorpay.com/v1/payments/pay_Fake123");
    assert.equal(opts.headers.authorization,`Bearer ${credentials.access_token}`);
    return new Response("simulated provider outage after signature validation",{status:503});
  };
  await assert.rejects(verifyCheckout(tx,id,body,live,fetcher),{status:502});assert.equal(calls,1);
  await assert.rejects(verifyCheckout(tx,id,{...body,razorpay_signature:"0".repeat(64)},live,fetcher),{status:400});
  assert.equal(calls,1,"Invalid checkout signatures never call the provider");
});
test("tenant-isolated OAuth lifecycle, legacy preservation, replay rejection, refresh and signed revocation",async t=>{
  const pg=await setupAnnFixtureDatabase(),adapter=annFixtureAdapter(pg);
  const sql=async fn=>pg.transaction(async trx=>{
    await trx.exec("SET LOCAL ROLE lebrands_app");
    const tx=async(strings,...values)=>(await trx.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values)).rows;
    tx.json=JSON.stringify;return fn(tx);
  });
  const db={...adapter,withStore:(store,fn)=>adapter.withMemberStore(store,hash,fn),account:sql};
  const member=fn=>db.withMemberStore(id,hash,fn);
  const get=async()=>JSON.parse((await pg.query("SELECT metadata::text FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows[0].metadata);
  let external=0;
  const fetcher=async(url,options)=>{
    external++;assert.match(String(url),/^https:\/\/auth\.razorpay\.com\/(token|revoke)$/);
    const body=JSON.parse(options.body);assert.equal(options.redirect,"manual");assert.equal(body.client_id,env.RAZORPAY_OAUTH_CLIENT_ID);
    return Response.json(String(url).endsWith("/revoke")?{message:"Token Revoked"}:token(body.grant_type==="refresh_token"?"Rotated":"One"));
  };
  try{
    await pg.exec(`DO $$ DECLARE r text; BEGIN
      FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF to_regrole(r) IS NULL THEN EXECUTE format('CREATE ROLE %I',r); END IF;
      END LOOP; END; $$;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
    await pg.exec(await readFile("db/staged/0048_razorpay_oauth.sql","utf8"));
    await t.test("Supabase direct default grants are explicitly removed, not just PUBLIC access",async()=>{
      const permissions=()=>pg.query(`SELECT p.proname,
        has_function_privilege('lebrands_app',p.oid,'EXECUTE') app,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') service
        FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.resolve_razorpay_oauth_webhook(text,text,text,text)'),
          to_regprocedure('public.list_razorpay_oauth_refresh(text)'))`);
      const initial=(await permissions()).rows;
      assert.equal(initial.length,2);
      assert.ok(initial.every(r=>r.anon&&r.authenticated&&r.service),"Reproduce Supabase defaults instead of assuming a clean database");
      await pg.exec(await readFile("db/staged/0049_razorpay_oauth_permissions.sql","utf8"));
      assert.ok((await permissions()).rows.every(r=>r.app&&!r.anon&&!r.authenticated&&!r.service));
    });
    await t.test("owner and Origin gates block writes without calling Razorpay",async()=>{
      assert.equal((await handleRazorpayOAuth(req(`/api/stores/${id}/integrations/razorpay/start`,{confirm:true},"https://evil.invalid"),env,db,{id:owner},hash,{fetcher})).status,403);
      assert.equal((await handleRazorpayOAuth(req(`/api/stores/${id}/integrations/razorpay/start`,{confirm:true}),env,db,{id:editor},hash,{fetcher})).status,403);
      assert.equal(external,0);
    });
    await t.test("authorisation URL is scoped; wrong session and replay cannot consume a grant",async()=>{
      const started=await member(tx=>beginOAuth(tx,id,owner,hash,env));
      const url=new URL(started.authorize_url);assert.equal(url.origin,"https://auth.razorpay.com");assert.equal(url.searchParams.get("scope"),"read_write");
      const state=url.searchParams.get("state");
      assert.equal(JSON.stringify(await get()).includes(state),false,"Never store the raw nonce");
      await assert.rejects(member(tx=>consumeOAuth(tx,id,owner,"b".repeat(64),state,env)),{status:409});
      const p=await member(tx=>consumeOAuth(tx,id,owner,hash,state,env));
      await assert.rejects(member(tx=>consumeOAuth(tx,id,owner,hash,state,env)),{status:409});
      await member(tx=>completeOAuth(tx,id,owner,p,tokenCredentials(token(),oauthConfig(env)),env));
      const publicState=await member(tx=>prepareAnnLaunch(tx,id,owner,env));
      assert.equal(publicState.providers.razorpay.auth_type,"oauth");assert.equal(publicState.providers.razorpay.runtime_ready,false);
      assert.equal(publicState.providers.razorpay.webhook_url,"https://app.lebrands.store/webhooks/razorpay/oauth");
      assert.doesNotMatch(JSON.stringify(publicState),/fake-access-token|fake-refresh-token|fake-client-secret|session_hash|oauth_pending/);
      await assert.rejects(member(tx=>reservePayment(tx,id,crypto.randomUUID(),env)),{status:409});
    });
    await t.test("legacy live credentials survive denial and test authorisation cannot replace them",async()=>{
      const legacy={key_id:"rzp_live_LegacyFake123",key_secret:"fake-legacy-secret",webhook_secret:"fake-legacy-webhook-secret"};
      const ciphertext=await sealCredentials(env.SESSION_SECRET,id,"razorpay",legacy);
      await pg.query("UPDATE integrations SET credentials_ciphertext=$2,metadata=$3::jsonb WHERE store_id=$1 AND provider='razorpay'",[id,ciphertext,JSON.stringify({mode:"live",enabled:true,credentials_verified:true})]);
      await assert.rejects(member(tx=>beginOAuth(tx,id,owner,hash,env,true)),{status:409});
      const live={...env,RAZORPAY_OAUTH_MODE:"live"};
      const started=await member(tx=>beginOAuth(tx,id,owner,hash,live,true));
      const state=new URL(started.authorize_url).searchParams.get("state");
      const response=await handleRazorpayOAuth(req(`/integrations/razorpay/callback?state=${encodeURIComponent(state)}&error=access_denied`),live,db,{id:owner},hash,{fetcher});
      assert.match(response.headers.get("location"),/oauth=cancelled$/);assert.equal(external,0);
      const [saved]=(await pg.query("SELECT credentials_ciphertext,metadata FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows;
      assert.equal(saved.credentials_ciphertext,ciphertext);assert.equal(saved.metadata.enabled,true);
      await pg.query("UPDATE integrations SET status='disconnected',credentials_ciphertext='',metadata='{}' WHERE store_id=$1 AND provider='razorpay'",[id]);
    });
    await t.test("callback exchanges once, encrypts tokens and rejects replay",async()=>{
      const response=await handleRazorpayOAuth(req(`/api/stores/${id}/integrations/razorpay/start`,{confirm:true}),env,db,{id:owner},hash,{fetcher});
      const started=await response.json(),state=new URL(started.authorize_url).searchParams.get("state");
      const callback=req(`/integrations/razorpay/callback?state=${encodeURIComponent(state)}&code=fictional-code`);
      assert.match((await handleRazorpayOAuth(callback,env,db,{id:owner},hash,{fetcher})).headers.get("location"),/oauth=connected$/);
      assert.equal(external,1);
      assert.match((await handleRazorpayOAuth(callback,env,db,{id:owner},hash,{fetcher})).headers.get("location"),/oauth=failed$/);
      assert.equal(external,1);
      const [saved]=(await pg.query("SELECT credentials_ciphertext,metadata FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows;
      assert.match(saved.credentials_ciphertext,/^v1\./);assert.doesNotMatch(saved.credentials_ciphertext,/fake-access-token/);
      assert.equal(saved.metadata.enabled,false);assert.equal(saved.metadata.webhook_verified,false);
    });
    await t.test("refresh is committed separately from financial work and old snapshots use the rotated token",async()=>{
      const [old]=(await pg.query("SELECT credentials_ciphertext FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows;
      const oldCredentials=await openCredentials(env.SESSION_SECRET,id,"razorpay",old.credentials_ciphertext);
      assert.deepEqual(await rotateOAuth(db,id,env,fetcher),{refreshed:true});
      await assert.rejects(member(async tx=>{
        const usable=await refreshOAuth(tx,id,oldCredentials,env,fetcher);
        assert.equal(usable.refresh_token,token("Rotated").refresh_token);
        throw new Error("simulated financial rollback");
      }),/simulated financial rollback/);
      const [saved]=(await pg.query("SELECT credentials_ciphertext FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows;
      assert.equal((await openCredentials(env.SESSION_SECRET,id,"razorpay",saved.credentials_ciphertext)).refresh_token,token("Rotated").refresh_token);
      assert.equal(external,2);
    });
    await t.test("signed revocation is isolated, stale revocation is ignored and invalid signatures do not query data",async()=>{
      const webhook=async(body,valid=true,connection=db)=>{
        const raw=JSON.stringify(body);
        return razorpayOAuthWebhook(new Request("https://app.lebrands.store/webhooks/razorpay/oauth",{method:"POST",
          headers:{"x-razorpay-signature":valid?await sign(raw):"0".repeat(64)},body:raw}),env,connection,fetcher);
      };
      const event={event:"account.app.authorization_revoked",account_id:"acc_FakeAccount123",created_at:Math.floor(Date.now()/1000)+1};
      assert.equal((await webhook(event,false,{account:()=>{throw new Error("must not query");}})).status,400);
      assert.equal((await webhook({...event,account_id:"acc_OtherFake123"})).status,200);
      assert.equal((await get()).credentials_verified,true);
      assert.equal((await webhook({...event,created_at:1})).status,200);assert.equal((await get()).credentials_verified,true);
      assert.equal((await webhook(event)).status,200);
      assert.equal((await get()).revoked,true);assert.equal((await get()).enabled,false);
      const [before]=(await pg.query("SELECT revision FROM store_launch_setup WHERE store_id=$1",[id])).rows;
      assert.equal((await webhook(event)).status,200);
      assert.equal((await pg.query("SELECT revision FROM store_launch_setup WHERE store_id=$1",[id])).rows[0].revision,before.revision);
    });
    await t.test("disconnection commits locally even if remote revocation fails; a retry clears the retained encrypted token",async()=>{
      const start=await member(tx=>beginOAuth(tx,id,owner,hash,env));
      const state=new URL(start.authorize_url).searchParams.get("state"),p=await member(tx=>consumeOAuth(tx,id,owner,hash,state,env));
      await member(tx=>completeOAuth(tx,id,owner,p,tokenCredentials(token(),oauthConfig(env)),env));
      const disconnect=()=>req(`/api/stores/${id}/integrations/razorpay/disconnect`,{confirm:true});
      const failed=await handleRazorpayOAuth(disconnect(),env,db,{id:owner},hash,{fetcher:async()=>{throw Error("simulated network failure");}});
      assert.equal((await failed.json()).revocation_pending,true);
      await assert.rejects(member(tx=>beginOAuth(tx,id,owner,hash,env)),{status:409});
      const response=await handleRazorpayOAuth(disconnect(),env,db,{id:owner},hash,{fetcher});
      assert.equal((await response.json()).revocation_pending,false);
      const [saved]=(await pg.query("SELECT status,credentials_ciphertext FROM integrations WHERE store_id=$1 AND provider='razorpay'",[id])).rows;
      assert.equal(saved.status,"disconnected");assert.equal(saved.credentials_ciphertext,"");
    });
  }finally{await pg.close();}
});
