import { cartItems, INDIAN_STATES, commerceError } from "../public/commerce-rules.js";
import {offerCode} from "../offers/rules.js";
const text = (value,max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
export function indianPhone(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[ ()-]/g,"").replace(/^\+91/,"").replace(/^91(?=\d{10}$)/,"");
  return /^[6-9][0-9]{9}$/.test(normalized) ? `+91${normalized}` : null;
}
export function orderInput(body) {
  const contact = body.contact ?? {}, address = body.address ?? {}, errors = {};
  if (body.payment_method!==undefined && !["cod","online"].includes(body.payment_method)) errors.payment_method="Choose an available payment method.";
  const name = text(contact.name,120), phone = indianPhone(contact.phone), email = text(contact.email ?? "",254);
  if (!name || name.length < 2) errors.name = "Enter your full name.";
  if (!phone) errors.phone = "Enter a valid Indian 10-digit mobile number.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter your email for order confirmation.";
  const clean = {};
  for (const [key,max] of Object.entries({line1:200,line2:200,landmark:120,city:100,pincode:6,state:2})) {
    clean[key] = text(address[key] ?? "",max);
    if (clean[key] == null) errors[key] = "Enter a valid address value.";
  }
  if (!clean.line1 || clean.line1.length < 5) errors.line1 = "Enter your house number and street.";
  if (!clean.city || clean.city.length < 2) errors.city = "Enter your city.";
  if (!/^[1-9][0-9]{5}$/.test(clean.pincode ?? "")) errors.pincode = "Enter a valid 6-digit pincode.";
  if (!INDIAN_STATES.some((s) => s.code === clean.state)) errors.state = "Choose your state or union territory.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.idempotency_key ?? "") ||
    !/^[0-9a-f]{64}$/.test(body.receipt_token ?? "")) errors._general = "Reload checkout and try again.";
  if (Object.keys(errors).length) throw commerceError("Check the highlighted fields.",errors);
  if(body.expected_discount_paise!=null&&(!Number.isSafeInteger(body.expected_discount_paise)||body.expected_discount_paise<0))
    throw commerceError("Reload the order summary before placing the order.");
  return {items:cartItems(body.items,false),contact:{name,phone,email},address:clean,
    ...(body.code?{code:offerCode(body.code)}:{}),
    ...(body.expected_discount_paise!=null?{expected_discount_paise:body.expected_discount_paise}:{}),
    ...(body.payment_method==="online"?{payment_method:"online"}:{}),
    idempotency_key:body.idempotency_key.toLowerCase(),receipt_token:body.receipt_token};
}
export function orderSource(body, request) {
  const source = body.source ?? {};
  if (source.utm_source === "mall") return "mall";
  if (!source.referrer && !request.headers.get("referer")) return "direct";
  try {
    const ref = new URL(source.referrer || request.headers.get("referer") || "");
    if (ref.hostname === "lebrands.space" || ref.hostname.endsWith(".lebrands.space")) return "mall";
    if (ref.origin === new URL(request.url).origin) return "direct";
  } catch { /* Missing or malformed referrer is unknown, never persisted. */ }
  return "unknown";
}
