import { INDIAN_STATES, commerceError } from "./commerce-rules.js";

export const stateName = (code) => INDIAN_STATES.find((s) => s.code === String(code))?.name || String(code || "");
export function indianDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(value));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}
const labels = {confirmed_cod:"Confirmed",confirmed:"Confirmed",packed:"Packed",processing:"Processing",
  shipped:"Shipped",delivered:"Delivered",cancelled:"Cancelled",returned:"Returned",rto:"Returned to origin",
  pending_payment:"Awaiting payment",paid:"Paid",refunded:"Refunded",issued:"Issued"};
export const statusLabel = (status, method) => `${labels[status] || "Unknown status"}${method === "cod" || status === "confirmed_cod" ? " · Cash on Delivery" : ""}`;
const transitions = {confirmed_cod:["packed","cancelled"],confirmed:["packed","cancelled"],paid:["packed","cancelled"],
  processing:["packed","cancelled"],packed:["shipped","cancelled"],shipped:["delivered","returned","rto"],delivered:["returned"]};
export const allowedTransitions = (status) => [...(transitions[status] || [])];
export function transitionInput(order, body) {
  if (!allowedTransitions(order.status).includes(body.status)) throw commerceError("That status change is not allowed.",undefined,409);
  const result = {status:body.status,restock:false};
  if (["returned","rto"].includes(body.status)) {
    if (body.restock !== undefined && typeof body.restock !== "boolean") throw commerceError("Choose whether to restock.");
    result.restock = body.restock === true;
  }
  if (body.status === "shipped") {
    for (const key of ["courier","tracking_number"]) {
      if (typeof body[key] !== "string" || !body[key].trim() || body[key].length > 120 || /[\u0000-\u001f]/.test(body[key])) throw commerceError("Enter courier and tracking number.");
      result[key] = body[key].trim();
    }
    let url;
    try {url = new URL(body.tracking_url);} catch {throw commerceError("Enter a valid HTTPS tracking link.");}
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 1000) throw commerceError("Enter a valid HTTPS tracking link.");
    result.tracking_url = url.href;
  }
  return result;
}
export const shouldRestoreStock = (status, restock) => status === "cancelled" || (["returned","rto"].includes(status) && restock === true);
export function financialYear(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"numeric"}).formatToParts(new Date(value));
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}
export function invoiceNumber(subdomain, fy, sequence, credit = false) {
  if (!Number.isSafeInteger(Number(sequence)) || Number(sequence) < 1) throw commerceError("Invalid document sequence.");
  const prefix = String(subdomain).replace(/[^a-z0-9]/gi,"").slice(0,12).toUpperCase() || "STO";
  return `${prefix}/${credit ? "CN/" : ""}${fy}/${String(sequence).padStart(4,"0")}`;
}
const small = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
function words(n) {
  if (n < 20) return small[n];
  if (n < 100) return ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"][Math.floor(n/10)] + (n%10 ? ` ${words(n%10)}` : "");
  for (const [scale,label] of [[10000000,"Crore"],[100000,"Lakh"],[1000,"Thousand"],[100,"Hundred"]]) {
    if (n >= scale) return `${words(Math.floor(n/scale))} ${label}${n%scale ? ` ${words(n%scale)}` : ""}`;
  }
}
export function amountInWords(paise) {
  const n = Number(paise);
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError("Money must be non-negative integer paise.");
  return `Rupees ${words(Math.floor(n/100))}${n%100 ? ` and ${words(n%100)} Paise` : ""} Only`;
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export const csv = (headers, rows) => "\uFEFF" + [headers,...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
export function dateFilters(params) {
  const get = (key) => typeof params?.get === "function" ? params.get(key) : params?.[key];
  const result = {search:String(get("search") || "").trim().slice(0,120),status:String(get("status") || ""),period:get("period") === "30" ? 30 : 7};
  for (const key of ["from","to"]) {
    const value = get(key) || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) throw commerceError("Enter valid dates.");
    result[key] = value;
  }
  if (result.from && result.to && result.from > result.to) throw commerceError("The end date must follow the start date.");
  if (result.status && !Object.hasOwn(labels,result.status)) throw commerceError("Choose a valid status.");
  return result;
}
