import test from "node:test";
import assert from "node:assert/strict";
import {setupAnnFixtureDatabase,annFixtureAdapter} from "../src/ann-preview-fixture.js";
import {handleStoreRoutes} from "../src/store/routes.js";
import {validateCatalogue,variantCombinations,reconcileVariants,validateVariants} from "../src/public/catalogue-model.js";
import {renderAura} from "../src/public/aura.js";
import {storefrontPage} from "../src/store/live.js";

const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("bounded combinations preserve row identity, reject duplicates and preserve zero-option products",()=>{
  assert.deepEqual(variantCombinations([]),[]);
  const axes=[{name:"Size",values:["S","M"]},{name:"Colour",values:["Red","Blue"]}];
  assert.equal(variantCombinations(axes).length,4);
  const rows=reconcileVariants(axes,[],"TEST");
  rows[0].stock=3;
  const saved={...rows[0],id:"ffffffff-ffff-4fff-8fff-ffffffffffff"};
  assert.equal(reconcileVariants(axes,[saved],"TEST")[0].stock,3);
  assert.equal(reconcileVariants(axes,[saved],"TEST")[0].expected_stock,3);
  assert.throws(()=>validateVariants([{...rows[0],sku:"SAME"},{...rows[1],sku:"same"},...rows.slice(2)],{axes}),/different SKU/);
  assert.throws(()=>validateCatalogue({axes:[{name:"A",values:Array.from({length:50},(_,i)=>String(i))},{name:"B",values:["1","2","3","4","5"]}]}),/200/);
});
test("real tenant routes save and reload GST, SEO, collection membership and stable variant inventory",async()=>{
  const pg=await setupAnnFixtureDatabase({sampleCatalogue:true});
  try{
    const db=annFixtureAdapter(pg);
    const call=async(path,body,method="POST")=>{
      const r=await handleStoreRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/${path}`,{
        method,headers:{origin:"https://app.lebrands.store","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),
      }),{},db,{id:owner,platform_status:"active"},"a".repeat(64));
      return {status:r.status,body:await r.json()};
    };
    const collection=await call("collections",{title:"Daily care",slug:"daily-care",description:"A thoughtful skincare routine.",seo_title:"Everyday skincare",seo_description:"Explore a carefully selected daily skincare routine."});
    assert.equal(collection.status,200,JSON.stringify(collection.body));
    const id=collection.body.saved_collection_id;
    assert.ok(id);
    assert.equal(collection.body.collections.find(c=>c.id===id).seo_title,"Everyday skincare");
    assert.equal(collection.body.collections.find(c=>c.id===id).seo_description,"Explore a carefully selected daily skincare routine.");
    const axes=[{name:"Size",values:["30 ml","60 ml"]}];
    const variants=reconcileVariants(axes,[],"SERUM");
    variants[0].stock=3;variants[1].stock=7;
    const payload={title:"Daily serum",description:"A lightweight daily serum for a simple skincare routine.",slug:"daily-serum",price_paise:120000,gst_rate:18,hsn_code:"3304",stock:0,sku:"SERUM",tags:["care"],catalogue:{vendor:"Example Studio",category:"Skincare",subcategory:"Serum",axes,seo_title:"Daily serum | Example",seo_description:"A lightweight serum for everyday care."},collection_ids:[id],variants};
    const created=await call("products",payload);
    assert.equal(created.status,200,JSON.stringify(created.body));
    const product=created.body.products.find(p=>p.id===created.body.saved_product_id);
    assert.equal(product.catalogue.vendor,"Example Studio");assert.equal(product.gst_rate,18);
    assert.equal(product.stock,10);assert.equal(product.variants.length,2);
    assert.deepEqual(product.collection_ids,[id]);
    assert.equal(product.slug,"daily-serum");
    assert.equal(product.catalogue.seo_title,payload.catalogue.seo_title);
    const changed=product.variants.map(row=>({...row,stock:row.stock+1}));
    await pg.query("UPDATE public.collection_products SET sort_order=4 WHERE store_id=$1 AND collection_id=$2 AND product_id=$3",[store,id,product.id]);
    const edited=await call(`products/${product.id}`,{catalogue:payload.catalogue,variants:changed,collection_ids:[id]},"PATCH");
    assert.equal(edited.status,200,JSON.stringify(edited.body));
    const reloaded=edited.body.products.find(p=>p.id===product.id);
    assert.deepEqual(reloaded.variants.map(v=>v.id),product.variants.map(v=>v.id));
    assert.equal(reloaded.stock,12);
    assert.equal((await pg.query("SELECT sort_order FROM public.collection_products WHERE store_id=$1 AND collection_id=$2 AND product_id=$3",[store,id,product.id])).rows[0].sort_order,4);
    const stale=await call(`products/${product.id}`,{catalogue:payload.catalogue,variants:changed},"PATCH");
    assert.equal(stale.status,409);
    const foreign=await call(`products/${product.id}`,{collection_ids:["99999999-9999-4999-8999-999999999999"]},"PATCH");
    assert.equal(foreign.status,400);
    const invalidVariant=await call(`products/${product.id}`,{catalogue:payload.catalogue,variants:reloaded.variants.map((v,i)=>i? v:{...v,id:"99999999-9999-4999-8999-999999999999"})},"PATCH");
    assert.equal(invalidVariant.status,400);
    const duplicate=await call("products",{...payload,title:"Different serum",slug:"different-serum",sku:"SERUM2"});
    assert.equal(duplicate.status,400);
    const publication=await call("publish",{});
    assert.equal(publication.status,400);
    assert.match(publication.body.error,/SKU-level checkout/);
    await pg.query("UPDATE public.products SET gst_rate=28 WHERE store_id=$1 AND id=$2",[store,product.id]);
    const legacy=await call(`products/${product.id}`,{catalogue:{...payload.catalogue,vendor:"Updated maker"}},"PATCH");
    assert.equal(legacy.status,200);
    assert.equal(legacy.body.products.find(p=>p.id===product.id).gst_rate,28);
    assert.equal(legacy.body.products.find(p=>p.id===product.id).variants.length,2);
    assert.equal((await call("products",{...payload,title:"New legacy tax",slug:"new-legacy",sku:"LEGACY",gst_rate:28})).status,400);
    const listing=await call("setup",undefined,"GET");
    assert.equal(listing.status,200);
    assert.equal(listing.body.products.find(p=>p.id===product.id).variants[0].stock,4);
    assert.equal(listing.body.products.some(p=>p.slug==="different-serum"),false,"a rejected variant save must roll back its parent insertion");
  }finally{await pg.close();}
});
test("storefront uses saved SEO overrides and resolvable product and collection handles",()=>{
  const p={id:"ffffffff-ffff-4fff-8fff-ffffffffffff",slug:"daily-serum",title:"Serum",description:"Fallback serum details.",price_paise:100,images:[],catalogue:{seo_title:"Serum search title",seo_description:"A precise serum description."}};
  const collection={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",slug:"daily-care",title:"Daily care",description:"Care collection",seo_title:"Daily skincare essentials",seo_description:"A considered skincare routine.",product_ids:[p.id]};
  const data={store:{name:"Example",subdomain:"example"},settings:{brand_name:"Example"},products:[p],collections:[collection]};
  assert.equal(storefrontPage("/products/daily-serum",data).productId,p.id);
  assert.equal(storefrontPage(`/products/${p.id}`,data).productId,p.id);
  const html=renderAura(data,{page:"product",productId:p.id});
  assert.match(html,/<title>Serum search title<\/title>/);
  assert.match(html,/name="description" content="A precise serum description\."/);
  assert.match(html,/canonical" href="https:\/\/example.lebrands.store\/products\/daily-serum"/);
  assert.match(renderAura(data,{page:"collection",collectionId:collection.id}),/<title>Daily skincare essentials<\/title>/);
});
