import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {ensureCheckoutSecurity,checkoutSecurityEnvironment} from "../src/connections/checkout-security.js";
import {verifyTurnstile} from "../src/checkout/turnstile.js";
import {migrationSelection} from "../db/migration-selection.js";
import {securityProvider} from "./helpers/checkout-security-provider.js";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",other="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const env={CLOUDFLARE_API_TOKEN:"isolated-provider-token",CLOUDFLARE_ZONE_ID:"a".repeat(32),
  CHECKOUT_SECURITY_ENCRYPTION_KEY:"isolated-dedicated-checkout-security-storage-key",
  SESSION_SECRET:"isolated-checkout-security-storage-secret",TURNSTILE_SITE_KEY:"platform-public-key",TURNSTILE_SECRET_KEY:"platform-private-key"};
const hostname="www.brand.com";
test("a dedicated encryption key is required before provisioning has side effects",async()=>{
  let touched=false;
  const unavailable=()=>{touched=true;throw new Error("Unexpected side effect");};
  await assert.rejects(ensureCheckoutSecurity(unavailable,id,hostname,{...env,CHECKOUT_SECURITY_ENCRYPTION_KEY:undefined},unavailable),error=>error.status===503);
  assert.equal(touched,false);
});
test("checkout credential encryption is independent of login and payment keys",async()=>{
  const {sealCredentials}=await import("../src/connections/providers.js");
  const credentials={site_key:"isolated-public-key",secret:"isolated-private-widget-secret"};
  const row={site_key:credentials.site_key,hostnames:JSON.stringify([hostname]),
    credentials_ciphertext:await sealCredentials(env.CHECKOUT_SECURITY_ENCRYPTION_KEY,id,"checkout-turnstile",credentials)};
  const db={withStore:async(storeId,fn)=>{assert.equal(storeId,id);return fn(async()=>[row]);}};
  const resolved=await checkoutSecurityEnvironment(db,{store_id:id},new Request(`https://${hostname}/checkout`),
    {...env,SESSION_SECRET:"a-different-login-secret-do-not-use-for-checkout",INTEGRATION_ENCRYPTION_KEY:"a-different-payment-encryption-key"});
  assert.equal(resolved.TURNSTILE_SITE_KEY,credentials.site_key);
  assert.equal(resolved.TURNSTILE_SECRET_KEY,credentials.secret);
});
test("automatic custom-domain checkout security: persistence, isolation, recovery and failure boundaries",async t=>{
  const pg=await setupAnnFixtureDatabase(),adapter=annFixtureAdapter(pg),provider=securityProvider();
  const db={withStore:(storeId,fn)=>adapter.withMemberStore(storeId,"a".repeat(64),fn)};
  const ensure=(host=hostname)=>db.withStore(id,async tx=>{
    await tx`INSERT INTO public.domains(store_id,hostname) VALUES(${id},${host}) ON CONFLICT(hostname) DO NOTHING`;
    return ensureCheckoutSecurity(tx,id,host,env,provider.fetcher);
  });
  const saved=()=>pg.query("SELECT site_key,credentials_ciphertext,hostnames::text FROM public.store_checkout_security WHERE store_id=$1",[id]);
  try{
    await t.test("migration is explicitly staged",()=>{
      assert.deepEqual(migrationSelection(["--staged-checkout-security"]),{staged:true,filename:"0054_checkout_security.sql",requires:"0017_ann_launch_setup.sql"});
    });
    await t.test("unowned hostnames cannot trigger remote provisioning",async()=>{
      await assert.rejects(db.withStore(id,tx=>ensureCheckoutSecurity(tx,id,"unowned.brand.com",env,provider.fetcher)));
      assert.equal(provider.calls.length,0);
    });
    await t.test("one managed store widget is provisioned, secret encrypted, public evidence minimal",async()=>{
      const result=await ensure();assert.equal(result.status,"ready");
      assert.deepEqual(Object.keys(result).sort(),["checked_at","status"]);
      const {rows:[row]}=await saved();
      assert.match(row.credentials_ciphertext,/^v1\./);assert.ok(!row.credentials_ciphertext.includes("fake-widget-secret"));
      assert.equal(provider.widgets.size,1);assert.equal([...provider.widgets.values()][0].mode,"managed");
      assert.deepEqual(JSON.parse(row.hostnames),[hostname]);
      await ensure();assert.equal(provider.calls.filter(c=>c.method==="POST").length,1);
    });
    await t.test("custom HTML/siteverify use the same store key; included host unchanged",async()=>{
      const custom=await checkoutSecurityEnvironment(db,{store_id:id},new Request(`https://${hostname}/checkout`),env);
      assert.match(custom.TURNSTILE_SITE_KEY,/fake-widget-key/);
      assert.notEqual(custom.TURNSTILE_SECRET_KEY,env.TURNSTILE_SECRET_KEY);
      assert.equal(await checkoutSecurityEnvironment(db,{store_id:id},new Request("https://brand.lebrands.store/checkout"),env),env);
      await assert.rejects(checkoutSecurityEnvironment(db,{store_id:id},new Request("https://other.brand.com/checkout"),env));
      await assert.rejects(checkoutSecurityEnvironment(db,{store_id:other},new Request(`https://${hostname}/checkout`),env));
      const request=new Request(`https://${hostname}/api/checkout/order`);
      await verifyTurnstile(request,custom,{turnstile_token:"fake-token"},async(url,options)=>{
        assert.equal(JSON.parse(options.body).secret,custom.TURNSTILE_SECRET_KEY);
        return new Response(JSON.stringify({success:true,hostname,action:"checkout"}));
      });
      for(const response of [{hostname:"other.brand.com",action:"checkout"},{hostname,action:"not-checkout"}])
        await assert.rejects(verifyTurnstile(request,custom,{turnstile_token:"fake-token"},async()=>new Response(JSON.stringify({success:true,...response}))));
    });
    await t.test("permission failures preserve local credentials and existing provider hosts",async()=>{
      const before=(await saved()).rows[0];
      provider.denyWrites(true);
      await assert.rejects(ensure("new.brand.com"),e=>e.status===503&&e.checkoutSecurity&&!/Cloudflare|token|secret|Forbidden/.test(e.message));
      assert.deepEqual((await saved()).rows[0],before);
      assert.deepEqual([...provider.widgets.values()][0].domains,[hostname]);
      provider.denyWrites(false);
    });
    await t.test("remote widget is recovered after transaction rollback without another create",async()=>{
      await pg.query("DELETE FROM public.store_checkout_security WHERE store_id=$1",[id]);
      const count=provider.calls.filter(c=>c.method==="POST").length;
      await ensure();assert.equal(provider.calls.filter(c=>c.method==="POST").length,count);
    });
    await t.test("another store's widget cannot be adopted",async()=>{
      const w=[...provider.widgets.values()][0],name=w.name;
      w.name=`LeBrands checkout ${other}`;
      await assert.rejects(ensure(),e=>e.checkoutSecurity===true);
      w.name=name;
    });
    await t.test("account capacity failure is explicit; no shared-key fallback or disabled protection",async()=>{
      await pg.query("DELETE FROM public.store_checkout_security WHERE store_id=$1",[id]);
      provider.widgets.clear();provider.atCapacity(true);
      await assert.rejects(ensure(),e=>e.status===503&&e.checkoutSecurity);
      assert.equal((await saved()).rows.length,0);
      provider.atCapacity(false);await ensure();
    });
    await t.test("RLS denies cross-store reads and forged credential writes",async()=>{
      await pg.exec(`SET ROLE lebrands_app; SELECT set_config('app.store_id','${other}',false)`);
      assert.equal((await pg.query("SELECT * FROM public.store_checkout_security")).rows.length,0);
      assert.equal((await pg.query("UPDATE public.store_checkout_security SET checked_at=now() WHERE store_id=$1 RETURNING store_id",[id])).rows.length,0);
      await assert.rejects(pg.query("INSERT INTO public.store_checkout_security(store_id,site_key,credentials_ciphertext,hostnames) VALUES($1,'foreign-key-value','v1.fake','[\"www.brand.com\"]')",[id]),e=>e.code==="42501");
      await pg.exec("RESET ROLE");
    });
  }finally{await pg.close();}
});
