import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gstinChecksum,gstinError,businessGSTINErrors,registeredBusinessState,inclusiveTax } from "../src/public/commerce-rules.js";
import { validateBasics,publishChecklist } from "../src/public/validation.js";
import { settingsPatch } from "../src/store/input.js";
import { renderDashboard } from "../src/ui/dashboard.js";
import { renderInvoice } from "../src/ui/invoice.js";
import { dashboardDb,STORE,ORDER,USER } from "./helpers/dashboard-db.js";
import { issueInvoice } from "../src/dashboard/repository.js";
import { checkoutContext } from "../src/checkout/repository.js";
const valid={gstin:"27AAPFU0939F1ZV",business_state:"27",address:"Registered office, Mumbai, Maharashtra"};

test("GSTIN requires the exact format and mod-36 check digit",()=>{
  assert.equal(gstinChecksum("27AAPFU0939F1Z"),"V");
  assert.equal(gstinChecksum("33ABCDE1234F1Z"),"7");
  assert.equal(gstinError(valid.gstin),"");
  for(const gstin of ["",valid.gstin.slice(0,14),`${valid.gstin}X`,"27AAPFUO939F1ZV","27AAPFU0939F1ZX","27AAPFU0939F0ZV"]) {
    assert.ok(gstinError(gstin));
  }
  assert.throws(()=>settingsPatch({gstin:"27AAPFU0939F1ZX"}),e=>!!e.errors.gstin);
  assert.equal(settingsPatch({gstin:"27aapfu0939f1zv"}).gstin,valid.gstin);
  assert.equal(settingsPatch({gstin:""}).gstin,"","Blank unfinished drafts can autosave");
});
test("registration state is independent of GSTIN and shipping/delivery state",()=>{
  assert.deepEqual(businessGSTINErrors(valid),{});
  assert.equal(registeredBusinessState({gstin:valid.gstin,address:"A registered street"}),"");
  assert.ok(businessGSTINErrors({...valid,business_state:"33",address:"Registered street"}).gstin);
  assert.ok(businessGSTINErrors({...valid,business_state:"33"}).business_state);
  assert.ok(businessGSTINErrors({...valid,business_state:"25"}).business_state);
  assert.ok(businessGSTINErrors({gstin:valid.gstin,address:"A street",store_state:"27"}).business_state);
  assert.deepEqual(businessGSTINErrors({...valid,business_state:""}),{},"Unambiguous legacy address state is verifiable");
});
test("checkout uses the registered business state for future invoice tax splits",async()=>{
  const tx = async(strings) => {
    const query = strings.join("?");
    if (query.includes("FROM public.stores")) return [{store_id:STORE,status:"live",name:"Shop",subdomain:"shop"}];
    if (query.includes("FROM public.store_publications")) return [{snapshot:{settings:valid}}];
    if (query.includes("FROM public.checkout_settings")) return [{settings:{store_state:"33"}}];
    throw new Error(`Unexpected checkout query: ${query}`);
  };
  const context=await checkoutContext(tx,STORE);
  assert.equal(context.settings.store_state,"27");
});
test("blank, wrong-checksum and wrong-state GSTIN make publishing ineligible",()=>{
  for(const settings of [
    {...valid,gstin:""},
    {...valid,gstin:"27AAPFU0939F1ZX"},
    {...valid,business_state:"33",address:"Registered street"},
  ]) {
    assert.ok(validateBasics(settings).gstin);
    assert.equal(publishChecklist({settings,store:{subdomain:"sample"},products:[],policies:[]})[0].complete,false);
  }
});
test("Settings renders required GSTIN/state controls and clear inline errors",()=>{
  const html=renderDashboard("settings",{store:{store_id:STORE},settings:{...valid,gstin:""},role:"owner"});
  assert.match(html,/data-tax-settings-form/);assert.match(html,/GSTIN \(required to publish\)/);
  assert.match(html,/name="business_state"/);assert.match(html,/data-tax-error="gstin"/);
  assert.match(html,/GSTIN is required/);
  const editor=renderDashboard("settings",{store:{store_id:STORE},settings:valid,role:"editor"});
  assert.match(editor,/<fieldset disabled>/);
});
test("zero-rate lines remain on GST invoices as Exempt, with zero tax",async()=>{
  assert.deepEqual(inclusiveTax(10000,0,true),{taxable_paise:10000,tax_paise:0,cgst_paise:0,sgst_paise:0,igst_paise:0});
  const db=dashboardDb();db.state.orders[0].status="shipped";
  Object.assign(db.state.orders[0],{subtotal_paise:11800,tax_paise:0,total_paise:11800});
  Object.assign(db.state.items[0],{gst_rate:0,taxable_paise:11800,tax_paise:0,cgst_paise:0,sgst_paise:0,igst_paise:0});
  const invoice=await db.transaction(tx=>issueInvoice(tx,STORE,ORDER,USER));
  assert.equal(invoice.document_type,"tax_invoice");assert.equal(invoice.tax_paise,0);
  const html=renderInvoice(invoice);
  assert.match(html,/<td>Exempt<\/td>/);assert.match(html,/<td>₹0\.00<\/td>/);
  assert.match(html,/GST Tax Invoice/);assert.ok(!html.includes("Bill of Supply"));
});
test("new database guard validates checksum and exempt tax on INSERT only, preserving historical documents",()=>{
  const sql=readFileSync(new URL("../db/migrations/0009_required_gstin.sql",import.meta.url),"utf8");
  assert.match(sql,/FOR v_i IN REVERSE 14\.\.1/);
  assert.match(sql,/CREATE TRIGGER validate_new_tax_invoice BEFORE INSERT/);
  assert.match(sql,/NEW\.document_type <> 'tax_invoice'/);
  assert.match(sql,/Exempt invoice lines must have zero tax/);
  assert.match(sql,/AS element\(value\)/);
  assert.ok(!/\bUPDATE public\.invoices[^;]*(snapshot|invoice_number)\s*=/.test(sql),"No financial snapshots or existing invoice serials are rewritten");
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.gstin_is_valid\(text,text\) FROM PUBLIC, lebrands_app/);
});
