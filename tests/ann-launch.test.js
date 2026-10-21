import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { prepareAnnLaunch, saveAnnLaunch } from "../src/store/ann-launch.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { sealCredentials, openCredentials, verifyRazorpay, verifyShiprocket, domainHostname, checkDomain } from "../src/connections/providers.js";
import { migrationSelection } from "../db/migration-selection.js";
import {securityProvider} from "./helpers/checkout-security-provider.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const editor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const secret = "local-test-encryption-only-not-a-real-key";
const json = v => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
const creds = { key_id: "rzp_test_12345678", key_secret: "test-secret-for-isolated-test", webhook_secret: "test-webhook-secret-for-isolated-test" };
const cfg = { SESSION_SECRET: secret, CLOUDFLARE_API_TOKEN: "not-a-real-token", CLOUDFLARE_ZONE_ID: "a".repeat(32),
  CUSTOM_DOMAIN_CNAME_TARGET: "brands.lebrands.store", CUSTOM_DOMAINS_ROUTING_READY: "true" };

test("credential envelopes are randomized, tenant/provider bound, tamper resistant and never plaintext", async () => {
  const a = await sealCredentials(secret, id, "razorpay", creds);
  assert.ok(!a.includes(creds.key_secret));
  assert.notEqual(a, await sealCredentials(secret, id, "razorpay", creds));
  assert.deepEqual(await openCredentials(secret, id, "razorpay", a), creds);
  await assert.rejects(openCredentials(secret, other, "razorpay", a));
  await assert.rejects(openCredentials(secret, id, "shiprocket", a));
  await assert.rejects(openCredentials("a-different-secret-of-at-least-32-characters", id, "razorpay", a));
  await assert.rejects(openCredentials(secret, id, "razorpay", `${a.slice(0,-8)}12345678`));
  await assert.rejects(sealCredentials("too-short", id, "razorpay", creds), { status: 503 });
});

test("provider checks use fixed hosts, non-mutating Razorpay validation and safe failure messages", async () => {
  let calls = [];
  const rz = await verifyRazorpay(creds, async (url, options) => {
    calls.push({ url, options }); return json({ entity: "collection", items: [{ secret_customer_data: "must-not-return" }] });
  });
  assert.equal(calls[0].url, "https://api.razorpay.com/v1/orders?count=1");
  assert.equal(calls[0].options.redirect, "manual"); assert.equal(calls[0].options.method, undefined);
  assert.equal(rz.metadata.mode, "test"); assert.equal(rz.metadata.runtime_ready, false);
  assert.equal(rz.metadata.webhook_verified, false); assert.ok(!JSON.stringify(rz).includes("must-not-return"));
  await assert.rejects(verifyRazorpay(creds, async () => new Response("private-provider-details", { status: 401 })),
    e => e.status === 400 && !e.message.includes("private-provider-details"));
  await assert.rejects(verifyRazorpay(creds, async () => json({ error: { secret: "private" } })), { status: 502 });
  calls = [];
  const sr = await verifyShiprocket({ email: "api@example.invalid", password: "not-real-password" }, async (url, options) => {
    calls.push({ url, options });
    return json(url.endsWith("login") ? { token: "isolated-token-not-real" } : { data: { shipping_address: [{ pickup_location: "private address" }] } });
  });
  assert.equal(calls.length, 2); assert.ok(calls[1].options.headers.authorization.startsWith("Bearer "));
  assert.equal(sr.metadata.pickup_count, 1); assert.ok(!JSON.stringify(sr).includes("private address"));
  for (const host of ["example.com", "https://www.example.com", "www.example.com/path", "www.lebrands.store",
    "x.workers.dev", "a.localhost", "a.b.internal", "10.1.2.3", "www.example.com:8080"]) assert.throws(() => domainHostname(host));
  assert.equal(domainHostname(" WWW.Brand.COM "), "www.brand.com");
  await assert.rejects(checkDomain(cfg, "a".repeat(32), "www.brand.com", async () => json({
    success: true, result: { id: "a".repeat(32), hostname: "www.otherbrand.com" },
  })), { status: 409 });
  assert.equal(migrationSelection(["--staged-launch"]).filename, "0017_ann_launch_setup.sql");
});

test("launch setup persists independently, keeps tenant/owner isolation and never activates payments or shipping", async () => {
  const pg = await setupAnnFixtureDatabase(), db = annFixtureAdapter(pg);
  const get = () => db.withMemberStore(id, "a".repeat(64), tx => prepareAnnLaunch(tx, id, owner, cfg));
  const save = (state, action, fields = {}, fetcher) => db.withMemberStore(id, "a".repeat(64),
    tx => saveAnnLaunch(tx, id, owner, cfg, { expected_revision: state.revision, action, confirm: true, ...fields }, fetcher));
  try {
    let state = await get();
    assert.equal(state.payment_domain_confirmation_required,false);
    assert.deepEqual(state.preferences, { address: "included", payments: "cod", delivery: "manual" });
    assert.equal(state.revision, 0); assert.equal(state.can_edit, true);
    const before = (await pg.query("SELECT settings FROM store_setup WHERE store_id=$1", [id])).rows[0].settings;
    await assert.rejects(db.withMemberStore(id, "b".repeat(64), tx => saveAnnLaunch(tx, id, editor, cfg,
      { expected_revision: 0, confirm: true, action: "choose", preferences: state.preferences })), { status: 403 });
    await assert.rejects(save(state, "choose", { preferences: { ...state.preferences, payments: "unknown" } }), { status: 400 });
    await assert.rejects(save(state, "choose", { preferences: { ...state.preferences, address: "custom" } }), { status: 400 });
    const stale = state;
    state = await save(state, "choose", { preferences: state.preferences });
    assert.equal(state.revision, 1);
    await assert.rejects(save(stale, "choose", { preferences: state.preferences }), { status: 409 });
    state=await save(state,"choose",{preferences:{...state.preferences,payments:"both",delivery:"both"}});
    assert.deepEqual((await get()).preferences,{address:"included",payments:"both",delivery:"both"});
    assert.equal(Object.values(state.providers).some(p=>p.runtime_ready),false);
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM integrations")).rows[0].n,0);
    state = await save(state, "razorpay-connect", { credentials: creds }, async () => json({ entity: "collection", items: [] }));
    assert.equal(state.providers.razorpay.verified, true); assert.equal(state.providers.razorpay.mode, "test");
    assert.equal(state.providers.razorpay.runtime_ready, false); assert.ok(!JSON.stringify(state).includes(creds.key_secret));
    const stored = (await pg.query("SELECT credentials_ciphertext,metadata FROM integrations WHERE store_id=$1", [id])).rows[0];
    assert.deepEqual(await openCredentials(secret, id, "razorpay", stored.credentials_ciphertext), creds);
    assert.equal(typeof stored.metadata, "object");
    await assert.rejects(save(state, "razorpay-connect", { credentials: creds }, async () => new Response("", { status: 401 })), { status: 400 });
    assert.equal((await get()).revision, state.revision); assert.equal((await get()).providers.razorpay.verified, true);
    state = await save(state, "choose", { preferences: { ...state.preferences, payments: "razorpay" } });
    assert.equal(state.preferences.payments, "razorpay");
    state = await save(state, "disconnect", { provider: "razorpay" });
    assert.equal(state.preferences.payments, "cod"); assert.equal(state.providers.razorpay.verified, false);
    assert.equal((await pg.query("SELECT credentials_ciphertext FROM integrations WHERE store_id=$1", [id])).rows[0].credentials_ciphertext, "");
    state = await save(state, "shiprocket-connect", { credentials: { email: "api@example.invalid", password: "isolated-password" } },
      async url => json(url.endsWith("/login") ? { token: "isolated-token-never-live" } : { data: { shipping_address: [] } }));
    assert.equal(state.providers.shiprocket.verified, true); assert.equal(state.providers.shiprocket.pickup_count, 0);
    assert.equal(state.providers.shiprocket.runtime_ready, false);
    state = await save(state, "choose", { preferences: { ...state.preferences, delivery: "shiprocket" } });
    state = await save(state, "disconnect", { provider: "shiprocket" });
    assert.equal(state.preferences.delivery, "manual"); assert.equal(state.providers.shiprocket.verified, false);
    assert.deepEqual((await pg.query("SELECT settings FROM store_setup WHERE store_id=$1", [id])).rows[0].settings, before);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM checkout_settings WHERE store_id=$1", [id])).rows[0].n, 0);
    // Real foundational RLS, not a synthetic schema, protects new launch state.
    await pg.exec("SET ROLE lebrands_app;"); 
    assert.equal((await pg.query("SELECT * FROM store_launch_setup")).rows.length, 0);
    await pg.exec(`SELECT set_config('app.store_id','${other}',false)`);
    assert.equal((await pg.query("SELECT * FROM store_launch_setup")).rows.length, 0);
    await assert.rejects(pg.query("INSERT INTO store_launch_setup(store_id) VALUES($1)", [id]), { code: "42501" });
    await pg.exec("RESET ROLE;");
    const call = (method, body, origin = "https://app.lebrands.store") => handleAnnRoutes(new Request(
      `https://app.lebrands.store/api/stores/${id}/ann/launch`, { method, headers: { origin, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}) }), cfg, db, { id: owner }, "a".repeat(64));
    assert.equal((await call("POST", {})).status, 405);
    assert.equal((await call("PATCH", {}, "https://untrusted.invalid")).status, 403);
    assert.equal((await call("PATCH", { expected_revision: state.revision, confirm: false, action: "disconnect", provider: "razorpay" })).status, 400);
    assert.equal((await call("GET")).status, 200);
  } finally { await pg.close(); }
});

test("custom domains require real DNS and SSL evidence, explicit activation and cannot escape their tenant", async () => {
  const pg = await setupAnnFixtureDatabase(), db = annFixtureAdapter(pg);
  let hostStatus = "pending", ssl = "pending", cname = false, creates = 0,platformReady=true;
  const security=securityProvider();
  const remote = async (url, options) => {
    const securityResult=await security.fetcher(url,options);
    if(securityResult)return securityResult;
    if (url.startsWith("https://api.razorpay.com/")) return json({ entity: "collection", items: [] });
    if (url.startsWith("https://cloudflare-dns.com/")) return json({ Answer: cname ? [{ name: "www.brand.com", type: 5, data: "brands.lebrands.store." }] : [] });
    if (url.endsWith("/custom_hostnames/fallback_origin")) return json({success:true,result:{origin:"store-origin.lebrands.store",status:platformReady?"active":"pending"}});
    if (url.includes("/dns_records?")) return json({success:true,result:[{name:"brands.lebrands.store",proxied:true,content:"store-origin.lebrands.store"}]});
    if (url.endsWith("/workers/routes")) return json({success:true,result:[{pattern:"*/*",script:"lebrands-store"}]});
    if (options.method === "POST") creates++;
    return json({ success: true, result: { id: "e".repeat(32), hostname: "www.brand.com", status: hostStatus,
      ssl: { status: ssl, validation_records: [{ txt_name: "_acme-challenge.www.brand.com", txt_value: "public-dns-proof" }] } } });
  };
  const get = () => db.withMemberStore(id, "a".repeat(64), tx => prepareAnnLaunch(tx, id, owner, cfg));
  const save = (s, action, extra = {}, env = cfg) => db.withMemberStore(id, "a".repeat(64), tx => saveAnnLaunch(tx, id, owner, env,
    { expected_revision: s.revision, confirm: true, action, ...extra }, remote));
  try {
    let state = await get();
    await assert.rejects(save(state, "domain-add", { hostname: "www.brand.com" }, {}), { status: 503 });
    const dnsOnly={CUSTOM_DOMAIN_CNAME_TARGET:"brands.lebrands.store"};
    state=await save(state,"domain-add",{hostname:"www.brand.com"},dnsOnly);
    assert.equal(state.platform.domains_available,true);
    assert.equal(state.platform.domain_activation_available,false);
    assert.equal(state.domain.status,"pending");
    assert.deepEqual(state.domain.dns_records,[{type:"CNAME",name:"www.brand.com",value:"brands.lebrands.store"}]);
    assert.equal(creates,0);
    state=await save(state,"domain-check",{id:state.domain.id},dnsOnly);
    assert.equal(state.domain.cname_verified,false);
    cname=true;
    state=await save(state,"domain-check",{id:state.domain.id},dnsOnly);
    assert.equal(state.domain.cname_verified,true);
    assert.equal(state.domain.status,"pending");
    await assert.rejects(save(state,"domain-activate",{id:state.domain.id,provider_domain_confirmed:true},dnsOnly),{status:503});
    cname=false;
    state=await save(state,"domain-remove",{id:state.domain.id},dnsOnly);
    state = await save(state, "domain-add", { hostname: "www.brand.com" });
    const domainId = state.domain.id;
    assert.equal(creates, 1); assert.equal(state.domain.status, "pending"); assert.equal(state.domain.dns_records.length, 2);
    await assert.rejects(save(state, "domain-check", { id: other }), { status: 404 });
    await assert.rejects(save(state, "domain-activate", { id: domainId }), { status: 400 });
    hostStatus = "active"; ssl = "active";
    await assert.rejects(save(state, "domain-activate", { id: domainId }), { status: 400 });
    cname = true;
    platformReady=false;
    await assert.rejects(save(state, "domain-activate", { id: domainId }), { status: 503 });
    platformReady=true;
    state = await save(state, "domain-check", { id: domainId });
    assert.equal(state.domain.status, "pending"); assert.equal(state.domain.cname_verified, true);
    state = await save(state, "razorpay-connect", { credentials: creds });
    assert.equal(state.payment_domain_confirmation_required,true);
    await assert.rejects(save(state, "domain-activate", { id: domainId }), { status: 400 });
    state = await save(state, "domain-activate", { id: domainId, provider_domain_confirmed: true });
    assert.equal(state.domain.status, "active"); assert.equal(state.preferences.address, "custom");
    cname = false;
    state = await save(state, "domain-check", { id: state.domain.id });
    assert.equal(state.domain.status, "failed"); assert.equal(state.preferences.address, "included");
    state = await save(state, "domain-remove", { id: domainId });
    assert.equal(state.domain, null); assert.equal(state.preferences.address, "included");
    cname = true;
    state = await save(state, "domain-add", { hostname: "www.brand.com" });
    assert.equal(state.domain.id, domainId); assert.equal(creates, 1);
  } finally { await pg.close(); }
});
