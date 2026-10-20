export const MARKETING_DEFAULTS=Object.freeze({
  meta_enabled:false,meta_pixel_id:"",meta_test_event_code:"",meta_domain_verification:"",
  google_enabled:false,ga4_measurement_id:"",google_ads_id:"",google_label_purchase:"",
  google_label_add_to_cart:"",google_label_begin_checkout:"",google_enhanced_conversions:false,google_site_verification:""
});
const booleans=new Set(["meta_enabled","google_enabled","google_enhanced_conversions"]);
export const marketingError=(message,status=400,fields)=>Object.assign(new Error(message),{status,fields});
export function validateMarketing(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw marketingError("Check your integration settings.",400);
  const fields={},settings={};
  for(const key of Object.keys(input))if(!Object.hasOwn(MARKETING_DEFAULTS,key))fields[key]="This setting is not supported.";
  for(const[key,value]of Object.entries(MARKETING_DEFAULTS)){
    const v=input[key]??value;
    if(booleans.has(key)){if(typeof v!=="boolean")fields[key]="Choose on or off.";settings[key]=v===true;}
    else{if(typeof v!=="string"||v.length>256)fields[key]="Enter a shorter value.";settings[key]=typeof v==="string"?v.trim():"";}
  }
  const check=(key,re,message)=>{if(settings[key]&&!re.test(settings[key]))fields[key]=message;};
  check("meta_pixel_id",/^\d{15,16}$/,"Enter the 15 or 16 digit Pixel ID from Meta.");
  check("ga4_measurement_id",/^G-[A-Z0-9]{4,20}$/,"Enter a GA4 ID beginning with G-.");
  check("google_ads_id",/^AW-\d{6,20}$/,"Enter a Google Ads ID beginning with AW-.");
  for(const key of ["google_label_purchase","google_label_add_to_cart","google_label_begin_checkout"])
    check(key,/^[A-Za-z0-9_-]{1,100}$/,"Enter only the conversion label, not a script.");
  check("meta_test_event_code",/^[A-Za-z0-9_-]{1,80}$/,"Enter only the test event code.");
  for(const key of ["meta_domain_verification","google_site_verification"])
    check(key,/^[A-Za-z0-9_=-]{8,200}$/,"Paste only the verification content value, not the HTML tag.");
  if(settings.meta_enabled&&!settings.meta_pixel_id)fields.meta_pixel_id="Enter your Meta Pixel ID.";
  if(settings.google_enabled&&!settings.ga4_measurement_id)fields.ga4_measurement_id="Enter your GA4 Measurement ID.";
  if(!settings.google_ads_id)for(const key of ["google_label_purchase","google_label_add_to_cart","google_label_begin_checkout"])
    if(settings[key])fields[key]="Add the Google Ads Conversion ID first.";
  if(settings.google_enhanced_conversions&&(!settings.google_ads_id||!settings.google_label_purchase))
    fields.google_enhanced_conversions="Add your Google Ads ID and purchase label first.";
  if(Object.keys(fields).length)throw marketingError("Check the highlighted settings.",400,fields);
  return settings;
}
export function publicMarketing(row){
  return Object.fromEntries(Object.keys(MARKETING_DEFAULTS).map(k=>[k,row?.[k]??MARKETING_DEFAULTS[k]]));
}
export const hasMarketing=s=>Boolean(s?.meta_enabled||s?.google_enabled);
export function cleanSourceUrl(value){
  try{const u=new URL(value);return u.protocol==="https:"?`${u.origin}/`:"";}catch{return "";}
}
// One immutable identity for product variants, independent of display names/SKUs.
export const trackingItemId=item=>String(item.tracking_product_id||item.product_option_id||item.product_id||item.id||"");
export function purchasePayload(order,items){
  const lines=items.map(i=>{
    const quantity=Number(i.quantity),net=Math.max(0,Number(i.total_paise)-Number(i.discount_paise||0)-Number(i.tax_paise||0));
    return{item_id:trackingItemId(i),item_name:String(i.title||"Product"),quantity,price:net/quantity/100};
  });
  return{event_id:order.tracking_event_id,transaction_id:`${order.store_id}:${order.order_number}`,
    currency:"INR",value:Number(order.total_paise)/100,
    google_value:Math.max(0,Number(order.total_paise)-Number(order.tax_paise)-Number(order.shipping_paise))/100,
    tax:Number(order.tax_paise)/100,shipping:Number(order.shipping_paise)/100,
    payment_method:order.payment_method,items:lines};
}
export async function contactHashes(email,phone){
  const digest=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
  const em=String(email||"").trim().toLowerCase(),digits=String(phone||"").replace(/\D/g,"");
  const indian=digits.length===10?`91${digits}`:digits;
  const validPhone=/^[1-9]\d{10,14}$/.test(indian);
  const googleEmail=em.replace(/^([^@]+)@(gmail\.com|googlemail\.com)$/,(_,local,domain)=>`${local.replace(/\./g,"")}@${domain}`);
  return{meta:{...(em?{em:[await digest(em)]}:{}),...(validPhone?{ph:[await digest(indian)]}:{})},
    google:{...(em?{sha256_email_address:await digest(googleEmail)}:{}),...(validPhone?{sha256_phone_number:await digest(`+${indian}`)}:{})}};
}
