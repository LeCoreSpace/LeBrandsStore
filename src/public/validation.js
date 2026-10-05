// Shared by the Worker and wizard. No browser-only or server-only dependencies.
export const RESERVED_SUBDOMAINS = [
  "www", "app", "admin", "api", "brands", "customers", "mail", "notify", "news",
  "help", "support", "status", "shop", "store", "checkout", "cart", "pay",
  "payments", "login", "account", "dashboard", "blog", "docs", "cdn", "static",
  "assets", "media", "lebrands", "lebrandsspace",
];
export const CATEGORIES = [
  ["beauty", "Beauty"], ["fashion", "Fashion"], ["jewellery", "Jewellery"],
  ["home-decor", "Home & décor"], ["food-beverages", "Food & beverages"],
  ["wellness", "Wellness"], ["kids", "Kids"], ["pets", "Pets"],
  ["gifting", "Gifting"], ["other", "Other"],
].map(([value, label]) => ({ value, label }));
export const POLICY_KINDS = ["privacy", "terms", "shipping", "cancellation-refund", "contact", "pricing"];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const length = (value) => typeof value === "string" ? [...value.trim()].length : 0;
export function contrastColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? "")) return null;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}
export function validateBasics(s = {}) {
  const errors = {};
  if (length(s.brand_name) < 2 || length(s.brand_name) > 40) errors.brand_name = "Use 2 to 40 characters for your brand name.";
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s.subdomain ?? "")) errors.subdomain = "Use 3 to 30 lowercase letters, numbers or hyphens.";
  if (RESERVED_SUBDOMAINS.includes(s.subdomain)) errors.subdomain = "That address is reserved. Choose another.";
  if (!UUID.test(s.logo_media_id ?? "")) errors.logo_media_id = "Upload your brand logo.";
  if (length(s.description) < 50 || length(s.description) > 500) errors.description = "Describe your brand in 50 to 500 characters.";
  if (length(s.tagline) > 60) errors.tagline = "Keep your tagline within 60 characters.";
  if (length(s.legal_name) < 2 || length(s.legal_name) > 120) errors.legal_name = "Enter your legal business name (2 to 120 characters).";
  if (length(s.address) < 10 || length(s.address) > 500) errors.address = "Enter your full business address (10 to 500 characters).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.support_email ?? "") || length(s.support_email) > 254) errors.support_email = "Enter a valid support email.";
  if (!/^\+?[0-9 ()-]{7,25}$/.test(s.support_phone ?? "")) errors.support_phone = "Enter a valid support phone or WhatsApp number.";
  if (s.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.gstin)) errors.gstin = "Enter a valid 15-character GSTIN, or leave it blank.";
  if (!CATEGORIES.some((c) => c.value === s.category)) errors.category = "Choose a store category.";
  return errors;
}
export function validateTheme(s = {}) {
  const errors = {};
  if (s.theme !== "aura") errors.theme = "Choose Aura. Bazaar is coming soon.";
  if (!contrastColor(s.accent_color)) errors.accent_color = "Choose a six-digit hex colour. Button text is adjusted for contrast.";
  if (!["serif", "modern", "classic"].includes(s.font_preset)) errors.font_preset = "Choose one of the three font presets.";
  if (!["rounded", "square", "pill"].includes(s.button_style)) errors.button_style = "Choose a button style.";
  return errors;
}
export function validateProduct(p = {}) {
  const errors = {};
  if (length(p.title) < 3 || length(p.title) > 80) errors.title = "Use 3 to 80 characters for the product title.";
  if (!Number.isSafeInteger(p.price_paise) || p.price_paise <= 0 || p.price_paise > 10000000000) errors.price_paise = "Enter a price greater than ₹0, with at most two decimal places.";
  if (p.compare_at_paise != null && (!Number.isSafeInteger(p.compare_at_paise) || p.compare_at_paise < p.price_paise || p.compare_at_paise > 10000000000)) errors.compare_at_paise = "Compare-at price must be at least the selling price.";
  if (length(p.description) < 30 || length(p.description) > 2000) errors.description = "Describe the product in 30 to 2,000 characters.";
  if (!Array.isArray(p.images) || p.images.length < 1 || p.images.length > 8 || p.images.some((m) => !UUID.test(m.id ?? ""))) errors.images = "Add 1 to 8 product images.";
  if (!Array.isArray(p.tags ?? []) || (p.tags ?? []).length > 10 || (p.tags ?? []).some((v) => typeof v !== "string" || length(v) < 1 || length(v) > 40)) errors.tags = "Use up to 10 tags, each within 40 characters.";
  if (p.sku && (length(p.sku) > 80 || typeof p.sku !== "string")) errors.sku = "Keep the SKU within 80 characters.";
  if (p.stock != null && (!Number.isInteger(p.stock) || p.stock < 0 || p.stock > 2147483647)) errors.stock = "Enter a whole stock quantity, or leave it blank for always in stock.";
  if (!/^(?:[0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(p.hsn_code ?? "")) errors.hsn_code = "Enter a 4, 6 or 8-digit HSN code.";
  if (![0, .25, 3, 5, 12, 18, 28].includes(p.gst_rate)) errors.gst_rate = "Choose a GST rate.";
  return errors;
}
export function publishChecklist(data) {
  const products = data.products ?? [], policies = data.policies ?? [];
  return [
    { label: "Brand basics and contact details complete", complete: Object.keys(validateBasics(data.settings)).length === 0 && data.settings.subdomain === data.store?.subdomain },
    { label: "Aura theme configured", complete: Object.keys(validateTheme(data.settings)).length === 0 },
    { label: "At least one complete product", complete: products.length > 0 && products.every((p) => !Object.keys(validateProduct(p)).length) },
    { label: "All six policy drafts generated and reviewed", complete: POLICY_KINDS.every((kind) => policies.some((p) => p.kind === kind && p.reviewed === true && length(p.body) >= 30)) },
  ];
}
export function resumeStep(data) {
  const completed = data.progress?.completed ?? [];
  return [1, 2, 3, 4].find((step) => !completed.includes(step)) ?? 4;
}
