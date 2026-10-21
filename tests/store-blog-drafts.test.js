import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {blogInput,safeBlogHref} from "../src/blog/input.js";
import {isBlogDashboard,handleBlogDashboard} from "../src/blog/routes.js";
import {renderStoreBlog,renderStoreBlogPreview} from "../src/ui/store-blog.js";
import {migrationSelection} from "../db/migration-selection.js";
import {saveBlogArticle,deleteBlogArticle,blogDashboard} from "../src/blog/repository.js";

test("FAQ authoring offers a direct shortcut, example format and existing section contract",async()=>{
  const source=await readFile(new URL("../src/public/store-blog.js",import.meta.url),"utf8");
  assert.match(source,/data-add-faq/);
  assert.match(source,/Add FAQ section/);
  assert.match(source,/type === "faq" \? "Frequently asked questions"/);
  assert.match(source,/How do I use this product/);
  const faq={id:"99999999-9999-4999-8999-999999999999",type:"faq",heading:"Frequently asked questions",body:"Can I use it daily?\nFollow the product guidance.\n\nHow do I store it?\nKeep it cool and dry."};
  const parsed=blogInput({title:"Product guide",slug:"product-guide",sections:[faq]});
  assert.equal(parsed.sections[0].body,faq.body);
  const html=renderStoreBlogPreview({store:{store_id:"11111111-1111-4111-8111-111111111111",name:"Example"},article:{...parsed},media:[],products:[]});
  assert.match(html,/<dt>Can I use it daily\?<\/dt>/);
  assert.match(html,/<dd>Keep it cool and dry\.<\/dd>/);
});

const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
const user="33333333-3333-4333-8333-333333333333", article="44444444-4444-4444-8444-444444444444";
const token="a".repeat(64);
const example={title:"How to use our serum",slug:"serum-guide",summary:"A simple guide.",author:"Team",category:"Skincare",
  hero_media_id:null,hero_alt:"",sections:[{id:article,type:"text",heading:"Routine",body:"Start here."}]};

test("article input is plain, bounded and restricted to owned reference identifiers",()=>{
  assert.equal(blogInput(example).sections[0].body,"Start here.");
  assert.equal(blogInput({...example,slug:""}).slug,"how-to-use-our-serum");
  for(const bad of [
    {...example,title:""}, {...example,slug:"/account"}, {...example,hero_media_id:"https://example.com/image"},
    {...example,sections:Array(41).fill(example.sections[0])},
    {...example,sections:[{...example.sections[0],body:"x".repeat(12001)}]},
    {...example,sections:[{...example.sections[0],type:"cta",href:"javascript:alert(1)"}]},
    {...example,sections:[{...example.sections[0],type:"cta",href:"/account"}]},
    {...example,sections:[{...example.sections[0],type:"product",product_id:"not-a-uuid"}]}
  ]) assert.throws(()=>blogInput(bad));
  assert.equal(safeBlogHref("https://example.com/offer"),"https://example.com/offer");
  assert.equal(safeBlogHref("/products/serum"),"/products/serum");
  for(const unsafe of ["javascript:alert(1)","//evil.example","/account","/products/../checkout","http://example.com","/\\evil"]) assert.equal(safeBlogHref(unsafe),"");
});

test("dashboard blog routes are private, and preview escapes draft content",()=>{
  assert(isBlogDashboard(`/stores/${a}/blog/${article}/preview`));
  assert(isBlogDashboard(`/api/stores/${a}/blog/${article}`));
  assert(!isBlogDashboard("/blog"));
  const data={store:{store_id:a,name:"My Store"},role:"owner",available:true,articles:[],article:{...example,id:article,revision:"1",title:'<img src=x onerror=alert(1)>',
    sections:[{...example.sections[0],body:"<script>alert(1)</script>"},{id:b,type:"cta",heading:"Read",href:"/account",body:""}]},media:[],products:[]};
  const html=renderStoreBlogPreview(data);
  assert.match(html,/noindex/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|href="\/account"/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(renderStoreBlog({...data,article:null}, {name:"Example"}),/New draft/);
});

test("API rejects unauthenticated requests before opening a tenant transaction",async()=>{
  const request=new Request(`https://app.lebrands.store/api/stores/${a}/blog`,{method:"POST",headers:{origin:"https://app.lebrands.store","content-type":"application/json"},body:JSON.stringify(example)});
  const response=await handleBlogDashboard(request,{withMemberStore(){throw Error("must not connect");}},null,token,a);
  assert.equal(response.status,401);
});

test("API rejects foreign origins, unsupported methods and malformed IDs before writes",async()=>{
  const db={withMemberStore(){throw Error("must not connect");}};
  for(const [method,child,origin,status] of [
    ["POST",undefined,"https://evil.test",403],
    ["PATCH",article,"https://app.lebrands.store",405],
    ["POST",article,"https://app.lebrands.store",405],
    ["PUT",undefined,"https://app.lebrands.store",405],
    ["PUT","bad","https://app.lebrands.store",404],
  ]){
    const r=await handleBlogDashboard(new Request(`https://app.lebrands.store/api/stores/${a}/blog`,{
      method,headers:{origin,"content-type":"application/json"},body:"{}"}),db,{id:user},token,a,child);
    assert.equal(r.status,status);
    assert.match(r.headers.get("x-robots-tag"),/noindex/);
  }
});

test("migration provides strict tenant and session RLS, revisions, unique slugs and no public drafts",async t=>{
  assert.deepEqual(migrationSelection(["--staged-store-blog"]),{staged:true,filename:"0056_store_blog_drafts.sql",requires:"0055_plan_capacity.sql"});
  const pg=new PGlite();
  try{
    // Use authoritative foundational DDL, not substitutes that could repeat
    // a mistaken assumption about an existing table or constraint.
    const source=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
    const table=(sql,name)=>{
      const match=sql.match(new RegExp(`CREATE TABLE public\\.${name}\\s*\\([\\s\\S]*?\\);`));
      assert(match,`Missing authoritative DDL for ${name}`);return match[0];
    };
    await pg.exec(await source("db/migrations/0001_init.sql"));
    const accounts=await source("db/migrations/0003_accounts.sql");
    await pg.exec(accounts.match(/ALTER TABLE public\.users[^;]*must_change_password[^;]*;/)[0]);
    await pg.exec(table(accounts,"sessions"));
    const wizard=await source("db/migrations/0005_store_wizard.sql");
    await pg.exec(table(wizard,"store_publications"));
    await pg.exec(wizard.match(/ALTER TABLE public\.media ADD COLUMN upload_type[^;]*;/)[0]);
    await pg.exec(`CREATE ROLE lebrands_app LOGIN;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      INSERT INTO brands(id,name,legal_name) VALUES('${article}','Fixture brand','Fixture legal');
      INSERT INTO stores(store_id,brand_id,name,subdomain) VALUES
        ('${a}','${article}','Store A','blog-fixture-a'),('${b}','${article}','Store B','blog-fixture-b');
      INSERT INTO users(id,name,email) VALUES('${user}','Fixture user','fixture@example.invalid');
      INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${token}','${user}',now()+interval '1 day');
      INSERT INTO store_members(store_id,user_id,role) VALUES('${a}','${user}','owner');
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT ON stores,users,sessions,store_members,media,store_publications TO lebrands_app;
      GRANT INSERT ON audit_log TO lebrands_app;`);
    const sql=await readFile(new URL("../db/staged/0056_store_blog_drafts.sql",import.meta.url),"utf8");
    await pg.exec(sql);
    const privilege=(await pg.query(`SELECT
      has_function_privilege('anon','public.blog_draft_access(uuid)','EXECUTE') AS anon,
      has_function_privilege('authenticated','public.blog_draft_access(uuid)','EXECUTE') AS auth,
      has_function_privilege('service_role','public.blog_draft_access(uuid)','EXECUTE') AS service,
      has_function_privilege('lebrands_app','public.blog_draft_access(uuid)','EXECUTE') AS app`)).rows[0];
    assert.deepEqual(privilege,{anon:false,auth:false,service:false,app:true});
    await pg.exec(`SET ROLE lebrands_app;
      SELECT set_config('app.store_id','${a}',false);
      SELECT set_config('app.blog_token','${token}',false);`);
    const insert=async store=>pg.query(`INSERT INTO store_blog_drafts(store_id,title,slug)
      VALUES($1,'Routine','routine') RETURNING id,revision::text`,[store]);
    const first=(await insert(a)).rows[0];
    assert.equal(first.revision,"1");
    // Exercise the actual repository's parameterised SQL, not a reimplementation
    // of saving. This adapter only translates tagged placeholders for PGlite.
    let active=pg;
    const tx=async(strings,...values)=>{
      const query=strings.reduce((s,part,i)=>s+part+(i<values.length?`$${i+1}`:""),"");
      return (await active.query(query,values)).rows;
    };
    tx.json=value=>JSON.stringify(value);
    const saved=await saveBlogArticle(tx,a,first.id,{...example,expected_revision:"1"});
    assert.equal(saved.revision,"2");
    assert.equal(saved.sections[0].heading,"Routine");
    assert.equal((await saveBlogArticle(tx,a,first.id,{...example,expected_revision:"2",summary:"Changed"})).revision,"3");
    await assert.rejects(saveBlogArticle(tx,a,first.id,{...example,expected_revision:"2"}),e=>e.status===409);
    assert.equal((await pg.query("SELECT summary FROM store_blog_drafts WHERE id=$1",[first.id])).rows[0].summary,"Changed");
    await assert.rejects(deleteBlogArticle(tx,a,first.id,{expected_revision:"2"}),e=>e.status===409);
    await assert.rejects(saveBlogArticle(tx,a,first.id,{...example,expected_revision:"3",hero_media_id:b}),e=>e.status===400);
    await assert.rejects(saveBlogArticle(tx,a,first.id,{...example,expected_revision:"3",
      sections:[{...example.sections[0],type:"product",product_id:b}]}),e=>e.status===400);
    const fresh=await saveBlogArticle(tx,a,null,{...example,slug:"new-draft"});
    assert.equal(fresh.revision,"1");
    await deleteBlogArticle(tx,a,fresh.id,{expected_revision:"1"});
    await assert.rejects(deleteBlogArticle(tx,a,fresh.id,{expected_revision:"1"}),e=>e.status===404);
    await t.test("real API create, reload, update, conflict, private preview and delete contracts",async()=>{
      const db={async withMemberStore(id,session,fn){
        assert.equal(id,a);assert.equal(session,token);
        return pg.transaction(async transaction=>{
          active=transaction;
          try{
            await transaction.query("SELECT set_config('app.store_id',$1,true)",[id]);
            return await fn(tx);
          }finally{active=pg;}
        });
      }};
      const request=(method,path="",body)=>new Request(`https://app.lebrands.store/api/stores/${a}/blog${path}`,{
        method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},
        ...(body?{body:JSON.stringify(body)}:{})});
      const route=(r,child,action)=>handleBlogDashboard(r,db,{id:user},token,a,child,action);
      let response=await route(request("POST","",{...example,slug:"api-draft"}));
      assert.equal(response.status,201);
      const created=(await response.json()).article;
      assert.equal(created.revision,"1");
      const reread=await route(request("GET",`/${created.id}`),created.id);
      assert.equal((await reread.json()).article.title,example.title);
      response=await route(request("PUT",`/${created.id}`,{...example,slug:"api-draft",title:"Saved update",expected_revision:"1"}),created.id);
      assert.equal(response.status,200);
      assert.equal((await response.json()).article.revision,"2");
      response=await route(request("PUT",`/${created.id}`,{...example,slug:"api-draft",expected_revision:"1"}),created.id);
      assert.equal(response.status,409);
      response=await route(request("POST","",{...example,slug:"api-draft"}));
      assert.equal(response.status,409);
      assert.equal((await response.json()).code,"BLOG_SLUG_TAKEN");
      response=await route(new Request(`https://app.lebrands.store/stores/${a}/blog/${created.id}/preview`),created.id,"preview");
      assert.equal(response.status,200);assert.match(response.headers.get("x-robots-tag"),/noindex/);
      assert.match(await response.text(),/Saved update/);
      response=await route(request("HEAD"));assert.equal(await response.text(),"");
      response=await route(request("DELETE",`/${created.id}`,{expected_revision:"2"}),created.id);
      assert.equal(response.status,200);assert.equal((await response.json()).article,null);
      response=await route(request("GET",`/${created.id}`),created.id);
      assert.equal(response.status,404);
    });
    await assert.rejects(insert(b),e=>e.code==="42501");
    await assert.rejects(pg.query("INSERT INTO store_blog_drafts(store_id,title,slug) VALUES($1,'Duplicate','serum-guide')",[a]),e=>e.code==="23505");
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM store_blog_drafts")).rows[0].count,1);
    await pg.query(`SELECT set_config('app.store_id',$1,false)`,[b]);
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM store_blog_drafts")).rows[0].count,0);
    await pg.query(`SELECT set_config('app.store_id',$1,false)`,[a]);
    await pg.query("SELECT set_config('app.blog_token','invalid',false)");
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM store_blog_drafts")).rows[0].count,0);
    await assert.rejects(insert(a),e=>e.code==="42501");
    await pg.exec("RESET ROLE");
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM store_blog_drafts")).rows[0].count,1);
    assert.equal((await pg.query("SELECT has_table_privilege('anon','store_blog_drafts','SELECT') AS allowed")).rows[0].allowed,false);
  }finally{await pg.close();}
});
