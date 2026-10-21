import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {mediaLibrary,mediaLibraryFilters} from "../src/dashboard/media-library.js";
import {handleMediaLibrary,isMediaLibraryPath} from "../src/dashboard/media-library-routes.js";
import {renderMediaLibrary} from "../src/ui/media-library.js";
import {isDashboardPath,handleDashboard} from "../src/dashboard/routes.js";

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const id=uuid(1),other=uuid(2),brand=uuid(3),user=uuid(4),image=uuid(5),video=uuid(6),logo=uuid(7),foreign=uuid(8),product=uuid(9),article=uuid(10);
const source=p=>readFile(new URL(`../${p}`,import.meta.url),"utf8");
const table=(s,n)=>s.match(new RegExp(`CREATE TABLE public\\.${n}\\s*\\([\\s\\S]*?\\);`))[0];
const url=query=>new URL(`https://app.lebrands.store/stores/${id}/media-library${query||""}`);

test("library filters are bounded, route mapping is exact and writes/auth failures stop before SQL",async()=>{
  assert.deepEqual(mediaLibraryFilters(url()),{query:"",type:"all",offset:0,limit:36});
  for(const q of ["?type=bad","?offset=-1","?offset=1.5","?offset=1000000","?q="+"x".repeat(101)])
    assert.throws(()=>mediaLibraryFilters(url(q)));
  assert(isMediaLibraryPath(url().pathname));assert(isDashboardPath(url().pathname));
  assert(!isMediaLibraryPath(url().pathname+"/delete"));
  const db={withMemberStore(){throw Error("SQL must not run");}};
  for(const [method,actor,status] of [["GET",null,401],["DELETE",{id:user},405],["POST",{id:user},405]]){
    const r=await handleMediaLibrary(new Request(url(),{method}),db,actor,"token",id);
    assert.equal(r.status,status);assert.match(r.headers.get("cache-control"),/no-store/);
  }
  assert.equal((await handleMediaLibrary(new Request(url()),db,{id:user},"token","bad")).status,404);
});

test("actual media SQL is tenant scoped, counts all storage and finds draft/published references without leaking records",async()=>{
  const pg=new PGlite();let active=pg;
  const tx=(strings,...args)=>{
    let text="",values=[];
    strings.forEach((part,i)=>{text+=part;if(i>=args.length)return;const a=args[i];
      if(a?.fragment){const base=values.length;text+=a.text.replace(/\$(\d+)/g,(_,n)=>`$${Number(n)+base}`);values.push(...a.values);}
      else{values.push(a);text+=`$${values.length}`;}});
    return {fragment:true,text,values,then(resolve,reject){return active.query(text,values).then(r=>r.rows).then(resolve,reject);}};
  };
  try{
    await pg.exec(await source("db/migrations/0001_init.sql"));
    const accounts=await source("db/migrations/0003_accounts.sql"),wizard=await source("db/migrations/0005_store_wizard.sql");
    await pg.exec(accounts.match(/ALTER TABLE public\.users[^;]*must_change_password[^;]*;/)[0]);
    await pg.exec(table(accounts,"sessions"));await pg.exec(table(wizard,"store_setup"));
    await pg.exec(table(wizard,"store_publications"));
    await pg.exec(wizard.match(/ALTER TABLE public\.media ADD COLUMN upload_type[^;]*;/)[0]);
    const pages=await source("db/migrations/0010_store_pages.sql");
    await pg.exec(pages.match(/ALTER TABLE public\.media DROP CONSTRAINT media_upload_type_check;/)[0]);
    await pg.exec(pages.match(/ALTER TABLE public\.media ADD CONSTRAINT media_upload_type_check[^;]*;/)[0]);
    await pg.exec(table(pages,"store_pages"));
    await pg.exec(`CREATE ROLE lebrands_app;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      INSERT INTO brands(id,name,legal_name)VALUES('${brand}','Example','Example');
      INSERT INTO stores(store_id,brand_id,name,subdomain)VALUES('${id}','${brand}','Example','example'),('${other}','${brand}','Private other store','other-store');
      INSERT INTO users(id,name,email)VALUES('${user}','Editor','editor@example.invalid');
      INSERT INTO store_members(store_id,user_id,role)VALUES('${id}','${user}','editor');
      INSERT INTO products(id,store_id,title,slug,cost_price_paise)VALUES('${product}','${id}','Example serum','serum',123456);`);
    for(const [mid,store,kind,type,size,alt]of[[image,id,"image","image",100,"Serum portrait"],[video,id,"video","video",200,"Serum video"],[logo,id,"image","logo",300,"Brand logo"],[foreign,other,"image","image",9999,"Other store secret"]])
      await pg.query(`INSERT INTO media(id,store_id,object_key,kind,content_type,upload_type,size_bytes,width,height,alt_text)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[mid,store,`stores/${store}/${mid}.${kind==="video"?"mp4":"webp"}`,kind,kind==="video"?"video/mp4":"image/webp",type,size,kind==="image"?800:null,kind==="image"?1000:null,alt]);
    await pg.exec(`INSERT INTO product_media(store_id,product_id,media_id)VALUES('${id}','${product}','${image}');
      INSERT INTO store_setup(store_id,logo_media_id,settings)VALUES('${id}','${logo}','{"private":"not-for-client"}');
      INSERT INTO store_pages(store_id,page_key,draft_layout,published_layout)VALUES('${id}','home','[{"image":"${image}"}]',NULL);
      INSERT INTO store_publications(store_id,snapshot)VALUES('${id}','{"hero":"${image}","private_cost":123456}');
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT ON stores,store_members,media,product_media,products,store_setup,store_publications,store_pages TO lebrands_app;`);
    await pg.exec(await source("db/staged/0056_store_blog_drafts.sql"));
    await pg.exec(await source("db/staged/0057_store_blog_publications.sql"));
    await pg.exec(`INSERT INTO store_blog_drafts(id,store_id,title,slug,hero_media_id)VALUES('${article}','${id}','Draft reference','draft-reference','${image}');
      INSERT INTO store_blog_publications(store_id,article_id,slug,snapshot,revision)VALUES('${id}','${article}','draft-reference','{"hero_media_id":"${image}"}',1);
      GRANT SELECT ON users,sessions TO lebrands_app;
      INSERT INTO sessions(token_hash,user_id,expires_at)VALUES('${"a".repeat(64)}','${user}',now()+interval '1 day');
      SET ROLE lebrands_app;`);
    const db={withMemberStore:async(store,token,fn)=>pg.transaction(async p=>{
      active=p;try{await p.query("SELECT set_config('app.store_id',$1,true)",[store]);
        await p.query("SELECT set_config('app.blog_token',$1,true)",[token]);return await fn(tx);
      }finally{active=pg;}
    })};
    const token="a".repeat(64);
    const r=await handleDashboard(new Request(url()),db,{id:user},token);
    assert.equal(r.status,200);assert.match(await r.text(),/Media library/);
    const api=q=>handleMediaLibrary(new Request(`https://app.lebrands.store/api/stores/${id}/media-library${q||""}`),db,{id:user},token,id);
    const data=await(await api()).json();
    assert.equal(data.total,3);assert.equal(data.storage.used,600);assert.equal(data.storage.limit,null);
    const own=data.items.find(m=>m.id===image);
    assert(own.usage.some(u=>u.label==="Product: Example serum"));
    assert(own.usage.some(u=>u.label==="Published storefront"));
    assert(own.usage.some(u=>u.label==="Page sections (draft or published)"));
    assert(own.usage.some(u=>u.label==="Blog drafts"));
    assert(own.usage.some(u=>u.label==="Published blog articles"));
    assert(!JSON.stringify(data).includes("private_cost"));assert(!JSON.stringify(data).includes("not-for-client"));
    assert(!JSON.stringify(data).includes("123456"));assert(!JSON.stringify(data).includes(foreign));
    for(const [q,total,kind]of[["?type=video",1,"video"],["?type=logo",1,"image"],["?type=image",1,"image"],["?q=portrait",1,"image"],["?q=unknown",0,null]]){
      const response=await api(q);assert.equal(response.status,200);const d=await response.json();assert.equal(d.total,total);
      assert.equal(d.storage.used,600);if(kind)assert.equal(d.items[0].kind,kind);
    }
    assert.equal((await(await api("?offset=36")).json()).items.length,0);
    const denied=await handleMediaLibrary(new Request(`https://app.lebrands.store/api/stores/${other}/media-library`),db,{id:user},token,other);
    assert.equal(denied.status,403);
    const head=await handleMediaLibrary(new Request(url(),{method:"HEAD"}),db,{id:user},token,id);
    assert.equal(head.status,200);assert.equal(await head.text(),"");
    assert.equal((await api("?offset=-1")).status,400);
    await pg.exec(`RESET ROLE;WITH fresh AS(SELECT gen_random_uuid() AS id FROM generate_series(1,37))
      INSERT INTO media(id,store_id,object_key,kind,upload_type,content_type,size_bytes)
      SELECT id,'${id}','stores/${id}/'||id||'.webp','image','image','image/webp',1 FROM fresh;
      SET ROLE lebrands_app;`);
    const first=await(await api()).json(),next=await(await api("?offset=36")).json();
    assert.equal(first.total,40);assert.equal(first.items.length,36);assert.equal(first.has_more,true);
    assert.equal(next.items.length,4);assert.equal(next.has_more,false);
    assert.equal(new Set([...first.items,...next.items].map(m=>m.id)).size,40);
    assert.equal(first.storage.used,637);
  }finally{await pg.close();}
});

test("SSR escapes library details, preserves filter pagination and does not invent generation or destructive actions",()=>{
  const data={store:{store_id:id,name:"Example"},role:"editor",query:"serum",type:"image",offset:36,limit:36,total:80,has_more:true,
    storage:{used:100,limit:1000},items:[{id:image,url:"javascript:alert(1)",filename:"<script>unsafe</script>",kind:"image",size_bytes:100,width:800,height:1000,usage:[]}]};
  const html=renderMediaLibrary(data,{name:"Editor"});
  assert.match(html,/&lt;script&gt;unsafe/);assert.doesNotMatch(html,/src="javascript:/);
  assert.match(html,/Image size guide/);assert.match(html,/AI Image Generation/);
  assert.match(html,/q=serum/);assert.match(html,/offset=72/);
  assert.doesNotMatch(html,/>Delete<|>Generate<|>Upload</);
  assert.match(html,/<title>Media library/);
});
