// Disposable in-memory PostgreSQL only. No connection strings, network or Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { defaultPageLayouts } from "../src/public/aura-layout.js";

test("0010 compiles, backfills safely and enforces real PostgreSQL page isolation and publication",async()=>{
  const pg=new PGlite();
  const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",u="33333333-3333-4333-8333-333333333333",hash="a".repeat(64);
  const query=(sql,params=[])=>pg.query(sql,params);
  const scalar=async(sql,params=[])=> (await query(sql,params)).rows[0];
  try{
    await pg.exec(`CREATE ROLE lebrands_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE TABLE public.users(id uuid PRIMARY KEY,must_change_password boolean NOT NULL DEFAULT false);
      CREATE TABLE public.sessions(user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE public.store_members(store_id uuid,user_id uuid,role text);
      CREATE TABLE public.stores(store_id uuid PRIMARY KEY,name text,settings jsonb DEFAULT '{}',status text);
      CREATE TABLE public.store_setup(store_id uuid PRIMARY KEY,settings jsonb DEFAULT '{}');
      CREATE TABLE public.store_publications(store_id uuid PRIMARY KEY,snapshot jsonb);
      CREATE TABLE public.products(id uuid PRIMARY KEY,store_id uuid,title text DEFAULT 'Example product');
      CREATE TABLE public.collections(id uuid PRIMARY KEY,store_id uuid);
      CREATE TABLE public.media(id uuid DEFAULT gen_random_uuid(),store_id uuid,object_key text,width integer,height integer,alt_text text,upload_type text CHECK(upload_type IN('logo','image')));
      CREATE TABLE public.product_media(store_id uuid,product_id uuid,media_id uuid,sort_order integer DEFAULT 0);
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT,UPDATE,INSERT ON public.store_publications TO lebrands_app;
      GRANT SELECT,UPDATE ON public.store_setup TO lebrands_app;`);
    const old=await readFile(new URL("../db/migrations/0005_store_wizard.sql",import.meta.url),"utf8");
    const auth=old.match(/CREATE FUNCTION public\.authorize_store_session[\s\S]+?\n\$\$;/)[0];
    await pg.exec(auth);
    await query("INSERT INTO users(id)VALUES($1)",[u]);
    await query("INSERT INTO sessions VALUES($1,$2,NULL,now()+interval '1 day')",[u,hash]);
    for(const id of [a,b]){
      await query("INSERT INTO stores(store_id,name,status)VALUES($1,'Actual merchant','live')",[id]);
      await query("INSERT INTO store_setup VALUES($1,$2)",[id,JSON.stringify({brand_name:"Actual merchant",tagline:"Unpublished draft"})]);
      await query("INSERT INTO store_publications VALUES($1,$2)",[id,JSON.stringify({settings:{brand_name:"Actual merchant",tagline:"Published title",description:"Actual copy"},products:[]})]);
    }
    await query("INSERT INTO store_members VALUES($1,$2,'owner')",[a,u]);
    const source=await readFile(new URL("../db/migrations/0010_store_pages.sql",import.meta.url),"utf8");
    await pg.exec(await preparePageMigration("0010_store_pages.sql",source));
    assert.equal((await scalar("SELECT status FROM stores WHERE store_id=$1",[a])).status,"live");
    const initial=await scalar("SELECT * FROM store_pages WHERE store_id=$1 AND page_key='home'",[a]);
    assert.equal(initial.draft_layout.find(x=>x.type==="hero").settings.title,"Unpublished draft");
    assert.equal(initial.published_layout.find(x=>x.type==="hero").settings.title,"Published title");
    assert.equal((await scalar("SELECT count(*)::int AS n FROM store_pages WHERE store_id=$1",[a])).n,16);
    const asApp=async(fn)=>{
      await pg.exec("BEGIN;SET LOCAL ROLE lebrands_app;");
      try{await query("SELECT set_config('app.store_id',$1,true)",[a]);const result=await fn();await pg.exec("COMMIT");return result;}
      catch(error){await pg.exec("ROLLBACK");throw error;}
    };
    const denied=async(fn,code)=>assert.rejects(asApp(fn),error=>error.code===code);
    assert.equal((await asApp(()=>scalar("SELECT count(*)::int AS n FROM store_pages WHERE store_id=$1",[b]))).n,0);
    assert.equal((await asApp(()=>scalar("SELECT count(*)::int AS n FROM store_page_versions WHERE store_id=$1",[b]))).n,0);
    await denied(()=>query("UPDATE store_pages SET published_layout=draft_layout WHERE store_id=$1",[a]),"42501");
    await denied(()=>query("DELETE FROM store_page_versions WHERE store_id=$1",[a]),"42501");
    await denied(()=>query("SELECT public.aura_section_schemas()"),"42501");
    const draft=structuredClone(initial.draft_layout);
    draft.find(x=>x.type==="hero").settings.title="New private draft";
    await denied(()=>query("SELECT * FROM save_store_page($1,'home',$2::jsonb,0,$3)",[b,JSON.stringify(draft),hash]),"42501");
    const saved=await asApp(()=>scalar("SELECT * FROM save_store_page($1,'home',$2::jsonb,0,$3)",[a,JSON.stringify(draft),hash]));
    assert.equal(saved.version,1);assert.equal(saved.updated_by,u);
    await denied(()=>query("SELECT * FROM save_store_page($1,'home',$2::jsonb,0,$3)",[a,JSON.stringify(draft),hash]),"40001");
    const bad=structuredClone(draft);bad[1].type="unknown";
    await denied(()=>query("SELECT * FROM save_store_page($1,'home',$2::jsonb,1,$3)",[a,JSON.stringify(bad),hash]),"22023");
    const unsafe=structuredClone(draft);unsafe.find(x=>x.type==="hero").settings.description='<p onclick="x">bad</p>';
    await denied(()=>query("SELECT * FROM save_store_page($1,'home',$2::jsonb,1,$3)",[a,JSON.stringify(unsafe),hash]),"22023");
    await asApp(()=>query("UPDATE store_publications SET snapshot=snapshot||'{\"products\":[]}'::jsonb WHERE store_id=$1",[a]));
    assert.equal((await scalar("SELECT published_layout FROM store_pages WHERE store_id=$1 AND page_key='home'",[a])).published_layout.find(x=>x.type==="hero").settings.title,"Published title","Catalog sync must not publish page drafts.");
    const publish=()=>asApp(async()=>{await query("SELECT set_config('app.publish_pages','true',true)");await query("UPDATE store_publications SET snapshot=snapshot WHERE store_id=$1",[a]);});
    await publish();
    const live=await scalar("SELECT * FROM store_pages WHERE store_id=$1 AND page_key='home'",[a]);
    assert.equal(live.published_layout.find(x=>x.type==="hero").settings.title,"New private draft");
    await asApp(()=>query("SELECT * FROM restore_store_page($1,'home',0,$2,$3)",[a,live.version,hash]));
    assert.equal((await scalar("SELECT published_layout FROM store_pages WHERE store_id=$1 AND page_key='home'",[a])).published_layout.find(x=>x.type==="hero").settings.title,"New private draft","Restore edits draft only.");
    for(let i=0;i<22;i++){
      const row=await scalar("SELECT * FROM store_pages WHERE store_id=$1 AND page_key='home'",[a]);
      const next=structuredClone(row.draft_layout);next.find(x=>x.type==="hero").settings.title=`Revision ${i}`;
      await asApp(()=>query("SELECT * FROM save_store_page($1,'home',$2::jsonb,$3,$4)",[a,JSON.stringify(next),row.version,hash]));
      await publish();
    }
    assert.equal((await scalar("SELECT count(*)::int AS n FROM store_page_versions WHERE store_id=$1 AND page_key='home'",[a])).n,20);
    const before=await scalar("SELECT published_layout FROM store_pages WHERE store_id=$1 AND page_key='home'",[a]);
    await query("UPDATE store_setup SET settings=settings||'{\"tagline\":\"Wizard change\",\"invoice_prefix\":\"KEEP\"}' WHERE store_id=$1",[a]);
    const after=await scalar("SELECT * FROM store_pages WHERE store_id=$1 AND page_key='home'",[a]);
    assert.equal(after.draft_layout.find(x=>x.type==="hero").settings.title,"Wizard change");
    assert.deepEqual(after.published_layout,before.published_layout);
    const flags=await query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('store_pages','store_page_versions')");
    assert.ok(flags.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
  }finally{await pg.close();}
});
