import { CATEGORIES, UUID, validateTheme } from "../public/validation.js";
import { CURRENT_GST_RATES, LEGACY_GST_RATES, INDIAN_STATES, gstinError, validInvoicePrefix } from "../public/commerce-rules.js";
import { validateLayoutMedia } from "../public/aura-layout.js";
import { validateProductContent } from "../public/catalog-content.js";
import {validateCatalogue} from "../public/catalogue-model.js";
import { validCategoryPair } from "../public/aura-taxonomy.js";

export const badInput = (message, errors) => Object.assign(new Error(message), { status: 400, errors });
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const string = (value, max, field) => {
  if (typeof value !== "string" || [...value].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw badInput(`Check ${field}.`, { [field]: `Use no more than ${max} characters and no control characters.` });
  return value.trim();
};
export function settingsPatch(value, context = {}) {
  if (!object(value)) throw badInput("Use the setup form.");
  const result = {}, limits = {
    brand_name: 40, subdomain: 30, tagline: 60, description: 500,
    legal_name: 120, trade_name:120, address: 500, support_email: 254,notification_email:254, support_phone: 25,
    business_line1:150,business_line2:150,business_city:80,business_pincode:6,invoice_prefix:4,
    gstin: 15, business_state: 2, category: 200, subcategory: 200, theme: 20, accent_color: 7, font_preset: 20, button_style: 20,
    color_preset: 20, style_preset: 20, statement: 500, founder_name: 160, founder_story: 4000,
  };
  for (const [key, val] of Object.entries(value)) {
    if (["hero_image", "hero_video", "hero_poster", "founder_portrait"].includes(key)) {
      result[key] = val == null ? null : validateLayoutMedia(val, key === "hero_video" ? "video" : "image", context);
      continue;
    }
    if (["craft_images", "gallery_images"].includes(key)) {
      if (!Array.isArray(val) || val.length > 8) throw badInput("Use no more than 8 images.", { [key]: "Use up to 8 images." });
      result[key] = val.map(image => validateLayoutMedia(image, "image", context));
      continue;
    }
    if (["logo_media_id","signature_media_id"].includes(key)) {
      if (val != null && !UUID.test(val)) throw badInput("Choose an uploaded image.", { [key]: "Choose an image uploaded to this store." });
      result[key] = val; continue;
    }
    if (!(key in limits)) throw badInput("Unknown store setting.");
    result[key] = string(val, limits[key], key);
  }
  // Incomplete text is a valid autosaved draft, but never a published address.
  if (result.category && !CATEGORIES.some((c) => c.value === result.category)) throw badInput("Choose a store category.", { category: "Choose a store category from the list." });
  if (result.category && !validCategoryPair(result.category, result.subcategory)) throw badInput("Choose a matching subcategory.", { subcategory: "Choose a subcategory belonging to this category." });
  if (result.gstin) result.gstin = result.gstin.toUpperCase();
  const formatErrors = {};
  if ("invoice_prefix" in result && !validInvoicePrefix(result.invoice_prefix)) formatErrors.invoice_prefix = "Use 1 to 4 uppercase letters or digits.";
  if (result.business_pincode && !/^[1-9][0-9]{5}$/.test(result.business_pincode)) formatErrors.business_pincode = "Enter a six-digit PIN.";
  if (result.support_phone) {
    const digits=result.support_phone.replace(/\D/g,"");
    if (digits.length===10) result.support_phone=`+91${digits}`;
    else if (digits.length===12 && digits.startsWith("91")) result.support_phone=`+${digits}`;
  }
  if (result.business_line1 && result.business_city && result.business_pincode && result.business_state) {
    result.address=[result.business_line1,result.business_line2,`${result.business_city}, ${INDIAN_STATES.find(s=>s.code===result.business_state)?.name || ""} ${result.business_pincode}`].filter(Boolean).join("\n");
  }
  const gstError = gstinError(result.gstin,false);
  if (gstError) formatErrors.gstin = gstError;
  if (result.business_state && !INDIAN_STATES.some(s => s.code === result.business_state)) formatErrors.business_state = "Choose a valid Indian state.";
  if (result.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.support_email)) formatErrors.support_email = "Enter a valid email.";
  if (result.notification_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.notification_email)) formatErrors.notification_email = "Enter a valid notification email.";
  if (result.support_phone && !/^\+?[0-9 ()-]{7,25}$/.test(result.support_phone)) formatErrors.support_phone = "Enter a valid phone number, such as +91 followed by your number.";
  if (Object.keys(formatErrors).length) throw badInput("Check the highlighted fields.", formatErrors);
  const themeFields = ["theme", "accent_color", "font_preset", "button_style", "color_preset", "style_preset"];
  const errors = validateTheme({ theme: "aura", accent_color: "#214a3d", font_preset: "serif", button_style: "rounded", ...result });
  if (themeFields.some((key) => key in result && errors[key])) throw badInput("Check your theme settings.", errors);
  return result;
}
export function progressPatch(value) {
  if (!object(value) || Object.keys(value).some((key) => !["step", "completed"].includes(key)) ||
    !Number.isInteger(value.step) || value.step < 1 || value.step > 4 ||
    ("completed" in value && (!Array.isArray(value.completed) || value.completed.some((n) => !Number.isInteger(n) || n < 1 || n > 4)))) throw badInput("Choose a valid wizard step.");
  return { step: value.step, completed: [...new Set(value.completed ?? [])] };
}
export function productPatch(value) {
  if (!object(value)) throw badInput("Use the product form.");
  const result = {}, textFields = { title: 80, description: 2000, sku: 80, hsn_code: 8, slug:80 };
  for (const [key, val] of Object.entries(value)) {
    if(key==="catalogue"){result.catalogue=validateCatalogue(val);continue;}
    if(key==="variants"){
      if(!Array.isArray(val)||val.length>200)throw badInput("Use at most 200 variants.");
      result.variants=val;continue;
    }
    if(key==="collection_ids"){
      if(!Array.isArray(val)||val.length>100||val.some(id=>typeof id!=="string"||!UUID.test(id))||new Set(val.map(id=>id.toLowerCase())).size!==val.length)throw badInput("Choose different, valid collections.");
      result.collection_ids=val.map(id=>id.toLowerCase());continue;
    }
    if(key==="slug"&&val!==""&&(typeof val!=="string"||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val)))throw badInput("Use lowercase letters, numbers and hyphens for the product address.");
    if (key === "content") { result.content = validateProductContent(val); continue; }
    if (key in textFields) { result[key] = string(val, textFields[key], key); continue; }
    if (["price_paise", "compare_at_paise", "stock"].includes(key)) {
      if ((key !== "price_paise" && val === null) ||
        (Number.isSafeInteger(val) && val >= 0 && val <= (key === "stock" ? 2147483647 : 10000000000))) { result[key] = val; continue; }
      throw badInput("Enter a valid whole amount.", { [key]: "Use a valid amount. Prices must have no more than two decimal places." });
    }
    if (key === "gst_rate") {
      if ([...CURRENT_GST_RATES,...LEGACY_GST_RATES].includes(val)) { result[key] = val; continue; }
      throw badInput("Choose a GST rate explicitly.", {gst_rate:"Choose a GST rate explicitly."});
    }
    if (key === "tags") {
      if (!Array.isArray(val) || val.length > 10) throw badInput("Use at most 10 tags.");
      result[key] = val.map((tag) => string(tag, 40, "tags")).filter(Boolean); continue;
    }
    if (key === "images") {
      if (!Array.isArray(val) || val.length > 8 || new Set(val.map((v) => v?.id)).size !== val.length) throw badInput("Use up to 8 different product images.");
      result[key] = val.map((m) => {
        if (!object(m) || !UUID.test(m.id ?? "") || Object.keys(m).some((k) => !["id", "alt"].includes(k))) throw badInput("Choose uploaded product images.");
        return { id: m.id, alt: string(m.alt ?? "", 200, "image alt text") };
      }); continue;
    }
    throw badInput("Unknown product field.");
  }
  return result;
}
export async function readBody(request, limit = 65536) {
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  if (!reader) return new Uint8Array();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw badInput("This request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
export async function readJson(request,limit=65536) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw badInput("Use the provided form.");
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBody(request,limit)));
    if (!object(value)) throw badInput("Use the provided form.");
    return value;
  } catch (error) {
    if (error.status) throw error;
    throw badInput("Use valid form data.");
  }
}
