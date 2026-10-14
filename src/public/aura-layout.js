import { SECTION_SCHEMAS, PAGE_KEYS } from "./sections/index.js";
import { isStarterImage } from "./aura-starter-assets.js";
export { SECTION_SCHEMAS, PAGE_KEYS };
export const AI_PAGE_KEYS=Object.freeze([...PAGE_KEYS,"faq"]);
// Keep the shipped migration registries immutable. AI extends them additively.
export const AI_SECTION_SCHEMAS=Object.freeze(Object.fromEntries(Object.entries(SECTION_SCHEMAS).map(([key,schema])=>[
  key,["header","footer","faq"].includes(key)?{...schema,allowedPages:[...schema.allowedPages,"faq"]}:schema
])));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const layoutError = message => Object.assign(new Error(message), { status: 400, code: "INVALID_LAYOUT" });
function fail(message) { throw layoutError(message); }
export function safeLayoutLink(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\s<>"'\\\u0000-\u001f]/.test(value)) return false;
  if (!value) return true;
  if (/^\/(?!\/)/.test(value)) return !/%(?:0[0-9a-f]|1[0-9a-f]|5c)/i.test(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) && !/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  } catch { return false; }
}
export function sanitizeRichText(value, maxLength = 5000) {
  if (typeof value !== "string" || [...value].length > maxLength) fail("Rich text is too long or has the wrong type.");
  const stack = [], allowed = new Set(["p", "br", "strong", "em", "ul", "ol", "li"]);
  if (/[<>]/.test(value.replace(/<\/?[a-z]+\s*\/?>/gi, ""))) fail("Rich text contains invalid HTML.");
  return value.replace(/<(\/?)([a-z]+)\s*(\/?)>/gi, (tag, close, rawName, slash) => {
    const name = rawName.toLowerCase();
    if (!allowed.has(name) || (slash && name !== "br")) fail("Rich text formatting is not allowed.");
    if (name !== "br") {
      if (close) { if (stack.pop() !== name) fail("Rich text tags are not balanced."); }
      else stack.push(name);
    }
    return name === "br" ? "<br>" : `<${close ? "/" : ""}${name}>`;
  }).replace(/$/, () => { if (stack.length) fail("Rich text tags are not balanced."); return ""; });
}
export function validateLayoutMedia(value, type, context = {}) {
   if (!plain(value) || Object.keys(value).some(key => !["url", "alt", "width", "height", "focalX", "focalY","sources"].includes(key))) fail("Invalid media object.");
  const extension = type === "video" ? "(?:mp4|webm)" : "(?:png|jpe?g|svg|webp|avif)";
  const match = String(value.url || "").match(new RegExp(`^https://media\\.lebrands\\.store/stores/(${UUID.source.slice(1, -1)})/${UUID.source.slice(1, -1)}\\.${extension}$`, "i"));
  const shared = type === "image" && isStarterImage(value.url);
  if (!shared && (!match || (context.storeId && match[1].toLowerCase() !== context.storeId.toLowerCase()))) fail("Media must belong to this store.");
  if (typeof value.alt !== "string" || !value.alt.trim() || value.alt.length > 500 || /[<>]/.test(value.alt)) fail("Media alt text is required.");
  for (const key of ["width", "height"]) if (own(value, key) && (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > 20000)) fail("Invalid image dimensions.");
  for (const key of ["focalX", "focalY"]) if (own(value, key) && (typeof value[key] !== "number" || value[key] < 0 || value[key] > 1)) fail("Invalid focal point.");
  if(own(value,"sources")){
    if(type!=="image"||!Array.isArray(value.sources)||value.sources.length>4||!value.width||!value.height)fail("Invalid responsive image sources.");
    const widths=new Set([value.width]),urls=new Set([value.url]);
    for(const source of value.sources){
      if(!plain(source)||Object.keys(source).some(k=>!["url","width","height"].includes(k))||!source.width||!source.height)fail("Invalid responsive image source.");
      validateLayoutMedia({...source,alt:value.alt},"image",context);
      if(source.width>=value.width||widths.has(source.width)||urls.has(source.url)||Math.abs(source.width/source.height-value.width/value.height)>.025)fail("Responsive images must retain the original aspect ratio and use distinct smaller sizes.");
      widths.add(source.width);urls.add(source.url);
    }
  }
  return structuredClone(value);
}
function validateFields(values, fields, context, enabled = true) {
  if (!plain(values) || Object.keys(values).some(key => !own(fields, key))) fail("Unknown section setting.");
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    const value = own(values, name) ? values[name] : field.default;
    if (value == null || value === "") {
      if (enabled && field.required) fail(`The ${name} field is required.`);
      result[name] = value ?? null; continue;
    }
    if (["text", "richtext"].includes(field.type)) {
      if (typeof value !== "string" || [...value].length > field.maxLength) fail(`The ${name} field is too long or has the wrong type.`);
      if (field.type === "text" && /[<>]/.test(value)) fail("HTML is not allowed in text fields.");
      result[name] = field.type === "richtext" ? sanitizeRichText(value, field.maxLength) : value;
    } else if (field.type === "toggle") {
      if (typeof value !== "boolean") fail(`The ${name} field must be a boolean.`);
      result[name] = value;
    } else if (field.type === "select") {
      if (!field.values.includes(value)) fail(`The ${name} selection is not allowed.`);
      result[name] = value;
    } else if (field.type === "colour") {
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) fail("Invalid colour.");
      result[name] = value;
    } else if (field.type === "link") {
      if (!safeLayoutLink(value)) fail("This link is not allowed.");
      result[name] = value;
    } else if (["image", "video"].includes(field.type)) result[name] = validateLayoutMedia(value, field.type, context);
    else if (["product", "collection"].includes(field.type)) {
      if (typeof value !== "string" || !UUID.test(value)) fail("Invalid product or collection.");
      const ids = context[field.type === "product" ? "productIds" : "collectionIds"];
      if (ids && !ids.has(value)) fail("Product or collection must belong to this store.");
      result[name] = value;
    } else if (field.type === "list") {
      if (!Array.isArray(value) || value.length < field.minItems || value.length > field.maxItems) fail("Invalid number of list items.");
      result[name] = value.map(item => validateFields(item, field.itemFields, context));
    } else fail("Unknown schema field type.");
  }
  return result;
}
export function validateLayout(pageKey, layout, context = {}) {
  if ((!PAGE_KEYS.includes(pageKey)&&pageKey!=="faq") || !Array.isArray(layout) || layout.length < 2 || layout.length > 30 || JSON.stringify(layout).length > 100000) fail("Invalid page or layout size.");
  const ids = new Set(), types = new Set();
  const result = layout.map(instance => {
    if (!plain(instance) || Object.keys(instance).some(key => !["id", "type", "settings", "blocks"].includes(key)) || typeof instance.id !== "string" || !IDENTIFIER.test(instance.id) || ids.has(instance.id)) fail("Invalid or duplicate section ID.");
    ids.add(instance.id);
    const schema = (pageKey==="faq"?AI_SECTION_SCHEMAS:SECTION_SCHEMAS)[instance.type];
    if (!own(SECTION_SCHEMAS,instance.type) || !schema.allowedPages.includes(pageKey)) fail("Section is not allowed on this page.");
    if (schema.requiredOn.includes(pageKey) && (types.has(instance.type) || instance.settings?.enabled === false)) fail("Required sections cannot be hidden or duplicated.");
    types.add(instance.type);
    const settings = validateFields(instance.settings, schema.fields, context, instance.settings?.enabled !== false);
    if (!Array.isArray(instance.blocks) || instance.blocks.length > schema.maxItems || (settings.enabled && instance.blocks.length && instance.blocks.length < schema.minItems)) fail("Invalid number of section blocks.");
    const blockIds = new Set();
    const blocks = instance.blocks.map(block => {
      if (!plain(block) || Object.keys(block).some(key => !["id", "type", "settings"].includes(key)) || typeof block.id !== "string" || !IDENTIFIER.test(block.id) || blockIds.has(block.id) || block.type !== "item" || !schema.blockFields) fail("Invalid section block.");
      blockIds.add(block.id);
      return { id: block.id, type: "item", settings: validateFields(block.settings, schema.blockFields, context, settings.enabled) };
    });
    if (settings.enabled && schema.id === "hero" && settings.variant === "video" && (!settings.video || !settings.poster)) fail("A video hero requires a video and poster.");
    return { id: instance.id, type: instance.type, settings, blocks };
  });
  for (const schema of Object.values(SECTION_SCHEMAS)) if (schema.requiredOn.includes(pageKey) && !types.has(schema.id)) fail(`Required ${schema.name} section is missing.`);
  if (result.at(-1).type !== "footer" || !["header", "announcement"].includes(result[0].type) || result.findIndex(item => item.type === "header") > 1) fail("Header and footer must frame the page.");
  return result;
}
export function getPageKey(options = {}) { return options.page === "policy" ? `policy-${options.policyKind}` : options.page || "home"; }
export function mergeSettingsToLayouts(layouts, settings, data = {}, changedKeys = null) {
  const defaults = defaultPageLayouts({ ...data, settings });
  const result = structuredClone(layouts);
  for (const [page, sections] of Object.entries(result)) {
    const fresh = defaults[page] || [];
    for (const instance of sections) {
      // Wizard-owned slots only. Never reset custom sections or their order.
      if (!["default-hero", "default-statement", "default-founder", "default-craft", "default-gallery", "default-about", "default-footer"].includes(instance.id)) continue;
      const replacement = fresh.find(next => next.id === instance.id);
      if (!replacement && instance.id === "default-gallery" && (!changedKeys || changedKeys.includes("gallery_images"))) {
        instance.blocks = []; instance.settings.enabled = false;
      }
      if (!replacement) continue;
      const keys = instance.type === "hero" ? ["title", "description", "image", "video", "poster", "variant"]
        : instance.type === "footer" ? ["brand_line"]
        : instance.type === "statement" ? ["text", "enabled"]
        : instance.type === "founder" ? ["portrait", "name", "story", "enabled"]
        : instance.type === "about" ? ["title", "body"] : [];
      const sources = { title: instance.type === "about" ? "brand_name" : "tagline", description: "description", image: "hero_image", video: "hero_video", poster: "hero_poster",
        variant: "hero_video", brand_line: "tagline", text: "statement", portrait: "founder_portrait", name: "founder_name", story: "founder_story", body: "description" };
      for (const key of keys) {
        const relevant = key === "enabled" ? (instance.type === "statement" ? ["statement"] : ["founder_name", "founder_story", "founder_portrait"]) :
          key === "variant" ? ["hero_video", "hero_poster"] : [sources[key]];
        if (!changedKeys || relevant.some(source => changedKeys.includes(source))) instance.settings[key] = replacement.settings[key];
      }
      if (["craft", "gallery"].includes(instance.type) && (!changedKeys || changedKeys.includes(`${instance.type}_images`))) {
        instance.blocks = replacement.blocks;
        if (instance.type === "gallery") instance.settings.enabled = true;
      }
    }
    if (page === "home" && !sections.some(part => part.id === "default-gallery") && defaults.home.some(part => part.type === "gallery")) {
      sections.splice(Math.max(0, sections.length - 1), 0, defaults.home.find(part => part.type === "gallery"));
    }
  }
  return result;
}
export function defaultPageLayouts(data = {}) {
  const s = data.settings || {}, brand = s.brand_name || data.store?.name || "Your brand";
  const make = (type, settings = {}, blocks = []) => ({ id: `default-${type}`, type, settings: { ...structuredClone(SECTION_SCHEMAS[type].defaults), ...settings }, blocks });
  const media = value => {
    if (!value?.url) return null;
    const out = { url: value.url, alt: value.alt || brand };
    for (const key of ["width", "height", "focalX", "focalY"]) if (own(value, key) && value[key] != null) out[key] = value[key];
    return out;
  };
  const blocks = (items, key = "image") => (items || []).map((item, index) => ({ id: `item-${index}`, type: "item", settings: { [key]: media(item), ...(key === "image" && item.caption ? { caption: item.caption } : {}) } }));
  const plainRich = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const home = [
    make("announcement", { enabled: false }), make("header"),
    make("hero", { title: s.tagline || brand, description: plainRich(s.description), image: media(s.hero_image || data.products?.[0]?.images?.[0]), video: media(s.hero_video), poster: media(s.hero_poster), variant: s.hero_video && s.hero_poster ? "video" : "split", button_label: "Shop the collection" }),
    make("statement", { text: s.statement || "", enabled: Boolean(s.statement) }),
    make("featured-collection", { title: "Collection" }),
    make("lookbook"), make("founder", { portrait: media(s.founder_portrait), story: plainRich(s.founder_story), name: s.founder_name || "", enabled: Boolean(s.founder_portrait && s.founder_name && s.founder_story) }),
    make("craft", {}, blocks(s.craft_images)), make("reviews"), make("trust"), make("footer", { brand_line: s.tagline || "" }),
  ];
  if (s.gallery_images?.length >= 4) home.splice(-3, 0, make("gallery", {}, blocks(s.gallery_images).map(block => ({ ...block, settings: { image: block.settings.image } }))));
  return Object.fromEntries([...PAGE_KEYS,"faq"].map(key => [key, key === "home" ? home : [
    make("header"),
    key === "collection" ? make("product-grid", { title: "Collection" }) :
      key === "product" ? make("product-details") :
      key === "about" ? make("about", { title: brand, body: plainRich(s.description) }) :
      key === "contact" ? make("contact", { title: "Contact" }) :
      key === "faq" ? make("faq") :
      key.startsWith("policy-") ? make("policy") : key === "404" ? make("not-found") : make("commerce"),
    make("footer", { brand_line: s.tagline || "" }),
  ]]));
}
