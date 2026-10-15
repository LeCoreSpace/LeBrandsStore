import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleAnnRoutes} from "../src/store/ann-routes.js";
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const product="dddddddd-dddd-4ddd-8ddd-dddddddddddd",photo="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
test("Ann confirmed product fixes preserve stock, legacy GST and publication, with owned approved photos only",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,samplePolicies:true}),db=annFixtureAdapter(pg);
  const objects=new Map(),env={MEDIA:{put:async(k,b)=>objects.set(k,b),delete:async k=>objects.delete(k)}};
  const call=async(action,method="GET",body,opts={})=>{
    const headers={origin:opts.origin||"https://app.lebrands.store"};
    if(body&&!(body instanceof FormData))headers["content-type"]="application/json";
    const response=await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${opts.store||store}/ann/${action}`,{
      method,headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})
    }),env,db,{id:opts.editor?"cccccccc-cccc-4ccc-8ccc-cccccccccccc":owner},(opts.editor?"b":"a").repeat(64));
    return{status:response.status,body:await response.json()};
  };
  const update=(state,patch,extra={})=>({expected_draft:state.expected_draft,confirm:true,action:"product",product:{id:product,patch},...extra});
  try{
    // Use the real production media DDL, not invented fixture columns.
    const ddl=await readFile(new URL("../db/staged/0013_ai_builder.sql",import.meta.url),"utf8");
    await pg.exec(ddl.match(/ALTER TABLE public\.media[\s\S]*?;/)[0]);
    const pending="ffffffff-ffff-4fff-8fff-ffffffffffff";
    await pg.query(`INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes,upload_type,ai_generated,source_media_id,approval_status)
      VALUES($1,$2,$3,'image','image/webp',32,'image',true,$4,'pending')`,[pending,store,`stores/${store}/${pending}.webp`,photo]);
    const other="88888888-8888-4888-8888-888888888888",foreign="99999999-9999-4999-8999-999999999999";
    await pg.query("INSERT INTO brands(id,name,legal_name) VALUES($1,'Other fixture brand','Other fixture brand')",[other]);
    await pg.query("INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES($1,$1,'other-ann-test','Other fixture')",[other]);
    await pg.query(`INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes,upload_type)
      VALUES($1,$2,$3,'image','image/webp',32,'image')`,[foreign,other,`stores/${other}/${foreign}.webp`]);
    let state=(await call("readiness")).body;
    assert.deepEqual(state.image_media.map(m=>m.id),[photo]);
    assert.equal(state.products[0].price_paise,129909);assert.equal(state.products[0].stock,7);
    assert.equal((await call("readiness","PATCH",update(state,{hsn_code:"6205"},{confirm:false}))).status,400);
    assert.equal((await call("readiness","PATCH",update(state,{stock:0}))).status,400);
    assert.equal((await call("readiness","PATCH",update(state,{gst_rate:28}))).status,400);
    assert.equal((await call("readiness","PATCH",update(state,{hsn_code:"6205"}),{editor:true})).status,403);
    assert.equal((await call("readiness","PATCH",update(state,{hsn_code:"6205"}),{origin:"https://invalid.example"})).status,403);
    assert.equal((await call("readiness","PATCH",update(state,{hsn_code:"6205"}),{store:other})).status,403);
    for(const id of [pending,foreign]){
      assert.equal((await call("readiness","PATCH",update(state,{title:"Must roll back",images:[{id,alt:"Bad selection"}]}))).status,400);
      assert.equal((await call("readiness")).body.products[0].title,"Sample cotton shirt");
    }
    const form=()=>{const f=new FormData();f.set("type","image");f.set("file",new Blob(["not an image"],{type:"image/webp"}),"sample.webp");return f;};
    assert.equal((await call("media","POST",form(),{editor:true})).status,403);
    assert.equal((await call("media","POST",form(),{origin:"https://invalid.example"})).status,403);
    assert.equal((await call("media","POST",form())).status,400);assert.equal(objects.size,0);
    // The authored WebP is real complete image data and already in the repo.
    const bytes=await readFile(new URL("../src/public/img/aura-starters/c001-s001/v01/c001-s001-product-p01-front-v01.webp",import.meta.url));
    const upload=new FormData();upload.set("type","image");upload.set("file",new Blob([bytes],{type:"image/webp"}),"photo.webp");
    const uploaded=await call("media","POST",upload);assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));
    assert.equal(objects.size,1);assert.equal((await call("readiness")).body.products[0].images.length,0);
    await pg.query("UPDATE products SET stock=3 WHERE id=$1",[product]);
    assert.equal((await call("readiness","PATCH",update(state,{hsn_code:"6205"}))).status,409);
    state=(await call("readiness")).body;
    let result=await call("readiness","PATCH",{expected_draft:state.expected_draft,confirm:true,action:"policy",
      policy:{kind:"privacy",body:"Merchant privacy policy text must survive a product change.",reviewed:true}});
    assert.equal(result.status,200);state=result.body;
    result=await call("readiness","PATCH",update(state,{hsn_code:"6205",images:[{id:uploaded.body.media.id,alt:"Cotton shirt photograph"}]}));
    assert.equal(result.status,200,JSON.stringify(result.body));state=result.body;
    const p=state.products.find(p=>p.id===product);
    assert.equal(p.stock,3);assert.equal(p.price_paise,129909);assert.equal(p.gst_rate,12);
    assert.equal(p.images[0].alt,"Cotton shirt photograph");assert.deepEqual(p.errors,{});
    assert.equal(state.policies.find(p=>p.kind==="privacy").body,"Merchant privacy policy text must survive a product change.");
    assert.ok(state.policies.every(p=>!p.reviewed));
    result=await call("readiness","PATCH",update(state,{price_paise:129910,gst_rate:18}));
    assert.equal(result.status,200);assert.equal(result.body.products[0].price_paise,129910);
    assert.equal(Number((await pg.query("SELECT count(*) AS n FROM store_publications")).rows[0].n),0);
    assert.equal((await pg.query("SELECT status FROM stores WHERE store_id=$1",[store])).rows[0].status,"draft");
  }finally{await pg.close();}
});
