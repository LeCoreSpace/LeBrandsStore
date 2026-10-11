import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {defaultInvoicePrefix,validInvoicePrefix,formatPhone,registeredSupplierErrors} from "../src/public/commerce-rules.js";
import {invoiceNumber,financialYear,timelineSentence} from "../src/public/dashboard-rules.js";
import {settingsPatch} from "../src/store/input.js";
import {renderDashboard,orderActionForm} from "../src/ui/dashboard.js";
import {renderInvoice} from "../src/ui/invoice.js";
import {dashboardDb,STORE,ORDER,USER} from "./helpers/dashboard-db.js";
import {issueInvoice} from "../src/dashboard/repository.js";

test("brand-derived prefixes validate 1–4 uppercase alphanumerics",()=>{
  assert.equal(defaultInvoicePrefix("STONESCENCE"),"STN");
  assert.equal(defaultInvoicePrefix("Store"),"STR");assert.equal(defaultInvoicePrefix(""),"STO");
  assert.equal(defaultInvoicePrefix("AEIOU"),"AEI");
  for(const prefix of ["STN","A","1234"]) assert.ok(validInvoicePrefix(prefix));
  for(const prefix of ["","ABCDE","stn","A/B","A-1"]) {
    assert.ok(!validInvoicePrefix(prefix));assert.throws(()=>settingsPatch({invoice_prefix:prefix}));
  }
});
test("invoice and independent credit series use short FY and reject >16 characters",()=>{
  assert.equal(invoiceNumber("STN","2026-27",1),"STN/26-27/0001");
  assert.equal(invoiceNumber("STN","2026-27",1,true),"STNC/26-27/0001");
  assert.equal(invoiceNumber("ABCD","2026-27",99999).length,16);
  assert.equal(invoiceNumber("ABCD","2026-27",9999,true).length,16);
  assert.throws(()=>invoiceNumber("ABCD","2026-27",10000,true),/16 characters/);
  assert.throws(()=>invoiceNumber("ABCD","2026-27",100000),/16 characters/);
  assert.throws(()=>invoiceNumber("ABCD","2026-27",0));
});
test("Indian FY rolls over at midnight IST on April 1",()=>{
  assert.equal(financialYear("2027-03-31T18:29:59Z"),"2026-27");
  assert.equal(financialYear("2027-03-31T18:30:00Z"),"2027-28");
  assert.equal(invoiceNumber("STN",financialYear("2027-03-31T18:30:00Z"),1),"STN/27-28/0001");
});
test("structured supplier validation requires legal name, street, city, PIN and valid registered GSTIN",()=>{
  const valid={legal_name:"Example Pvt Ltd",business_line1:"1 Example Road",business_city:"Mumbai",business_state:"27",business_pincode:"400001",gstin:"27AAPFU0939F1ZV"};
  assert.deepEqual(registeredSupplierErrors(valid),{});
  for(const key of ["legal_name","business_line1","business_city","business_pincode","gstin"]) {
    assert.ok(registeredSupplierErrors({...valid,[key]:""})[key]);
  }
  assert.ok(registeredSupplierErrors({...valid,business_pincode:"000000"}).business_pincode);
  assert.match(settingsPatch(valid).address,/Maharashtra 400001/);
});
test("phones display grouped while settings persist E.164",()=>{
  assert.equal(formatPhone("+918111006300"),"+91 81110 06300");
  assert.equal(formatPhone("8111006300"),"+91 81110 06300");
  assert.equal(settingsPatch({support_phone:"+91 81110 06300"}).support_phone,"+918111006300");
});
test("timeline sentences omit raw keys, duplicate statuses and false/empty metadata",()=>{
  assert.equal(timelineSentence({action:"order.created",metadata:{payment_method:"cod"}}),"Order placed · Cash on Delivery");
  assert.equal(timelineSentence({action:"order.status_changed",metadata:{from:"confirmed_cod",to:"packed",restock:false}}),"Marked as packed");
  assert.equal(timelineSentence({action:"order.status_changed",metadata:{to:"shipped",courier:"Bluedart",tracking_number:"4564354",restock:false}}),"Shipped via Bluedart · tracking 4564354");
  assert.equal(timelineSentence({action:"invoice.issued",metadata:{invoice_number:"STN/26-27/0001",document_type:"tax_invoice"}}),"Tax invoice STN/26-27/0001 issued");
  assert.equal(timelineSentence({action:"order.payment_collected"}),"Payment collected");
  assert.equal(timelineSentence({action:"order.status_changed",metadata:{to:"delivered"}}),"Delivered");
});
test("action forms expose only possible status fields, default restock visibility and terminal omission",()=>{
  const packed=orderActionForm(STORE,ORDER,["shipped","cancelled"]);
  assert.match(packed,/data-action-fields="shipping" >/);
  assert.match(packed,/data-action-fields="restock" hidden/);
  const confirmed=orderActionForm(STORE,ORDER,["packed","cancelled"]);
  assert.ok(!confirmed.includes('name="courier"'));
  const returned=orderActionForm(STORE,ORDER,["returned","rto"]);
  assert.ok(!returned.includes('name="courier"'));assert.match(returned,/data-action-fields="restock" >/);
  const html=renderDashboard("order",{store:{store_id:STORE},role:"owner",order:{id:ORDER,status:"cancelled",timeline:[]}});
  assert.ok(!html.includes("data-order-form"));assert.match(html,/No timeline events recorded\./);
});
test("invoices show separate rates, NOS, complete supplier, optional safe signature and formatted phone",async()=>{
  const db=dashboardDb();db.state.orders[0].status="shipped";
  const invoice=await db.transaction(tx=>issueInvoice(tx,STORE,ORDER,USER));
  assert.equal(invoice.snapshot.items[0].uqc,"NOS");
  invoice.snapshot.supplier.signature_url=`https://media.lebrands.store/stores/${STORE}/${ORDER}.png`;
  invoice.snapshot.customer.phone="+918111006300";
  const intra=renderInvoice(invoice);
  assert.match(intra,/Invoice No\./);assert.match(intra,/<th>CGST %<\/th>/);assert.match(intra,/<td>9%<\/td>/);
  assert.match(intra,/2 NOS/);assert.match(intra,/alt="Authorised signature"/);assert.match(intra,/\+91 81110 06300/);
  invoice.snapshot.customer.state="27";
  const inter=renderInvoice(invoice);assert.match(inter,/<th>IGST %<\/th>/);assert.match(inter,/<td>18%<\/td>/);
  assert.ok(!inter.includes("<th>CGST %</th>"));
});
test("incomplete current Settings block issuance without allocating a serial; repairs permit a frozen invoice",async()=>{
  const db=dashboardDb();db.state.orders[0].status="shipped";
  db.state.businessSettings={legal_name:"Legal Store",address:"Registered Street",business_city:"Chennai",business_pincode:"600001",business_state:"33",gstin:"33ABCDE1234F1Z7"};
  await assert.rejects(db.transaction(tx=>issueInvoice(tx,STORE,ORDER,USER)),{status:409});
  assert.equal(db.state.invoices.length,0);assert.deepEqual(db.state.sequences,{});
  db.state.businessSettings.business_line1="Registered Street";
  const invoice=await db.transaction(tx=>issueInvoice(tx,STORE,ORDER,USER));
  assert.equal(invoice.snapshot.supplier.line1,"Registered Street");
  db.state.businessSettings.business_line1="New address";
  assert.equal((await db.transaction(tx=>issueInvoice(tx,STORE,ORDER,USER))).snapshot.supplier.line1,"Registered Street");
});
test("overview attention rows use customer identity and Settings expose short prefix and signature controls",()=>{
  const html=renderDashboard("overview",{store:{store_id:STORE},overview:{needing_action:[{id:ORDER,customer_name:"Ananya",status:"packed"}]}});
  assert.match(html,/Ananya/);
  const settings=renderDashboard("settings",{store:{store_id:STORE,name:"Stonescence"},role:"owner",draft:{settings:{},invoice_prefix_locked:true}});
  assert.match(settings,/name="invoice_prefix" maxlength="4" value="STN" readonly/);
  assert.match(settings,/data-signature-upload/);assert.match(settings,/name="business_line1"/);
});
test("migration preserves 0008 privilege boundary and adds DB prefix locks, complete suppliers and NOS",()=>{
  const sql=readFileSync(new URL("../db/migrations/0009_required_gstin.sql",import.meta.url),"utf8");
  assert.match(sql,/CREATE TRIGGER guard_invoice_prefix BEFORE UPDATE OF settings/);
  assert.match(sql,/CREATE TRIGGER guard_invoice_prefix_delete BEFORE DELETE/);
  assert.match(sql,/Invoice prefix is locked[\s\S]*?ERRCODE = 'insufficient_privilege'/);
  assert.match(sql,/length\(v_number\) > 16[\s\S]*?ERRCODE = 'check_violation'/);
  assert.match(sql,/jsonb_build_object\('uqc','NOS'\)/);
  for(const name of ["issue_invoice","cancel_invoice"]) {
    assert.match(sql,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?SECURITY DEFINER SET search_path = pg_catalog,public`));
  }
  assert.ok(!/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]*?\bON TABLE\b/i.test(sql));
  assert.ok(!/CREATE POLICY|DROP POLICY|DISABLE ROW LEVEL SECURITY/.test(sql));
});
test("financial numbering reads published settings and republish guards cover upserts, removal and deletion",()=>{
  const sql=readFileSync(new URL("../db/migrations/0009_required_gstin.sql",import.meta.url),"utf8");
  for (const name of ["issue_invoice","cancel_invoice"]) {
    const body=sql.split(`CREATE OR REPLACE FUNCTION public.${name}`)[1].split("END $$;")[0];
    assert.match(body,/SELECT p\.snapshot->'settings' INTO v_settings FROM public\.store_publications p\s+WHERE p\.store_id = v_store_id FOR UPDATE/);
    assert.doesNotMatch(body,/SELECT st\.settings INTO v_settings/);
    assert.doesNotMatch(body,/UPDATE public\.store_setup/);
    assert.match(body,/v_prefix := COALESCE\(v_settings->>'invoice_prefix'/);
  }
  const guard=sql.split("CREATE FUNCTION public.guard_invoice_prefix()")[1].split("END $$;")[0];
  assert.match(guard,/TG_TABLE_NAME = 'store_publications'/);
  assert.match(guard,/v_old_settings := COALESCE\(OLD\.snapshot->'settings'/);
  assert.match(guard,/v_new_settings := COALESCE\(NEW\.snapshot->'settings'/);
  assert.match(guard,/v_existing_published := FOUND/);
  assert.match(guard,/AND NOT v_existing_published/);
  assert.match(guard,/v_old_settings->>'invoice_prefix' IS NOT NULL AND v_new_settings->>'invoice_prefix' IS NULL/);
  assert.match(guard,/i\.credit_note_number IS NOT NULL AND i\.cancelled_at >= v_boundary/);
  for (const raise of guard.matchAll(/RAISE EXCEPTION[\s\S]*?USING ERRCODE = '([^']+)'/g)) {
    assert.equal(raise[1],"insufficient_privilege","Every prefix guard denial must be SQLSTATE 42501");
  }
  assert.match(sql,/CREATE TRIGGER guard_published_invoice_prefix BEFORE INSERT OR UPDATE OF snapshot/);
  assert.match(sql,/CREATE TRIGGER guard_published_invoice_prefix_delete BEFORE DELETE ON public\.store_publications/);
  assert.match(sql,/Pin the published default independently of any unpublished draft changes/);
  const probes=readFileSync(new URL("../db/dashboard-isolation.js",import.meta.url),"utf8");
  assert.match(probes,/dashboard\.prefix\.republish-draft-denied/);
  assert.match(probes,/dashboard\.prefix\.republish-unchanged-allowed/);
});
