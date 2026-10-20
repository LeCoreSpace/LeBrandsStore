import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupBusinessReviewFixture} from "../src/business-review-preview-fixture.js";
import {requireBusinessPublication} from "../src/store/business-publication-access.js";
import {businessEditorAccess} from "../src/store/business-access.js";
import {loadDraft,publish} from "../src/store/repository.js";
import {publishChecklist} from "../src/public/validation.js";
import {renderEmail} from "../src/email/templates.js";
import {migrationSelection} from "../db/migration-selection.js";

test("post-publication review is staged and review email escapes reviewer input",()=>{
 assert.equal(migrationSelection(["--staged-business-review-after-publication"]).filename,"0052_business_review_after_publication.sql");
 for(const decision of ["approved","changes_requested"]){
  const mail=renderEmail("business_review",{decision,note:"Fix <script>unsafe</script>",store_name:"Example",action_url:"https://app.lebrands.store/stores/example/settings#business-documents"});
  assert.doesNotMatch(mail.html,/<script>/);
  assert.match(mail.html,/&lt;script&gt;/);
  assert.match(mail.text,/Open business documents/);
  assert.match(mail.text,decision==="approved"?/approved your business documents/:/upload replacement documents/);
 }
});

test("pending review publication preserves approval authority and queues decision email atomically",async()=>{
 const f=await setupBusinessReviewFixture();
 const {pg,db,store,ownerToken,token}=f;
 try{
  await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0035_business_document_review.sql','fixture')");
  await pg.exec(await readFile("db/staged/0037_platform_billing.sql","utf8"));
  await pg.query("INSERT INTO public.schema_migrations(filename,checksum) VALUES('0037_platform_billing.sql','fixture')");
  await pg.exec(await readFile("db/staged/0038_free_subscriptions.sql","utf8"));
  await pg.exec(await readFile("db/staged/0014_transactional_email.sql","utf8"));
  await pg.exec(await readFile("db/staged/0052_business_review_after_publication.sql","utf8"));
  const access=fn=>db.withMemberStore(store,ownerToken,fn);
  await access(tx=>requireBusinessPublication(tx,store));
  assert.equal((await access(tx=>businessEditorAccess(tx,store,ownerToken))).allowed,true);
  const [authority]=await access(tx=>tx`SELECT public.business_publication_access(${store}) AS approved`);
  assert.equal(authority.approved,false,"Pending manual review must not grant financial approval");
  const draft=await access(tx=>loadDraft(tx,store));
  assert.equal(publishChecklist(draft).find(c=>c.label==="Business documents submitted and security-screened").complete,true);
  await pg.query("UPDATE public.store_setup SET settings=settings||$2::jsonb WHERE store_id=$1",[store,JSON.stringify({
   subdomain:"ann-test-store",support_email:"support@example.invalid",support_phone:"+919876543210",
   tagline:"A synthetic test storefront",description:"A synthetic storefront used for isolated publication checks.",
   address:"1 Example Road, Chennai, Tamil Nadu 600001",
  })]);
  const logo="ffffffff-ffff-4fff-8fff-ffffffffffff";
  await pg.query("INSERT INTO public.media(id,store_id,object_key,kind,content_type,size_bytes,upload_type) VALUES($1,$2,$3,'image','image/webp',32,'logo')",[logo,store,`stores/${store}/${logo}.webp`]);
  await pg.query("UPDATE public.store_setup SET logo_media_id=$2 WHERE store_id=$1",[store,logo]);
  await pg.query("UPDATE public.products SET hsn_code='6204' WHERE store_id=$1",[store]);
  await access(tx=>tx`INSERT INTO public.product_media(store_id,product_id,media_id) VALUES(${store},${"dddddddd-dddd-4ddd-8ddd-dddddddddddd"},${"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"})`);
  await pg.query("UPDATE public.policy_pages SET reviewed_at=now() WHERE store_id=$1",[store]);
  const price=(await pg.query("SELECT pp.id FROM public.billing_plan_prices pp JOIN public.billing_plans p ON p.id=pp.plan_id WHERE p.code='free' AND pp.country_code='IN' AND pp.enabled LIMIT 1")).rows[0];
  await access(tx=>tx`SELECT public.billing_activate_free(${store},${ownerToken},${price.id},'free-v1',true)`);
  assert.equal((await access(tx=>publish(tx,store,true))).store.status,"live");
  const subscription=(await pg.query("SELECT status,free_live_started_at,free_expires_at FROM public.billing_subscriptions WHERE store_id=$1",[store])).rows[0];
  assert.equal(subscription.status,"trialing");
  assert.equal(new Date(subscription.free_expires_at)-new Date(subscription.free_live_started_at),30*86400*1000);
  await db.account(tx=>tx`SELECT public.business_review_decide(${token},${store},1,'changes_requested','Please upload a legible registration document.',true)`);
  assert.equal((await pg.query("SELECT status FROM public.stores WHERE store_id=$1",[store])).rows[0].status,"live","Correction request alone must not suspend");
  await assert.rejects(access(tx=>requireBusinessPublication(tx,store)),e=>e.status===403);
  assert.equal((await access(tx=>businessEditorAccess(tx,store,ownerToken))).reason,"changes_requested");
  let emails=(await pg.query("SELECT template,payload FROM public.email_log WHERE store_id=$1",[store])).rows;
  assert.equal(emails.length,1);assert.equal(emails[0].template,"business_review");
  assert.equal(emails[0].payload.decision,"changes_requested");
  const email=(await pg.query("SELECT id FROM public.email_log WHERE store_id=$1 LIMIT 1",[store])).rows[0];
  assert.equal((await access(tx=>tx`SELECT public.business_review_email_allowed(${store},${email.id}) AS allowed`))[0].allowed,true);
  await assert.rejects(db.account(tx=>tx`SELECT public.business_review_decide(${token},${store},1,'approved','This is a stale review attempt.',true)`),e=>e.code==="40001");
  assert.equal((await pg.query("SELECT count(*) AS n FROM public.email_log WHERE store_id=$1",[store])).rows[0].n,1);
  await db.account(tx=>tx`SELECT public.business_review_decide(${token},${store},2,'approved','Registration evidence has been reviewed.',true)`);
  emails=(await pg.query("SELECT payload FROM public.email_log WHERE store_id=$1 ORDER BY created_at",[store])).rows;
  assert.equal(emails.length,2);assert.ok(emails.some(e=>e.payload.decision==="approved"));
  assert.ok((await pg.query("SELECT * FROM public.email_pending_stores()")).rows.length);
  await pg.query("UPDATE public.store_business_verifications SET submission_version=submission_version+1,status='pending_review' WHERE store_id=$1",[store]);
  await assert.rejects(access(tx=>requireBusinessPublication(tx,store)),e=>e.status===403);
  await assert.rejects(db.account(tx=>tx`SELECT public.business_publication_ready(${store})`),e=>e.code==="42501");
  const grants=(await pg.query("SELECT has_function_privilege('anon','public.business_publication_ready(uuid)','EXECUTE') AS ready,has_function_privilege('authenticated','public.business_review_notify()','EXECUTE') AS notify")).rows[0];
  assert.deepEqual(grants,{ready:false,notify:false});
  await pg.query("UPDATE public.users SET email='changed@example.invalid' WHERE id=$1",[f.owner.id]);
  assert.equal((await access(tx=>tx`SELECT public.business_review_email_allowed(${store},${email.id}) AS allowed`))[0].allowed,false);
 }finally{await pg.close();}
});
