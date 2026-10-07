export function defaultInvoicePrefix(name) {
  const letters = String(name || "").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return (letters.replace(/[AEIOU]/g,"") || letters || "STO").slice(0,3);
}
export const validInvoicePrefix = value => /^[A-Z0-9]{1,4}$/.test(String(value || ""));
export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g,"");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : "";
  return local ? `+91 ${local.slice(0,5)} ${local.slice(5)}` : String(value || "");
}
export function registeredSupplierErrors(settings) {
  const errors = businessGSTINErrors(settings);
  if (!String(settings.legal_name || "").trim()) errors.legal_name = "Enter the registered legal business name.";
  for (const key of ["business_line1","business_city"]) if (!String(settings[key] || "").trim()) errors[key] = key === "business_line1" ? "Enter registered address line 1." : "Enter the registered address city.";
  if (!/^[1-9][0-9]{5}$/.test(settings.business_pincode || "")) errors.business_pincode = "Enter the registered address six-digit PIN.";
  return errors;
}
// Pure shared rules. Money is integer paise; tax rounding never uses floats.
export const CURRENT_GST_RATES = [0, 5, 18, 40];
export const LEGACY_GST_RATES = [0.25, 3, 12, 28];
export const INDIAN_STATES = [
  ["01","Jammu and Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],
  ["05","Uttarakhand"],["06","Haryana"],["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],
  ["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],["14","Manipur"],
  ["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],
  ["20","Jharkhand"],["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],
  ["26","Dadra and Nagar Haveli and Daman and Diu"],["27","Maharashtra"],["29","Karnataka"],
  ["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],
  ["35","Andaman and Nicobar Islands"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"],
].map(([code,name]) => ({code,name})).sort((a,b) => a.name.localeCompare(b.name));
export const DEFAULT_CHECKOUT_SETTINGS = {
  delivery_mode: "free", flat_paise: 0, free_above_paise: 0,
  cod_enabled: true, cod_max_paise: 300000, store_state: "",
};
export const commerceError = (message, errors, status = 400) => Object.assign(new Error(message), {status,errors});
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function gstinChecksum(value) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (!/^[0-9A-Z]{14}$/.test(value)) return null;
  let sum = 0, factor = 2;
  for (let i = 13; i >= 0; i--) {
    const product = alphabet.indexOf(value[i]) * factor;
    sum += Math.floor(product / 36) + product % 36;
    factor = 3 - factor;
  }
  return alphabet[(36 - sum % 36) % 36];
}
export function gstinError(value, required = true) {
  if (!value) return required ? "GSTIN is required to publish your store." : "";
  if (!GSTIN_PATTERN.test(value)) return "Enter a 15-character GSTIN with 2 state digits, a valid PAN, an entity code, Z and a check character.";
  if (gstinChecksum(value.slice(0,14)) !== value[14]) return "The GSTIN checksum is invalid. Check it against your GST registration certificate.";
  return "";
}
const addressStates = (address) => INDIAN_STATES.filter(s =>
  new RegExp(`(?:^|[\\s,;.()/-])${s.name}(?:$|[\\s,;.()/-])`,"i").test(String(address || "")));
export function registeredBusinessState(settings = {}) {
  if (settings.business_state) return INDIAN_STATES.find(s => s.code === settings.business_state)?.code || "";
  const states = addressStates(settings.address);
  return states.length === 1 ? states[0].code : "";
}
export function businessGSTINErrors(settings = {}) {
  const errors = {}, error = gstinError(settings.gstin), state = registeredBusinessState(settings);
  if (error) errors.gstin = error;
  if (!state) errors.business_state = "Select the state of your registered business address.";
  const writtenStates = addressStates(settings.address);
  if (state && writtenStates.length === 1 && writtenStates[0].code !== state) {
    errors.business_state = "The selected state does not match the state written in your business address.";
  }
  if (!error && state && settings.gstin.slice(0,2) !== state) {
    errors.gstin = "The first two GSTIN digits must match the registered business address state.";
  }
  return errors;
}
export function inferStoreState(settings = {}) {
  const registered = registeredBusinessState(settings);
  if (registered) return registered;
  const prefix = typeof settings.gstin === "string" ? settings.gstin.slice(0,2) : "";
  if (INDIAN_STATES.some((s) => s.code === prefix)) return prefix;
  const address = String(settings.address ?? "").toLowerCase();
  return INDIAN_STATES.find((s) => address.includes(s.name.toLowerCase()))?.code ?? "";
}
export function checkoutSettings(value, partial = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw commerceError("Use the checkout settings form.");
  const result = partial ? {} : {...DEFAULT_CHECKOUT_SETTINGS};
  const errors = {};
  for (const [key,val] of Object.entries(value)) {
    if (!(key in DEFAULT_CHECKOUT_SETTINGS)) throw commerceError("Unknown checkout setting.");
    if (["flat_paise","free_above_paise","cod_max_paise"].includes(key)) {
      if (!Number.isSafeInteger(val) || val < 0 || val > 10000000000 || (key === "cod_max_paise" && val === 0)) errors[key] = "Enter a valid amount in rupees, with at most two decimal places.";
    } else if (key === "delivery_mode" && !["free","flat","free_above"].includes(val)) errors[key] = "Choose a delivery charge rule.";
    else if (key === "cod_enabled" && typeof val !== "boolean") errors[key] = "Choose whether Cash on Delivery is enabled.";
    else if (key === "store_state" && val !== "" && !INDIAN_STATES.some((s) => s.code === val)) errors[key] = "Choose an Indian state or union territory.";
    result[key] = val;
  }
  if (!partial && result.delivery_mode === "free_above" && result.free_above_paise <= 0) errors.free_above_paise = "Enter the amount above which delivery is free.";
  if (Object.keys(errors).length) throw commerceError("Check your checkout settings.", errors);
  return result;
}
export function cartItems(items, allowEmpty = true) {
  if (!Array.isArray(items) || items.length > 50 || (!allowEmpty && !items.length)) throw commerceError("Add products to your cart first.");
  const found = new Set();
  return items.map((item) => {
    if (!item || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.product_id ?? "") ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || found.has(item.product_id.toLowerCase())) throw commerceError("Check the products and quantities in your cart.");
    found.add(item.product_id.toLowerCase());
    return {product_id:item.product_id.toLowerCase(),quantity:item.quantity};
  });
}
export function inclusiveTax(gross, rate, intraState) {
  if (!Number.isSafeInteger(gross) || gross < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) throw commerceError("A product has invalid tax details.", undefined, 409);
  const denominator = 10000n + BigInt(Math.round(rate * 100));
  const taxable = Number((BigInt(gross) * 10000n + denominator / 2n) / denominator);
  const tax = gross - taxable;
  // Round taxable line value half-up. For odd intra-state tax, SGST gets
  // the remaining paise so CGST + SGST + taxable always equals the line total.
  return {taxable_paise:taxable,tax_paise:tax,cgst_paise:intraState?Math.floor(tax/2):0,
    sgst_paise:intraState?tax-Math.floor(tax/2):0,igst_paise:intraState?0:tax};
}
export function deliveryCharge(subtotal, settings) {
  if (!subtotal || settings.delivery_mode === "free" ||
    (settings.delivery_mode === "free_above" && subtotal >= settings.free_above_paise)) return 0;
  return settings.flat_paise;
}
export function quoteCart(published, inventory, requested, settings, state = "") {
  const issues = [], items = [];
  for (const wanted of cartItems(requested)) {
    const product = published.find((p) => p.id === wanted.product_id);
    const stock = inventory.find((p) => p.id === wanted.product_id);
    if (!product || !stock || stock.status !== "active") {
      issues.push({product_id:wanted.product_id,message:"This product is no longer available."}); continue;
    }
    const available = stock.track_inventory ? Number(stock.stock) : null;
    const quantity = available == null ? wanted.quantity : Math.min(wanted.quantity, available);
    if (quantity !== wanted.quantity) issues.push({product_id:wanted.product_id,message:quantity ?
      `Only ${quantity} of this product are available.` : "This product is out of stock."});
    if (!quantity) continue;
    const price = Number(product.price_paise);
    if (!Number.isSafeInteger(price) || price <= 0 || price > 10000000000) throw commerceError("A product is not available for checkout.", undefined, 409);
    const gross = price * quantity;
    items.push({product_id:product.id,title:product.title,quantity,unit_price_paise:price,line_total_paise:gross,
      image_url:product.images?.[0]?.url ?? "", stock:available,hsn_code:product.hsn_code,gst_rate:Number(product.gst_rate),
      ...inclusiveTax(gross,Number(product.gst_rate),!state || state === settings.store_state)});
  }
  const subtotal_paise = items.reduce((sum,item) => sum + item.line_total_paise,0);
  const delivery_paise = deliveryCharge(subtotal_paise,settings), total_paise = subtotal_paise + delivery_paise;
  return {items,issues,settings,subtotal_paise,delivery_paise,total_paise,
    tax_paise:items.reduce((sum,item) => sum + item.tax_paise,0),
    cod_available:settings.cod_enabled && !!settings.store_state && !!items.length && total_paise <= settings.cod_max_paise};
}
