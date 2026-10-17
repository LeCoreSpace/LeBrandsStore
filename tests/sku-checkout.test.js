import test from "node:test";
import assert from "node:assert/strict";
import {createSkuCheckoutFixture} from "../src/sku-checkout-fixture-data.js";
import {cartItems,quoteCart,DEFAULT_CHECKOUT_SETTINGS} from "../src/public/commerce-rules.js";
import {checkoutQuote,placeCodOrder} from "../src/checkout/repository.js";
import {restoreReservedStock} from "../src/connections/payments.js";
import {handleCheckout} from "../src/checkout/routes.js";
import {orderInput} from "../src/checkout/input.js";
import {sha256} from "../src/auth/passwords.js";
import {changeOrderStatus} from "../src/dashboard/repository.js";
import {syncPublishedProducts} from "../src/dashboard/repository.js";
const UUID=i=>`${String(i).padStart(8,"0")}-1111-4111-8111-111111111111`;
test("cart identity validates UUIDs and rejects duplicate SKU lines, not different SKUs of one product",()=>{
  assert.equal(cartItems([{product_id:UUID(1),product_option_id:UUID(2),quantity:1},{product_id:UUID(1),product_option_id:UUID(3),quantity:1}]).length,2);
  assert.throws(()=>cartItems([{product_id:UUID(1),product_option_id:UUID(2),quantity:1},{product_id:UUID(1),product_option_id:UUID(2),quantity:2}]));
  assert.throws(()=>cartItems([{product_id:UUID(1),product_option_id:"forged",quantity:1}]));
});
test("real schema SKU order, tax, idempotency, race, isolation, recovery and historical snapshots",async t=>{
  const f=await createSkuCheckoutFixture(),{pg,db,product,id}=f;
  const [black,white,soldout]=product.variants;
  const items=[{product_id:product.id,product_option_id:black.id,quantity:1},{product_id:product.id,product_option_id:white.id,quantity:1}];
  const input=rows=>orderInput({items:rows,contact:{name:"Synthetic Buyer",phone:"9000000000",email:""},
    address:{line1:"12 Test Street",line2:"",landmark:"",city:"Chennai",state:"33",pincode:"600001"},
    receipt_token:crypto.randomUUID().replaceAll("-","").repeat(2),idempotency_key:crypto.randomUUID(),payment_method:"cod"});
  const place=async value=>{
    const hash=await sha256(JSON.stringify(value)),receiptHash=await sha256(`${id}:${value.receipt_token}`);
    return db.withStore(id,tx=>placeCodOrder(tx,id,value,hash,receiptHash,"direct"));
  };
  let placed,orderId;
  try{
    await t.test("published SKU price overrides are authoritative and parent stock is not used for the selected SKU",async()=>{
      const q=await db.withStore(id,tx=>checkoutQuote(tx,id,items,"33"));
      assert.equal(q.issues.length,0);assert.equal(q.items.length,2);
      assert.deepEqual(q.items.map(i=>i.unit_price_paise),[10000,12000]);
      assert.equal(q.total_paise,22000);
      assert.equal(q.items[0].sku,black.sku);
      assert.match(q.items[0].title,/Size: S.*Colour: Black/);
      assert.equal(q.items[0].taxable_paise+q.items[0].cgst_paise+q.items[0].sgst_paise,q.items[0].line_total_paise);
      const noChoice=await db.withStore(id,tx=>checkoutQuote(tx,id,[{product_id:product.id,quantity:1}]));
      assert.match(noChoice.issues[0].message,/Choose a variant/);
      const out=await db.withStore(id,tx=>checkoutQuote(tx,id,[{product_id:product.id,product_option_id:soldout.id,quantity:1}]));
      assert.equal(out.items.length,0);assert.ok(out.issues.length);
      const foreign=await db.withStore(id,tx=>checkoutQuote(tx,id,[{product_id:product.id,product_option_id:UUID(99),quantity:1}]));
      assert.equal(foreign.items.length,0);assert.ok(foreign.issues.length);
      const wrongCombo=quoteCart([{...product,variants:[{...black,values:["M","Black"]}]}],
        [{id:product.id,status:"active",variants:[{id:black.id,stock:2,attributes:black.values}]}],[items[0]],DEFAULT_CHECKOUT_SETTINGS);
      assert.equal(wrongCombo.items.length,0);
    });
    await t.test("places both SKUs atomically, snapshots selections and replays without a second deduction",async()=>{
      const value=input(items);placed=await place(value);
      const [order]=(await pg.query("SELECT id FROM orders WHERE store_id=$1 AND order_number=$2",[id,placed.order_number])).rows;
      orderId=order.id;
      const rows=(await pg.query("SELECT product_option_id,sku,option_snapshot,title,unit_price_paise FROM order_items WHERE order_id=$1 ORDER BY unit_price_paise",[orderId])).rows;
      assert.equal(rows.length,2);assert.equal(rows[0].sku,black.sku);
      assert.deepEqual(rows[0].option_snapshot,[{name:"Size",value:"S"},{name:"Colour",value:"Black"}]);
      assert.equal(Number(rows[1].unit_price_paise),12000);
      assert.deepEqual((await pg.query("SELECT stock FROM product_options WHERE product_id=$1 ORDER BY sort_order",[product.id])).rows.map(r=>r.stock),[1,2,0,1]);
      assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[product.id])).rows[0].stock,4);
      const replay=await place(value);assert.equal(replay.replayed,true);
      assert.equal((await pg.query("SELECT count(*)::int n FROM orders WHERE store_id=$1",[id])).rows[0].n,1);
      await assert.rejects(place({...value,items:[{...items[0],quantity:2}]}),e=>e.status===409);
    });
    await t.test("server ignores forged client price and refuses base-only inserts from old Workers",async()=>{
      const response=await handleCheckout(new Request(`https://${f.data.store.subdomain}.lebrands.store/api/cart/validate`,{
        method:"POST",headers:{origin:`https://${f.data.store.subdomain}.lebrands.store`,"content-type":"application/json"},
        body:JSON.stringify({items:[{...items[1],price_paise:1,sku:"FORGED"}]}),
      }),{},db,f.data.store,f.data);
      const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.items[0].unit_price_paise,12000);
      await assert.rejects(pg.query(`INSERT INTO order_items(store_id,order_id,product_id,title,quantity,unit_price_paise,total_paise)
        VALUES($1,$2,$3,'Old worker',1,100,100)`,[id,orderId,product.id]),e=>e.code==="23514");
    });
    await t.test("cancel restores both selected SKU quantities once and updates aggregate stock",async()=>{
      await db.withStore(id,tx=>changeOrderStatus(tx,id,orderId,"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",{status:"cancelled"}));
      assert.deepEqual((await pg.query("SELECT stock FROM product_options WHERE product_id=$1 ORDER BY sort_order",[product.id])).rows.map(r=>r.stock),[2,3,0,1]);
      assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[product.id])).rows[0].stock,6);
      await db.withStore(id,async tx=>{
        const [order]=await tx`SELECT * FROM orders WHERE store_id=${id} AND id=${orderId} FOR UPDATE`;
        await restoreReservedStock(tx,id,order);
      });
      assert.equal((await pg.query("SELECT stock FROM products WHERE id=$1",[product.id])).rows[0].stock,6);
    });
    await t.test("two last-unit orders cannot oversell; failure restores only its reserved SKU",async()=>{
      const last=product.variants[3];
      const results=await Promise.allSettled([place(input([{product_id:product.id,product_option_id:last.id,quantity:1}])),
        place(input([{product_id:product.id,product_option_id:last.id,quantity:1}]))]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(results.filter(r=>r.status==="rejected"&&r.reason.status===409).length,1);
      const number=results.find(r=>r.status==="fulfilled").value.order_number;
      await db.withStore(id,async tx=>{
        const [order]=await tx`SELECT * FROM orders WHERE store_id=${id} AND order_number=${number} FOR UPDATE`;
        await restoreReservedStock(tx,id,order);
        const [fresh]=await tx`SELECT * FROM orders WHERE store_id=${id} AND id=${order.id}`;
        await restoreReservedStock(tx,id,fresh);
      });
      assert.equal((await pg.query("SELECT stock FROM product_options WHERE id=$1",[last.id])).rows[0].stock,1);
    });
    await t.test("SKU/option snapshots remain unchanged after a catalogue rename or price edit",async()=>{
      await pg.query("UPDATE product_options SET sku='RENAMED-SKU',price_paise=99999 WHERE id=$1",[black.id]);
      const row=(await pg.query("SELECT sku,option_snapshot,unit_price_paise FROM order_items WHERE order_id=$1 AND product_option_id=$2",[orderId,black.id])).rows[0];
      assert.equal(row.sku,black.sku);assert.equal(Number(row.unit_price_paise),10000);
      assert.equal(row.option_snapshot[1].value,"Black");
    });
    await t.test("operational sync freezes published SKU metadata; explicit catalogue publication refreshes it",async()=>{
      await f.member.withMemberStore(id,f.token,tx=>syncPublishedProducts(tx,id,product.id,false));
      const frozen=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot.products[0];
      assert.equal(frozen.variants.find(v=>v.id===black.id).sku,black.sku);
      assert.equal(frozen.variants.find(v=>v.id===black.id).price_paise,null);
      await f.member.withMemberStore(id,f.token,tx=>syncPublishedProducts(tx,id,product.id,true));
      const updated=(await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1",[id])).rows[0].snapshot.products[0];
      assert.equal(updated.variants.find(v=>v.id===black.id).sku,"RENAMED-SKU");
      assert.equal(updated.variants.find(v=>v.id===black.id).price_paise,99999);
    });
    await t.test("tenant mismatch returns no rows and never changes another store's inventory",async()=>{
      await pg.exec("BEGIN;SET LOCAL ROLE lebrands_app");
      await pg.query("SELECT set_config('app.store_id',$1,true)",[UUID(91)]);
      assert.equal((await pg.query("SELECT id FROM product_options WHERE id=$1",[black.id])).rows.length,0);
      assert.equal((await pg.query("UPDATE product_options SET stock=0 WHERE id=$1 RETURNING id",[black.id])).rows.length,0);
      await pg.exec("ROLLBACK");
    });
    await t.test("public checkout API preserves SKU identity through input, abuse controls and receipt lookup",async()=>{
      const {receiptOrder}=await import("../src/checkout/repository.js");
      const value=input([{product_id:product.id,product_option_id:white.id,quantity:1}]);
      value.contact.phone="9012345678";
      const host=`https://${f.data.store.subdomain}.lebrands.store`;
      const response=await handleCheckout(new Request(`${host}/api/checkout/order`,{
        method:"POST",headers:{origin:host,"content-type":"application/json","cf-connecting-ip":"203.0.113.42"},
        body:JSON.stringify({...value,turnstile_token:"isolated-fixture-test"}),
      }),{SESSION_SECRET:"isolated-sku-checkout-test-secret-not-production"},db,f.data.store,f.data,
        {verifyTurnstile:async()=>true});
      const result=await response.json();
      assert.equal(response.status,201,JSON.stringify(result));
      const confirmationHash=await sha256(`${id}:${result.receipt_url.split("/").at(-1)}`);
      const receipt=await db.withStore(id,tx=>receiptOrder(tx,id,confirmationHash));
      assert.equal(receipt.items[0].sku,white.sku);
      assert.equal(receipt.items[0].quantity,1);assert.equal(Number(receipt.items[0].unit_price_paise),12000);
      assert.match(receipt.items[0].title,/Size: S.*Colour: White/);
    });
  }finally{await pg.close();}
});
