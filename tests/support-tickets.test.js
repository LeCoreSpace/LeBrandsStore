import test from "node:test";
import assert from "node:assert/strict";
import {setupSupportFixture} from "../src/support-preview-fixture.js";
import {handleSupport,safeSupportContext,readSupportBody} from "../src/support/routes.js";
import {prepareSupportEmails} from "../src/support/email.js";
import {sha256} from "../src/auth/passwords.js";
import {platformDeliveryKey} from "../src/email/tokens.js";
import {renderEmail} from "../src/email/templates.js";
import {migrationSelection} from "../db/migration-selection.js";

test("support contracts reject unsafe context and use professional service emails",async()=>{
 assert.deepEqual(migrationSelection(["--staged-support-tickets"]),{staged:true,filename:"0051_support_tickets.sql",requires:"0046_platform_admin.sql"});
 assert.throws(()=>safeSupportContext({api_key:"private"}));
 assert.throws(()=>safeSupportContext({pathname:"/settings?token=private"}));
 assert.deepEqual(safeSupportContext({theme_key:"minimal",provider:"meta"}),{theme_key:"minimal",provider:"meta"});
 await assert.rejects(()=>readSupportBody(new Request("https://app.lebrands.store/api/support",{method:"POST",headers:{"content-type":"application/json"},body:" ".repeat(65537)})),e=>e.status===413);
 for(const kind of["ticket_created","ticket_closed"]){
  const m=renderEmail(kind,{ticket_number:"12",audience:"brand",action_url:"https://app.lebrands.store/support/example"});
  assert.match(m.subject,/SUP-000012/);assert.match(m.html,/Open support ticket/);
  assert.doesNotMatch(m.text,/Verify email|verification code|unsubscribe|Track your order/);
 }
});

test("real support DDL, permissions, account/store workflows and durable notifications",async t=>{
 const f=await setupSupportFixture();
 const request=(path,actor="brand",body,origin="https://app.lebrands.store")=>new Request(`https://app.lebrands.store${path}`,{
  method:body?"POST":"GET",headers:{cookie:`__Host-lbs_session=${f.tokens[actor]}`,origin,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const call=req=>handleSupport(req,f.env,{}, {createDb:()=>f.db});
 const base={subject:"Help creating my first store",body:"I need help choosing my store design.",category_code:"store_setup",
  store_id:null,source:"onboarding",context:{},idempotency_key:crypto.randomUUID()};
 let id,revision;
 try{
 await t.test("real schema preserves email function identity and denies direct/API-role access",async()=>{
  const oid=await f.pg.query("SELECT 'public.email_claim_platform(uuid,text)'::regprocedure::oid AS oid");
  assert.equal(oid.rows[0].oid,f.oldClaimOid);
  const privileges=await f.pg.query("SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND(p.proname LIKE 'support_%' OR p.proname='email_claim_platform')");
  assert.ok(privileges.rows.length>10);assert.ok(privileges.rows.every(row=>!row.anon&&!row.authenticated));
  for(const role of["anon","authenticated","lebrands_app"]){
   const sequence=await f.pg.query("SELECT has_sequence_privilege($1,'public.support_tickets_ticket_number_seq','USAGE, SELECT, UPDATE') AS allowed",[role]);
   assert.equal(sequence.rows[0].allowed,false);
  }
  for(const role of["anon","authenticated","lebrands_app"]){
   await f.pg.exec(`SET ROLE ${role}`);
   try{
    await assert.rejects(()=>f.pg.query("SELECT * FROM public.support_tickets"),e=>e.code==="42501");
    await assert.rejects(()=>f.pg.query("SELECT public.support_actor('invalid',true)"),e=>e.code==="42501");
    if(role!=="lebrands_app")await assert.rejects(()=>f.pg.query("SELECT public.support_list('invalid',false,'all','','all',0)"),e=>e.code==="42501");
   }finally{await f.pg.exec("RESET ROLE");}
  }
 });
 await t.test("signed-in account can create before owning a store; duplicate retry is safe",async()=>{
  const page=await call(request("/support/new"));assert.equal(page.status,200);assert.match(await page.text(),/Raise a ticket|New ticket/);
  const response=await call(request("/api/support","brand",base));assert.equal(response.status,201,await response.clone().text());
  id=(await response.json()).data.id;
  const retry=await call(request("/api/support","brand",base));assert.equal((await retry.json()).data.id,id);
  assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM public.support_ticket_notifications WHERE ticket_id=$1",[id])).rows[0].n,2);
  assert.equal((await call(request("/api/support","brand",{...base,subject:"Different request reused key"}))).status,400);
 });
 await t.test("other brands and forged admin access are denied, with CSRF and input guards",async()=>{
  assert.equal((await call(request(`/api/support/${id}`,"other"))).status,403);
  assert.equal((await call(request("/api/admin/support","brand"))).status,403);
  assert.equal((await call(request("/api/support","brand",{...base,idempotency_key:crypto.randomUUID()},"https://evil.invalid"))).status,403);
  assert.equal((await call(request("/api/support","brand",{...base,idempotency_key:crypto.randomUUID(),priority:"urgent"}))).status,400);
  assert.equal((await call(request("/api/support","brand",{...base,idempotency_key:crypto.randomUUID(),context:{api_secret:"private"}}))).status,400);
  await assert.rejects(async()=>f.pg.query("SELECT public.support_detail($1,$2,NULL)",[await sha256(f.tokens.brand),id]),e=>e.code==="22023");
 });
 await t.test("admin sees inbox; private notes never enter brand conversation or activity",async()=>{
  assert.equal((await call(request("/admin/support","admin"))).status,200);
  const note={body:"Private support investigation",visibility:"internal",idempotency_key:crypto.randomUUID()};
  const r=await call(request(`/api/admin/support/${id}/messages`,"admin",note));assert.equal(r.status,200);
  assert.equal((await r.json()).data.messages.length,2);
  const repeat=await call(request(`/api/admin/support/${id}/messages`,"admin",note));assert.equal((await repeat.json()).data.messages.length,2);
  const brand=(await(await call(request(`/api/support/${id}`))).json()).data;
  assert.equal(brand.messages.length,1);assert.equal(brand.events.length,1);assert.equal(brand.notifications.length,0);
  assert.doesNotMatch(JSON.stringify(brand),/Private support investigation|message_number|capability_hash/);
  revision=brand.revision;
  assert.equal((await call(request(`/api/support/${id}/messages`,"brand",{...note,idempotency_key:crypto.randomUUID()}))).status,403);
 });
 await t.test("assignment, priority and Pending use optimistic concurrency",async()=>{
  const r=await call(request(`/api/admin/support/${id}/workflow`,"admin",{revision,status:"pending",priority:"high",assigned_admin_user_id:f.user.id,waiting_on:"support"}));
  assert.equal(r.status,200,await r.clone().text());
  const ticket=(await r.json()).data;assert.equal(ticket.status,"pending");assert.equal(ticket.priority,"high");
  assert.equal(ticket.assigned_admin_user_id,f.user.id);
  assert.equal((await call(request(`/api/admin/support/${id}/workflow`,"admin",{revision,status:"closed",resolution:"Resolved the issue."}))).status,409);
  revision=ticket.revision;
  const noDiscard=await call(request(`/api/admin/support/${id}/workflow`,"admin",{revision,priority:"normal",resolution:"Unsaved resolution must not disappear."}));
  assert.equal(noDiscard.status,400);
 });
 await t.test("closure requires public resolution and queues both recipients exactly once",async()=>{
  assert.equal((await call(request(`/api/admin/support/${id}/workflow`,"admin",{revision,status:"closed"}))).status,400);
  const r=await call(request(`/api/admin/support/${id}/workflow`,"admin",{revision,status:"closed",resolution:"Your store setup is ready to continue."}));
  assert.equal(r.status,200,await r.clone().text());const ticket=(await r.json()).data;
  assert.equal(ticket.status,"closed");assert.equal(ticket.messages.at(-1).body,"Your store setup is ready to continue.");
  assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM public.support_ticket_notifications WHERE ticket_id=$1 AND notification_type='ticket_closed'",[id])).rows[0].n,2);
  revision=ticket.revision;
 });
 await t.test("a private note on Closed neither reopens it nor exposes private activity",async()=>{
  const before=(await(await call(request(`/api/support/${id}`))).json()).data;
  const response=await call(request(`/api/admin/support/${id}/messages`,"admin",{body:"Internal follow-up after closure",visibility:"internal",idempotency_key:crypto.randomUUID()}));
  assert.equal(response.status,200);assert.equal((await response.json()).data.status,"closed");
  const after=(await(await call(request(`/api/support/${id}`))).json()).data;
  assert.equal(after.last_activity_at,before.last_activity_at);assert.equal(after.events.length,before.events.length);
  assert.doesNotMatch(JSON.stringify(after),/Internal follow-up after closure/);
 });
 await t.test("preparation/recovery reuses private platform jobs and idempotent provider keys",async()=>{
  await prepareSupportEmails(f.env,f.db);await prepareSupportEmails(f.env,f.db);
  const jobs=await f.pg.query("SELECT * FROM public.platform_email_jobs WHERE template IN('ticket_created','ticket_closed')");
  assert.equal(jobs.rows.length,4);assert.ok(jobs.rows.every(j=>j.status==="pending"));
  assert.ok(jobs.rows.every(j=>!JSON.stringify(j.payload).includes("Private support investigation")));
  const pending=await f.pg.query("SELECT * FROM public.email_platform_pending()");
  for(const row of pending.rows){
   const cap=await platformDeliveryKey(f.env,row.token_hash);
   const claimed=await f.db.account(tx=>tx`SELECT public.email_claim_platform(${row.id},${cap}) AS job`);
   assert.ok(claimed[0].job); // No provider call or real email send.
   const second=await f.db.account(tx=>tx`SELECT public.email_claim_platform(${row.id},${cap}) AS job`);assert.equal(second[0].job,null);
   await f.db.account(tx=>tx`SELECT public.email_finish_platform(${row.id},${cap},${"synthetic-provider-"+row.id},${null})`);
  }
 });
 await t.test("reply reopens Closed as Pending; later closure creates a distinct notification event",async()=>{
  const body={body:"I still need help with the page sections.",visibility:"public",idempotency_key:crypto.randomUUID()};
  const r=await call(request(`/api/support/${id}/messages`,"brand",body));
  assert.equal(r.status,200);const ticket=(await r.json()).data;assert.equal(ticket.status,"pending");assert.equal(ticket.waiting_on,"support");
  const close=await call(request(`/api/support/${id}/workflow`,"brand",{revision:ticket.revision,status:"closed",resolution:"I have solved the issue now, thank you."}));
  assert.equal(close.status,200);
  assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM public.support_ticket_notifications WHERE ticket_id=$1 AND notification_type='ticket_closed'",[id])).rows[0].n,4);
 });
 await t.test("store tickets remain isolated and owner/requester notification is deduplicated",async()=>{
  const store=f.storeId;
  const body={...base,store_id:store,source:"dashboard",idempotency_key:crypto.randomUUID()};
  assert.equal((await call(request("/api/support","brand",body))).status,403);
  const r=await call(request("/api/support","owner",body));assert.equal(r.status,201);
  const sid=(await r.json()).data.id;
  assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM public.support_ticket_notifications WHERE ticket_id=$1",[sid])).rows[0].n,2);
  const personal=await f.pg.query("SELECT count(*)::int AS n FROM public.support_tickets WHERE id=$1 AND scope='account' AND store_id IS NULL",[id]);assert.equal(personal.rows[0].n,1);
 });
 await t.test("delayed email cancels when membership has been revoked",async()=>{
  const store=f.storeId;
  await f.pg.query("INSERT INTO public.store_members(store_id,user_id,role) VALUES($1,$2,'editor')",[store,f.brandId]);
  const create=await call(request("/api/support","brand",{...base,store_id:store,idempotency_key:crypto.randomUUID()}));const tid=(await create.json()).data.id;
  await prepareSupportEmails(f.env,f.db);
  const row=(await f.pg.query("SELECT j.id,j.token_hash FROM public.support_ticket_notifications n JOIN public.platform_email_jobs j ON j.id=n.email_job_id WHERE n.ticket_id=$1 AND n.recipient_user_id=$2",[tid,f.brandId])).rows[0];
  await f.pg.query("DELETE FROM public.store_members WHERE store_id=$1 AND user_id=$2",[store,f.brandId]);
  const cap=await platformDeliveryKey(f.env,row.token_hash);
  const claim=await f.db.account(tx=>tx`SELECT public.email_claim_platform(${row.id},${cap}) AS job`);
  assert.equal(claim[0].job,null);assert.equal((await call(request(`/api/support/${tid}`,"brand"))).status,403);
 });
 }finally{await f.pg.close();}
});
