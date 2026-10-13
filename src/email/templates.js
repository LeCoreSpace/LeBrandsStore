import {escapeHtml} from "../ui/layout.js";
const esc=escapeHtml;
export const maskRecipient=value=>{
  const [name,domain]=String(value||"").split("@");
  return domain?`${name.slice(0,1)}***@${domain}`:"";
};
const money=value=>`₹${(Number(value||0)/100).toFixed(2)}`;
const https=value=>{try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:"";}catch{return "";}};
const titles={confirmed:"Your order is confirmed",shipped:"Your order is on its way",delivered:"Your order has been delivered",
  cancelled:"Your order was cancelled",refunded:"Your refund update",new_order:"A new order for your store",
  reset:"Reset your password",invite:"You are invited to a store",verification:"Verify your email"};
export function renderEmail(type,data={}){
  if(!(type in titles))throw new Error("Unknown email template");
  const platform=["reset","invite","verification"].includes(type),brand=platform?"LeBrands.Store":String(data.brand_name||"Your store");
  const colour=/^#[0-9a-f]{6}$/i.test(data.accent_colour||"")?data.accent_colour:"#702440";
  const font=data.font==="serif"?"Georgia, serif":'Arial, Helvetica, sans-serif';
  const title=titles[type],number=data.order_number?`Order ${data.order_number}`:"";
  const paragraphs=[];
  let rows="";
  if(["confirmed","new_order"].includes(type)){
    paragraphs.push(number);
    rows=(data.items||[]).map(item=>`<tr><td style="padding:12px 0;border-bottom:1px solid #eee">${esc(item.title||item.product_title||item.product_snapshot?.title||"Item")}<br><small>Quantity: ${esc(item.quantity)}</small></td><td style="text-align:right">${esc(money(item.line_total_paise??item.total_paise??Number(item.unit_price_paise||0)*Number(item.quantity||0)))}</td></tr>`).join("");
    paragraphs.push(`Total including GST: ${money(data.total_paise)}`,`GST: ${money(data.tax_paise)}`,
      `Payment: ${data.payment_method==="cod"?"Cash on delivery":data.payment_method||"See order details"}`);
    if(data.address)paragraphs.push(`Delivery address: ${Object.values(data.address).filter(v=>typeof v==="string"&&v).join(", ")}`);
  }else if(type==="shipped")paragraphs.push(number,`Courier: ${data.courier||"See tracking details"}`,`Tracking number: ${data.tracking_number||"See tracking details"}`);
  else if(["cancelled","refunded"].includes(type)){
    paragraphs.push(number);
    if(data.refund_paise!=null)paragraphs.push(`Refund amount: ${money(data.refund_paise)}`);
    if(data.credit_note_number)paragraphs.push(`Credit note: ${data.credit_note_number}`);
    if(data.credit_amount_paise!=null)paragraphs.push(`Credit note amount: ${money(data.credit_amount_paise)}`);
    if(data.refund_paise==null)paragraphs.push("Any refund due is handled separately. This email does not confirm a payment refund.");
  }else if(type==="delivered")paragraphs.push(number,"Your parcel has been marked delivered. Contact the store if you need help.");
  else paragraphs.push(type==="reset"?"Use this single-use link within 30 minutes. If you did not request it, ignore this email.":
    type==="invite"?"Sign in with the invited email address to join this store. This single-use invitation expires in 7 days.":
    "Confirm your email to use the AI store builder. This single-use link expires in 30 minutes.");
  const link=https(data.action_url),label=type==="reset"?"Reset password":type==="invite"?"Accept invitation":type==="verification"?"Verify email":type==="new_order"?"Open order":type==="shipped"?"Track shipment":"Track your order";
  const contact=data.contact_email||(platform?"https://lebrands.store/support":""),policy=https(data.policy_url||(platform?"https://lebrands.store/terms":"")),logo=https(data.logo_url);
  const footer=[contact,policy].filter(Boolean);
  const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f5f5f7;color:#242424;font-family:${font}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 14px"><table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:600px;margin:auto;background:#fff;border:1px solid #ececef;border-radius:20px;overflow:hidden"><tr><td style="padding:30px"><div style="font-size:18px;font-weight:700;color:${colour}">${logo?`<img src="${esc(logo)}" alt="${esc(brand)}" width="100" style="max-height:60px;object-fit:contain;display:block;margin-bottom:16px">`:""}${esc(brand)}</div><h1 style="font-size:25px;line-height:1.3;margin:30px 0 18px">${esc(title)}</h1>${rows?`<table width="100%" cellspacing="0">${rows}</table>`:""}${paragraphs.filter(Boolean).map(p=>`<p style="font-size:15px;line-height:1.7">${esc(p)}</p>`).join("")}${link?`<p style="margin:26px 0"><a href="${esc(link)}" style="background:${colour};color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;display:inline-block;font-size:15px">${label}</a></p>`:""}<div style="border-top:1px solid #eee;margin-top:30px;padding-top:18px;font-size:12px;line-height:1.7">${contact?`Contact: ${esc(contact)}<br>`:""}${policy?`<a href="${esc(policy)}">Store policies</a><br>`:""}This is a transactional email. No marketing messages are included.</div></td></tr></table></td></tr></table></body></html>`;
  return {subject:`${title}${number?`: ${number}`:""}`,html,text:[brand,title,...paragraphs.filter(Boolean),
    ...(rows?(data.items||[]).map(i=>`${i.title||i.product_title||i.product_snapshot?.title||"Item"}: quantity ${i.quantity}, line total ${money(i.line_total_paise??i.total_paise??Number(i.unit_price_paise||0)*Number(i.quantity||0))}`):[]),
    link?`${label}: ${link}`:"",...footer,"This is a transactional email, not marketing."].filter(Boolean).join("\n\n")};
}
