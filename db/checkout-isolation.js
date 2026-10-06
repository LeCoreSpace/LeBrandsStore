import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { placeCodOrder, checkoutQuote } from "../src/checkout/repository.js";
import { sha256 } from "../src/auth/passwords.js";

export function checkoutIsolationChecks(getFixtures,appTransaction,denied) {
  const tables = ["checkout_settings","checkout_attempts"];
  const prepare = async (tx,a) => {
    await tx`UPDATE public.products SET stock = 5,track_inventory = true WHERE store_id = ${a.storeId}`;
    await tx`UPDATE public.store_publications SET snapshot = ${tx.json({
      products:a.productIds.map((id) => ({id,title:"RLS Test Product",price_paise:10000,gst_rate:18,hsn_code:"4202",images:[]})),
      settings:{gstin:"27ABCDE1234F1Z5"},store:{store_id:a.storeId},
    })} WHERE store_id = ${a.storeId}`;
  };
  const input = (productId) => ({
    items:[{product_id:productId,quantity:1}],contact:{name:"RLS Checkout Fixture",phone:"+919000000000",email:""},
    address:{line1:"RLS Test Address",line2:"",landmark:"",city:"Mumbai",state:"27",pincode:"400001"},
    idempotency_key:randomUUID(),receipt_token:"d".repeat(64),
  });
  return [
    ...tables.map((table) => ({name:`checkout.${table}.no-context`,reason:"Checkout metadata does not leak without tenant context.",
      fn:() => appTransaction(null,async (tx) => assert.equal((await tx`SELECT store_id FROM public.${tx(table)}`).length,0))})),
    ...tables.map((table) => ({name:`checkout.${table}.own-context`,reason:"Checkout metadata belongs only to its store.",
      fn:() => {const {a} = getFixtures();return appTransaction(a.storeId,async (tx) => {
        const rows = await tx`SELECT store_id FROM public.${tx(table)}`;
        assert.equal(rows.length,1);assert.equal(rows[0].store_id,a.storeId);
      });}})),
    ...tables.map((table) => ({name:`checkout.${table}.cross-update`,reason:"Another store's checkout configuration and abuse records cannot be changed.",
      fn:() => {const {a,b} = getFixtures();return appTransaction(a.storeId,async (tx) =>
        assert.equal((await tx`UPDATE public.${tx(table)} SET updated_at = now() WHERE store_id = ${b.storeId} RETURNING store_id`).length,0));}})),
    {name:"checkout.attempts.cross-insert",reason:"Rate-limit records cannot be inserted into another store.",
      fn:() => {const {a,b} = getFixtures();return denied(a.storeId,(tx) => tx`
        INSERT INTO public.checkout_attempts(store_id,ip_hash,purpose) VALUES(${b.storeId},${"e".repeat(64)},'checkout')`);}},
    {name:"checkout.order.own-transaction",reason:"The real COD repository creates only same-store customer, address, order and tax lines; retries do not reduce stock twice.",
      fn:() => {const {a,b} = getFixtures();return appTransaction(a.storeId,async (tx) => {
        await prepare(tx,a);
        const data = input(a.productIds[1]), hash = await sha256(JSON.stringify(data)), receipt = await sha256(`${a.storeId}:${data.receipt_token}`);
        const placed = await placeCodOrder(tx,a.storeId,data,hash,receipt,"direct");
        const replay = await placeCodOrder(tx,a.storeId,data,hash,receipt,"direct");
        assert.equal(replay.order_number,placed.order_number);assert.equal(replay.replayed,true);
        const [stock] = await tx`SELECT stock FROM public.products WHERE store_id = ${a.storeId} AND id = ${a.productIds[1]}`;
        assert.equal(stock.stock,4);
        for (const table of ["customers","customer_addresses","orders","order_items"]) {
          const rows = await tx`SELECT store_id FROM public.${tx(table)}`;
          assert.ok(rows.length > 0 && rows.every((r) => r.store_id === a.storeId));
          assert.equal((await tx`SELECT store_id FROM public.${tx(table)} WHERE store_id = ${b.storeId}`).length,0);
        }
        const [tax] = await tx`SELECT i.taxable_paise,i.cgst_paise,i.sgst_paise,i.igst_paise,i.total_paise
          FROM public.order_items i JOIN public.orders o ON o.store_id = i.store_id AND o.id = i.order_id
          WHERE o.store_id = ${a.storeId} AND o.order_number = ${placed.order_number}`;
        assert.equal(Number(tax.igst_paise),0);
        assert.equal(Number(tax.taxable_paise)+Number(tax.cgst_paise)+Number(tax.sgst_paise),Number(tax.total_paise));
      });}},
    {name:"checkout.order.cross-product",reason:"Checkout cannot price or reduce another store's product even if its UUID is supplied.",
      fn:async () => {
        const {a,b} = getFixtures();
        await appTransaction(a.storeId,async (tx) => {
          await prepare(tx,a);
          const quote = await checkoutQuote(tx,a.storeId,input(b.productIds[1]).items,"27");
          assert.equal(quote.items.length,0);assert.equal(quote.issues.length,1);
        });
        const data = input(b.productIds[1]);
        await assert.rejects(appTransaction(a.storeId,async (tx) => {
          await prepare(tx,a);
          return placeCodOrder(tx,a.storeId,data,await sha256(JSON.stringify(data)),"a".repeat(64),"direct");
        }),{status:409});
      }},
  ];
}
