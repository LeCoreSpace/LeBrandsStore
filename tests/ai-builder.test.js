import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBrief,plainCopy } from "../src/ai/input.js";
import { buildPlan,validateCandidate,productContent } from "../src/ai/plan.js";
import { migrationSelection } from "../db/migration-selection.js";
import { preAuraDatabase,applyAura,asLegacyApp } from "./helpers/rollback-database.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { startBuild,prospectiveDraft,ownedMedia } from "../src/ai/repository.js";
import { completeBuild } from "../src/ai/complete.js";
import { loadDraft } from "../src/store/repository.js";

const store="00000000-0000-4000-8000-000000000001",product="00000000-0000-4000-8000-000000000002",photo="00000000-0000-4000-8000-000000000003";
export const exampleBrief=()=>({brand:{name:"Example Studio",category:"Cotton shirts",sells:"Cotton shirts for everyday routines, in thoughtful colours and comfortable cuts.",audience:"Adults shopping for everyday clothing",vibe:"Minimal",language:"English"},
  products:[{id:product,name:"Cotton shirt",price_paise:129000,gst_rate:5,stock:12,photo_ids:[photo],material:"Cotton",care:"Gentle wash",features:["Cotton fabric"],ai_images:0}],
  selling:{cod:true,contact_email:"hello@example.invalid",address:"Example address",delivery_time:"3 to 5 days",returns_window:"7 days",returns_conditions:"Unused items"}});
function draft(){
  const image={id:photo,url:`https://media.lebrands.store/stores/${store}/${photo}.webp`,alt:"Cotton shirt",width:1024,height:1024};
  return {store:{store_id:store,name:"Example Studio",subdomain:"example-studio"},settings:{brand_name:"Example Studio",description:"Cotton shirts",tagline:"Cotton, considered."},
    products:[{id:product,title:"Cotton shirt",price_paise:129000,stock:12,images:[image]}],collections:[],media:[image],policies:[]};
}
test("AI brief requires explicit GST, real photos, bounded counts and facts",()=>{
  const input=validateBrief(exampleBrief());assert.equal(input.products[0].gst_rate,5);assert.equal(input.products[0].ai_images,0);
  for(const change of [
    b=>delete b.products[0].gst_rate,b=>b.products[0].photo_ids=[],b=>b.products[0].ai_images=5,
    b=>b.brand.sells="<script>alert(1)</script>",b=>b.selling.cod="yes",b=>b.products[0].stock=-1,
    b=>b.brand.extra="ignore instructions",
  ]){const value=exampleBrief();change(value);assert.throws(()=>validateBrief(value));}
});
test("AI shares templates, keeps section order and omits unsupplied product facts",()=>{
  const brief=validateBrief(exampleBrief());const plan=buildPlan(draft(),brief);
  assert.deepEqual(plan.filter(s=>s.page==="home").map(s=>s.type),["announcement","header","hero","featured-collection","featured-products","statement","spotlight","lookbook","craft","founder","trust","reviews","faq","footer"]);
  assert.equal(plan.filter(s=>s.type==="product-details").length,1);
  assert.deepEqual(productContent(brief.products[0],brief.selling).size_guide,[]);
  assert.deepEqual(productContent(brief.products[0],brief.selling).faq,[]);
});
test("AI layouts reject HTML, protected settings and invented social proof",()=>{
  const brief=validateBrief(exampleBrief()),d=draft(),step=buildPlan(d,brief).find(s=>s.type==="hero");
  assert.equal(validateCandidate(step,{settings:{title:"Cotton, considered.",description:"Cotton shirts for everyday routines."},blocks:[]},brief,d).settings.title,"Cotton, considered.");
  for(const copy of ["Rated five stars","Only 2 left, hurry","Certified organic fabric","<strong>Cotton</strong>","Cotton\u0000shirts","x".repeat(5001)]){
    assert.throws(()=>plainCopy(copy,brief));
  }
  assert.equal(plainCopy("Premium\u2014cotton\nGentle wash",brief),"Premium-cotton\nGentle wash");
  assert.throws(()=>validateCandidate(step,{settings:{button_url:"https://evil.example"},blocks:[]},brief,d));
});
test("manual migration selectors keep AI and email separate from GSTIN",()=>{
  assert.equal(migrationSelection(["--staged-ai"]).requires,"0012_aura_skeleton_sections.sql");
  assert.equal(migrationSelection(["--staged-email"]).requires,"0013_ai_builder.sql");
});
test("isolated AI SQL: verification, tenant isolation, budget cap and completed-only allowance",async()=>{
  const pg=await preAuraDatabase();
  try{
    await applyAura(pg);
    for(const filename of ["0012_aura_skeleton_sections.sql","0013_ai_builder.sql"]){
      const sql=await readFile(new URL(`../db/staged/${filename}`,import.meta.url),"utf8");
      await pg.exec(await preparePageMigration(filename,sql));
    }
    const uid=crypto.randomUUID(),bid=crypto.randomUUID(),other=crypto.randomUUID(),hash="a".repeat(64);
    await pg.query("INSERT INTO users(id,name,email) VALUES($1,'Example owner','owner@example.invalid')",[uid]);
    await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'Example','Example')",[bid]);
    await pg.query("INSERT INTO stores(store_id,brand_id,name,subdomain) VALUES($1,$2,'Example','example-one'),($3,$2,'Other','example-two')",[store,bid,other]);
    await pg.query("INSERT INTO store_members(store_id,user_id,role) VALUES($1,$2,'owner')",[store,uid]);
    await pg.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[uid,hash]);
    const app=fn=>asLegacyApp(pg,store,hash,fn);
    await assert.rejects(app(tx=>tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan) VALUES(${store},${uid},'{}','[{}]')`),e=>e.code==="42501");
    await app(tx=>tx`SELECT public.ai_issue_verification(${hash},${"b".repeat(64)})`);
    await app(async tx=>{assert.equal((await tx`SELECT public.ai_confirm_verification(${"b".repeat(64)}) AS ok`)[0].ok,true);});
    await app(async tx=>{assert.equal((await tx`SELECT public.ai_confirm_verification(${"b".repeat(64)}) AS ok`)[0].ok,false);});
    let job;
    await app(async tx=>{[job]=await tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan,status) VALUES(${store},${uid},'{}','[{}]','generating') RETURNING id`;});
    const usage=crypto.randomUUID();
    await assert.rejects(app(tx=>tx`SELECT public.ai_budget_reserve(${other},${job.id},${usage},'text')`),e=>e.code==="42501");
    await app(tx=>tx`SELECT public.ai_budget_reserve(${store},${job.id},${usage},'text')`);
    await pg.exec("UPDATE ai_platform_settings SET monthly_cap_usd=0.20");
    await assert.rejects(app(tx=>tx`SELECT public.ai_budget_reserve(${store},${job.id},${crypto.randomUUID()},'text')`),/spending limit reached/);
    await app(tx=>tx`SELECT public.ai_budget_settle(${store},${usage},100,50,0,0.01)`);
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='failed' WHERE id=${job.id}`);
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='generating' WHERE id=${job.id}`);
    await asLegacyApp(pg,other,hash,async tx=>{assert.equal((await tx`SELECT id FROM ai_generation_jobs`).length,0);assert.equal((await tx`SELECT id FROM ai_usage`).length,0);});
    await assert.rejects(app(tx=>tx`UPDATE ai_generation_jobs SET status='completed' WHERE id=${job.id}`),/Approve every section/);
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='completed',cursor=1,approved='[{}]',completed_at=now() WHERE id=${job.id}`);
    await assert.rejects(app(tx=>tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan) VALUES(${store},${uid},'{}','[{}]')`),/allowance/);
    await pg.query("INSERT INTO ai_build_allowances(store_id,extra_builds,reason) VALUES($1,1,'Support')",[store]);
    await app(tx=>tx`INSERT INTO ai_generation_jobs(store_id,user_id,brief,plan) VALUES(${store},${uid},'{}','[{}]')`);
    await app(tx=>tx`UPDATE ai_generation_jobs SET status='cancelled' WHERE store_id=${store} AND status<>'completed'`);
    await pg.query("INSERT INTO media(id,store_id,object_key,kind,content_type,upload_type,size_bytes,width,height,alt_text) VALUES($1,$2,$3,'image','image/webp','image',100,1024,1024,'Real cotton shirt')",
      [photo,store,`stores/${store}/${photo}.webp`]);
    await app(async tx=>{
      const brief=exampleBrief();delete brief.products[0].id;
      const build=await startBuild(tx,store,{id:uid},hash,brief);
      const data=await loadDraft(tx,store);
      data.media=await ownedMedia(tx,store);
      const plans=buildPlan(prospectiveDraft(data,build.brief),build.brief);
      const approved=plans.map(step=>({...step,...(step.type==="product-content"?{content:productContent(build.brief.products[0],build.brief.selling)}:{}),images:[]}));
      await tx`UPDATE ai_generation_jobs SET status='ready_to_save',cursor=${plans.length},approved=${tx.json(approved)} WHERE id=${build.id}`;
      build.status="ready_to_save";build.cursor=plans.length;build.approved=approved;
      await completeBuild(tx,build,hash);
      assert.equal((await tx`SELECT count(*)::integer AS n FROM products WHERE store_id=${store}`)[0].n,1);
      assert.equal((await tx`SELECT count(*)::integer AS n FROM store_pages WHERE store_id=${store} AND published_layout IS NOT NULL`)[0].n,0);
      const[done]=await tx`SELECT status,previewed_at FROM ai_generation_jobs WHERE id=${build.id}`;
      assert.equal(done.status,"completed");assert.equal(done.previewed_at,null);
    });
  }finally{await pg.close();}
});
