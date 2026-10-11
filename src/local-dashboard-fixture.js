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
