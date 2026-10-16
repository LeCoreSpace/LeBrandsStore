import { connection, failure, shiprocketClient } from "./runtime-client.js";
import { INDIAN_STATES } from "../public/commerce-rules.js";

export function shippingSettings(value) {
  const fields=["pickup_location","pickup_pincode","weight_kg","length_cm","breadth_cm","height_cm","max_units","max_freight_paise","auto_pickup"];
  if (!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length!==fields.length || Object.keys(value).some(k=>!fields.includes(k))) throw failure("Complete the parcel settings.",400);
  const s={...value};
  if (typeof s.pickup_location!=="string" || !s.pickup_location.trim() || s.pickup_location.length>100 ||
    !/^[1-9][0-9]{5}$/.test(s.pickup_pincode) || typeof s.auto_pickup!=="boolean" ||
    !Number.isInteger(s.max_units) || s.max_units<1 || s.max_units>50 ||
    !Number.isSafeInteger(s.max_freight_paise) || s.max_freight_paise<100 || s.max_freight_paise>1000000 ||
    ["weight_kg","length_cm","breadth_cm","height_cm"].some(k=>typeof s[k]!=="number" || !Number.isFinite(s[k]) || s[k]<=0 || s[k]>(k==="weight_kg"?100:200))) throw failure("Use a real pickup location, positive parcel dimensions and weight, a parcel item limit, and a maximum courier charge.",400);
  return s;
}
export async function pickupLocations(api) {
  const response=await api("/settings/company/pickup");
  if (!Array.isArray(response.data?.shipping_address)) throw failure("Cannot load Shiprocket pickup locations.",502);
  return response.data.shipping_address.filter(p=>p.pickup_location && /^[1-9][0-9]{5}$/.test(String(p.pin_code))).map(p=>({name:String(p.pickup_location),pincode:String(p.pin_code)}));
}
export async function checkShipping(tx,id,input,total,env,fetcher=fetch) {
  const [i]=await tx`SELECT status,metadata::text FROM public.integrations WHERE store_id=${id} AND provider='shiprocket'`;
  const meta=i?JSON.parse(i.metadata):{};
  if (i?.status!=="connected" || meta.enabled!==true) return;
  const c=await connection(tx,id,"shiprocket",env),s=shippingSettings(meta.shipping);
  const units=input.items.reduce((n,p)=>n+p.quantity,0);
  if (units>s.max_units) throw failure("This cart exceeds the store's automatic parcel size. Reduce the quantity or contact the store.",400);
  await serviceable(shiprocketClient(c.credentials,fetcher),s,input.address.pincode,input.payment_method==="online"?"online":"cod",total);
}
export async function serviceable(api,s,pincode,method,total) {
  const query=new URLSearchParams({pickup_postcode:s.pickup_pincode,delivery_postcode:pincode,weight:String(s.weight_kg),
    cod:method==="cod"?"1":"0",declared_value:String(total/100),length:String(s.length_cm),breadth:String(s.breadth_cm),height:String(s.height_cm),is_return:"0"});
  const result=await api(`/courier/serviceability/?${query}`);
  const options=result.data?.available_courier_companies;
  const available=Array.isArray(options)?options.filter(p=>Number.isSafeInteger(Number(p.courier_company_id)) && Number(p.courier_company_id)>0 &&
    (method!=="cod" || Number(p.cod)===1) && Number.isFinite(Number(p.rate)) && Number(p.rate)>0 && Math.ceil(Number(p.rate)*100)<=s.max_freight_paise && !p.blocked):[];
  available.sort((a,b)=>Number(a.rate)-Number(b.rate));
  if (!available.length) throw failure("No eligible courier is available within the store's shipping limits for this PIN. Contact the store.",409);
  return available[0];
}
export function shippingOrder(order,items,customer,s) {
  const a=order.shipping_address, state=INDIAN_STATES.find(x=>x.code===a.state)?.name;
  if (!state || items.reduce((n,p)=>n+p.quantity,0)>s.max_units) throw failure("The delivery address or parcel limits need attention.");
  return {order_id:`LB-${order.id}`,order_date:new Date(order.created_at).toISOString().replace("T"," ").slice(0,19),
    pickup_location:s.pickup_location,billing_customer_name:a.name,billing_last_name:"",
    billing_address:a.line1,billing_address_2:[a.line2,a.landmark].filter(Boolean).join(", "),
    billing_city:a.city,billing_state:state,billing_country:"India",billing_pincode:a.pincode,
    billing_email:customer?.email||"",billing_phone:a.phone.replace(/^\+91/,""),shipping_is_billing:true,
    order_items:items.map(p=>({name:p.title,sku:p.sku||p.product_id||p.id,units:p.quantity,selling_price:Number(p.unit_price_paise)/100,...(p.hsn_code?{hsn:p.hsn_code}:{})})),
    payment_method:order.payment_method==="cod"?"COD":"Prepaid",sub_total:Number(order.subtotal_paise)/100,
    shipping_charges:Number(order.shipping_paise)/100,length:s.length_cm,breadth:s.breadth_cm,height:s.height_cm,weight:s.weight_kg};
}
