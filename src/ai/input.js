import { UUID } from "../public/validation.js";
import { CURRENT_GST_RATES } from "../public/commerce-rules.js";

export const aiError = (message, status = 400) => Object.assign(new Error(message), { status });
const fail = message => { throw aiError(message); };
function object(value, keys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) fail(`Check ${name}.`);
  return value;
}
function text(value, max, name, required = false, min = 0) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`Check ${name}.`);
  const clean = value.trim().replace(/[\u2013\u2014]/g, "-");
  if ((required && !clean) || (clean && clean.length < min)) fail(`Check ${name}.`);
  return clean;
}
function integer(value, max, name, optional = false) {
  if (optional && (value == null || value === "")) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`Check ${name}.`);
  return value;
}
function strings(value, max, length, name) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) fail(`Check ${name}.`);
  return value.map(item => text(item, length, name, true));
}
const email = (value, name) => {
  const clean = text(value, 254, name, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) fail(`Check ${name}.`);
  return clean;
};
const id = (value, name, optional = false) => {
  if (optional && !value) return null;
  if (typeof value !== "string" || !UUID.test(value)) fail(`Check ${name}.`);
  return value.toLowerCase();
};
export function validateBrief(value) {
  object(value, ["brand", "products", "selling"], "brand form");
  const b = object(value.brand, ["name","tagline","category","subcategory","sells","audience","differentiators",
    "founder_story","year_started","city","vibe","reference_words","logo_id","colours","language","section_images"], "brand");
  if(b.section_images!=null&&typeof b.section_images!=="boolean")fail("Choose whether to generate section images.");
  if (b.language !== "English") fail("English is the supported store language.");
  const vibes = ["Minimal","Luxe","Earthy","Bold","Playful","Traditional","Modern Indian","Street"];
  if (!vibes.includes(b.vibe)) fail("Choose a brand vibe.");
  const colours = strings(b.colours, 3, 7, "colours");
  if (colours.some(colour => !/^#[a-f0-9]{6}$/i.test(colour))) fail("Use six-digit hex colours.");
  const brand = {
    name:text(b.name,120,"brand name",true), tagline:text(b.tagline,240,"tagline"),
    category:text(b.category,120,"category",true), subcategory:text(b.subcategory,120,"subcategory"),
    sells:text(b.sells,500,"what you sell",true,50), audience:text(b.audience,500,"audience",true),
    differentiators:strings(b.differentiators,3,240,"differences"), founder_story:text(b.founder_story,3000,"founder story"),
    year_started:integer(b.year_started,2100,"year started",true), city:text(b.city,120,"city"),
    vibe:b.vibe, reference_words:strings(b.reference_words,3,60,"reference words"),
    logo_id:id(b.logo_id,"logo",true), colours, language:"English",section_images:b.section_images===true,
  };
  if (brand.year_started != null && brand.year_started < 1800) fail("Check year started.");
  if (!Array.isArray(value.products) || value.products.length < 1 || value.products.length > 5) fail("Add one to five products.");
  const products = value.products.map((raw, index) => {
    const p = object(raw, ["id","name","description","price_paise","compare_at_paise","gst_rate","hsn","stock","photo_ids","material",
      "variants","care","features","how_to_use","size_chart","ai_images","image_styles"], `product ${index+1}`);
    if (!CURRENT_GST_RATES.includes(p.gst_rate)&&!(p.id&&[12,28].includes(p.gst_rate))) fail("Choose a GST rate explicitly for every product.");
    if (!Array.isArray(p.photo_ids) || p.photo_ids.length < 1 || p.photo_ids.length > 5) fail("Each product needs one to five real photos.");
    const sizes = p.size_chart ?? [];
    if (!Array.isArray(sizes) || sizes.length > 20) fail("Check size chart.");
    const styles = strings(p.image_styles,5,20,"image styles");
    if (styles.some(style => !["background","lifestyle","flatlay","closeup","model"].includes(style))) fail("Choose a supported image style.");
    const product = {
      id:id(p.id,"product",true), name:text(p.name,200,"product name",true),
      description:text(p.description,5000,"product description"),
      price_paise:integer(p.price_paise,1000000000,"product price"),
      compare_at_paise:integer(p.compare_at_paise,1000000000,"compare-at price",true),
      gst_rate:p.gst_rate, hsn:text(p.hsn,8,"HSN"), stock:p.id&&p.stock===null?null:integer(p.stock,1000000,"stock"),
      photo_ids:[...new Set(p.photo_ids.map(photo => id(photo,"photo")))],
      material:text(p.material,1000,"material"), variants:text(p.variants,1000,"variants"),
      care:text(p.care,1000,"care"), features:strings(p.features,8,240,"features"),
      how_to_use:text(p.how_to_use,1000,"how to use"), size_chart:sizes.map(size => {
        object(size,["size","measurement"],"size row");
        return {size:text(size.size,80,"size",true),measurement:text(size.measurement,240,"measurement",true)};
      }),
      ai_images:integer(p.ai_images ?? 0,4,"AI image count"), image_styles:styles,
    };
    if (product.compare_at_paise != null && product.compare_at_paise < product.price_paise) fail("Compare-at price cannot be below the selling price.");
    if (product.ai_images && !styles.length) fail("Choose an image style for each opted-in product.");
    if (product.hsn && !/^\d{4,8}$/.test(product.hsn)) fail("Check HSN.");
    return product;
  });
  const s = object(value.selling, ["delivery_time","free_shipping_threshold_paise","cod","returns_window",
    "returns_conditions","contact_email","phone","whatsapp","address","first_order_offer","prepaid_discount_paise"], "selling details");
  if (typeof s.cod !== "boolean") fail("Choose whether your brand accepts COD.");
  const selling = {
    delivery_time:text(s.delivery_time,240,"delivery time"),
    free_shipping_threshold_paise:integer(s.free_shipping_threshold_paise,1000000000,"free-shipping threshold",true),
    cod:s.cod, returns_window:text(s.returns_window,120,"returns window"),
    returns_conditions:text(s.returns_conditions,2000,"return conditions"),
    contact_email:email(s.contact_email,"contact email"), phone:text(s.phone,30,"phone"),
    whatsapp:text(s.whatsapp,30,"WhatsApp"), address:text(s.address,1000,"business address",true),
    first_order_offer:text(s.first_order_offer,500,"first-order offer"),
    prepaid_discount_paise:integer(s.prepaid_discount_paise,1000000000,"prepaid discount",true),
  };
  return {brand,products,selling};
}

export function plainCopy(value, facts) {
  if (typeof value !== "string" || value.length > 5000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("AI returned unsafe or oversized copy.");
  value=value.replace(/[\u2013\u2014]/g,"-").replace(/\r\n?/g,"\n");
  // No reviews, numerical social proof, urgency, ratings or unsupported certification.
  if (/\b(?:rated|rating|testimonials?|five.star|5.star|customers love|selling fast|only \d+ left|hurry|best.selling)\b/i.test(value)) fail("AI returned unsupported social proof or urgency.");
  const source = JSON.stringify(facts).toLowerCase();
  for (const claim of value.match(/\b(?:\d+(?:[.,]\d+)*%?|\d{4}|certified|organic|award|awards|handmade|handcrafted|sustainable|recycled|guaranteed)\b/gi) || []) {
    if (!source.includes(claim.toLowerCase())) fail("AI returned a claim that was not supplied by the brand.");
  }
  return value;
}
