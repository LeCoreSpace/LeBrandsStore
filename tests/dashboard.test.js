import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { allowedTransitions,transitionInput,financialYear,invoiceNumber,amountInWords,csvCell,csv,stateName,indianDate,statusLabel,dateFilters } from "../src/public/dashboard-rules.js";
import { inclusiveTax } from "../src/public/commerce-rules.js";
import { dashboardAccess,changeOrderStatus,collectPayment,issueInvoice,orderDetail,listOrders,syncPublishedProducts } from "../src/dashboard/repository.js";
import { isDashboardPath,handleDashboard } from "../src/dashboard/routes.js";
import { renderDashboard } from "../src/ui/dashboard.js";
import { renderInvoice } from "../src/ui/invoice.js";
import { renderCommerceBody } from "../src/public/commerce-view.js";
import { dashboardDb,STORE,USER,ORDER,PRODUCT } from "./helpers/dashboard-db.js";

const shipping = {status:"shipped",courier:"Manual courier",tracking_number:"TRACK-123",tracking_url:"https://courier.example/track/123"};
const change = (db,body) => db.transaction((tx) => changeOrderStatus(tx,STORE,ORDER,USER,body));

test("live catalogue sync publishes only its target, never other wizard drafts", async () => {
  const other = "90000000-0000-4000-8000-000000000001";
  const unfinished = "90000000-0000-4000-8000-000000000002";
  const products = [{id:PRODUCT,status:"draft",title:"Updated target",tags:[],price_paise:1000},
    {id:other,status:"active",title:"Not approved yet",tags:[],price_paise:2000},
    {id:unfinished,status:"draft",title:"Unfinished draft",tags:[],price_paise:0}];
  const published = [{id:PRODUCT,title:"Old target"},{id:other,title:"Previously published"}];
  let saved;
  const tx = async (parts,...values) => {
    const sql = parts.join("?").replace(/\s+/g," ").trim();
    if (sql.startsWith("SELECT status FROM public.stores")) return [{status:"live"}];
    if (sql.startsWith("UPDATE public.products SET status")) {
      assert.equal(values[1],PRODUCT);products[0].status = "active";return [];
    }
    if (sql.startsWith("SELECT snapshot FROM public.store_publications")) return [{snapshot:{products:published}}];
    if (sql.startsWith("SELECT store_id, name, subdomain")) return [{store_id:STORE,name:"Store",subdomain:"store",status:"live"}];
    if (sql.includes("FROM public.store_setup")) return [];
    if (sql.startsWith("SELECT *, to_json(tags)")) return products;
    if (sql.includes("FROM public.product_media") || sql.includes("FROM public.policy_pages")) return [];
    if (sql.startsWith("UPDATE public.store_publications")) {saved = values[0];return [];}
    throw new Error(`Unexpected test SQL: ${sql}`);
  };
  tx.json = (value) => structuredClone(value);
  await syncPublishedProducts(tx,STORE,PRODUCT,true);
  assert.equal(saved[0].title,"Updated target");
  assert.deepEqual(saved[1],published[1]);assert.equal(saved.length,2);
  assert.equal(products[2].status,"draft");
});
test("workflow allows only fulfilment and terminal transitions", () => {
  assert.deepEqual(allowedTransitions("confirmed_cod"),["packed","cancelled"]);
  for (const state of ["cancelled","returned","rto","refunded"]) assert.deepEqual(allowedTransitions(state),[]);
  assert.throws(() => transitionInput({status:"confirmed_cod"},shipping),{status:409});
  assert.throws(() => transitionInput({status:"shipped"},{status:"cancelled"}),{status:409});
  assert.throws(() => transitionInput({status:"packed"},{...shipping,tracking_url:"javascript:alert(1)"}));
  assert.throws(() => transitionInput({status:"packed"},{...shipping,courier:""}));
  assert.throws(() => transitionInput({status:"shipped"},{status:"returned",restock:"yes"}));
  assert.equal(transitionInput({status:"packed"},shipping).status,"shipped");
});
test("cancel restores exactly deducted tracked stock once, with actor audit", async () => {
  const db = dashboardDb();
  await change(db,{status:"cancelled"});
  assert.equal(db.state.stock,5);
  assert.equal(db.state.orders[0].status,"cancelled");
  assert.ok(db.state.orders[0].stock_restored_at);
  assert.equal(db.state.audit[0].actor_user_id,USER);
  await assert.rejects(change(db,{status:"cancelled"}),{status:409});
  assert.equal(db.state.stock,5);
});
test("untracked lines never fabricate stock on cancellation", async () => {
  const db = dashboardDb();db.state.items[0].inventory_deducted = false;
  await change(db,{status:"cancelled"});assert.equal(db.state.stock,3);
});
test("pack, ship and deliver issue one immutable document; COD payment is separate", async () => {
  const db = dashboardDb();
  await change(db,{status:"packed"});await change(db,shipping);
  assert.equal(db.state.invoices.length,1);
  assert.equal(db.state.invoices[0].invoice_number,"STORE/2026-27/0001");
  assert.equal(db.state.invoices[0].document_type,"tax_invoice");
  const first = structuredClone(db.state.invoices[0].snapshot);
  const same = await db.transaction((tx) => issueInvoice(tx,STORE,ORDER,USER));
  assert.equal(same.invoice_number,db.state.invoices[0].invoice_number);
  await change(db,{status:"delivered"});
  await db.transaction((tx) => collectPayment(tx,STORE,ORDER,USER,{collected_at:"2026-01-02T12:00:00+05:30"}));
  assert.equal(db.state.orders[0].payment_collected_at,"2026-01-02T06:30:00.000Z");
  assert.deepEqual(db.state.invoices[0].snapshot,first);
  await assert.rejects(db.transaction((tx) => collectPayment(tx,STORE,ORDER,USER,{collected_at:"2026-01-02T12:00:00+05:30"})),{status:409});
});
test("returned/RTO document cancellation records credit number and optional restock", async () => {
  for (const restock of [true,false]) {
    const db = dashboardDb();await change(db,{status:"packed"});await change(db,shipping);
    await change(db,{status:"rto",restock});
    assert.equal(db.state.stock,restock ? 5 : 3);
    assert.equal(db.state.invoices[0].status,"cancelled");
    assert.equal(db.state.invoices[0].credit_note_number,"STORE/CN/2026-27/0001");
    assert.equal(db.state.invoices[0].invoice_number,"STORE/2026-27/0001");
  }
});
test("failed invoice issuance rolls back shipment, status, audit and sequence without gaps", async () => {
  const db = dashboardDb();await change(db,{status:"packed"});db.state.failInvoice = true;
  await assert.rejects(change(db,shipping),/Simulated/);
  assert.equal(db.state.orders[0].status,"packed");assert.equal(db.state.shipments.length,0);
  assert.deepEqual(db.state.sequences,{});assert.equal(db.state.invoices.length,0);
  db.state.failInvoice = false;await change(db,shipping);
  assert.equal(db.state.invoices[0].invoice_number,"STORE/2026-27/0001");
});
test("parallel invoice issuance uses atomic per-store/FY UPSERT and consecutive numbers", async () => {
  const db = dashboardDb(), second = "10000000-0000-4000-8000-000000000099";
  db.state.orders[0].status = "shipped";
  db.state.orders.push({...db.state.orders[0],id:second,order_number:"STO-1002"});
  db.state.items.push({...db.state.items[0],order_id:second});
  const result = await Promise.all([ORDER,second].map((id) => db.transaction((tx) => issueInvoice(tx,STORE,id,USER))));
  assert.deepEqual(result.map((r) => r.invoice_number),["STORE/2026-27/0001","STORE/2026-27/0002"]);
  // This is a transaction model, not a live PostgreSQL concurrency claim.
  assert.equal(db.state.sequences[`${STORE}:2026-27`].last_number,2);
  assert.match(db.state.queries.find((q) => q.startsWith("INSERT INTO public.invoice_sequences")),/ON CONFLICT\(store_id,financial_year\)/);
});
test("Indian financial year boundary and document numbering do not collide across FY", () => {
  assert.equal(financialYear("2026-03-31T18:29:59Z"),"2025-26");
  assert.equal(financialYear("2026-03-31T18:30:00Z"),"2026-27");
  assert.notEqual(invoiceNumber("shop","2025-26",1),invoiceNumber("shop","2026-27",1));
  assert.equal(invoiceNumber("shop","2026-27",10000),"SHOP/2026-27/10000");
});
test("no-GSTIN receipt has no GST tax lines while preserving gross order total", async () => {
  const db = dashboardDb();db.state.orders[0].supplier_snapshot.gstin = "";
  await change(db,{status:"packed"});await change(db,shipping);
  const invoice = db.state.invoices[0], html = renderInvoice(invoice);
  assert.equal(invoice.document_type,"receipt");assert.equal(invoice.tax_paise,0);assert.equal(invoice.total_paise,11800);
  assert.match(html,/Bill of Supply \/ Order receipt/);assert.ok(!html.includes("<th>CGST</th>"));assert.ok(!html.includes("<th>GST %</th>"));
});
test("GST split, invoice contents, Indian state/date formatting and escaping", async () => {
  assert.equal(inclusiveTax(11800,18,true).cgst_paise,900);
  assert.equal(inclusiveTax(11800,18,false).igst_paise,1800);
  const db = dashboardDb();await change(db,{status:"packed"});await change(db,shipping);
  const invoice = db.state.invoices[0];
  invoice.snapshot.items[0].title = "<script>alert(1)</script>";
  const html = renderInvoice(invoice);
  assert.match(html,/Reverse charge: No/);assert.match(html,/Authorised signatory/);
  assert.match(html,/Tamil Nadu/);assert.match(html,/CGST/);assert.ok(!html.includes("<script>alert"));
  assert.equal(indianDate("2026-10-06T08:45:00Z"),"6 Oct 2026, 2:15 pm");
  assert.equal(stateName("33"),"Tamil Nadu");
  assert.equal(statusLabel("confirmed_cod"),"Confirmed · Cash on Delivery");
});
test("supplier GSTIN mismatch rejects shipment before issuing a misleading document", async () => {
  const db = dashboardDb();db.state.orders[0].supplier_snapshot.state = "27";
  await change(db,{status:"packed"});await assert.rejects(change(db,shipping),{status:409});
  assert.equal(db.state.invoices.length,0);assert.equal(db.state.orders[0].status,"packed");
});
test("amount in words supports zero, paise and Indian lakh/crore grouping", () => {
  assert.equal(amountInWords(0),"Rupees Zero Only");
  assert.equal(amountInWords(11805),"Rupees One Hundred Eighteen and Five Paise Only");
  assert.equal(amountInWords(123456789),"Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only");
  assert.match(amountInWords(1000000000),/One Crore/);
  assert.throws(() => amountInWords(-1));assert.throws(() => amountInWords(1.2));
});
test("CSV neutralises formula prefixes and whitespace bypasses; escapes quotes/newlines", () => {
  for (const value of ["=2+2","+919000000000","-2","@cmd"," \t=cmd","\tcmd","\ncmd"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('hello,"world"'),'"hello,""world"""');
  assert.ok(csv(["Name"],[["safe"]]).startsWith("\uFEFF"));
});
test("member roles reject non-members, editor fulfilment and non-owner exports", async () => {
  const db = dashboardDb();db.state.role = null;
  await assert.rejects(dashboardAccess(db.tx,STORE,USER),{status:403});
  db.state.role = "editor";await assert.rejects(dashboardAccess(db.tx,STORE,USER,true),{status:403});
  db.state.role = "admin";await assert.rejects(dashboardAccess(db.tx,STORE,USER,false,true),{status:403});
  db.state.role = "owner";assert.equal(await dashboardAccess(db.tx,STORE,USER,false,true),"owner");
});
test("date filtering rejects invalid or inverted dates and includes India timezone SQL", async () => {
  for (const from of ["2026-99-01","2026-02-30","invalid"]) assert.throws(() => dateFilters({from}),{status:400});
  assert.throws(() => dateFilters({from:"2026-10-07",to:"2026-10-06"}),{status:400});
  const db = dashboardDb();await listOrders(db.tx,STORE,{from:"2026-10-06",to:"2026-10-07"});
  assert.match(db.state.queries[0],/Asia\/Kolkata/);assert.match(db.state.queries[0],/sum\(i.quantity\)/);
});
test("order detail aggregates item tax components for dashboard breakdown", async () => {
  const db = dashboardDb(), order = await orderDetail(db.tx,STORE,ORDER);
  assert.equal(order.cgst_paise,900);assert.equal(order.sgst_paise,900);assert.equal(order.igst_paise,0);assert.equal(order.taxable_paise,10000);
  order.timeline = [{action:"order.status_changed",metadata:{from:"confirmed_cod",to:"packed"}}];
  const html = renderDashboard("order",{store:{store_id:STORE},role:"owner",order},{});
  assert.match(html,/Buyer/);assert.match(html,/Street/);assert.match(html,/Tamil Nadu/);
  assert.match(html,/Previous status: Confirmed · Cash on Delivery/);
});
test("dashboard paths cover base store and nested records without capturing wizard writes", () => {
  assert.ok(isDashboardPath(`/stores/${STORE}`));
  assert.ok(isDashboardPath(`/api/stores/${STORE}/orders/${ORDER}/status`,"POST"));
  assert.ok(!isDashboardPath(`/api/stores/${STORE}/products/${PRODUCT}`,"PATCH"));
  assert.ok(!isDashboardPath(`/stores/${STORE}/settings/checkout`));
  assert.ok(!isDashboardPath("/stores/new","POST"));
});
test("anonymous dashboard and non-member CSV requests fail before any data or exports", async (context) => {
  context.mock.method(console,"error",()=>{});
  const db = {withMemberStore:async () => {throw Object.assign(new Error("Denied"),{status:403});}};
  const anonymous = await handleDashboard(new Request(`https://app.lebrands.store/stores/${STORE}`),db,null,null);
  assert.equal(anonymous.status,401);
  const forbidden = await handleDashboard(new Request(`https://app.lebrands.store/api/stores/${STORE}/exports/orders`,{method:"POST",body:"{}"}),db,{id:USER},"a".repeat(64));
  assert.equal(forbidden.status,403);
});
test("customer confirmation shows state name, current status and private invoice link", () => {
  const html = renderCommerceBody({}, {page:"confirmation",invoiceUrl:"/orders/private/invoice",
    order:{order_number:"STO-1001",status:"shipped",created_at:"2026-10-06T08:45:00Z",shipping_address:{state:"33"},items:[],invoice:{status:"issued"}}});
  assert.match(html,/Tamil Nadu/);assert.match(html,/Shipped · Cash on Delivery/);assert.match(html,/private\/invoice/);assert.match(html,/6 Oct 2026, 2:15 pm/);
});
test("dashboard renders all empty views safely, owner navigation and real item count", () => {
  const data = {store:{store_id:STORE,name:"<script>Store</script>",subdomain:"store"},role:"owner",draft:{products:[],settings:{}},filters:{period:7}};
  for (const view of ["overview","orders","products","customers","invoices","settings"]) {
    const html = renderDashboard(view,data,{});
    assert.ok(!html.includes("<script>Store</script>"));assert.match(html,/\/assets\/dashboard.js/);
  }
  const html = renderDashboard("orders",{...data,orders:[{id:ORDER,order_number:"STO-1001",item_count:1}]},{});
  assert.match(html,/<td>1<\/td>/);
  assert.match(renderDashboard("product-new",data,{}),/data-new="true"/);
});
test("Turnstile matches storefront colour scheme and database document history is guarded", async () => {
  const js = await readFile(new URL("../src/public/commerce.js",import.meta.url),"utf8");
  assert.match(js,/theme: "auto"/);
  const sql = await readFile(new URL("../db/migrations/0007_brand_dashboard.sql",import.meta.url),"utf8");
  assert.match(sql,/protect_issued_invoice/);assert.match(sql,/REVOKE UPDATE,DELETE ON public.audit_log FROM lebrands_app/);
});
