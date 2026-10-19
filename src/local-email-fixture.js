import {renderEmail} from "./email/templates.js";
export const emailFixtureTypes=["confirmed","new_order","shipped","delivered","cancelled","refunded","reset","invite","verification"];
export function emailFixture(kind){
 if(!emailFixtureTypes.includes(kind))return null;
 return renderEmail(kind,{
  brand_name:"Example Studio",accent_colour:"#702440",font:"sans",order_number:"DEMO-1042",
  items:[{product_snapshot:{title:"Indigo cotton shirt"},quantity:1,line_total_paise:129000}],
  subtotal_paise:129000,shipping_paise:0,total_paise:129000,tax_paise:6143,payment_method:"cod",
  address:{name:"Example customer",line1:"Illustrative delivery address",city:"Example city",pincode:"000000"},
  courier:"Example courier",tracking_number:"DEMO-TRACKING",credit_note_number:"DEMO-CN-01",
  ...(["cancelled","refunded"].includes(kind)?{credit_amount_paise:129000}:{}),
  ...(kind==="refunded"?{refund_paise:129000}:{}),
  contact_email:"help@example.invalid",policy_url:"https://example.invalid/policies/terms",
  action_url:"https://example.invalid/demo",preferences_url:"https://example.invalid/email-preferences"
 }).html;
}
