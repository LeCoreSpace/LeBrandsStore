import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { listOrders,listCustomers,listInvoices,invoiceDetail,overview,exportRows,changeOrderStatus,issueInvoice } from "../src/dashboard/repository.js";
import { handleDashboard } from "../src/dashboard/routes.js";

export function dashboardIsolationChecks(getFixtures,transaction,denied) {
  const tables = ["invoices","invoice_sequences","audit_log"];
  return [
    ...tables.map((table) => ({name:`dashboard.${table}.no-context`,reason:"Seeded invoice and audit fixtures cannot be read without store context.",
      fn:() => transaction(null,async (tx) => assert.equal((await tx`SELECT store_id FROM public.${tx(table)}`).length,0))})),
    ...tables.map((table) => ({name:`dashboard.${table}.own-context`,reason:"Invoices, numbering and audit entries belong only to the authorized store.",
      fn:() => {const {a,b} = getFixtures();return transaction(a.storeId,async (tx) => {
        const rows = await tx`SELECT store_id FROM public.${tx(table)}`;
        assert.equal(rows.length,1);assert.ok(rows.every((r) => r.store_id === a.storeId));
        assert.equal((await tx`SELECT store_id FROM public.${tx(table)} WHERE store_id = ${b.storeId}`).length,0);
      });}})),
    {name:"dashboard.repositories.scoped",reason:"Real dashboard, customer, invoice and export queries never include another store's fixtures.",
      fn:() => {const {a,b} = getFixtures();return transaction(a.storeId,async (tx) => {
        const orders = await listOrders(tx,a.storeId);assert.equal(orders.length,1);assert.equal(orders[0].id,a.orderId);assert.equal(orders[0].item_count,1);
        const customers = await listCustomers(tx,a.storeId);assert.equal(customers.length,1);assert.equal(customers[0].id,a.customerId);
        const invoices = await listInvoices(tx,a.storeId);assert.equal(invoices.length,1);assert.equal(invoices[0].id,a.invoiceId);
        await assert.rejects(invoiceDetail(tx,a.storeId,b.invoiceId),{status:404});
        const stats = await overview(tx,a.storeId,7);assert.equal(stats.orders,1);
        for (const kind of ["customers","orders","products"]) {
          const output = await exportRows(tx,a.storeId,kind,{});
          assert.equal(output.rows.length,kind === "products" ? 2 : 1);
          assert.ok(!JSON.stringify(output.rows).includes(b.storeId));assert.ok(!JSON.stringify(output.rows).includes(b.productIds[0]));
        }
        assert.equal((await exportRows(tx,b.storeId,"orders",{})).rows.length,0);
      });}},
    {name:"dashboard.invoices.cross-insert",reason:"An invoice cannot attach itself to another store's order.",
      fn:() => {const {a,b} = getFixtures();return denied(a.storeId,(tx) => tx`INSERT INTO public.invoices
        (store_id,order_id,invoice_number,financial_year,subtotal_paise,total_paise)
        VALUES (${a.storeId},${b.orderId},'RLS-cross/2026-27/0001','2026-27',100,100)`);}},
    {name:"dashboard.audit.append-only",reason:"APP cannot erase or rewrite audit history, even in its own store.",
      fn:async () => {const {a} = getFixtures();
        await denied(a.storeId,(tx) => tx`DELETE FROM public.audit_log WHERE store_id = ${a.storeId}`);
        await denied(a.storeId,(tx) => tx`UPDATE public.audit_log SET action = 'erased' WHERE store_id = ${a.storeId}`);
      }},
    {name:"dashboard.actor-name.scoped",reason:"Private account names can only be resolved for a member in the same store context.",
      fn:() => {const f = getFixtures();return transaction(f.a.storeId,async (tx) => {
        const [own] = await tx`SELECT public.store_actor_name(${f.a.storeId},${f.accountUsers[0].id}) AS name`;
        assert.ok(own.name);
        const [other] = await tx`SELECT public.store_actor_name(${f.b.storeId},${f.accountUsers[1].id}) AS name`;
        assert.equal(other.name,null);
      });}},
    {name:"dashboard.non-members.denied",reason:"The real routes refuse another store's dashboard, orders, customers, products, invoices, settings and all exports before fetching data.",
      fn:async () => {const f = getFixtures(), user = f.accountUsers[0];
        const db = {withMemberStore:(id,hash,fn) => transaction(null,async (tx) => {
          const [row] = await tx`SELECT public.authorize_store_session(${hash},${id}) AS allowed`;
          if (!row.allowed) throw Object.assign(new Error("You do not have access to this store."),{status:403});
          await tx`SELECT set_config('app.store_id',${id},true)`;
          return fn(tx);
        })};
        for (const page of ["","/orders","/customers","/products","/invoices","/settings"]) {
          const response = await handleDashboard(new Request(`https://app.lebrands.store/stores/${f.b.storeId}${page}`),db,user,user.tokenHash);
          assert.equal(response.status,403);
        }
        for (const kind of ["customers","orders","products"]) {
          const response = await handleDashboard(new Request(`https://app.lebrands.store/api/stores/${f.b.storeId}/exports/${kind}`,{method:"POST",body:"{}"}),db,user,user.tokenHash);
          assert.equal(response.status,403);
        }
      }},
    {name:"dashboard.order.invoice.transaction",reason:"Real fulfilment uses consecutive per-FY invoice numbers, immutable snapshots, tax splits and one-time stock restoration; every probe rolls back.",
      fn:() => {const f = getFixtures(), a = f.a;return transaction(a.storeId,async (tx) => {
        const orderId = randomUUID();
        await tx`UPDATE public.products SET stock = 3,track_inventory = true WHERE store_id = ${a.storeId} AND id = ${a.productIds[1]}`;
        await tx`INSERT INTO public.orders(id,store_id,customer_id,order_number,status,payment_method,subtotal_paise,total_paise,shipping_address,supplier_snapshot)
          VALUES (${orderId},${a.storeId},${a.customerId},'RLS-9001','confirmed_cod','cod',10000,10000,
            ${tx.json({name:"RLS Fixture",line1:"RLS Fixture Address",city:"Mumbai",state:"27",pincode:"400001"})},
            ${tx.json({legal_name:"RLS Fixture Supplier",address:"RLS Fixture Supplier Address",gstin:"27ABCDE1234F1Z5",state:"27"})})`;
        await tx`INSERT INTO public.order_items(store_id,order_id,product_id,title,quantity,unit_price_paise,total_paise,taxable_paise,inventory_deducted)
          VALUES (${a.storeId},${orderId},${a.productIds[1]},'RLS Workflow Item',1,10000,10000,10000,true)`;
        await changeOrderStatus(tx,a.storeId,orderId,f.accountUsers[0].id,{status:"packed"});
        const shipped = await changeOrderStatus(tx,a.storeId,orderId,f.accountUsers[0].id,
          {status:"shipped",courier:"RLS Manual Courier",tracking_number:"RLS123",tracking_url:"https://example.com/rls-test"});
        assert.equal(shipped.invoice.status,"issued");assert.equal(shipped.taxable_paise,10000);
        const again = await issueInvoice(tx,a.storeId,orderId,f.accountUsers[0].id);
        assert.equal(again.id,shipped.invoice.id);
        const returned = await changeOrderStatus(tx,a.storeId,orderId,f.accountUsers[0].id,{status:"rto",restock:true});
        assert.equal(returned.invoice.status,"cancelled");assert.ok(returned.invoice.credit_note_number);
        const [stock] = await tx`SELECT stock FROM public.products WHERE store_id = ${a.storeId} AND id = ${a.productIds[1]}`;
        assert.equal(stock.stock,4);
        const [cross] = await tx`SELECT count(*)::integer AS count FROM public.invoices WHERE store_id = ${f.b.storeId}`;
        assert.equal(cross.count,0);
      });}},
    {name:"dashboard.invoice.content.immutable",reason:"Issued invoice snapshots and numbers cannot be rewritten by the application role.",
      fn:async () => {const {a} = getFixtures();
        await denied(a.storeId,(tx) => tx`UPDATE public.invoices SET invoice_number = 'rewritten' WHERE store_id = ${a.storeId}`);
        await denied(a.storeId,(tx) => tx`UPDATE public.invoices SET snapshot = '{}'::jsonb WHERE store_id = ${a.storeId}`);
      }},
    {name:"dashboard.invoice.counter.protected",reason:"APP cannot erase, move, rewind or skip invoice numbers.",
      fn:async () => {const {a} = getFixtures();
        await denied(a.storeId,(tx) => tx`DELETE FROM public.invoice_sequences WHERE store_id = ${a.storeId}`);
        await denied(a.storeId,(tx) => tx`UPDATE public.invoice_sequences SET last_number = 0 WHERE store_id = ${a.storeId}`);
        await denied(a.storeId,(tx) => tx`UPDATE public.invoice_sequences SET last_number = last_number + 2 WHERE store_id = ${a.storeId}`);
      }},
  ];
}
