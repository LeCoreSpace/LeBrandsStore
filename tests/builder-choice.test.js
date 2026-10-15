import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { renderBuilderChoice } from "../src/ui/builder-choice.js";
import { readFile } from "node:fs/promises";

const store="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const owner="33333333-3333-4333-8333-333333333333";
const fixture={store:{store_id:store,name:"Example Studio",subdomain:"example-studio"},
  role:"owner",settings:{brand_name:"Example Studio",category:"fashion",subcategory:"mens-clothing"},
  products:[{id:"real-product"}],layouts:{home:[{id:"existing-section"}]},policies:[{reviewed:true}],
  progress:{step:3,completed:[1,2]},aura_skeleton_enabled:true};

mock.module("../src/store/repository.js",{namedExports:{
  loadDraft:async tx=>{
    const [row]=await tx`SELECT settings FROM public.store_setup WHERE store_id = ${store}`;
    return {...structuredClone(fixture),settings:row?.settings||fixture.settings};
  },
}});
const {handleBuilderRoutes,isBuilderRoute,annBuilderEnabled}=await import("../src/store/builder-routes.js");
const post=(mode,origin="https://app.lebrands.store",id=store)=>new Request(`https://app.lebrands.store/stores/${id}/build`,{
  method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({mode}),
});

test("chooser offers the two builders, uses real paths, gates Ann and escapes merchant data",()=>{
  const html=renderBuilderChoice({...fixture,settings:{...fixture.settings,builder_mode:"standard"}});
  assert.match(html,/Build your Store with Ann/);assert.match(html,/Standard Builder/);
  assert.match(html,/Last used/);assert.match(html,/name="mode" value="standard"/);
  assert.match(html,/<button[^>]+disabled[^>]*>Build with Ann/);
  assert.doesNotMatch(html,/name="mode" value="ann"|AI store builder|coming soon|[\u2013\u2014]/i);
  assert.match(html,/Build your store \| Example Studio/);
  assert.match(html,new RegExp(`/stores/${store}/build`));
  assert.match(html,new RegExp(`/stores/${store}/editor`));
  const escaped=renderBuilderChoice({...fixture,store:{...fixture.store,name:'<script>alert(1)</script>'}});
  assert.doesNotMatch(escaped,/<script>alert\(1\)<\/script>/);
  assert.match(escaped,/&lt;script&gt;/);
  const reader=renderBuilderChoice({...fixture,role:"staff"});
  assert.match(reader,/<button[^>]+disabled[^>]*>Use Standard Builder/);
  assert.equal(annBuilderEnabled({ANN_BUILDER_ENABLED:"true"}),false);
  assert.equal(isBuilderRoute(`/stores/${store}/build/standard`),true);
  assert.equal(isBuilderRoute(`/stores/${store}/build/ann`),true);
  assert.equal(isBuilderRoute(`/api/stores/${store}/build`),false);
});

test("builder selection is tenant-scoped and only merges its preference in isolated PostgreSQL",async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(`CREATE ROLE lebrands_app NOLOGIN;
      CREATE TABLE store_setup(store_id uuid PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}',
        step integer DEFAULT 1,completed integer[] DEFAULT '{}');
      CREATE TABLE store_members(store_id uuid,user_id uuid,role text);
      ALTER TABLE store_setup ENABLE ROW LEVEL SECURITY;
      ALTER TABLE store_setup FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON store_setup TO lebrands_app
        USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
        WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
      GRANT USAGE ON SCHEMA public TO lebrands_app;
      GRANT SELECT,INSERT,UPDATE ON store_setup TO lebrands_app;
      GRANT SELECT ON store_members TO lebrands_app;`);
    const original={...fixture.settings,invoice_prefix:"EX",nested:{keep:true}};
    await pg.query("INSERT INTO store_setup VALUES($1,$2,3,ARRAY[1,2]),($3,$4,2,ARRAY[1])",
      [store,original,other,{brand_name:"Other brand"}]);
    await pg.query("INSERT INTO store_members VALUES($1,$2,'owner')",[store,owner]);
    await pg.exec("SET ROLE lebrands_app");
    await pg.query("SELECT set_config('app.store_id',$1,false)",[store]);
    const tx=async(strings,...values)=>(await pg.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:"")+s,""),values)).rows;
    const db={withMemberStore:async(id,hash,fn)=>{
      if(id!==store)throw Object.assign(new Error("No access"),{status:403});
      return fn(tx);
    }};
    const user={id:owner};
    const before=structuredClone(fixture);
    const response=await handleBuilderRoutes(post("standard"),{},db,user,"a".repeat(64));
    assert.equal(response.status,303);assert.equal(response.headers.get("location"),`/stores/${store}/setup`);
    const row=(await pg.query("SELECT settings,step,to_json(completed) completed FROM store_setup WHERE store_id=$1",[store])).rows[0];
    assert.deepEqual(row.settings,{...original,builder_mode:"standard"});
    assert.equal(row.step,3);assert.deepEqual(row.completed,[1,2]);assert.deepEqual(fixture,before);
    assert.equal((await handleBuilderRoutes(post("ann"),{ANN_BUILDER_ENABLED:"true"},db,user,"a".repeat(64))).status,409);
    assert.equal((await handleBuilderRoutes(post("unknown"),{},db,user,"a".repeat(64))).status,400);
    assert.equal((await handleBuilderRoutes(post("standard","https://foreign.example"),{},db,user,"a".repeat(64))).status,403);
    assert.equal((await handleBuilderRoutes(post("standard","https://app.lebrands.store",other),{},db,user,"a".repeat(64))).status,403);
    assert.equal((await handleBuilderRoutes(post("standard"),{},db,{id:other},"a".repeat(64))).status,403);
    assert.equal((await handleBuilderRoutes(post("standard"),{},db,null,null)).status,401);
    await assert.rejects(pg.query("UPDATE store_setup SET store_id=$1 WHERE store_id=$2",[other,store]),e=>e.code==="42501");
    assert.equal((await pg.query("SELECT * FROM store_setup WHERE store_id=$1",[other])).rows.length,0);
    const get=()=>new Request(`https://app.lebrands.store/stores/${store}/build`);
    const page=await handleBuilderRoutes(get(),{},db,user,"a".repeat(64));
    assert.equal(page.status,200);assert.equal(page.headers.get("cache-control"),"no-store");
    assert.match(await page.text(),/Current builder: <strong>Standard Builder/);
    const head=await handleBuilderRoutes(new Request(get(),{method:"HEAD"}),{},db,user,"a".repeat(64));
    assert.equal(head.status,200);assert.equal(await head.text(),"");
    const oldAnn=await handleBuilderRoutes(new Request(`https://app.lebrands.store/stores/${store}/build/ann`),{},db,user,"a".repeat(64));
    assert.equal(oldAnn.headers.get("location"),`/stores/${store}/build`);
    // A brand new store has no setup row until its first explicit choice.
    await assert.rejects(pg.query("DELETE FROM store_setup WHERE store_id=$1",[store]),e=>e.code==="42501");
    await pg.exec("RESET ROLE");
    await pg.query("DELETE FROM store_setup WHERE store_id=$1",[store]);
    await pg.exec("SET ROLE lebrands_app");
    assert.equal((await handleBuilderRoutes(post("standard"),{},db,user,"a".repeat(64))).status,303);
    assert.equal((await pg.query("SELECT settings->>'builder_mode' mode FROM store_setup WHERE store_id=$1",[store])).rows[0].mode,"standard");
    await pg.exec("RESET ROLE");
    assert.deepEqual((await pg.query("SELECT settings FROM store_setup WHERE store_id=$1",[other])).rows[0].settings,{brand_name:"Other brand"});
  }finally{await pg.close();}
});

test("old four-step setup remains available and new stores enter the chooser",async()=>{
  const accounts=await readFile(new URL("../src/auth/routes.js",import.meta.url),"utf8");
  assert.ok(accounts.indexOf("isBuilderRoute(path)) return")<accounts.indexOf("isAiRoute(path)) return"));
  assert.match(accounts,/redirect\(`\/stores\/\$\{storeId\}\/build`\)/);
  const routes=await readFile(new URL("../src/store/routes.js",import.meta.url),"utf8");
  assert.match(routes,/renderWizard\(data, user\)/);
  const dashboard=await readFile(new URL("../src/ui/dashboard.js",import.meta.url),"utf8");
  assert.match(dashboard,/build">Build your store/);
  assert.doesNotMatch(dashboard,/>AI store builder</);
});
