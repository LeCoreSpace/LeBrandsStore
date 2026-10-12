// Fictional marketing capture data. Imported only by the local preview entry.
// Nothing here is persisted or represents a real merchant or customer.
import { DEFAULT_SETTINGS } from "./store/repository.js";
import { quoteCart, DEFAULT_CHECKOUT_SETTINGS } from "./public/commerce-rules.js";

export const EXAMPLE_STORE_ID="00000000-0000-4000-8000-000000000010";
export const EXAMPLE_PRODUCTS=[
  ["indigo-shirt","Indigo Everyday Cotton Shirt",1290],
  ["ecru-shirt","Ecru Windowlight Cotton Shirt",1490],
  ["rust-kurta","Rust Handcrafted Cotton Kurta",1890],
  ["olive-overshirt","Olive Everyday Cotton Overshirt",2490],
  ["ecru-trousers","Ecru Relaxed Cotton Trousers",2890],
  ["indigo-kurta","Indigo Studio Cotton Kurta",3490]
];
export const exampleProductId=i=>`00000000-0000-4000-8000-${String(100+i).padStart(12,"0")}`;
export const examplePhotoUrl=i=>`https://media.lebrands.store/stores/${EXAMPLE_STORE_ID}/${exampleProductId(i)}.webp`;
export const EXAMPLE_IMAGE_WIDTHS=[480,768,1200,1600];
export const exampleRenditionUrl=(i,width)=>`https://media.lebrands.store/stores/${EXAMPLE_STORE_ID}/00000000-0000-4000-8000-${String((i+1)*1000000+width).padStart(12,"0")}.webp`;

export function exampleMedia(html){
  for(let i=0;i<EXAMPLE_PRODUCTS.length;i++){
    html=html.replaceAll(examplePhotoUrl(i),`/__example-media/${EXAMPLE_PRODUCTS[i][0]}.webp`);
    for(const width of EXAMPLE_IMAGE_WIDTHS)html=html.replaceAll(exampleRenditionUrl(i,width),`/__example-media/${EXAMPLE_PRODUCTS[i][0]}-${width}.webp`);
  }
  return html;
}
export function exampleFixture(){
  const store={store_id:EXAMPLE_STORE_ID,name:"Example Studio",subdomain:"example-studio",status:"live"};
  const settings={...DEFAULT_SETTINGS,brand_name:store.name,subdomain:store.subdomain,
    description:"Handmade cotton apparel for everyday living. Thoughtful cuts, natural colours and a softer way to dress.",
    tagline:"Cotton, considered.",category:"fashion",invoice_prefix:"EXMP",
    legal_name:"Example Studio",gstin:"33AAAAA0000A1Z0",
    business_state:"33",business_city:"Chennai",business_pincode:"600001",
    business_line1:"12 Example Studio Lane",address:"12 Example Studio Lane\nChennai, Tamil Nadu 600001",
    support_email:"hello@example-studio.invalid",support_phone:"+919000000000",
    accent_color:"#214a3d",theme:"aura",font_preset:"serif",button_style:"square"};
  const products=EXAMPLE_PRODUCTS.map(([slug,title,rupees],i)=>({
    id:exampleProductId(i),store_id:store.store_id,title,description:
      "Soft woven cotton, cut and stitched by hand. A relaxed everyday fit in a muted natural shade. Gentle cold wash and line dry.",
    sku:`EX-${String(i+1).padStart(2,"0")}`,slug,price_paise:rupees*100,stock:18+i*3,
    track_inventory:true,status:"active",hsn_code:"6205",gst_rate:rupees>2500?18:5,
    images:[{id:exampleProductId(i),url:examplePhotoUrl(i),alt:`Generated ${title} product photograph for fictional Example Studio`,width:2000,height:2500,
      sources:EXAMPLE_IMAGE_WIDTHS.map(width=>({url:exampleRenditionUrl(i,width),width,height:Math.round(width*1.25)}))}]
  }));
  const policyBodies={
    privacy:"Example store policy. This fictional store uses customer details only to fulfil orders. No customer information is sold or used for marketing.",
    terms:"Example store policy. Products and prices in this local demonstration are fictional. No orders can be placed and no payments can be collected.",
    shipping:"Example store policy. Standard delivery within India is free. Handmade apparel is dispatched within three working days in this fictional example.",
    "cancellation-refund":"Example store policy. Unshipped orders may be cancelled. Returns of unworn garments are accepted within seven days in this fictional example.",
    contact:"Example store contact. Example Studio, 12 Example Studio Lane, Chennai 600001. Email hello@example-studio.invalid. These are fictional details.",
    pricing:"Example store pricing. Product prices include GST. Cash on Delivery is the payment option shown in this fictional local demonstration."
  };
  const policies=Object.entries(policyBodies).map(([kind,body])=>({kind,body,reviewed:true}));
  const checkout={...DEFAULT_CHECKOUT_SETTINGS,store_state:"33",cod_enabled:true,cod_max_paise:1500000,shipping_flat_paise:0};
  const people=[
    ["Priya R.","Mumbai","27","400001"],["Arjun M.","Chennai","33","600001"],
    ["Meera S.","Bengaluru","29","560001"],["Kavin D.","Chennai","33","600020"],
    ["Tara K.","Delhi","07","110001"],["Ishaan P.","Hyderabad","36","500001"],
    ["Nila V.","Kochi","32","682001"],["Dev A.","Pune","27","411001"],
    ["Ananya B.","Bengaluru","29","560001"],["Rohan T.","Chennai","33","600001"],
    ["Maya C.","Mumbai","27","400001"],["Aadi N.","Delhi","07","110001"]
  ];
  // Real order states: confirmed COD / packed are still unfulfilled.
  const statuses=["confirmed_cod","confirmed_cod","shipped","delivered","delivered","shipped","delivered","packed","delivered","shipped","delivered","delivered"];
  const orders=people.map(([name,city,state,pincode],i)=>{
    const product=products[i%products.length];
    const quoted=quoteCart(products,products,[{product_id:product.id,quantity:i===2?2:1}],checkout,state);
    const day=11-Math.floor(i*7/12);
    return {id:`00000000-0000-4000-8000-${String(200+i).padStart(12,"0")}`,
      order_number:`EXMP-${1012-i}`,created_at:`2026-10-${String(day).padStart(2,"0")}T05:30:00Z`,
      customer_name:name,phone:"+919000000000",email:`customer${i+1}@example.invalid`,
      status:statuses[i],payment_method:"cod",source:i%3===0?"mall":"direct",
      payment_collected_at:statuses[i]==="delivered"&&i%2===0?`2026-10-${String(day).padStart(2,"0")}T12:30:00Z`:null,
      total_paise:quoted.total_paise,subtotal_paise:quoted.subtotal_paise,shipping_paise:quoted.delivery_paise,
      taxable_paise:quoted.items.reduce((sum,item)=>sum+item.taxable_paise,0),
      cgst_paise:quoted.items.reduce((sum,item)=>sum+item.cgst_paise,0),
      sgst_paise:quoted.items.reduce((sum,item)=>sum+item.sgst_paise,0),
      igst_paise:quoted.items.reduce((sum,item)=>sum+item.igst_paise,0),
      item_count:quoted.items.reduce((sum,item)=>sum+item.quantity,0),items:quoted.items,
      shipping_address:{name,line1:"24 Example Lane",city,state,pincode,phone:"+919000000000"},
      shipments:[],timeline:[{action:"order.placed",actor_type:"system",created_at:`2026-10-${String(day).padStart(2,"0")}T05:30:00Z`}]
    };
  });
  const revenue=orders.reduce((sum,o)=>sum+o.total_paise,0);
  const top=products.map(p=>{
    const sold=orders.flatMap(o=>o.items).filter(i=>i.product_id===p.id);
    return {...p,quantity:sold.reduce((sum,i)=>sum+i.quantity,0),revenue_paise:sold.reduce((sum,i)=>sum+i.line_total_paise,0)};
  }).sort((a,b)=>b.revenue_paise-a.revenue_paise);
  return {store,settings,products,policies,progress:{step:1,completed:[]},
    role:"owner",draft:{store,settings,products,policies},product:products[0],order:orders[0],orders,
    filters:{period:7},invoices:[],checkout,
    customers:orders.map((o,i)=>({id:String(i),name:o.customer_name,phone:o.phone,email:o.email,orders_count:1,total_spent_paise:o.total_paise,last_order_at:o.created_at})),
    overview:{today_orders:orders.filter(o=>o.created_at.startsWith("2026-10-11")).length,orders:orders.length,
      revenue_paise:revenue,aov_paise:Math.round(revenue/orders.length),top_products:top,
      sources:[{source:"direct",orders:8},{source:"mall",orders:4}],
      needing_action:orders.filter(o=>["confirmed_cod","packed"].includes(o.status)||(o.status==="delivered"&&!o.payment_collected_at))}
  };
}
export function exampleInvoice(data=exampleFixture()){
  const order=data.orders[0];
  return {document_type:"tax_invoice",status:"issued",invoice_number:"EXMP/26-27/0001",
    issued_at:order.created_at,total_paise:order.total_paise,snapshot:{
      order_number:order.order_number,supplier:{legal_name:"Example Studio",gstin:data.settings.gstin,
        line1:data.settings.business_line1,city:"Chennai",state:"33",pincode:"600001"},
      customer:order.shipping_address,place_of_supply:order.shipping_address.state,
      items:order.items.map(i=>({...i,total_paise:i.line_total_paise,uqc:"NOS"})),
      totals:{subtotal_paise:order.subtotal_paise,shipping_paise:0,payment_method:"cod"}
    }};
}
