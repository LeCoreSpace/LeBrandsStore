import test from "node:test";
import assert from "node:assert/strict";
import {setupBusinessReviewFixture} from "../src/business-review-preview-fixture.js";
import {handleBusinessReview} from "../src/admin/business-review-routes.js";
import {handleBusinessDocumentRoutes} from "../src/store/business-document-routes.js";
import {requireBusinessPublication} from "../src/store/business-publication-access.js";
import {businessEditorAccess} from "../src/store/business-access.js";
import {publish,loadDraft} from "../src/store/repository.js";
import {publishChecklist} from "../src/public/validation.js";
import {migrationSelection} from "../db/migration-selection.js";

const origin="https://app.lebrands.store",root=`${origin}/admin/business-reviews`;
const formRequest=(url,fields,source=origin)=>new Request(url,{method:"POST",headers:{origin:source},body:new URLSearchParams(fields)});

test("restricted manual review, private history and DB publication guards use real staged DDL",async()=>{
  const f=await setupBusinessReviewFixture();
  const {pg,db,store,token,user,env,owner,ownerToken}=f;
  const url=`${root}/${store}`,merchant=`${origin}/api/stores/${store}/business-verification`;
  const call=(request,actor=user,hash=token)=>handleBusinessReview(request,env,db,actor,hash);
  const decide=(revision,decision="approved",extra={})=>formRequest(url,{expected_revision:String(revision),decision,note:"Examined registration evidence manually.",manual_review:"1",...extra});
  try {
    assert.deepEqual(migrationSelection(["--staged-business-document-review"]),{staged:true,filename:"0035_business_document_review.sql",requires:"0034_business_document_scanning.sql"});
    assert.equal((await call(new Request(root),null,null)).status,401);
    assert.equal((await call(new Request(root),owner,ownerToken)).status,403);
    assert.equal((await call(new Request(root),user,ownerToken)).status,403,"forged user metadata is not reviewer authorization");
    assert.equal((await call(formRequest(url,{expected_revision:"1",decision:"approved",note:"Examined evidence.",manual_review:"1"},"https://evil.example"))).status,403);
    const queue=await call(new Request(root));
    assert.equal(queue.status,200);assert.equal(queue.headers.get("cache-control"),"no-store");
    assert.match(await queue.text(),/Example Studio/);
    assert.equal((await call(new Request(`${root}?page=-1`))).status,400);
    const detail=await call(new Request(url));
    assert.equal(detail.status,200);
    const html=await detail.text();
    assert.match(html,/synthetic-registration\.pdf/);assert.match(html,/name="expected_revision" value="1"/);
    assert.doesNotMatch(html,/business-verifications\/|object_key|sha256|<embed/);
    assert.match(html,/<iframe[^>]+title="Preview of synthetic-registration\.pdf"/);
    assert.match(html,/\?view=inline/);
    assert.equal((await call(decide(1,"approved",{manual_review:""}))).status,400);
    assert.equal((await call(decide(1,"approved",{note:"tiny"}))).status,400);

    await pg.query("INSERT INTO public.platform_business_reviewers(user_id) VALUES($1)",[owner.id]);
    assert.equal((await call(new Request(url),owner,ownerToken)).status,403,"even a platform reviewer cannot review an affiliated store");
    assert.equal((await call(decide(1),owner,ownerToken)).status,403);
    const ownQueue=await (await call(new Request(root),owner,ownerToken)).text();
    assert.doesNotMatch(ownQueue,/href="\/admin\/business-reviews\/aaaaaaaa/);
    await pg.query("DELETE FROM public.platform_business_reviewers WHERE user_id=$1",[owner.id]);

    await assert.rejects(db.account(tx=>tx`UPDATE public.store_business_verifications SET status='approved' WHERE store_id=${store}`),e=>e.code==="42501");
    await assert.rejects(db.account(tx=>tx`INSERT INTO public.platform_business_reviewers(user_id) VALUES(${owner.id})`),e=>e.code==="42501");
    await assert.rejects(db.withMemberStore(store,ownerToken,tx=>tx`UPDATE public.stores SET approved_at=now(),approved_by='forged brand approval' WHERE store_id=${store}`),e=>e.code==="42501");
    await assert.rejects(db.withMemberStore(store,ownerToken,tx=>requireBusinessPublication(tx,store)),e=>e.status===403);
    await assert.rejects(db.withMemberStore(store,ownerToken,tx=>publish(tx,store,true)),e=>e.status===403);
    assert.equal((await db.withMemberStore(store,ownerToken,tx=>businessEditorAccess(tx,store,ownerToken))).allowed,true,"pending review does not lock draft building");
    const pendingDraft=await db.withMemberStore(store,ownerToken,tx=>loadDraft(tx,store));
    assert.equal(publishChecklist(pendingDraft).find(c=>c.label==="Business documents approved").complete,false);
    await assert.rejects(pg.query("INSERT INTO public.store_publications(store_id,snapshot) VALUES($1,'{}')",[store]),e=>e.code==="42501"&&/Business documents/.test(e.message));
    await assert.rejects(pg.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]),e=>e.code==="42501");
    const original=f.initial.verification.documents[0];
    const download=await call(new Request(`${url}/documents/${original.id}`));
    assert.equal(download.status,200);
    assert.equal(download.headers.get("content-type"),"application/octet-stream");
    assert.equal(download.headers.get("cache-control"),"no-store");
    assert.match(download.headers.get("content-disposition"),/^attachment/);
    assert.match(await download.text(),/Synthetic registration test/);
    const inline=await call(new Request(`${url}/documents/${original.id}?view=inline`));
    assert.equal(inline.status,200);
    assert.equal(inline.headers.get("content-type"),"application/pdf");
    assert.equal(inline.headers.get("x-frame-options"),"SAMEORIGIN");
    assert.match(inline.headers.get("content-disposition"),/^inline/);
    assert.match(inline.headers.get("content-security-policy"),/frame-ancestors 'self'/);
    assert.equal((await call(new Request(`${url}/documents/ffffffff-ffff-4fff-8fff-ffffffffffff`))).status,404);

    assert.equal((await call(decide(1,"changes_requested",{note:"Please provide a more legible certificate."}))).status,303);
    const stale=await call(decide(1,"approved",{note:"Preserve this note <safely>."}));
    assert.equal(stale.status,409);assert.match(await stale.text(),/Preserve this note &lt;safely&gt;/);
    let v=(await pg.query("SELECT * FROM public.store_business_verifications WHERE store_id=$1",[store])).rows[0];
    assert.equal(v.status,"changes_requested");assert.equal(v.reviewed_by,user.id);assert.equal(v.revision,2);
    await pg.query("UPDATE public.stores SET status='paused' WHERE store_id=$1",[store]);
    const body=new FormData();
    body.set("details",JSON.stringify({expected_revision:2,country_code:"IN",legal_name:v.legal_name,
      registration_type:v.registration_type,registration_number:v.registration_number,document_type:"gst_certificate",explanation:""}));
    body.set("file",new Blob(["%PDF-1.4\nSynthetic corrected registration document.\n%%EOF\n"],{type:"application/pdf"}),"corrected.pdf");
    const replaced=await handleBusinessDocumentRoutes(new Request(merchant,{method:"POST",headers:{origin},body}),env,db,owner,ownerToken);
    assert.equal(replaced.status,201,await replaced.clone().text());
    v=(await pg.query("SELECT * FROM public.store_business_verifications WHERE store_id=$1",[store])).rows[0];
    assert.equal(v.status,"pending_review");assert.equal(v.reviewed_by,null);assert.equal(v.reviewed_at,null);
    assert.equal(f.files.size,2,"replacements preserve prior evidence");
    assert.equal((await call(new Request(`${url}/documents/${original.id}`))).status,200,"staff can inspect previous evidence");
    assert.equal((await handleBusinessDocumentRoutes(new Request(`${merchant}/documents/${original.id}`),env,db,owner,ownerToken)).status,404);
    assert.equal((await call(decide(3))).status,303);
    assert.equal((await call(decide(3))).status,409,"duplicate/stale decisions never append a second decision");
    v=(await pg.query("SELECT * FROM public.store_business_verifications WHERE store_id=$1",[store])).rows[0];
    assert.equal(v.status,"approved");assert.equal(v.revision,4);
    assert.equal((await pg.query("SELECT status FROM public.stores WHERE store_id=$1",[store])).rows[0].status,"paused","approval does not publish or resume a store");
    assert.equal((await db.withMemberStore(store,ownerToken,tx=>requireBusinessPublication(tx,store))).enforced,true);
    await pg.query("UPDATE public.store_setup SET settings=settings||$2::jsonb WHERE store_id=$1",[store,JSON.stringify({
      subdomain:"ann-test-store",support_email:"support@example.invalid",support_phone:"+919876543210",
      tagline:"A synthetic test storefront",description:"A synthetic storefront used for isolated publication checks.",
      address:"1 Example Road, Chennai, Tamil Nadu 600001",
    })]);
    const logo="ffffffff-ffff-4fff-8fff-ffffffffffff";
    await pg.query("INSERT INTO public.media(id,store_id,object_key,kind,content_type,size_bytes,upload_type) VALUES($1,$2,$3,'image','image/webp',32,'logo')",[logo,store,`stores/${store}/${logo}.webp`]);
    await pg.query("UPDATE public.store_setup SET logo_media_id=$2 WHERE store_id=$1",[store,logo]);
    await pg.query("UPDATE public.products SET hsn_code='6204' WHERE store_id=$1",[store]);
    await db.withMemberStore(store,ownerToken,tx=>tx`INSERT INTO public.product_media(store_id,product_id,media_id) VALUES(${store},${"dddddddd-dddd-4ddd-8ddd-dddddddddddd"},${"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"})`);
    await pg.query("UPDATE public.policy_pages SET reviewed_at=now() WHERE store_id=$1",[store]);
    const approvedDraft=await db.withMemberStore(store,ownerToken,tx=>loadDraft(tx,store));
    const missing=publishChecklist(approvedDraft).filter(c=>!c.complete);
    assert.deepEqual(missing,[],"synthetic publication prerequisites are complete");
    const published=await db.withMemberStore(store,ownerToken,tx=>publish(tx,store,true));
    assert.equal(published.store.status,"live","approved business can publish without the obsolete first-live approval flag");
    const snapshot=(await pg.query("SELECT snapshot FROM public.store_publications WHERE store_id=$1",[store])).rows[0].snapshot;
    assert.equal(snapshot.business_review,undefined,"private approval state is not copied into storefront snapshots");
    const events=(await pg.query("SELECT event_type,actor_user_id FROM public.store_business_verification_events ORDER BY id")).rows;
    assert.deepEqual(events.map(e=>e.event_type),["submitted","changes_requested","resubmitted","approved"]);
    assert.equal(events.at(-1).actor_user_id,user.id);
    await assert.rejects(pg.query("DELETE FROM public.store_business_verification_events WHERE store_id=$1",[store]),e=>e.code==="42501");
    await assert.rejects(pg.query("UPDATE public.store_business_verification_events SET submission='{}' WHERE store_id=$1",[store]),e=>e.code==="42501");
    // Document approval replaces the obsolete first-live flag, but never grants
    // tax verification or clears a separately recorded suspension.
    await pg.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]);
    await pg.query("UPDATE public.stores SET status='draft',approved_at=now(),approved_by='synthetic legacy reviewer',approval_revoked_at=now(),approval_revocation_note='Synthetic separate suspension' WHERE store_id=$1",[store]);
    await assert.rejects(pg.query("UPDATE public.stores SET status='live' WHERE store_id=$1",[store]),e=>e.code==="42501");
    await pg.query("UPDATE public.platform_business_reviewers SET active=false WHERE user_id=$1",[user.id]);
    assert.equal((await call(new Request(root))).status,403);
    assert.equal((await call(new Request(`${url}/documents/${original.id}`))).status,403);
  } finally {await pg.close();}
});
