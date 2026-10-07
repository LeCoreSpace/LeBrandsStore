import assert from "node:assert/strict";
import { financialYear,invoiceNumber } from "../../src/public/dashboard-rules.js";
import { inferStoreState,gstinError,defaultInvoicePrefix } from "../../src/public/commerce-rules.js";
export const STORE = "10000000-0000-4000-8000-000000000001";
export const USER = "10000000-0000-4000-8000-000000000002";
export const ORDER = "10000000-0000-4000-8000-000000000003";
export const PRODUCT = "10000000-0000-4000-8000-000000000004";
export function dashboardDb() {
  let state = {role:"owner",orders:[{id:ORDER,store_id:STORE,order_number:"STO-1001",status:"confirmed_cod",payment_method:"cod",
    created_at:"2026-01-01T00:00:00Z",customer_name:"Buyer",phone:"+919000000000",subtotal_paise:11800,total_paise:11800,
    tax_paise:1800,shipping_paise:0,shipping_address:{name:"Buyer",line1:"Street",city:"Chennai",state:"33",pincode:"600001"},
    supplier_snapshot:{legal_name:"Legal Store",address:"Supplier Street, Chennai",line1:"Supplier Street",city:"Chennai",pincode:"600001",gstin:"33ABCDE1234F1Z7",state:"33"}}],
    items:[{store_id:STORE,order_id:ORDER,product_id:PRODUCT,title:"Product",quantity:2,unit_price_paise:5900,
      total_paise:11800,taxable_paise:10000,tax_paise:1800,cgst_paise:900,sgst_paise:900,igst_paise:0,gst_rate:18,inventory_deducted:true}],
    stock:3,invoices:[],shipments:[],audit:[],sequences:{},queries:[],contextStore:STORE,clock:"2026-10-06T08:00:00Z"};
  const tx = async (strings,...v) => {
    const q = strings.join("?").replace(/\s+/g," ");
    state.queries.push(q);
    if (q.startsWith("SELECT role")) return state.role ? [{role:state.role}] : [];
    if (q.startsWith("SELECT now()")) return [{issued_at:"2026-10-06T08:00:00Z"}];
    if (q.startsWith("SELECT") && q.includes("FROM public.stores")) return [{subdomain:"store",name:"Store"}];
    if (q.startsWith("SELECT") && q.includes("FROM public.store_publications")) return [{snapshot:{settings:state.orders[0].supplier_snapshot}}];
    if (q.startsWith("SELECT") && q.includes("FROM public.orders")) {
      return state.orders.filter((o) => o.store_id === v[0] && (!v[1] || o.id === v[1])).map((o) => ({...o}));
    }
    if (q.startsWith("SELECT") && q.includes("FROM public.order_items")) return state.items.filter((i) => i.store_id === v[0] && i.order_id === v[1]);
    if (q.startsWith("SELECT") && q.includes("FROM public.invoices")) return state.invoices.filter((i) => i.store_id === v[0] && (i.order_id === v[1] || i.id === v[1]));
    if (q.startsWith("SELECT") && q.includes("FROM public.shipments")) return state.shipments.filter((i) => i.store_id === v[0] && i.order_id === v[1]);
    if (q.startsWith("SELECT") && q.includes("FROM public.audit_log")) return state.audit.filter((i) => i.store_id === v[0] && i.entity_id === v[1]);
    // Function-boundary model only, not execution of PL/pgSQL or real RLS.
    if (q.startsWith("SELECT * FROM public.issue_invoice") || q.startsWith("SELECT * FROM public.cancel_invoice")) {
      const fail = (message,code) => {throw Object.assign(new Error(message),{code});};
      const order = state.orders.find((o) => o.store_id === state.contextStore && o.id === v[0]);
      if (!state.contextStore || !order) fail("Order is not in the current store","42501");
      let invoice = state.invoices.find((i) => i.store_id === state.contextStore && i.order_id === order.id);
      if (q.includes("cancel_invoice")) {
        if (!invoice) return [];
        if (invoice.status === "cancelled") return [{...invoice,changed:false}];
        if (!["cancelled","returned","rto"].includes(order.status)) fail("Cancel or return the order first","23514");
        const fy=financialYear(state.clock),seq = state.sequences[`${state.contextStore}:${fy}`] ??= {last_number:0,last_credit_number:0};
        seq.last_credit_number++;
        Object.assign(invoice,{status:"cancelled",credit_note_number:invoiceNumber(state.invoicePrefix || defaultInvoicePrefix("Store"),fy,seq.last_credit_number,true),cancelled_at:state.clock});
        return [{...invoice,changed:true}];
      }
      if (invoice) return [{id:invoice.id,invoice_number:invoice.invoice_number}];
      if (!["shipped","delivered","returned","rto"].includes(order.status)) fail("Invoices are issued when an order is shipped","23514");
      const settings = state.publicationSettings ?? {legal_name:"Legal Store",address:"Supplier Street, Chennai",gstin:"33ABCDE1234F1Z7"};
      const supplier = state.businessSettings ? {
        legal_name:state.businessSettings.legal_name,address:state.businessSettings.address,
        line1:state.businessSettings.business_line1,city:state.businessSettings.business_city,
        pincode:state.businessSettings.business_pincode,gstin:state.businessSettings.gstin,
        state:state.businessSettings.business_state,
      } : order.supplier_snapshot ?? {legal_name:settings.legal_name || "Store",address:settings.address,gstin:settings.gstin || "",state:inferStoreState(settings)};
      if (!supplier.legal_name || !supplier.address) fail("Complete supplier details","23514");
      if (state.businessSettings && (!supplier.line1 || !supplier.city || !/^[1-9][0-9]{5}$/.test(supplier.pincode || ""))) fail("Complete registered address in Settings","23514");
      if (gstinError(supplier.gstin)) fail("A valid GSTIN is required for new invoices","23514");
      const document_type = "tax_invoice";
      const items = state.items.filter((i) => i.store_id === state.contextStore && i.order_id === order.id);
      if (document_type === "tax_invoice") {
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(supplier.gstin) || supplier.gstin.slice(0,2) !== supplier.state) fail("GST state mismatch","23514");
        const intra = supplier.state === order.shipping_address.state;
        if (items.some((i) => i.tax_paise > 0 && (intra ? i.igst_paise !== 0 : i.cgst_paise !== 0 || i.sgst_paise !== 0))) fail("Tax split mismatch","23514");
      }
      const fy = financialYear(state.clock), seq = state.sequences[`${state.contextStore}:${fy}`] ??= {last_number:0,last_credit_number:0};
      seq.last_number++;
      if (state.failInvoice) throw new Error("Simulated invoice insert failure");
      invoice = {id:crypto.randomUUID(),store_id:state.contextStore,order_id:order.id,
        invoice_number:invoiceNumber(state.invoicePrefix || defaultInvoicePrefix("Store"),fy,seq.last_number),financial_year:fy,document_type,
        subtotal_paise:order.subtotal_paise,tax_paise:document_type === "tax_invoice" ? order.tax_paise : 0,
        total_paise:order.total_paise,issued_at:state.clock,status:"issued",
        snapshot:structuredClone({supplier,customer:order.shipping_address,items:items.map(i=>({...i,uqc:"NOS"})),order_number:order.order_number,totals:order,place_of_supply:order.shipping_address.state})};
      state.invoices.push(invoice);return [{id:invoice.id,invoice_number:invoice.invoice_number}];
    }
    if (/^(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE).*public\.(invoices|invoice_sequences)\b/.test(q)) {
      throw Object.assign(new Error("Invoice tables are SELECT-only"),{code:"42501"});
    }
    if (q.startsWith("UPDATE public.orders")) {
      const clock = q.includes("stock_restored_at"), order = state.orders.find((o) => o.store_id === v[clock ? 0 : 1] && o.id === v[clock ? 1 : 2]);
      if (clock) order.stock_restored_at = "2026-10-06T08:00:00Z";
      else if (q.includes("payment_collected_at")) order.payment_collected_at = v[0];
      else order.status = v[0];
      return [];
    }
    if (q.startsWith("UPDATE public.products")) {assert.equal(v[1],STORE);assert.equal(v[2],PRODUCT);state.stock += v[0];return [];}
    if (q.startsWith("INSERT INTO public.shipments")) {
      state.shipments.push({store_id:v[0],order_id:v[1],courier:v[2],tracking_number:v[3],tracking_url:v[4],status:"shipped"});return [];
    }
    if (q.startsWith("UPDATE public.shipments")) {state.shipments.forEach((s) => {s.status = "delivered";});return [];}
    if (q.startsWith("INSERT INTO public.audit_log")) {
      state.audit.push({store_id:v[0],actor_user_id:v[1],action:v[2],entity_type:v[3],entity_id:v[4],metadata:v[5],created_at:"2026-10-06T08:00:00Z"});return [];
    }
    throw new Error(`Unhandled dashboard mock query: ${q}`);
  };
  tx.json = (value) => value;
  let tail = Promise.resolve();
  async function transaction(fn) {
    const before = tail;let release;tail = new Promise((resolve) => {release = resolve;});await before;
    const snapshot = structuredClone(state);
    try {return await fn(tx);} catch (error) {state = snapshot;throw error;} finally {release();}
  }
  return {tx,transaction,get state() {return state;}};
}
