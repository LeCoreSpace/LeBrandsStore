import test from "node:test";
import assert from "node:assert/strict";
import {setupBusinessReconsiderFixture} from "../src/business-review-preview-fixture.js";
import {handleBusinessReview} from "../src/admin/business-review-routes.js";
import {renderBusinessReview} from "../src/ui/business-review.js";
import {migrationSelection} from "../db/migration-selection.js";

test("re-review stays explicitly staged and preserves the old approved-state guard",()=>{
 assert.deepEqual(migrationSelection(["--staged-business-review-reconsider"]),{
  staged:true,filename:"0053_business_review_reconsider.sql",requires:"0052_business_review_after_publication.sql"});
 const data={store:{store_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},verification:{status:"approved",revision:2}};
 assert.doesNotMatch(renderBusinessReview("detail",data,{}),/>Review again</);
 assert.match(renderBusinessReview("detail",{...data,reconsider_available:true},{}),/>Review again</);
 assert.doesNotMatch(renderBusinessReview("detail",{...data,reconsider_available:true},{}),/name="review_again"/);
});

test("approved re-review is read-only until a guarded decision and one atomic email intent",async()=>{
 const f=await setupBusinessReconsiderFixture();
 const {pg,db,store,token,user}=f;
 const base=`https://app.lebrands.store/admin/business-reviews/${store}`;
 const call=(request,who=user,session=token)=>handleBusinessReview(request,f.env,db,who,session);
 const post=(values,origin="https://app.lebrands.store")=>new Request(base,{method:"POST",headers:{origin},body:new URLSearchParams(values)});
 const state=async()=> (await pg.query("SELECT status,revision,reviewed_at,reviewed_by,feedback FROM public.store_business_verifications WHERE store_id=$1",[store])).rows[0];
 const count=async table=>Number((await pg.query(`SELECT count(*) AS n FROM public.${table} WHERE store_id=$1`,[store])).rows[0].n);
 try{
  // Legacy approvals may have no human review metadata, as in the reported case.
  await pg.query("UPDATE public.store_business_verifications SET reviewed_at=NULL,reviewed_by=NULL,feedback='' WHERE store_id=$1",[store]);
  const storeBefore=(await pg.query("SELECT status FROM public.stores WHERE store_id=$1",[store])).rows[0].status;
  const before=await state(),emailsBefore=await count("email_log"),eventsBefore=await count("store_business_verification_events");
  assert.equal(before.reviewed_at,null);assert.equal(before.reviewed_by,null);
  const normal=await call(new Request(base));assert.equal(normal.status,200);
  assert.match(await normal.text(),/>Review again</);
  const open=await call(new Request(base+"?review_again=1"));assert.equal(open.status,200);
  const html=await open.text();
  assert.match(html,/name="review_again" value="1"/);assert.match(html,/Record new decision/);
  assert.match(html,/Cancel review/);assert.match(html,/Nothing changes until you record/);
  assert.deepEqual(await state(),before);assert.equal(await count("email_log"),emailsBefore);
  assert.equal(await count("store_business_verification_events"),eventsBefore);
  const form={review_again:"1",expected_revision:String(before.revision),decision:"approved",note:"Rechecked the current registration documents.",manual_review:"1"};
  assert.equal((await call(post(form,"https://evil.invalid"))).status,403);
  assert.equal((await call(post({...form,note:"short"}))).status,400);
  assert.equal((await call(post({...form,manual_review:""}))).status,400);
  assert.equal((await call(post({...form,review_again:"yes"}))).status,400);
  assert.equal((await call(post({...form,review_again:""}))).status,400);
  const {review_again,...oldForm}=form;
  assert.equal((await call(post(oldForm))).status,409,"Original decision route must still reject approved submissions");
  assert.equal(await count("email_log"),emailsBefore);
  await assert.rejects(db.account(tx=>tx`SELECT public.business_review_reconsider(${f.ownerToken},${store},${before.revision},'approved','Owner may not approve their own evidence.',true)`),e=>e.code==="42501");
  const confirmed=await call(post(form));assert.equal(confirmed.status,303);
  assert.equal(confirmed.headers.get("location"),`/admin/business-reviews/${store}?reviewed=1`);
  const approved=await state();assert.equal(approved.status,"approved");assert.equal(approved.revision,before.revision+1);
  assert.ok(approved.reviewed_by);assert.equal(approved.feedback,form.note);
  assert.equal(await count("email_log"),emailsBefore+1);
  assert.equal(await count("store_business_verification_events"),eventsBefore+1);
  assert.equal((await call(post(form))).status,409);
  const conflict=await call(post({...form,note:"Preserve this unsaved reviewer note."}));
  assert.equal(conflict.status,409);assert.match(await conflict.text(),/Preserve this unsaved reviewer note/);
  assert.equal(await count("email_log"),emailsBefore+1,"Retry must not create another email");
  const rejection=await call(post({...form,expected_revision:String(approved.revision),decision:"changes_requested",note:"Please upload the correct registration certificate."}));
  assert.equal(rejection.status,303);
  const rejected=await state();assert.equal(rejected.status,"changes_requested");
  assert.equal((await pg.query("SELECT status FROM public.stores WHERE store_id=$1",[store])).rows[0].status,storeBefore);
  assert.equal(await count("email_log"),emailsBefore+2);
  const latest=(await pg.query("SELECT submission FROM public.store_business_verification_events WHERE store_id=$1 AND submission->>'review_again'='true' ORDER BY created_at DESC",[store])).rows;
  assert.equal(latest.length,2);assert.equal(latest[0].submission.reviewed_submission.status,"approved");
  const history=await call(new Request(base));assert.match(await history.text(),/Reviewed again:/);
  assert.equal((await call(post({...form,expected_revision:String(rejected.revision)}))).status,409,"A reconsideration form cannot decide a changed submission");
  const grants=(await pg.query("SELECT has_function_privilege('anon','public.business_review_reconsider(text,uuid,integer,text,text,boolean)','EXECUTE') AS anon,has_function_privilege('authenticated','public.business_review_reconsider(text,uuid,integer,text,text,boolean)','EXECUTE') AS authenticated,has_function_privilege('service_role','public.business_review_reconsider(text,uuid,integer,text,text,boolean)','EXECUTE') AS service_role")).rows[0];
  assert.deepEqual(grants,{anon:false,authenticated:false,service_role:false});
 }finally{await pg.close();}
});
