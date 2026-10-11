import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import preview from "../src/preview.js";
import {exampleFixture,exampleInvoice,EXAMPLE_STORE_ID} from "../src/local-example-fixture.js";

function env(){
  const result={ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;
    return new Response(path.endsWith(".js")?await readFile("src/public"+path,"utf8"):"local test asset");
  }}};
  for(const key of ["SUPABASE_DB_URL","SUPABASE_APP_DB_URL","GSTIN_KEY","GSTIN_API_KEY"])
    Object.defineProperty(result,key,{get(){throw new Error("Local demo must never access DB/provider credentials");}});
  return result;
}

test("example seed has six apparel products, reviewed policies and 12 fictional orders over seven days",()=>{
  const data=exampleFixture();
  assert.equal(data.products.length,6);assert.equal(data.policies.length,6);
  assert.ok(data.policies.every(p=>p.reviewed&&p.body.length>30));
  assert.ok(data.products.every(p=>p.price_paise>=129000&&p.price_paise<=349000));
  assert.equal(data.orders.length,12);
  assert.equal(new Set(data.orders.map(o=>o.created_at.slice(0,10))).size,7);
  assert.ok(data.orders.some(o=>o.cgst_paise>0&&o.sgst_paise>0&&o.igst_paise===0));
  assert.ok(data.orders.some(o=>o.igst_paise>0&&o.cgst_paise===0&&o.sgst_paise===0));
  assert.ok(data.orders.some(o=>o.payment_collected_at));
  assert.equal(data.overview.revenue_paise,data.orders.reduce((sum,o)=>sum+o.total_paise,0));
  assert.notEqual(exampleFixture().products,data.products,"Fresh data on every render, no persistent mutations");
});

test("example invoice is the interstate demo order with the current shortened FY number format",()=>{
  const data=exampleFixture(),invoice=exampleInvoice(data);
  assert.equal(invoice.invoice_number,"EXMP/26-27/0001");
  assert.equal(invoice.snapshot.supplier.legal_name,"Example Studio");
  assert.equal(invoice.snapshot.supplier.gstin,"33AAAAA0000A1Z0");
  assert.equal(invoice.snapshot.supplier.state,"33");
  assert.equal(invoice.snapshot.customer.state,"27");
  assert.equal(invoice.snapshot.order_number,data.orders[0].order_number);
  assert.equal(invoice.total_paise,data.orders[0].total_paise);
  assert.ok(invoice.snapshot.items[0].igst_paise>0);
});

test("all example screens render actual UI locally without DB or provider access",async()=>{
  for(const view of ["store","checkout","dashboard","invoice","wizard","composite"]){
    const response=await preview.fetch(new Request("https://local.example/__example-preview/"+view),env(),{});
    assert.equal(response.status,200);
    const html=await response.text();
    if(view!=="composite")assert.match(html,/Example store\. Fictional brand/);
    assert.doesNotMatch(html,/https:\/\/media\.lebrands\.store\/stores\/00000000/);
    if(view==="invoice")assert.match(html,/content:"SAMPLE"/);
    if(view==="wizard")assert.match(html,/data-visual-only="true"/);
  }
});

test("example mutations are forbidden; cart quote is a pure local computation",async()=>{
  const referer="https://local.example/__example-preview/checkout",local=env();
  for(const path of [`/api/stores/${EXAMPLE_STORE_ID}/setup`,`/api/stores/${EXAMPLE_STORE_ID}/publish`,"/api/checkout/order","/__example-preview/store"]){
    const response=await preview.fetch(new Request("https://local.example"+path,{method:"POST",headers:{referer}}),local,{});
    assert.ok([403,405].includes(response.status));
  }
  const response=await preview.fetch(new Request("https://local.example/api/cart/validate",{method:"POST",headers:{referer,"content-type":"application/json"},
    body:JSON.stringify({items:[{product_id:exampleFixture().products[0].id,quantity:1}],state:"27"})}),local,{});
  const quote=await response.json();
  assert.equal(response.status,200);assert.equal(quote.total_paise,129000);
  assert.equal(quote.issues.length,0);assert.ok(quote.items[0].igst_paise>0);
  assert.match(quote.items[0].image_url,/^\/__example-media\//);
});

test("local media adapters retain the real renderer/client and accept only approved demo image paths",async()=>{
  const response=await preview.fetch(new Request("https://local.example/__example-module/aura.js"),env(),{});
  const source=await response.text();
  assert.match(source,/const safeImage = \(url\) => \/\^\\\/__example-media/);
  assert.match(source,/from "\/assets\/validation.js"/);
  assert.match(source,/export function renderAura/);
  assert.equal((await preview.fetch(new Request("https://local.example/__example-media/private.sql"),env(),{})).status,404);
});
