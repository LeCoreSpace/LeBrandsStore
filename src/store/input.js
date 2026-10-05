import { CATEGORIES, UUID, validateTheme } from "../public/validation.js";

export const badInput = (message, errors) => Object.assign(new Error(message), { status: 400, errors });
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const string = (value, max, field) => {
  if (typeof value !== "string" || [...value].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw badInput(`Check ${field}.`, { [field]: `Use no more than ${max} characters and no control characters.` });
  return value.trim();
};
export function settingsPatch(value) {
  if (!object(value)) throw badInput("Use the setup form.");
  const result = {}, limits = {
    brand_name: 40, subdomain: 30, tagline: 60, description: 500,
    legal_name: 120, address: 500, support_email: 254, support_phone: 25,
    gstin: 15, category: 30, theme: 20, accent_color: 7, font_preset: 20, button_style: 20,
  };
  for (const [key, val] of Object.entries(value)) {
    if (key === "logo_media_id") {
      if (val != null && !UUID.test(val)) throw badInput("Choose an uploaded logo.");
      result[key] = val; continue;
    }
    if (!(key in limits)) throw badInput("Unknown store setting.");
    result[key] = string(val, limits[key], key);
  }
  // Incomplete text is a valid autosaved draft, but never a published address.
  if (result.category && !CATEGORIES.some((c) => c.value === result.category)) throw badInput("Choose a store category.");
  if (result.gstin) result.gstin = result.gstin.toUpperCase();
  const themeFields = ["theme", "accent_color", "font_preset", "button_style"];
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
  const result = {}, textFields = { title: 80, description: 2000, sku: 80, hsn_code: 8 };
  for (const [key, val] of Object.entries(value)) {
    if (key in textFields) { result[key] = string(val, textFields[key], key); continue; }
    if (["price_paise", "compare_at_paise", "stock"].includes(key)) {
      if ((key !== "price_paise" && val === null) ||
        (Number.isSafeInteger(val) && val >= 0 && val <= (key === "stock" ? 2147483647 : 10000000000))) { result[key] = val; continue; }
      throw badInput("Enter a valid whole amount.", { [key]: "Use a valid amount. Prices must have no more than two decimal places." });
    }
    if (key === "gst_rate") {
      if (val === null || [0, .25, 3, 5, 12, 18, 28].includes(val)) { result[key] = val; continue; }
      throw badInput("Choose a GST rate.");
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
export async function readJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw badInput("Use the provided form.");
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBody(request)));
    if (!object(value)) throw badInput("Use the provided form.");
    return value;
  } catch (error) {
    if (error.status) throw error;
    throw badInput("Use valid form data.");
  }
}
