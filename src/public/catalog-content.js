import { sanitizeRichText, validateLayoutMedia } from "./aura-layout.js";
import { UUID } from "./validation.js";

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const plain = value => value && typeof value === "object" && !Array.isArray(value);
function text(value, max, rich = false) {
  if (typeof value !== "string" || [...value].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail("Check the content length and format.");
  return rich ? sanitizeRichText(value, max) : value.trim();
}
function rows(value, fields, max = 20) {
  if (!Array.isArray(value) || value.length > max) fail(`Use no more than ${max} items.`);
  return value.map(row => {
    if (!plain(row) || Object.keys(row).some(key => !(key in fields))) fail("Unknown content field.");
    return Object.fromEntries(Object.entries(fields).map(([key, [limit, rich]]) => [key, text(row[key] ?? "", limit, rich)]));
  });
}
const FAQ = { question: [240, false], answer: [3000, true] };
export function validateProductContent(value) {
  if (!plain(value)) fail("Use the product content form.");
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (["description_features", "materials_care", "delivery_returns"].includes(key)) result[key] = text(item, 5000, true);
    else if (key === "size_note") result[key] = text(item, 500);
    else if (key === "features") result[key] = rows(item, { label: [80], value: [240] });
    else if (key === "size_guide") result[key] = rows(item, { size: [80], measurement: [240] });
    else if (key === "how_to_use") result[key] = rows(item, { title: [160], text: [1000] }, 10);
    else if (key === "faq") result[key] = rows(item, FAQ);
    else fail("Unknown product content field.");
  }
  return result;
}
export function validateCollectionPatch(value, context = {}) {
  if (!plain(value)) fail("Use the collection form.");
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (["title", "slug", "description"].includes(key)) result[key] = text(item, { title: 120, slug: 80, description: 4000 }[key]);
    else if (["product_ids", "related_ids"].includes(key)) {
      if (!Array.isArray(item) || item.length > (key === "product_ids" ? 500 : 20) || item.some(id => typeof id !== "string" || !UUID.test(id))) fail("Choose valid catalogue items.");
      result[key] = item.map(id => id.toLowerCase());
      if (new Set(result[key]).size !== item.length) fail("Choose different catalogue items.");
    } else if (key === "cover") result.cover = item === null ? null : validateLayoutMedia(item, "image", context);
    else if (key === "faq") result.faq = rows(item, FAQ);
    else fail("Unknown collection field.");
  }
  if ("title" in result && !result.title) fail("Enter a collection title.");
  if ("slug" in result && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug) || result.slug === "all")) fail("Use a lowercase collection address, not 'all'.");
  return result;
}
