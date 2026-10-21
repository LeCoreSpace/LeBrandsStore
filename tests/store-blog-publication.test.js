import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {handleBlogDashboard} from "../src/blog/routes.js";
import {handleContentLLM,storeDiscoveryDashboard} from "../src/blog/discovery-dashboard.js";
import {blogPublications} from "../src/blog/publication.js";
import {serveStorefront} from "../src/store/live.js";
import {serveStoreDiscovery} from "../src/store/discovery.js";
import {renderAura} from "../src/public/aura.js";
import {renderStoreDiscovery} from "../src/ui/store-discovery.js";
import {renderPublicBlog} from "../src/blog/render.js";
import {migrationSelection} from "../db/migration-selection.js";

const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",
 user="33333333-3333-4333-8333-333333333333",brand="44444444-4444-4444-8444-444444444444",
 section="55555555-5555-4555-8555-555555555555",token="a".repeat(64);
const source=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const table=(sql,name)=>sql.match(new RegExp(`CREATE TABLE public\\.${name}\\s*\\([\\s\\S]*?\\);`))[0];
const value={title:"Routine guide",slug:"routine-guide",summary:"A saved summary.",author:"Brand team",category:"Guides",
 hero_media_id:null,hero_alt:"",sections:[{id:section,type:"text",heading:"Start here",body:"Original published copy."}]};
const mediaId="66666666-6666-4666-8666-666666666666",foreignMedia="77777777-7777-4777-8777-777777777777",productId="88888888-8888-4888-8888-888888888888";

test("real publication API freezes revisions, protects URLs and isolates public readers",async()=>{
 assert.deepEqual(migrationSelection(["--staged-store-blog-publication"]),{staged:true,filename:"0057_store_blog_publications.sql",requires:"0056_store_blog_drafts.sql"});
 const pg=new PGlite();let active=pg;
 const tx=async(strings,...values)=>(await active.query(strings.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:""),""),values)).rows;
 tx.json=v=>JSON.stringify(v);
 try{
  await pg.exec(await source("db/migrations/0001_init.sql"));
  const accounts=await source("db/migrations/0003_accounts.sql"),wizard=await source("db/migrations/0005_store_wizard.sql");
  await pg.exec(accounts.match(/ALTER TABLE public\.users[^;]*must_change_password[^;]*;/)[0]);
  await pg.exec(table(accounts,"sessions"));await pg.exec(table(wizard,"store_publications"));
  await pg.exec(wizard.match(/ALTER TABLE public\.media ADD COLUMN upload_type[^;]*;/)[0]);
  await pg.exec(`CREATE ROLE lebrands_app;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    INSERT INTO brands(id,name,legal_name) VALUES('${brand}','Fixture','Fixture legal');
    INSERT INTO stores(store_id,brand_id,name,subdomain,status) VALUES
      ('${id}','${brand}','Fixture store','fixture-store','live'),('${other}','${brand}','Other store','other-store','live');
    INSERT INTO users(id,name,email) VALUES('${user}','Fixture editor','blog@example.invalid');
    INSERT INTO store_members(store_id,user_id,role) VALUES('${id}','${user}','editor');
    INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${token}','${user}',now()+interval '1 day');
    INSERT INTO domains(store_id,hostname,status,is_primary) VALUES('${id}','www.fixture.example','active',true);
    GRANT USAGE ON SCHEMA public TO lebrands_app;
    GRANT SELECT ON stores,domains,users,sessions,store_members,media,store_publications TO lebrands_app;
    GRANT INSERT ON audit_log TO lebrands_app;`);
  await pg.query("INSERT INTO store_publications(store_id,snapshot) VALUES($1,$2::jsonb)",[id,JSON.stringify({store:{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"},settings:{brand_name:"Fixture store"},products:[{id:productId,title:"Example serum",slug:"example-serum",status:"published",catalogue:{cost_paise:999}}],collections:[],policies:[]})]);
  for(const [owner,media]of[[id,mediaId],[other,foreignMedia]])await pg.query("INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes) VALUES($1,$2,$3,'image','image/webp',10)",[media,owner,`stores/${owner}/${media}.webp`]);
  await pg.exec(await source("db/staged/0056_store_blog_drafts.sql"));
  await pg.exec(await source("db/staged/0057_store_blog_publications.sql"));
  await pg.exec("SET ROLE lebrands_app");
  const transaction=async(store,session,fn)=>pg.transaction(async p=>{
    active=p;try{
      await p.query("SELECT set_config('app.store_id',$1,true)",[store]);
      await p.query("SELECT set_config('app.blog_token',$1,true)",[session||""]);
      return await fn(tx);
    }finally{active=pg;}
  });
  const db={withMemberStore:(store,session,fn)=>transaction(store,session,fn),withStore:(store,fn)=>transaction(store,"",fn)};
  const req=(method,path="",body)=>new Request(`https://app.lebrands.store/api/stores/${id}/blog${path}`,{method,
    headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const call=(method,path,body,article,action)=>handleBlogDashboard(req(method,path,body),db,{id:user},token,id,article,action);
  let r=await call("POST","",{...value,hero_media_id:foreignMedia});assert.equal(r.status,400);
  r=await call("POST","",{...value,hero_media_id:mediaId,hero_alt:"Merchant-written hero description",sections:[...value.sections,{id:foreignMedia,type:"product",heading:"An everyday essential",body:"",product_id:productId}]});assert.equal(r.status,201);
  let draft=(await r.json()).article;const aid=draft.id;
  const publish=rev=>call("POST",`/${aid}/publish`,{expected_revision:rev},aid,"publish");
  r=await publish("1");assert.equal(r.status,200,await r.clone().text());
  draft=(await r.json()).article;assert.equal(draft.revision,"2");assert.equal(draft.publication.revision,"2");
  assert.equal(draft.publication.url,"https://www.fixture.example/blog/routine-guide");
  const first=draft.publication.first_published_at;
  const publicData=()=>db.withStore(id,t=>blogPublications(t,id,{slug:"routine-guide"}));
  assert.equal((await publicData()).blog_article.sections[0].body,"Original published copy.");
  const published=await publicData();
  assert.equal(published.blog_article.hero_image.alt,"Merchant-written hero description");
  assert.equal(published.blog_article.media[0].id,mediaId);
  assert.deepEqual(published.blog_article.products,[{id:productId,name:"Example serum",href:"/products/example-serum"}]);
  assert(!JSON.stringify(published).includes("cost_paise"));
  const update={...value,sections:[{...value.sections[0],body:"Private next draft."}],expected_revision:"2"};
  r=await call("PUT",`/${aid}`,update,aid);assert.equal(r.status,200);
  draft=(await r.json()).article;assert.equal(draft.revision,"3");assert.equal(draft.publication.revision,"2");
  assert.equal((await publicData()).blog_article.sections[0].body,"Original published copy.");
  assert.equal((await publish("2")).status,409);
  r=await call("PUT",`/${aid}`,{...update,slug:"renamed",expected_revision:"3"},aid);assert.equal(r.status,400);
  r=await publish("3");assert.equal(r.status,200);
  draft=(await r.json()).article;assert.equal(draft.revision,"4");
  assert.equal((await publicData()).blog_article.sections[0].body,"Private next draft.");
  const live=await serveStorefront(new Request("https://www.fixture.example/blog/routine-guide"),db,
    {store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"});
  assert.equal(live.status,200);const html=await live.text();
  assert.match(html,/Private next draft/);assert.match(html,/<meta property="og:type" content="article">/);
  assert.match(html,/<link rel="canonical" href="https:\/\/www.fixture.example\/blog\/routine-guide">/);
  assert.match(html,/BlogPosting/);assert.match(html,/href="\/blog"/);assert.doesNotMatch(html,/noindex/);
  const view=await transaction(id,token,t=>storeDiscoveryDashboard(t,id));
  for(const file of view.files){
    const source=await db.withStore(id,t=>blogPublications(t,id));
    const pub={store:{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"},settings:{brand_name:"Fixture store"},products:[{id:productId,title:"Example serum",slug:"example-serum",status:"published"}],collections:[],policies:[],...source};
    const actual=serveStoreDiscovery(new Request(file.url),pub,view.origin);
    assert.equal(file.content,await actual.text());assert.equal(file.status,actual.status);
  }
  assert.match(view.files.find(f=>f.path==="/sitemap.xml").content,/\/blog\/routine-guide/);
  assert.match(view.files.find(f=>f.path==="/llms.txt").content,/Routine guide/);
  const head=await serveStorefront(new Request("https://www.fixture.example/blog/routine-guide",{method:"HEAD"}),db,{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"});
  assert.equal(head.status,200);assert.equal(await head.text(),"");
  const invalidPage=await serveStorefront(new Request("https://www.fixture.example/blog?page=2"),db,{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"});
  assert.equal(invalidPage.status,404);
  assert.equal(view.files.find(f=>f.path==="/llm.txt").location,"https://www.fixture.example/llms.txt");
  const contentResponse=await handleContentLLM(new Request(`https://app.lebrands.store/api/stores/${id}/content-llm`),db,{id:user},token,id);
  assert.equal(contentResponse.status,200);assert.equal((await contentResponse.json()).files.length,4);
  await db.withStore(id,async t=>{
    assert.equal((await t`SELECT count(*)::int AS n FROM store_blog_drafts`)[0].n,0);
    assert.equal((await t`SELECT count(*)::int AS n FROM store_blog_publications`)[0].n,1);
    assert.equal((await t`DELETE FROM store_blog_publications WHERE store_id=${id} RETURNING article_id`).length,0);
  });
  assert.deepEqual((await db.withStore(other,t=>blogPublications(t,other))).blogs,[]);
  const foreign=await handleBlogDashboard(new Request(`https://app.lebrands.store/api/stores/${other}/blog/${aid}/publish`,{method:"POST",headers:{origin:"https://app.lebrands.store","content-type":"application/json"},body:JSON.stringify({expected_revision:"4"})}),db,{id:user},token,other,aid,"publish");
  assert.equal(foreign.status,403);
  r=await call("POST",`/${aid}/unpublish`,{expected_revision:"4"},aid,"unpublish");assert.equal(r.status,200);
  draft=(await r.json()).article;assert.equal(draft.publication,null);assert.equal(draft.published_slug,"routine-guide");assert.equal(draft.revision,"5");
  assert.equal((await publicData()).blog_article,null);
  const gone=await serveStorefront(new Request("https://www.fixture.example/blog/routine-guide"),db,{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"});
  assert.equal(gone.status,404);
  r=await publish("5");assert.equal(r.status,200);draft=(await r.json()).article;
  assert.equal(draft.publication.first_published_at,first);
  await pg.exec(`RESET ROLE;UPDATE stores SET status='paused' WHERE store_id='${id}';SET ROLE lebrands_app`);
  assert.equal((await publicData()).blogs.length,0);
  const paused=await serveStorefront(new Request("https://www.fixture.example/blog/routine-guide"),db,{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"paused"});
  assert.equal(paused.status,404);
  await pg.exec(`RESET ROLE;UPDATE stores SET status='live' WHERE store_id='${id}';SET ROLE lebrands_app`);
  r=await call("DELETE",`/${aid}`,{expected_revision:draft.revision},aid);assert.equal(r.status,200);
  assert.equal((await publicData()).blogs.length,0);
  await pg.exec("RESET ROLE");
  const [grants]=(await pg.query("SELECT has_table_privilege('anon','store_blog_publications','SELECT') AS a,has_table_privilege('service_role','store_blog_publications','SELECT') AS s,has_function_privilege('authenticated','protect_blog_address()','EXECUTE') AS f")).rows;
  assert.deepEqual(grants,{a:false,s:false,f:false});
 }finally{await pg.close();}
});

test("public rendering escapes content across every saved theme; files are shown as text",()=>{
 const article={...value,id:section,first_published_at:"2026-10-21T08:00:00Z",updated_at:"2026-10-21T09:00:00Z",media:[],products:[],
  sections:[{...value.sections[0],body:"<script>alert(1)</script>"}]};
 const data={store:{store_id:id,name:"Fixture store",subdomain:"fixture-store",status:"live"},settings:{brand_name:"Fixture store"},products:[],collections:[],blog_article:article,blogs:[article],blog_enabled:true};
 for(const style of ["editorial","boutique","architectural","minimal","vintage"]){
  const themed={...data,settings:{...data.settings,ann_design:{version:1,style,copy:{},media:{}}}};
  const page=renderAura(themed,{page:"blog-article",canonicalOrigin:"https://www.fixture.example",commerce:true,publicBlogHtml:renderPublicBlog(themed,{page:"blog-article"})});
  assert.match(page,new RegExp(`data-style="${style}"`));assert.match(page,/class="store-articles"/);
  assert.match(page,/&lt;script&gt;/);assert.match(page,/href="\/blog"/);
  assert.equal((page.match(/<main\b/g)||[]).length,1);
 }
 const html=renderAura(data,{page:"blog-article",canonicalOrigin:"https://www.fixture.example",commerce:true,publicBlogHtml:renderPublicBlog(data,{page:"blog-article"})});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 const files=renderStoreDiscovery({store:data.store,role:"owner",available:true,published:true,origin:"https://www.fixture.example",files:[{name:"sitemap.xml",path:"/sitemap.xml",url:"https://www.fixture.example/sitemap.xml",status:200,content:'<urlset><script>alert(1)</script></urlset>'}]},{name:"Fixture"});
 assert.match(files,/&lt;urlset&gt;/);assert.doesNotMatch(files,/<script>alert/);
});
