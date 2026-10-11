import assert from "node:assert/strict";
import test from "node:test";
import { prepareCheckoutFixture } from "../db/checkout-isolation.js";

test("checkout preparation preserves a current-FY locked published prefix and unrelated snapshot fields", async () => {
  const old={settings:{invoice_prefix:"RLS",brand_name:"Fixture Brand",theme:"aura"},
    store:{store_id:"fixture-id",status:"live"},policies:[{kind:"privacy"}],fixture:"marked"};
  let result;
  const tx=async(strings,...values)=>{
    const q=strings.join("?");
    if(q.startsWith("SELECT snapshot"))return[{snapshot:structuredClone(old)}];
    if(q.startsWith("UPDATE public.store_publications")){
      result=values[0];
      if(result.settings.invoice_prefix!==old.settings.invoice_prefix)
        throw Object.assign(new Error("Invoice prefix is locked until the next Indian financial year"),{code:"42501"});
    }
    return[];
  };
  tx.json=value=>value;
  await prepareCheckoutFixture(tx,{storeId:"fixture-id",productIds:["fixture-product"]});
  assert.equal(result.settings.invoice_prefix,"RLS");
  assert.equal(result.settings.brand_name,old.settings.brand_name);
  assert.equal(result.store.status,"live");
  assert.deepEqual(result.policies,old.policies);
  assert.equal(result.fixture,"marked");
  assert.equal(result.products[0].id,"fixture-product");
  assert.equal(old.settings.gstin,undefined,"No mutation of the previous snapshot");
});
