import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {costChange,cogsFilters,listCosts,saveCosts,productCostFields,costHistory} from "../src/dashboard/cogs.js";
import {handleDashboard,isDashboardPath} from "../src/dashboard/routes.js";
import {handleStoreRoutes} from "../src/store/routes.js";
import {productPatch} from "../src/store/input.js";
import {loadDraft,saveProduct} from "../src/store/repository.js";
import {migrationSelection} from "../db/migration-selection.js";
import {createSkuCheckoutFixture} from "../src/sku-checkout-fixture-data.js";
import {orderInput} from "../src/checkout/input.js";
import {placeCodOrder} from "../src/checkout/repository.js";

const sid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const editor="cccccccc-cccc-4ccc-8ccc-cccccccccccc",token="a".repeat(64),editorToken="b".repeat(64);
const origin="https://accounts.lebrands.store";
const request=(path,body,method=body?"POST":"GET")=>new Request(origin+path,{method,
  headers:{origin,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
test("cost input treats missing, null and zero separately and requires exact revisions",()=>{
  const base={product_id:sid,cost_price_paise:null,expected_revision:0};
  assert.equal(costChange(base).cost_price_paise,null);
  assert.equal(costChange({...base,cost_price_paise:0}).cost_price_paise,0);
  for(const value of [-1,NaN,Infinity,0.1,"5",1000000000001])
    assert.throws(()=>costChange({...base,cost_price_paise:value}));
  assert.throws(()=>costChange({...base,expected_revision:-1}));
  assert.throws(()=>productPatch({cost_price_paise:0}));
  assert.deepEqual(productPatch({cost_price_paise:0,cost_revision:0}),{cost_price_paise:0,cost_revision:0});
  assert.throws(()=>productPatch({cost_price_paise:null,cost_revision:null}));
  assert.equal(cogsFilters(new URLSearchParams("missing=1&limit=25&offset=0")).missing,true);
  for(const q of ["limit=0","offset=-1","missing=yes","limit=5.5"])assert.throws(()=>cogsFilters(new URLSearchParams(q)));
  assert.deepEqual(migrationSelection(["--staged-catalogue-cogs"]),{staged:true,filename:"0041_catalogue_cogs.sql",requires:"0021_catalogue_forms_api.sql"});
  assert.ok(isDashboardPath(`/stores/${sid}/cogs`));
  assert.ok(isDashboardPath(`/api/stores/${sid}/cogs/${sid}/history`));
});

test("real SKU checkout still places its order and captures an explicit zero override",async()=>{
  const f=await createSkuCheckoutFixture();
  try{
    await f.pg.exec(await readFile(new URL("../db/staged/0041_catalogue_cogs.sql",import.meta.url),"utf8"));
    const variant=f.product.variants[0];
    await f.member.withMemberStore(f.id,f.token,tx=>saveCosts(tx,f.id,f.token,{changes:[
      {product_id:f.product.id,cost_price_paise:3200,expected_revision:0},
      {product_id:f.product.id,product_option_id:variant.id,cost_price_paise:0,expected_revision:0},
    ]}));
    const input=orderInput({items:[{product_id:f.product.id,product_option_id:variant.id,quantity:1}],
      contact:{name:"Synthetic cost buyer",phone:"9000000000",email:"cost-buyer@example.test"},
      address:{line1:"12 Test Street",city:"Chennai",state:"33",pincode:"600001"},
      idempotency_key:crypto.randomUUID(),receipt_token:"e".repeat(64)});
    await f.db.withStore(f.id,tx=>placeCodOrder(tx,f.id,input,"c".repeat(64),"d".repeat(64),"direct"));
    const captured=(await f.pg.query("SELECT unit_cost_paise,cost_source,capture_reason FROM order_item_costs WHERE store_id=$1",[f.id])).rows;
    assert.equal(captured.length,1);
    assert.equal(Number(captured[0].unit_cost_paise),0);
    assert.equal(captured[0].cost_source,"override");
    assert.equal(captured[0].capture_reason,"at_order_creation");
  }finally{await f.pg.close();}
});

test("restricted COGS storage, private routes, forms and frozen order costs",async t=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true,catalogueApi:true});
  try{
    const db=annFixtureAdapter(pg),user={id:owner,name:"Example owner"};
    const pid=(await pg.query("SELECT id FROM products WHERE store_id=$1",[sid])).rows[0].id;
    const [v1,v2]=["dddddddd-dddd-4ddd-8ddd-dddddddddddd","eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"];
    await pg.query("INSERT INTO product_options(id,store_id,product_id,name,value,sku,attributes,stock,sort_order) VALUES($1,$2,$3,'Size','S','COST-S','[\"S\"]',3,0),($4,$2,$3,'Size','M','COST-M','[\"M\"]',4,1)",[v1,sid,pid,v2]);
    const member=(fn,tk=token)=>db.withMemberStore(sid,tk,fn);
    const filters=cogsFilters(new URLSearchParams());
    let response=await handleDashboard(request(`/api/stores/${sid}/cogs`),db,user,token);
    assert.equal(response.status,200);assert.equal((await response.json()).cogs.available,false);
    const early=await member(tx=>saveCosts(tx,sid,token,{changes:[{product_id:pid,cost_price_paise:1,expected_revision:0}]})).catch(e=>e);
    assert.equal(early.status,409);
    const customer=(await pg.query("INSERT INTO customers(store_id,name,phone) VALUES($1,'Synthetic customer','9000000000') RETURNING id",[sid])).rows[0].id;
    const order=(await pg.query("INSERT INTO orders(store_id,customer_id,order_number,subtotal_paise,total_paise,shipping_address) VALUES($1,$2,'COGS-TEST-1',20000,20000,'{}') RETURNING id",[sid,customer])).rows[0].id;
    const oldLine=(await pg.query("INSERT INTO order_items(store_id,order_id,product_id,title,quantity,unit_price_paise,total_paise) VALUES($1,$2,$3,'Synthetic shirt',1,10000,10000) RETURNING id",[sid,order,pid])).rows[0].id;
    await pg.exec(await readFile(new URL("../db/staged/0041_catalogue_cogs.sql",import.meta.url),"utf8"));
    const change=(amount,revision,option=null)=>({product_id:pid,product_option_id:option,cost_price_paise:amount,expected_revision:revision});
    await t.test("base, override, inheritance, zero and clearing",async()=>{
      let costs=await member(tx=>listCosts(tx,sid,token,filters));
      assert.equal(costs.items.length,3);assert.ok(costs.items.every(r=>r.effective_cost_paise===null));
      await member(tx=>saveCosts(tx,sid,token,{changes:[change(32000,0)]}));
      costs=await member(tx=>listCosts(tx,sid,token,filters));
      assert.equal(costs.items.find(r=>r.product_option_id===v1).effective_cost_paise,32000);
      assert.equal(costs.items.find(r=>r.product_option_id===v1).cost_source,"inherited");
      await member(tx=>saveCosts(tx,sid,token,{changes:[change(0,0,v1)]}));
      costs=await member(tx=>listCosts(tx,sid,token,filters));
      assert.equal(costs.items.find(r=>r.product_option_id===v1).effective_cost_paise,0);
      await member(tx=>saveCosts(tx,sid,token,{changes:[change(null,1,v1)]}));
      assert.equal((await member(tx=>listCosts(tx,sid,token,filters))).items.find(r=>r.product_option_id===v1).effective_cost_paise,32000);
      assert.deepEqual(await member(tx=>productCostFields(tx,sid,token,pid)),{cost_price_paise:32000,cost_revision:1});
      const hist=await member(tx=>costHistory(tx,sid,token,pid));
      assert.equal(hist.history.length,3);
      assert.ok(hist.history.every(r=>r.actor_name==="Example owner"));
    });
    await t.test("stale/batch failures are atomic; SQL permission denials stay 42501",async()=>{
      await assert.rejects(member(tx=>saveCosts(tx,sid,token,{changes:[change(40000,1),change(200,999,v1)]})),e=>e.status===409);
      assert.equal((await member(tx=>productCostFields(tx,sid,token,pid))).cost_price_paise,32000);
      await assert.rejects(member(tx=>saveCosts(tx,sid,token,{changes:[change(10,1),change(20,1)]})),e=>e.status===400);
      await assert.rejects(member(tx=>listCosts(tx,sid,editorToken,filters),editorToken),e=>e.status===403);
      for(const table of ["catalogue_costs","catalogue_cost_history","order_item_costs"])
        await assert.rejects(member(tx=>tx.unsafe(`SELECT * FROM public.${table}`)),e=>e.code==="42501");
      await assert.rejects(member(tx=>tx`UPDATE public.products SET cost_price_paise=7 WHERE store_id=${sid} AND id=${pid}`),e=>e.code==="42501");
      await assert.rejects(member(tx=>tx`SELECT public.catalogue_cost_list(${"ffffffff-ffff-4fff-8fff-ffffffffffff"},${token},'',false,50,0)`),e=>e.code==="42501");
    });
    await t.test("order snapshots are private and do not change with current costs",async()=>{
      await pg.query("SELECT set_config('app.store_id',$1,false)",[sid]);
      const line=(await pg.query("INSERT INTO order_items(store_id,order_id,product_id,product_option_id,title,quantity,unit_price_paise,total_paise) VALUES($1,$2,$3,$4,'Synthetic shirt S',1,10000,10000) RETURNING id",[sid,order,pid,v1])).rows[0].id;
      assert.equal((await pg.query("SELECT unit_cost_paise FROM order_item_costs WHERE order_item_id=$1",[oldLine])).rows[0].unit_cost_paise,null);
      assert.equal(Number((await pg.query("SELECT unit_cost_paise FROM order_item_costs WHERE order_item_id=$1",[line])).rows[0].unit_cost_paise),32000);
      await member(tx=>saveCosts(tx,sid,token,{changes:[change(45000,1)]}));
      assert.equal(Number((await pg.query("SELECT unit_cost_paise FROM order_item_costs WHERE order_item_id=$1",[line])).rows[0].unit_cost_paise),32000);
      assert.equal((await pg.query("SELECT capture_reason FROM order_item_costs WHERE order_item_id=$1",[oldLine])).rows[0].capture_reason,"historical_unknown");
      assert.equal((await member(tx=>loadDraft(tx,sid))).products[0].cost_price_paise,undefined);
    });
    await t.test("dashboard and Ann-embedded forms show costs only to authorised roles",async()=>{
      for(const suffix of ["", "?embed=ann"]){
        response=await handleDashboard(request(`/stores/${sid}/products/${pid}${suffix}`),db,user,token);
        assert.equal(response.status,200);const html=await response.text();
        assert.match(html,/data-cogs-cost-input/);assert.match(html,/cost_revision/);
      }
      response=await handleDashboard(request(`/stores/${sid}/products/${pid}`),db,{id:editor},editorToken);
      assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/data-cogs-cost-input/);
      response=await handleDashboard(request(`/api/stores/${sid}/cogs`),db,{id:editor},editorToken);
      assert.equal(response.status,403);
      response=await handleDashboard(new Request(origin+`/api/stores/${sid}/cogs`,{method:"POST",headers:{origin:"https://evil.invalid","content-type":"application/json"},body:'{"changes":[]}'}),db,user,token);
      assert.equal(response.status,403);
      response=await handleDashboard(request(`/api/stores/${sid}/cogs/${pid}/history`),db,user,token);
      assert.equal(response.status,200);assert.ok((await response.json()).history.length>=4);
    });
    await t.test("product-form save uses the guarded cost setter and preserves omission",async()=>{
      const before=await member(tx=>productCostFields(tx,sid,token,pid));
      await member(tx=>saveProduct(tx,sid,pid,{cost_price_paise:0,cost_revision:before.cost_revision},{tokenHash:token}));
      assert.equal((await member(tx=>productCostFields(tx,sid,token,pid))).cost_price_paise,0);
      await member(tx=>saveProduct(tx,sid,pid,{description:"A new description."},{tokenHash:token}));
      assert.equal((await member(tx=>productCostFields(tx,sid,token,pid))).cost_price_paise,0);
      const patch={cost_price_paise:500,cost_revision:before.cost_revision};
      response=await handleStoreRoutes(request(`/api/stores/${sid}/products/${pid}`,patch,"PATCH"),{},db,user,token);
      assert.equal(response.status,409);
      const current=await member(tx=>productCostFields(tx,sid,token,pid));
      response=await handleStoreRoutes(request(`/api/stores/${sid}/products/${pid}`,{cost_price_paise:null,cost_revision:current.cost_revision},"PATCH"),{},db,user,token);
      assert.equal(response.status,200);
      assert.equal((await member(tx=>productCostFields(tx,sid,token,pid))).cost_price_paise,null);
    });
  }finally{await pg.close();}
});
