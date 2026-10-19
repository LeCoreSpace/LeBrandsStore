import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createSkuCheckoutFixture} from "../src/sku-checkout-fixture-data.js";
import {offerInput,applyBestOffer,allocateDiscount} from "../src/offers/rules.js";
import {saveOffer,readOffers} from "../src/offers/repository.js";
import {checkoutQuote,placeCodOrder,receiptOrder} from "../src/checkout/repository.js";
import {sha256} from "../src/auth/passwords.js";
import {migrationSelection} from "../db/migration-selection.js";
import {handleCheckout} from "../src/checkout/routes.js";
const base={title:"Weekend",method:"code",code:"SAVE10",scope:"order",kind:"percentage",value:1000,
  min_spend_paise:0,min_quantity:1,max_discount_paise:null,starts_at:null,ends_at:null,usage_limit:2,status:"active",target_ids:[]};
test("integer allocations conserve paise and offer validation rejects unsupported activation",()=>{
  assert.equal(migrationSelection(["--staged-store-offers"]).filename,"0044_store_offers.sql");
  const lines=[{product_id:"a",line_total_paise:101},{product_id:"b",line_total_paise:102}];
  assert.equal(allocateDiscount(lines,101).reduce((n,l)=>n+l.amount,0),101);
  assert.throws(()=>offerInput({...base,kind:"bundle"}));
  assert.throws(()=>offerInput({...base,value:10001}));
  assert.equal(offerInput({...base,code:" save10 "}).code,"SAVE10");
  const quote={items:lines.map(l=>({...l,quantity:1,gst_rate:5,tax_paise:0})),subtotal_paise:203,
    total_paise:203,settings:{store_state:"33",delivery_mode:"free",cod_enabled:true,cod_max_paise:190},issues:[]};
  const out=applyBestOffer(quote,[{...base,id:"1",used_count:0,code:"SAVE10"}],{},{code:"SAVE10",state:"33"});
  assert.equal(out.discount_paise,20);assert.equal(out.total_paise,183);
  assert.equal(out.cod_available,true);
  assert.equal(out.items.reduce((n,l)=>n+l.discount_paise,0),20);
  const snapshot={collections:[{id:"collection",product_ids:["a"]}]};
  const product=applyBestOffer(quote,[{...base,id:"2",method:"automatic",scope:"collection",target_ids:["collection"],value:5000}],snapshot,{state:"33"});
  assert.equal(product.discount_paise,50);assert.equal(product.items[1].discount_paise,0);
  const expired=applyBestOffer(quote,[{...base,id:"3",method:"automatic",ends_at:"2000-01-01T00:00:00Z"}],{});
  assert.equal(expired.discount_paise,0);
  assert.equal(expired.cod_available,false);
  const shipping={...quote,total_paise:203,settings:{...quote.settings,delivery_mode:"free_above",free_above_paise:200,flat_paise:50}};
  const worse=applyBestOffer(shipping,[{...base,id:"4",method:"automatic",value:1000}],{});
  assert.equal(worse.discount_paise,0,"An automatic discount must not increase the final payable total");
});
test("real schema offers: tenant, role, revisions, checkout snapshots and usage",async t=>{
  const f=await createSkuCheckoutFixture(),{pg,db,id,token,data,product}=f;
  try{
    await pg.exec(await readFile(new URL("../db/staged/0044_store_offers.sql",import.meta.url),"utf8"));
    let offer;
    await t.test("owner saves normalised code; duplicate code and stale updates fail",async()=>{
      offer=await db.withStore(id,tx=>saveOffer(tx,id,token,base));
      let rows=await db.withStore(id,tx=>readOffers(tx,id));
      assert.equal(rows[0].code,"SAVE10");assert.equal(rows[0].value,1000);
      await assert.rejects(db.withStore(id,tx=>saveOffer(tx,id,token,base)),e=>e.status===409);
      await assert.rejects(db.withStore(id,tx=>saveOffer(tx,id,token,{...base,id:offer,expected_revision:99})),e=>e.status===409);
    });
    const variant=product.variants.find(v=>v.stock===3),items=[{product_id:product.id,product_option_id:variant.id,quantity:1}];
    await t.test("quote applies published SKU price and discounted tax",async()=>{
      const quote=await db.withStore(id,tx=>checkoutQuote(tx,id,items,"33","SAVE10"));
      assert.equal(quote.subtotal_paise,12000);assert.equal(quote.discount_paise,1200);
      assert.equal(quote.total_paise,10800);assert.equal(quote.tax_paise,514);
      assert.equal(quote.items[0].cgst_paise+quote.items[0].sgst_paise,quote.items[0].tax_paise);
      await assert.rejects(db.withStore(id,tx=>checkoutQuote(tx,id,items,"33","BAD")),e=>e.status===400);
      const rejected=await db.withStore(id,tx=>checkoutQuote(tx,id,items,"33","BAD",{allowCodeError:true}));
      assert.match(rejected.offer_error,/not active/);
      assert.equal(rejected.items.length,1);assert.equal(rejected.total_paise,12000);
      assert.equal(rejected.discount_paise,0);assert.equal(rejected.offer,null);
      const origin="https://fixture.lebrands.store";
      for(const code of ["BAD","INVALID_CODE"]){
        const response=await handleCheckout(new Request(`${origin}/api/cart/validate`,{method:"POST",
          headers:{"content-type":"application/json",origin},body:JSON.stringify({items,state:"33",code})}),
          {SESSION_SECRET:"synthetic-offer-check-secret-for-tests-only"},db,{store_id:id},f.data);
        assert.equal(response.status,200);
        const result=await response.json();
        assert.ok(result.offer_error);assert.equal(result.items.length,1);assert.equal(result.total_paise,12000);
      }
    });
    await t.test("order saves discount allocations once and retains historical evidence",async()=>{
      const input={items,contact:{name:"Offer Test",phone:"+919876540000",email:""},address:{line1:"Test road",line2:"",landmark:"",city:"Chennai",state:"33",pincode:"600001"},
        code:"SAVE10",idempotency_key:crypto.randomUUID(),receipt_token:"e".repeat(64)};
      const hash=await sha256(JSON.stringify(input)),receipt=await sha256(`${id}:${input.receipt_token}`);
      const place=()=>db.withStore(id,tx=>placeCodOrder(tx,id,input,hash,receipt,"direct",{}));
      const order=await place();assert.equal(order.total_paise,10800);
      assert.equal((await place()).replayed,true);
      const saved=await db.withStore(id,tx=>receiptOrder(tx,id,receipt));
      assert.equal(Number(saved.discount_paise),1200);
      const usage=await pg.query("SELECT * FROM offer_redemptions WHERE offer_id=$1",[offer]);
      assert.equal(usage.rows.length,1);assert.equal(usage.rows[0].state,"committed");
      assert.equal((await pg.query("SELECT sum(amount_paise)::int AS n FROM order_item_discounts")).rows[0].n,1200);
      const line=(await pg.query("SELECT discount_paise,total_paise,taxable_paise,tax_paise FROM order_items WHERE order_id=$1",[saved.id])).rows[0];
      assert.equal(Number(line.discount_paise),1200);
      assert.equal(Number(line.total_paise)-Number(line.discount_paise),Number(line.taxable_paise)+Number(line.tax_paise));
      await db.withStore(id,tx=>saveOffer(tx,id,token,{...base,id:offer,expected_revision:1,value:2000,status:"paused"}));
      const snap=(await pg.query("SELECT snapshot FROM order_discounts")).rows[0].snapshot;
      assert.equal(snap.value,1000);assert.equal(snap.amount_paise,1200);
    });
    await t.test("wrong tenant and non-admin cannot mutate offer configuration",async()=>{
      await assert.rejects(db.withStore("cccccccc-cccc-4ccc-8ccc-cccccccccccc",tx=>saveOffer(tx,"cccccccc-cccc-4ccc-8ccc-cccccccccccc",token,base)),e=>e.code==="42501");
      await pg.query("UPDATE store_members SET role='editor' WHERE store_id=$1",[id]);
      await assert.rejects(db.withStore(id,tx=>saveOffer(tx,id,token,{...base,code:"STAFF"})),e=>e.code==="42501");
      assert.deepEqual(await db.withStore("cccccccc-cccc-4ccc-8ccc-cccccccccccc",tx=>readOffers(tx,"cccccccc-cccc-4ccc-8ccc-cccccccccccc")),[]);
      await pg.query("UPDATE store_members SET role='owner' WHERE store_id=$1",[id]);
      // Direct APP table writes are denied even inside the correct tenant.
      await assert.rejects(db.withStore(id,tx=>tx`UPDATE public.offers SET value=1 WHERE store_id=${id}`),e=>e.code==="42501");
    });
    await t.test("the last redemption cannot be consumed twice and failed checkout rolls back",async()=>{
      const capped=await db.withStore(id,tx=>saveOffer(tx,id,token,{...base,code:"LASTONE",kind:"fixed",value:1000,usage_limit:1}));
      const make=async phone=>{
        const input={items,contact:{name:"Limit Test",phone,email:""},address:{line1:"Test road",line2:"",landmark:"",city:"Chennai",state:"33",pincode:"600001"},
          code:"LASTONE",idempotency_key:crypto.randomUUID(),receipt_token:crypto.randomUUID().replaceAll("-","").repeat(2)};
        const hash=await sha256(JSON.stringify(input)),receipt=await sha256(`${id}:${input.receipt_token}`);
        return db.withStore(id,tx=>placeCodOrder(tx,id,input,hash,receipt,"direct",{}));
      };
      const results=await Promise.allSettled([make("+919876540001"),make("+919876540002")]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal((await pg.query("SELECT count(*)::int n FROM offer_redemptions WHERE offer_id=$1",[capped])).rows[0].n,1);
      assert.equal((await pg.query("SELECT stock FROM product_options WHERE id=$1",[variant.id])).rows[0].stock,1);
    });
    await t.test("pending payment holds release on cancellation; committed uses remain consumed",async()=>{
      const [r]=(await pg.query("SELECT * FROM offer_redemptions ORDER BY created_at DESC LIMIT 1")).rows;
      await pg.query("UPDATE offer_redemptions SET state='held' WHERE id=$1",[r.id]);
      await pg.query("UPDATE orders SET status='cancelled' WHERE id=$1",[r.order_id]);
      assert.equal((await pg.query("SELECT state FROM offer_redemptions WHERE id=$1",[r.id])).rows[0].state,"released");
      const existing=(await pg.query("SELECT * FROM offer_redemptions WHERE state='committed' LIMIT 1")).rows[0];
      await pg.query("UPDATE orders SET status='cancelled' WHERE id=$1",[existing.order_id]);
      assert.equal((await pg.query("SELECT state FROM offer_redemptions WHERE id=$1",[existing.id])).rows[0].state,"committed");
      await assert.rejects(pg.query("INSERT INTO offers(store_id,title,method,scope,kind,status,value) VALUES($1,'Future','automatic','order','bundle','active',100)",[id]),e=>e.code==="23514");
    });
  }finally{await pg.close();}
});
