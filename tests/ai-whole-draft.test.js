import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preAuraDatabase,applyAura,asLegacyApp } from "./helpers/rollback-database.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { buildPlan,productContent } from "../src/ai/plan.js";
import { getJob,startBuild,prospectiveDraft,ownedMedia } from "../src/ai/repository.js";
import { advanceWholeDraft,resumeWholeDraft,isWholeDraft,imageSources } from "../src/ai/draft-flow.js";
import { completeBuild } from "../src/ai/complete.js";
import { loadDraft } from "../src/store/repository.js";
import {storePrompt,validateStoreCopy} from "../src/ai/batch.js";
import {fillDeferredImages} from "../src/ai/draft-flow.js";

test("whole-store generation resumes legacy jobs, prepares every page and saves atomically without publishing",async t=>{
  const pg=await preAuraDatabase(),store=crypto.randomUUID(),other=crypto.randomUUID(),user=crypto.randomUUID(),
    brand=crypto.randomUUID(),photo=crypto.randomUUID(),hash="c".repeat(64);
  try{
    await applyAura(pg);
    for(const name of ["0012_aura_skeleton_sections.sql","0013_ai_builder.sql"]){
      await pg.exec(await preparePageMigration(name,await readFile(new URL(`../db/staged/${name}`,import.meta.url),"utf8")));
    }
    await pg.query("INSERT INTO users(id,name,email,email_verified_at) VALUES($1,'Test owner','owner@example.invalid',now())",[user]);
    await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'Cotton Studio','Cotton Studio')",[brand]);
    await pg.query("INSERT INTO stores(store_id,brand_id,name,subdomain) VALUES($1,$2,'Cotton Studio','whole-draft'),($3,$2,'Other','other-draft')",[store,brand,other]);
    await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[store,user]);
    await pg.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[user,hash]);
    const app=fn=>asLegacyApp(pg,store,hash,fn);
    await app(tx=>tx`INSERT INTO media(id,store_id,object_key,kind,content_type,upload_type,size_bytes,width,height)
      VALUES(${photo},${store},${`stores/${store}/${photo}.webp`},'image','image/webp','image',100,1024,1024)`);
    const brief={brand:{name:"Cotton Studio",category:"Cotton shirts",sells:"Cotton shirts for everyday routines, in thoughtful colours and comfortable cuts.",
      audience:"Adults",vibe:"Minimal",language:"English"},
      products:[{name:"Cotton shirt",description:"Everyday cotton.",price_paise:129000,gst_rate:5,stock:12,
        photo_ids:[photo],material:"Cotton",care:"Gentle wash",features:["Cotton fabric"],ai_images:0}],
      selling:{cod:true,contact_email:"hello@example.invalid",address:"Example address",delivery_time:"3 to 5 days",
        returns_window:"7 days",returns_conditions:"Unused items",first_order_offer:"Ten percent off"}};
    let job=await app(tx=>startBuild(tx,store,{id:user},hash,brief));
    assert.ok(isWholeDraft(job));
    // Simulate an existing legacy plan: adoption must not change immutable inputs.
    const legacyPlan=structuredClone(job.plan);delete legacyPlan[0].workflow;
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='cancelled' WHERE id=${job.id}`);
    const source=await app(async tx=>{
      const [row]=await tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan,base_versions,base_updated_at)
        VALUES(${store},${user},${tx.json(job.brief)},${tx.json(legacyPlan)},${tx.json(job.base_versions)},
          ${job.base_updated_at}) RETURNING *,base_updated_at::text AS base_updated_at`;
      return row;
    });
    job=await app(tx=>resumeWholeDraft(tx,source));
    assert.equal(job.status,"queued");assert.ok(isWholeDraft(job));
    assert.deepEqual(job.plan,legacyPlan);
    await assert.rejects(asLegacyApp(pg,other,hash,tx=>getJob(tx,other,job.id,null)),/Build not found/);
    const generated=crypto.randomUUID(),key=`stores/${store}/${generated}.webp`;
    await app(tx=>tx`INSERT INTO media(id,store_id,object_key,kind,content_type,upload_type,size_bytes,width,height,
      ai_generated,source_media_id,approval_status)
      VALUES(${generated},${store},${key},'image','image/webp','image',100,1024,1024,true,${photo},'pending')`);
    for(let cursor=0;cursor<job.plan.length;cursor++){
      job=await app(async tx=>{
        const current=await getJob(tx,store,job.id,null),step=current.plan[current.cursor];
        const section=step.section&&structuredClone(step.section);
        if(section?.type==="reviews")section.settings.enabled=false;
        const candidate=step.type==="product-content"?{content:productContent(current.brief.products[0],current.brief.selling)}:
          step.type==="page-content"?{body:step.page==="about"?"Cotton Studio":""}:{section};
        if(step.page==="faq")candidate.section={...structuredClone(current.approved.find(a=>a.type==="faq").section),id:"ai-faq-page"};
        candidate.images=step.type==="hero"?[{id:crypto.randomUUID(),media_id:generated,key,width:1024,height:1024,
          label:"Cotton shirt",status:"pending",source_key:`stores/${store}/${photo}.webp`,sources:[]}]:[];
        const saved={...current,candidate:{...current.candidate,...candidate}};
        return advanceWholeDraft(tx,saved);
      });
      assert.equal(job.cursor,cursor+1);assert.equal(job.status,cursor+1===job.plan.length?"ready_to_save":"queued");
      assert.ok(isWholeDraft(job));
    }
    assert.equal((await pg.query("SELECT approval_status FROM media WHERE id=$1",[generated])).rows[0].approval_status,"pending");
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM store_pages WHERE store_id=$1 AND published_layout IS NOT NULL",[store])).rows[0].n,0);
    const completed=await app(tx=>completeBuild(tx,job,hash));
    assert.equal(completed.status,"completed");
    const draft=await app(tx=>loadDraft(tx,store));
    assert.equal(draft.layouts.home.length,job.plan.filter(s=>s.page==="home").length);
    for(const page of ["home","collection","product","cart","checkout","about","contact","faq"])assert.ok(draft.layouts[page]?.length,page);
    assert.equal(draft.layouts.home.find(s=>s.type==="hero").settings.image.url,`https://media.lebrands.store/${key}`);
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM store_pages WHERE store_id=$1 AND published_layout IS NOT NULL",[store])).rows[0].n,0);
    assert.equal((await pg.query("SELECT approval_status FROM media WHERE id=$1",[generated])).rows[0].approval_status,"approved");
    assert.equal((await pg.query("SELECT status,previewed_at FROM ai_generation_jobs WHERE id=$1",[job.id])).rows[0].previewed_at,null);
    await assert.rejects(app(tx=>completeBuild(tx,completed,hash)),/Wait for the complete/);

    // Real queue handler, isolated database and mocked provider; no network or live data.
    await pg.query("INSERT INTO ai_build_allowances(store_id,extra_builds) VALUES($1,1) ON CONFLICT(store_id) DO UPDATE SET extra_builds=1",[store]);
    let failures=true,textCalls=0;
    t.mock.module("../src/db.js",{namedExports:{createDb:()=>({withStore:(id,fn)=>asLegacyApp(pg,id,null,fn),close:async()=>{}})}});
    t.mock.module("../src/ai/provider.js",{namedExports:{
      providerReady:()=>true,
      generateText:async(_env,prompt)=>{textCalls++;if(failures)throw Object.assign(new Error("Provider temporarily unavailable"),{status:503});
        const schemaValue=schema=>schema.type==="object"?Object.fromEntries(Object.entries(schema.properties).map(([key,field])=>[key,schemaValue(field)])):
          schema.type==="array"?Array.from({length:schema.minItems||0},()=>schemaValue(schema.items)):"Cotton, considered.";
        return{raw:JSON.stringify(schemaValue(prompt.responseSchema)),input_tokens:12,output_tokens:8,cost_usd:0.001};},
      verifyFacts:async()=>({raw:'{"supported":true}',input_tokens:10,output_tokens:5,cost_usd:0.001}),
      generateImage:async()=>{throw new Error("Unexpected image generation");},
    }});
    const {processAiMessage}=await import("../src/ai/worker.js");
    const [queued]=await app(async tx=>{
      const data={...await loadDraft(tx,store),media:await ownedMedia(tx,store)};
      const step=buildPlan(prospectiveDraft(data,job.brief),job.brief).find(s=>s.type==="statement");
      step.workflow="whole-store";
      return tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan,status)
        VALUES(${store},${user},${tx.json(job.brief)},${tx.json([step])},'queued') RETURNING id`;
    });
    const messages=[],env={AI_BUILD_QUEUE:{send:async message=>messages.push(message)}},body={store_id:store,job_id:queued.id};
    for(let attempt=0;attempt<3;attempt++)await processAiMessage(body,env);
    let failed=await app(tx=>getJob(tx,store,queued.id,null));
    assert.equal(failed.status,"failed");assert.equal(failed.candidate._retry_count,2);
    assert.equal(messages.length,2);assert.equal(textCalls,3);
    failed=await app(tx=>resumeWholeDraft(tx,failed));
    failures=false;await processAiMessage(body,env);
    let prepared=await app(tx=>getJob(tx,store,queued.id,null));
    if(prepared.status==="queued"){
      await processAiMessage(body,env);await processAiMessage(body,env);
      prepared=await app(tx=>getJob(tx,store,queued.id,null));
      assert.fail(prepared.error||"Unexpected batch retry");
    }
    assert.equal(prepared.status,"ready_to_save");assert.equal(prepared.cursor,1);
    assert.equal(prepared.approved[0].section.settings.text,"Cotton, considered.");
    await processAiMessage(body,env);assert.equal(textCalls,4,"Duplicate delivery does not regenerate");
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='cancelled' WHERE id=${queued.id}`);
    const {handleAiRoutes}=await import("../src/ai/routes.js");
    const db={withMemberStore:(id,token,fn)=>asLegacyApp(pg,id,token,fn)};
    const response=await handleAiRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ai/start`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({brief}),
    }),env,db,{id:user},hash);
    assert.equal(response.status,200);
    const started=await response.json();
    assert.equal(started.job.status,"queued");assert.equal(started.job.workflow,"whole-store");
    assert.equal(messages.at(-1).job_id,started.job.id);
    const beforeCalls=textCalls,beforeMessages=messages.length;
    await processAiMessage(messages.at(-1),env);
    let entire=await app(tx=>getJob(tx,store,started.job.id,null));
    if(entire.status==="queued"){
      await processAiMessage(messages.at(-1),env);await processAiMessage(messages.at(-1),env);
      entire=await app(tx=>getJob(tx,store,started.job.id,null));
      assert.fail(entire.error||"Unexpected full-store retry");
    }
    assert.equal(entire.status,"ready_to_save");
    assert.equal(entire.approved.length,entire.plan.length);
    assert.ok(entire.plan.length>=50);
    assert.equal(textCalls-beforeCalls,1,"All store content uses one generation request, not one per section");
    assert.equal(messages.length,beforeMessages,"No per-section queue fan-out when images are not requested");
    const publicState=await (await handleAiRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ai/state`),env,db,{id:user},hash)).json();
    assert.ok(publicState.job.progress.preview_ready);
    for(const page of ["home","collection","product","cart","checkout"]){
      const response=await handleAiRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ai/draft?job_id=${entire.id}&page=${page}`),env,db,{id:user},hash);
      assert.equal(response.status,200,page);
      const html=await response.text();
      assert.ok(html.includes("Cotton Studio"),page);
      assert.ok(!/<script\b/i.test(html),page);
      assert.equal(response.headers.get("cache-control"),"private, no-store");
    }
    const badPage=await handleAiRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ai/draft?job_id=${entire.id}&page=admin`),env,db,{id:user},hash);
    assert.equal(badPage.status,400);
    const currentDraft={...await app(tx=>loadDraft(tx,store)),media:await app(tx=>ownedMedia(tx,store))};
    const batchPrompt=storePrompt({...entire,cursor:0,approved:[],candidate:null});
    assert.ok(batchPrompt.responseSchema.required.length>10);
    assert.equal(batchPrompt.schemaName,"aura_complete_store");
    assert.throws(()=>validateStoreCopy({...entire,cursor:0,approved:[],candidate:null},{unexpected:"unsafe"},currentDraft,batchPrompt),/incomplete/);
    const savedEntire=await app(tx=>completeBuild(tx,entire,hash));
    assert.equal(savedEntire.status,"completed");
    const noPhotoJob={...entire,cursor:0,approved:[],candidate:null,brief:structuredClone(entire.brief)};
    noPhotoJob.brief.products[0].photo_ids=[];noPhotoJob.brief.products[0].ai_images=1;
    noPhotoJob.brief.products[0].material="Cotton";noPhotoJob.brief.products[0].care="Wash cold.";
    const noPhotoPrompt=storePrompt(noPhotoJob);
    const noPhotoResult=await (await import("../src/ai/provider.js")).generateText(env,noPhotoPrompt);
    const noPhotoPrepared=validateStoreCopy(noPhotoJob,JSON.parse(noPhotoResult.raw),currentDraft,noPhotoPrompt);
    const deferred=noPhotoPrepared.filter(item=>item.deferred_images);
    assert.ok(deferred.length,"Copy can finish before requested product images exist");
    assert.ok(deferred.every(item=>item.section.settings.enabled===false));
    fillDeferredImages(noPhotoPrepared,currentDraft.products);
    assert.ok(deferred.every(item=>item.section.settings.enabled===true),"Approved product photos fill native image sections at save time");
    assert.equal((await pg.query("SELECT count(*)::integer AS n FROM store_pages WHERE store_id=$1 AND published_layout IS NOT NULL",[store])).rows[0].n,0);
    assert.deepEqual(imageSources({width:1024,height:1024,sources:[{url:"test",width:480}]}),
      [{url:"test",width:480,height:480}]);
  }finally{await pg.close();}
});
