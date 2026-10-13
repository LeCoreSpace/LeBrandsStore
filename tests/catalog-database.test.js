import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { saveEntityContent, saveCollection, deleteCollection } from "../src/store/catalog.js";

test("real SQL catalogue drafts preserve prefix, other entities, tenant isolation and publication snapshots", async () => {
  const pg = new PGlite();
  const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
  const p="33333333-3333-4333-8333-333333333333", q="44444444-4444-4444-8444-444444444444";
  const tx = Object.assign(async (parts,...values) => (await pg.query(parts.reduce((sql,part,i)=>sql+(i?`$${i}`:"")+part,""),values)).rows, { json: value=>JSON.stringify(value) });
  const asApp = async fn => {
    await pg.exec("BEGIN; SET LOCAL ROLE lebrands_app");
    try { await pg.query("SELECT set_config('app.store_id',$1,true)",[a]); const value=await fn(); await pg.exec("COMMIT"); return value; }
    catch(error){await pg.exec("ROLLBACK");throw error;}
  };
  try {
    await pg.exec(`CREATE ROLE lebrands_app NOLOGIN NOBYPASSRLS;
      CREATE TABLE stores(store_id uuid PRIMARY KEY);
      CREATE TABLE store_setup(store_id uuid PRIMARY KEY REFERENCES stores,settings jsonb DEFAULT '{}');
      CREATE TABLE products(id uuid PRIMARY KEY,store_id uuid REFERENCES stores,status text DEFAULT 'active');
      CREATE TABLE collections(id uuid PRIMARY KEY,store_id uuid REFERENCES stores,title text,slug text,description text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(store_id,id),UNIQUE(store_id,slug));
      CREATE TABLE collection_products(store_id uuid,collection_id uuid,product_id uuid REFERENCES products,sort_order integer,FOREIGN KEY(store_id,collection_id) REFERENCES collections(store_id,id));
      CREATE TABLE store_publications(store_id uuid PRIMARY KEY,snapshot jsonb);
      CREATE TABLE store_pages(store_id uuid,page_key text,draft_layout jsonb);
      CREATE FUNCTION aura_skeleton_available() RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT true$$;
      REVOKE ALL ON FUNCTION aura_skeleton_available() FROM PUBLIC;GRANT EXECUTE ON FUNCTION aura_skeleton_available() TO lebrands_app;
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      CREATE FUNCTION prefix_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.settings->>'invoice_prefix' IS DISTINCT FROM NEW.settings->>'invoice_prefix' THEN RAISE EXCEPTION 'Prefix locked' USING ERRCODE='42501'; END IF;
        RETURN NEW; END $$;
      CREATE TRIGGER prefix_guard BEFORE UPDATE ON store_setup FOR EACH ROW EXECUTE FUNCTION prefix_guard();`);
    for(const table of ["stores","store_setup","products","collections","collection_products","store_pages"]) await pg.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON ${table} FOR ALL TO lebrands_app USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid) WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
      GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO lebrands_app;`);
    await pg.query("INSERT INTO stores VALUES($1),($2)",[a,b]);
    await pg.query("INSERT INTO store_setup VALUES($1,$2::jsonb),($3,'{}')",[a,JSON.stringify({invoice_prefix:"KEEP",tagline:"Retained"}),b]);
    await pg.query("INSERT INTO products(id,store_id) VALUES($1,$2),($3,$4)",[p,a,q,b]);
    await pg.query("INSERT INTO store_publications VALUES($1,$2::jsonb)",[a,JSON.stringify({products:[{id:p,content:{materials_care:"Published care"}}],collections:[]})]);
    const before=(await pg.query("SELECT snapshot FROM store_publications")).rows;
    await asApp(()=>saveEntityContent(tx,a,"products",p,{materials_care:"Draft care"}));
    const c=await asApp(()=>saveCollection(tx,a,null,{title:"Cotton",slug:"cotton",product_ids:[p],faq:[{question:"Fabric?",answer:"Cotton"}]}));
    await asApp(()=>saveCollection(tx,a,c,{description:"Everyday cotton",product_ids:[]}));
    const settings=(await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[a])).rows[0].settings;
    assert.equal(settings.invoice_prefix,"KEEP");
    assert.equal(settings.tagline,"Retained");
    assert.equal(settings.aura_content.products[p].materials_care,"Draft care");
    assert.equal(settings.aura_content.collections[c].faq[0].answer,"Cotton");
    assert.deepEqual((await pg.query("SELECT snapshot FROM store_publications")).rows,before);
    await assert.rejects(asApp(()=>saveCollection(tx,a,c,{product_ids:[q]})),/belonging to this store/);
    await assert.rejects(asApp(()=>saveEntityContent(tx,b,"products",q,{materials_care:"Intrusion"})),error=>error.status===404);
    await assert.rejects(asApp(()=>pg.query("INSERT INTO collections(id,store_id,title,slug) VALUES($1,$2,'Cross','cross')",[crypto.randomUUID(),b])),error=>error.code==="42501");
    await pg.query("INSERT INTO store_pages VALUES($1,'home',$2::jsonb)",[a,JSON.stringify([{settings:{collection:c}}])]);
    await assert.rejects(asApp(()=>deleteCollection(tx,a,c)),error=>error.status===409);
    await pg.query("DELETE FROM store_pages WHERE store_id=$1",[a]);
    await asApp(()=>deleteCollection(tx,a,c));
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM collections")).rows[0].n,0);
    const final=(await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[a])).rows[0].settings;
    assert.equal(final.aura_content.products[p].materials_care,"Draft care");
    assert.equal(final.invoice_prefix,"KEEP");
  } finally { await pg.close(); }
});
