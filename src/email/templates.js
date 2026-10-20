import {escapeHtml} from "../ui/layout.js";
import {stateName} from "../public/dashboard-rules.js";
const esc=escapeHtml;
export const maskRecipient=value=>{
  const [name,domain]=String(value||"").split("@");
  return domain?`${name.slice(0,1)}***@${domain}`:"";
};
const money=value=>`₹${(Number(value||0)/100).toFixed(2)}`;
const has=v=>v!=null&&v!==""&&Number.isFinite(Number(v));
const https=value=>{try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:"";}catch{return "";}};
const titles={confirmed:"Your order is confirmed",shipped:"Your order is on its way",delivered:"Your order has been delivered",
  cancelled:"Your order was cancelled",refunded:"Your refund update",new_order:"A new order for your store",
  reset:"Reset your password",invite:"You are invited to a store",verification:"Verify your email",checkout_verification:"Your checkout verification code"};
const intro={
  confirmed:"Thank you for your order. Here is your receipt.",
  new_order:"A customer has placed an order. The details are below.",
  shipped:"Your parcel has left the store and is with the courier.",
  delivered:"Your parcel has been marked delivered. Contact the store if you need help.",
  cancelled:"This order has been cancelled.",
  refunded:"Here is the latest on your refund.",
  reset:"Use this single-use link within 30 minutes. If you did not request it, ignore this email.",
  invite:"Sign in with the invited email address to join this store. This single-use invitation expires in 7 days.",
  verification:"Confirm your email to use the AI store builder. This single-use link expires in 30 minutes.",
  checkout_verification:"Verify your email to complete checkout. This single-use code expires in 10 minutes. If you did not request it, ignore this email."};
const labels={reset:"Reset password",invite:"Accept invitation",verification:"Verify email",new_order:"Open order",shipped:"Track shipment"};
const itemTitle=i=>i.title||i.product_title||i.product_snapshot?.title||"Item";
const itemTotal=i=>i.line_total_paise??(i.total_paise!=null?Number(i.total_paise)-Number(i.discount_paise||0):Number(i.unit_price_paise||0)*Number(i.quantity||0));
function itemMeta(i){
  const s=i.product_snapshot&&typeof i.product_snapshot==="object"?i.product_snapshot:{},p=[];
  const a=s.attributes||s.options||s.variant_attributes||i.option_snapshot;
  if(a&&typeof a==="object"&&!Array.isArray(a))Object.entries(a).forEach(([k,v])=>{if(v!=null&&typeof v!=="object"&&String(v))p.push(`${k}: ${v}`);});
  else if(s.variant_title||s.variant)p.push(String(s.variant_title||s.variant));
  const sku=s.sku||s.variant_sku||i.sku;if(sku)p.push(`SKU ${sku}`);
  return p;
}
export function renderEmail(type,data={}){
  if(type==="ticket_created"||type==="ticket_closed"){
    const closed=type==="ticket_closed",admin=data.audience==="admin";
    const description=closed
      ?(admin?"A support ticket has been closed. Open the ticket to review its resolution.":"Your support ticket has been closed. Open it to read the resolution or reply if you still need help.")
      :(admin?"A brand has raised a support request. Sign in to review the ticket.":"We have received your support request. You can follow its progress and reply from your account.");
    return renderEmail("verification",{...data,support:true,support_title:closed?"Support ticket closed":"Support ticket created",
      support_description:description,support_number:`SUP-${String(data.ticket_number).padStart(6,"0")}`});
  }
  if(!(type in titles))throw new Error("Unknown email template");
  const platform=["reset","invite","verification"].includes(type),brand=platform?"LeBrands.Store":String(data.brand_name||"Your store");
  const colour=/^#[0-9a-f]{6}$/i.test(data.accent_colour||"")?data.accent_colour:"#702440";
  const font=data.font==="serif"?"Georgia, 'Times New Roman', serif":"'Helvetica Neue', Arial, sans-serif";
  const orderish=["confirmed","new_order"].includes(type);
  const pending=orderish&&data.status==="pending_payment";
  const inactive=orderish&&["cancelled","failed","expired","payment_failed","refunded"].includes(data.status);
  const title=data.support?data.support_title:pending?"Your payment is pending":inactive?"Your order status has changed":titles[type],number=data.support?data.support_number:data.order_number?`Order ${data.order_number}`:"";
  const introduction=data.support?data.support_description:pending?"Your order is not confirmed yet. Check the latest payment status using the order link.":inactive?`Current order status: ${data.status}. Check the latest details using the order link.`:intro[type];
  const cod=data.payment_method==="cod",paid=["paid","captured"].includes(data.payment_status)&&!cod&&!pending&&!inactive;
  const payText=inactive?"This order is not active. Check the latest order details.":pending?"Awaiting payment confirmation.":cod?"Cash on delivery. Pay when your order arrives; no online payment has been taken.":paid?"Paid online.":data.payment_method&&data.payment_method!=="online"?String(data.payment_method):"Online payment";
  // blocks: {h: html, t: text}
  const blocks=[];
  const para=(s,strong)=>{if(s)blocks.push({h:`<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3b3b3f${strong?";font-weight:700":""}">${esc(s)}</p>`,t:s});};
  para(introduction);
  if(type==="checkout_verification"){
    if(!/^\d{6}$/.test(String(data.verification_code||"")))throw new Error("Invalid checkout verification code");
    blocks.push({h:`<div style="margin:24px 0;padding:22px;border:1px dashed ${colour};border-radius:10px;text-align:center;font-size:34px;font-weight:700;letter-spacing:.2em;color:${colour}">${esc(data.verification_code)}</div>`,
      t:`Your verification code: ${data.verification_code}`});
    para("Never share this code. LeBrands.Store will not ask for it by phone or message.");
  }
  if(number)blocks.push({h:`<p style="margin:0 0 18px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${colour};font-weight:700">${esc(number)}</p>`,t:number});
  const items=Array.isArray(data.items)?data.items:[];
  if(orderish){
    if(items.length){
      const rows=items.map(i=>{const m=itemMeta(i);return `<tr><td style="padding:14px 0;border-bottom:1px solid #ececef;font-size:15px;line-height:1.45;color:#242424"><strong>${esc(itemTitle(i))}</strong>${m.length?`<br><span style="font-size:12px;color:#6b6b72">${esc(m.join(" · "))}</span>`:""}<br><span style="font-size:12px;color:#6b6b72">Quantity: ${esc(i.quantity)}</span></td><td align="right" valign="top" style="padding:14px 0 14px 12px;border-bottom:1px solid #ececef;font-size:15px;white-space:nowrap;color:#242424">${esc(money(itemTotal(i)))}</td></tr>`;}).join("");
      blocks.push({h:`<h2 style="margin:22px 0 4px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#6b6b72">Items</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`,
        t:items.map(i=>{const m=itemMeta(i);return `${itemTitle(i)}: quantity ${i.quantity}, line total ${money(itemTotal(i))}${m.length?` (${m.join(", ")})`:""}`;}).join("\n")});
    }
    const tot=[];
    if(has(data.subtotal_paise))tot.push(["Subtotal",money(data.subtotal_paise)]);
    if(Number(data.discount_paise)>0)tot.push(["Offer saving",`−${money(data.discount_paise)}`]);
    if(has(data.shipping_paise))tot.push(["Shipping",Number(data.shipping_paise)===0?"Free":money(data.shipping_paise)]);
    if(has(data.tax_paise)&&Number(data.tax_paise)>0)tot.push(["GST (included in total)",money(data.tax_paise)]);
    const grand=inactive?"Order total":cod?"Total due on delivery":paid?"Total paid":"Total including GST";
    const trs=tot.map(([k,v])=>`<tr><td style="padding:5px 0;font-size:13px;color:#6b6b72">${esc(k)}</td><td align="right" style="padding:5px 0;font-size:13px;color:#6b6b72">${esc(v)}</td></tr>`).join("");
    blocks.push({h:`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 18px">${trs}<tr><td style="padding:12px 0 0;border-top:2px solid ${colour};font-size:16px;font-weight:700;color:#242424">${esc(grand)}</td><td align="right" style="padding:12px 0 0;border-top:2px solid ${colour};font-size:16px;font-weight:700;color:#242424">${esc(money(data.total_paise))}</td></tr></table>`,
      t:[...tot.map(([k,v])=>`${k}: ${v}`),`${grand}: ${money(data.total_paise)}`].join("\n")});
    blocks.push({h:`<h2 style="margin:20px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#6b6b72">Payment</h2><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3b3b3f">${esc(payText)}</p>`,t:`Payment: ${payText}`});
    if(data.address&&typeof data.address==="object"){
      const address=data.address;
      const a=[address.name,address.line1,address.line2,address.landmark,
        [address.city,stateName(address.state)||address.state].filter(Boolean).join(", "),address.pincode,address.phone].filter(v=>typeof v==="string"&&v);
      if(a.length)blocks.push({h:`<h2 style="margin:20px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#6b6b72">Delivery address</h2><p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3b3b3f">${a.map(esc).join("<br>")}</p>`,t:`Delivery address: ${a.join(", ")}`});
    }
  }else if(type==="shipped"){
    para(`Courier: ${data.courier||"See tracking details"}`);para(`Tracking number: ${data.tracking_number||"See tracking details"}`);
  }else if(["cancelled","refunded"].includes(type)){
    if(data.refund_paise!=null)para(`Refund amount: ${money(data.refund_paise)}`,true);
    if(data.credit_note_number)para(`Credit note: ${data.credit_note_number}`);
    if(data.credit_amount_paise!=null)para(`Credit note amount: ${money(data.credit_amount_paise)}`);
    if(data.refund_paise==null)para("Any refund due is handled separately. This email does not confirm a payment refund.");
  }
   const link=https(data.action_url),label=data.support?"Open support ticket":labels[type]||"Track your order";
  const contact=data.contact_email||(platform?"https://lebrands.store/support":""),policy=https(data.policy_url||(platform?"https://lebrands.store/terms":"")),logo=https(data.logo_url);
  const prefs=https(data.preferences_url);
  const prefNote="Essential order, payment and security messages cannot be disabled. Optional delivery updates can be turned off.";
  const pre=`${title}${number?`: ${number}`:""}. ${introduction}`;
  const cta=link?`<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px"><tr><td style="border-radius:8px;background:${colour}"><a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table><p style="margin:0 0 6px;font-size:12px;color:#6b6b72;word-break:break-all">If the button does not work, open ${esc(link)}</p>`:"";
  const contactH=contact?(/^[^@\s]+@[^@\s]+$/.test(contact)?`Contact: <a href="mailto:${esc(contact)}" style="color:${colour}">${esc(contact)}</a>`:`Contact: ${esc(contact)}`):"";
  const footH=[contactH,policy?`<a href="${esc(policy)}" style="color:${colour}">Store policies</a>`:"",prefs?`<a href="${esc(prefs)}" style="color:${colour}">Email preferences / unsubscribe</a>`:""].filter(Boolean).join("<br>");
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>@media only screen and (max-width:620px){.shell{padding:12px 8px!important}.card{padding:24px 20px!important}.h1{font-size:23px!important}}</style></head><body style="margin:0;padding:0;background:#f3f1ee;color:#242424;font-family:${font}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f3f1ee">${esc(pre)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ee"><tr><td class="shell" align="center" style="padding:28px 14px"><table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e6e3df;border-radius:14px;overflow:hidden"><tr><td style="height:6px;line-height:6px;font-size:0;background:${colour}">&nbsp;</td></tr><tr><td class="card" style="padding:32px 34px"><div style="padding-bottom:18px;border-bottom:1px solid #ececef">${logo?`<img src="${esc(logo)}" alt="${esc(brand)}" width="100" style="max-height:60px;width:auto;object-fit:contain;display:block;margin-bottom:12px">`:""}<span style="font-size:18px;font-weight:700;letter-spacing:.01em;color:${colour}">${esc(brand)}</span></div><h1 class="h1" style="font-size:27px;line-height:1.25;margin:26px 0 12px;font-weight:700;color:#1f1f22">${esc(title)}</h1>${blocks.map(b=>b.h).join("")}${cta}<div style="border-top:1px solid #ececef;margin-top:28px;padding-top:18px;font-size:12px;line-height:1.7;color:#6b6b72">${footH?`${footH}<br><br>`:""}${prefs?`${esc(prefNote)}<br><br>`:""}This is a transactional email. No marketing messages are included.</div></td></tr></table></td></tr></table></body></html>`;
  const text=[brand,title,...blocks.map(b=>b.t),link?`${label}: ${link}`:"",
    contact?`Contact: ${contact}`:"",policy?`Store policies: ${policy}`:"",prefs?`Email preferences / unsubscribe: ${prefs}`:"",prefs?prefNote:"",
    "This is a transactional email, not marketing."].filter(Boolean).join("\n\n");
  return {subject:`${title}${number?`: ${number}`:""}`,html,text};
}
