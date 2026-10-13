import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderEmail,maskRecipient} from "../src/email/templates.js";
import {signedEmailToken,verifyEmailToken} from "../src/email/tokens.js";
import {authenticateWebhook} from "../src/email/webhook.js";
import {sendResend} from "../src/email/service.js";
import {hashPassword} from "../src/auth/passwords.js";
import {preAuraDatabase,applyAura,asLegacyApp} from "./helpers/rollback-database.js";
import {preparePageMigration} from "../db/page-schema-migration.js";
const env={SESSION_SECRET:"fixture-only-signing-key-never-used-in-production"};
test("every transactional template has HTML, text, safe branding and no marketing or dash characters",()=>{
 for(const kind of ["confirmed","new_order","shipped","delivered","cancelled","refunded","reset","invite","verification"]){
  const out=renderEmail(kind,{brand_name:"Example & Store",order_number:"EO-1",total_paise:10500,tax_paise:500,
   items:[{title:"Cotton shirt",quantity:1,unit_price_paise:10000}],payment_method:"cod",contact_email:"help@example.invalid",
   action_url:"https://example.invalid/track",policy_url:"https://example.invalid/policies/terms",accent_colour:"#702440"});
  assert.match(out.html,/viewport/);assert.match(out.html,/transactional email/);assert.match(out.text,/Example|LeBrands.Store/);
  assert.ok(!/[–—]/.test(out.html+out.text));assert.ok(out.subject);
 }
 assert.equal(maskRecipient("owner@example.invalid"),"o***@example.invalid");
 const snapshot=renderEmail("confirmed",{items:[{product_snapshot:{title:"Indigo cotton shirt"},quantity:2,line_total_paise:258000}],total_paise:258000});
 assert.match(snapshot.html,/Indigo cotton shirt/);
 assert.match(snapshot.text,/Indigo cotton shirt: quantity 2, line total ₹2580\.00/);
 assert.ok(!renderEmail("shipped",{action_url:"javascript:alert(1)",brand_name:"<script>bad</script>"}).html.includes('href="javascript:'));
 assert.match(renderEmail("confirmed",{brand_name:"<script>"}).html,/&lt;script&gt;/);
 assert.throws(()=>renderEmail("newsletter"));
});
test("signed reset and invite links reject expiry, tampering, wrong purposes and keys",async()=>{
 const token=await signedEmailToken(env,"reset",1800,1000000);
 assert.equal(await verifyEmailToken(env,token,"reset",1000001),true);
 assert.equal(await verifyEmailToken(env,token,"invite",1000001),false);
 assert.equal(await verifyEmailToken(env,token,"reset",2800000),false);
 assert.equal(await verifyEmailToken({...env,SESSION_SECRET:"another-fixture"},token,"reset",1000001),false);
 assert.equal(await verifyEmailToken(env,token+"a","reset",1000001),false);
});
test("Resend webhook signatures bind body, timestamp and message id",async()=>{
 const bytes=new TextEncoder().encode("fixture-webhook-key"),secret=`whsec_${btoa(String.fromCharCode(...bytes))}`,timestamp="1000",id="evt_test";
 const raw=JSON.stringify({type:"email.delivered",data:{email_id:"test_id"}});
 const key=await crypto.subtle.importKey("raw",bytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${id}.${timestamp}.${raw}`)));
 const req=new Request("https://example.invalid/webhook",{method:"POST",headers:{"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${btoa(String.fromCharCode(...sig))}`}});
 assert.equal(await authenticateWebhook(req,{RESEND_WEBHOOK_SECRET:secret},raw,1000000),true);
 assert.equal(await authenticateWebhook(req,{RESEND_WEBHOOK_SECRET:secret},raw+"x",1000000),false);
 assert.equal(await authenticateWebhook(req,{RESEND_WEBHOOK_SECRET:secret},raw,1400000),false);
});
test("Resend sends stable idempotency keys and fails explicitly on provider errors",async t=>{
 const calls=[];t.mock.method(globalThis,"fetch",async(url,options)=>{calls.push(options);return Response.json({id:"fixture-email-id"});});
 const message={from:"Example <orders@notify.lebrands.store>",to:["test@example.invalid"],...renderEmail("confirmed")};
 assert.equal(await sendResend({RESEND_API_KEY:"fixture-only"},message,"event-fixture"),"fixture-email-id");
 await sendResend({RESEND_API_KEY:"fixture-only"},message,"event-fixture");
 assert.equal(calls[0].headers["Idempotency-Key"],calls[1].headers["Idempotency-Key"]);
 assert.deepEqual(JSON.parse(calls[0].body),message);
 t.mock.method(globalThis,"fetch",async()=>new Response("Unavailable",{status:503}));
 await assert.rejects(sendResend({RESEND_API_KEY:"fixture-only"},message,"event-fixture"),e=>e.status===503);
});
test("isolated email migration: idempotent events, tenant isolation, private reset jobs, expiry and single-use invitations",async()=>{
 const pg=await preAuraDatabase();
 try{
  await applyAura(pg);
  for(const filename of ["0012_aura_skeleton_sections.sql","0013_ai_builder.sql","0014_transactional_email.sql"]){
   const sql=await readFile(new URL(`../db/staged/${filename}`,import.meta.url),"utf8");
   await pg.exec(await preparePageMigration(filename,sql));
  }
  const owner=crypto.randomUUID(),member=crypto.randomUUID(),brand=crypto.randomUUID(),store=crypto.randomUUID(),other=crypto.randomUUID();
  const session="a".repeat(64),memberSession="e".repeat(64),delivery="d".repeat(64),reset="b".repeat(64),invite="c".repeat(64);
  await pg.query("INSERT INTO users(id,name,email) VALUES($1,'Owner','owner@example.invalid'),($2,'Member','member@example.invalid')",[owner,member]);
  await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'Example','Example')",[brand]);
  await pg.query("INSERT INTO stores(store_id,brand_id,name,subdomain) VALUES($1,$2,'Example','email-example'),($3,$2,'Other','email-other')",[store,brand,other]);
  await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[store,owner]);
  await pg.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')",[owner,session,member,memberSession]);
  const app=fn=>asLegacyApp(pg,store,session,fn);
  const message={from:"LeBrands.Store <hello@notify.lebrands.store>",to:["owner@example.invalid"],html:"<p>Fixture</p>",text:"Fixture",subject:"Fixture"};
  await assert.rejects(app(tx=>tx`SELECT * FROM public.platform_email_jobs`),e=>e.code==="42501");
  let job;
  await app(async tx=>{
   const[row]=await tx`SELECT public.email_issue_reset('owner@example.invalid',${reset},${tx.json(message)},${delivery}) AS id`;job=row.id;
   assert.ok(job);
   assert.equal((await tx`SELECT public.email_issue_reset('absent@example.invalid',${reset},${tx.json(message)},${delivery}) AS id`)[0].id,null);
   assert.equal((await tx`SELECT public.email_issue_reset('owner@example.invalid',${reset},${tx.json(message)},${delivery}) AS id`)[0].id,null);
   const[claimed]=await tx`SELECT public.email_claim_platform(${job},${delivery}) AS job`;
   assert.equal(claimed.job.attempts,1);
   await tx`SELECT public.email_finish_platform(${job},${delivery},NULL,'provider_unavailable')`;
  });
  await assert.rejects(app(tx=>tx`SELECT public.email_claim_platform(${job},${"f".repeat(64)})`),e=>e.code==="42501");
  await pg.query("UPDATE platform_email_jobs SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",[job]);
  await app(async tx=>{
   assert.equal((await tx`SELECT public.email_claim_platform(${job},${delivery}) AS job`)[0].job.attempts,2);
   await tx`SELECT public.email_finish_platform(${job},${delivery},'fixture-provider-id',NULL)`;
   assert.equal((await tx`SELECT public.email_platform_event('fixture-provider-id','delivered',now()) AS found`)[0].found,true);
   for(let i=0;i<10;i++)assert.equal((await tx`SELECT public.email_reset_allowed(${"f".repeat(64)}) AS allowed`)[0].allowed,true);
   assert.equal((await tx`SELECT public.email_reset_allowed(${"f".repeat(64)}) AS allowed`)[0].allowed,false);
   assert.equal((await tx`SELECT public.email_claim_platform(${job},${delivery}) AS job`)[0].job,null);
   await tx`SELECT public.email_invite_staff(${store},${session},'member@example.invalid','editor',${invite},${tx.json(message)})`;
  });
  await assert.rejects(asLegacyApp(pg,other,session,tx=>tx`SELECT public.email_invite_staff(${store},${session},'member@example.invalid','editor',${"f".repeat(64)},${tx.json(message)})`),e=>e.code==="42501");
  await asLegacyApp(pg,other,session,async tx=>{
   assert.equal((await tx`SELECT * FROM public.email_staff_invites WHERE store_id=${store}`).length,0);
   assert.equal((await tx`UPDATE public.email_log SET status='failed' WHERE store_id=${store} RETURNING id`).length,0);
  });
  await asLegacyApp(pg,"",memberSession,async tx=>assert.equal((await tx`SELECT public.email_accept_invite(${invite},${memberSession}) AS id`)[0].id,store));
  await assert.rejects(asLegacyApp(pg,"",memberSession,tx=>tx`SELECT public.email_accept_invite(${invite},${memberSession})`),e=>e.code==="42501");
  const customer=crypto.randomUUID(),order=crypto.randomUUID();
  await pg.query("INSERT INTO store_setup(store_id,settings) VALUES($1,'{\"support_email\":\"merchant@example.invalid\"}') ON CONFLICT(store_id) DO UPDATE SET settings=EXCLUDED.settings",[store]);
  await app(async tx=>{
   await tx`INSERT INTO public.customers(id,store_id,name,phone,email) VALUES(${customer},${store},'Example buyer','9999999999','buyer@example.invalid')`;
   await tx`INSERT INTO public.orders(id,store_id,customer_id,order_number,status,payment_method,subtotal_paise,tax_paise,total_paise,shipping_address)
     VALUES(${order},${store},${customer},'EMAIL-DEMO-1','confirmed_cod','cod',10000,500,10500,'{}')`;
   await tx`SELECT public.email_queue_order(${store},${order},'confirmed')`;
   assert.equal((await tx`SELECT * FROM public.email_log WHERE order_id=${order}`).length,2);
   await tx`UPDATE public.orders SET status='shipped' WHERE store_id=${store} AND id=${order}`;
   assert.equal((await tx`SELECT * FROM public.email_log WHERE order_id=${order}`).length,3);
   await tx`UPDATE public.customers SET email_bounced_at=now() WHERE store_id=${store} AND id=${customer}`;
   await tx`UPDATE public.orders SET status='delivered' WHERE store_id=${store} AND id=${order}`;
   assert.equal((await tx`SELECT * FROM public.email_log WHERE order_id=${order}`).length,3);
  });
  const record=await hashPassword("Fixture-password-123",{PASSWORD_PEPPER:btoa("fixture-only-password-pepper-that-is-long-enough")});
  await pg.query("UPDATE email_reset_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[owner]);
  await app(async tx=>assert.equal((await tx`SELECT public.email_complete_reset(${reset},${record.password_hash},${record.password_algo},${record.password_iterations},${record.password_salt}) AS changed`)[0].changed,false));
  await pg.query("UPDATE email_reset_tokens SET expires_at=now()+interval '1 minute' WHERE user_id=$1",[owner]);
  await app(async tx=>{
   assert.equal((await tx`SELECT public.email_complete_reset(${reset},${record.password_hash},${record.password_algo},${record.password_iterations},${record.password_salt}) AS changed`)[0].changed,true);
   assert.equal((await tx`SELECT public.email_complete_reset(${reset},${record.password_hash},${record.password_algo},${record.password_iterations},${record.password_salt}) AS changed`)[0].changed,false);
  });
 }finally{await pg.close();}
});
