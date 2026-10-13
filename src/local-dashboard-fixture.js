// Synthetic read-only display data, imported only by src/preview.js.
// Never used by the production Worker or written to a database.
import { DEFAULT_SETTINGS } from "./store/repository.js";
export function localDashboardFixture() {
  const store={store_id:"00000000-0000-4000-8000-000000000000",name:"Demo store",subdomain:"",status:"draft"};
  const product={id:"00000000-0000-4000-8000-000000000001",title:"Everyday cotton tote",description:"A reusable cotton tote for everyday essentials.",sku:"TOTE-01",price_paise:149900,stock:24,track_inventory:true,status:"active",gst_rate:5,hsn_code:"4202",images:[]};
  const orders=[
    {id:"00000000-0000-4000-8000-000000000002",order_number:"LB-1042",created_at:"2026-10-11T05:30:00Z",customer_name:"Demo customer",phone:"+919000000000",email:"demo@example.invalid",status:"confirmed_cod",payment_method:"cod",total_paise:314790,item_count:2,subtotal_paise:299800,shipping_paise:0,taxable_paise:299800,cgst_paise:7495,sgst_paise:7495,igst_paise:0},
    {id:"00000000-0000-4000-8000-000000000003",order_number:"LB-1041",created_at:"2026-10-10T05:30:00Z",customer_name:"Example customer",phone:"+919000000001",status:"delivered",payment_method:"cod",payment_collected_at:"2026-10-11T04:30:00Z",total_paise:157395,item_count:1},
    {id:"00000000-0000-4000-8000-000000000004",order_number:"LB-1040",created_at:"2026-10-09T05:30:00Z",customer_name:"Sample customer",phone:"+919000000002",status:"cancelled",payment_method:"cod",total_paise:157395,item_count:1},
  ];
  const order={...orders[0],items:[{...product,quantity:2,unit_price_paise:149900,total_paise:314790}],shipments:[],timeline:[{action:"order.placed",actor_type:"system",created_at:orders[0].created_at}],shipping_address:{name:"Demo customer",line1:"Example address",city:"Mumbai",state:"27",pincode:"400001",phone:"+919000000000"}};
  const settings={...DEFAULT_SETTINGS,brand_name:store.name,description:"Demo catalogue",support_email:"demo@example.invalid",support_phone:"+919000000000",category:"accessories",invoice_prefix:"DEMO",business_state:"27",business_city:"Mumbai",business_pincode:"400001",business_line1:"Example registered address",legal_name:"Demo business"};
  const draft={store,settings,products:[product],policies:[]};
  return {store,role:"owner",draft,products:[product],product,order,filters:{period:7},orders,
    customers:[{id:"00000000-0000-4000-8000-000000000005",name:"Demo customer",phone:"+919000000000",email:"demo@example.invalid",orders_count:1,total_spent_paise:314790,last_order_at:orders[0].created_at}],
    invoices:[],overview:{today_orders:1,orders:3,revenue_paise:472185,aov_paise:236093,top_products:[{...product,quantity:3,revenue_paise:472185}],sources:[{source:"direct",orders:3}],needing_action:[orders[0]]}};
}

// Fictional Aura skeleton data for local previews only (?aura=1). Never persisted or live.
export function auraDashboardFixture() {
  const data = localDashboardFixture();
  const p1 = { ...data.product, content: {
    description_features: "<p>Heavy <strong>cotton canvas</strong> with a flat base.</p>",
    features: [{ label: "Capacity", value: "14 litres" }],
    materials_care: "<p>100% cotton. <em>Wash cold</em>, dry flat.</p><ul><li>No bleach</li></ul>",
    size_guide: [{ size: "One size", measurement: "40 x 36 cm" }], size_note: "Handles drop 24 cm.",
    how_to_use: [{ title: "Fill it", text: "Up to 8 kg." }],
    faq: [{ question: "Is it washable?", answer: "<p>Yes, <strong>cold</strong> only.</p>" }],
    delivery_returns: "<p>Ships in 3 days from Jaipur.</p>" } };
  const p2 = { ...p1, id: "00000000-0000-4000-8000-000000000011", title: "Block print scarf", sku: "SCARF-01", content: {} };
  const collections = [
    { id: "00000000-0000-4000-8000-000000000021", title: "Everyday carry", slug: "everyday-carry", description: "Bags that earn their place.", product_ids: [p1.id], cover: null, faq: [{ question: "Are these restocked?", answer: "Twice a season." }], related_ids: ["00000000-0000-4000-8000-000000000022"] },
    { id: "00000000-0000-4000-8000-000000000022", title: "Cool weather", slug: "cool-weather", description: "", product_ids: [p2.id], cover: null, faq: [], related_ids: [] },
  ];
  data.aura_skeleton_enabled = true;
  data.draft = { ...data.draft, products: [p1, p2], collections };
  data.products = [p1, p2]; data.product = p1; data.collections = collections;
  return data;
}
