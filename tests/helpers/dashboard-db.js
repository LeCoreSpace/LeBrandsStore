import assert from "node:assert/strict";
export const STORE = "10000000-0000-4000-8000-000000000001";
export const USER = "10000000-0000-4000-8000-000000000002";
export const ORDER = "10000000-0000-4000-8000-000000000003";
export const PRODUCT = "10000000-0000-4000-8000-000000000004";
export function dashboardDb() {
  let state = {role:"owner",orders:[{id:ORDER,store_id:STORE,order_number:"STO-1001",status:"confirmed_cod",payment_method:"cod",
    created_at:"2026-01-01T00:00:00Z",customer_name:"Buyer",phone:"+919000000000",subtotal_paise:11800,total_paise:11800,
    tax_paise:1800,shipping_paise:0,shipping_address:{name:"Buyer",line1:"Street",city:"Chennai",state:"33",pincode:"600001"},
    supplier_snapshot:{legal_name:"Legal Store",address:"Supplier Street, Chennai",gstin:"33ABCDE1234F1Z5",state:"33"}}],
    items:[{store_id:STORE,order_id:ORDER,product_id:PRODUCT,title:"Product",quantity:2,unit_price_paise:5900,
      total_paise:11800,taxable_paise:10000,tax_paise:1800,cgst_paise:900,sgst_paise:900,igst_paise:0,gst_rate:18,inventory_deducted:true}],
    stock:3,invoices:[],shipments:[],audit:[],sequences:{},queries:[]};
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
    if (q.startsWith("INSERT INTO public.invoice_sequences")) {
      assert.match(q,/ON CONFLICT\(store_id,financial_year\) DO UPDATE SET last_number = public.invoice_sequences.last_number \+ 1 RETURNING last_number/);
      const seq = state.sequences[`${v[0]}:${v[1]}`] ??= {last_number:0,last_credit_number:0};
      seq.last_number++;return [{...seq}];
    }
    if (q.startsWith("INSERT INTO public.invoices")) {
      if (state.failInvoice) throw new Error("Simulated invoice insert failure");
      const invoice = {id:crypto.randomUUID(),store_id:v[0],order_id:v[1],invoice_number:v[2],financial_year:v[3],
        document_type:v[4],subtotal_paise:v[5],tax_paise:v[6],total_paise:v[7],snapshot:v[8],issued_at:v[9],status:"issued"};
      state.invoices.push(invoice);return [{...invoice}];
    }
    if (q.startsWith("UPDATE public.invoice_sequences")) {
      const seq = state.sequences[`${v[0]}:${v[1]}`];if (!seq) return [];
      seq.last_credit_number++;return [{...seq}];
    }
    if (q.startsWith("UPDATE public.invoices")) {
      const invoice = state.invoices.find((i) => i.store_id === v[1] && i.id === v[2]);
      Object.assign(invoice,{status:"cancelled",credit_note_number:v[0],cancelled_at:"2026-10-07T08:00:00Z"});return [];
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
