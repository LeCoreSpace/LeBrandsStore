import {UUID} from "../public/validation.js";
import {badInput} from "../store/input.js";

export const SECTION_TYPES = ["text","image","image_text","quote","product","faq","cta"];
const object = v => v && typeof v === "object" && !Array.isArray(v);
function text(v, max, field) {
  if (v === undefined) return "";
  if (typeof v !== "string" || [...v].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))
    throw badInput(`Check ${field}. Use no more than ${max} characters.`);
  return v.trim();
}
function reference(v, field) {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !UUID.test(v)) throw badInput(`Choose a valid ${field}.`);
  return v;
}
export function safeBlogHref(value) {
  if (!value) return "";
  // Public storefront paths only. No protocol-relative, escaped or private paths.
  if (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value)) {
    const u = new URL(value, "https://store.invalid");
    if (u.origin === "https://store.invalid" &&
      /^(?:\/$|\/(?:products|collections|pages|policies|blog)(?:\/|$))/.test(u.pathname)) return u.pathname + u.search + u.hash;
    return "";
  }
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && !u.username && !u.password) return u.href;
  } catch {}
  return "";
}
export function blogInput(input) {
  if (!object(input)) throw badInput("Use the article editor.");
  const allowed = new Set(["title","slug","summary","author","category","hero_media_id","hero_alt","sections","expected_revision"]);
  if (Object.keys(input).some(k => !allowed.has(k))) throw badInput("Unknown article field.");
  const result = {};
  for (const [key,max] of Object.entries({title:160,slug:160,summary:400,author:100,category:80,hero_alt:300}))
    result[key] = text(input[key],max,key);
  if (!result.title) throw badInput("Give your article a title.");
  if (!result.slug && !input.expected_revision) {
    result.slug = result.title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,160).replace(/-$/,"");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) throw badInput("Use lowercase letters, numbers and single hyphens in the article address.");
  result.hero_media_id = reference(input.hero_media_id,"hero image");
  if (!Array.isArray(input.sections) || input.sections.length > 40) throw badInput("Use up to 40 article sections.");
  const ids = new Set();
  result.sections = input.sections.map(s => {
    if (!object(s) || !SECTION_TYPES.includes(s.type) || !UUID.test(s.id || "") || ids.has(s.id))
      throw badInput("Check your article sections.");
    if (Object.keys(s).some(k => !["id","type","heading","body","media_id","alt","product_id","href"].includes(k)))
      throw badInput("Unknown article section field.");
    ids.add(s.id);
    const value = {id:s.id,type:s.type,heading:text(s.heading,200,"section heading"),
      body:text(s.body,12000,"section text")};
    if (["image","image_text"].includes(s.type)) {
      value.media_id = reference(s.media_id,"section image");
      value.alt = text(s.alt,300,"image description");
    }
    if (s.type === "product") value.product_id = reference(s.product_id,"published product");
    if (s.type === "cta") {
      const href = text(s.href,2000,"button link");
      value.href = safeBlogHref(href);
      if (href && !value.href) throw badInput("Use an HTTPS link or a public store page for your button.");
    }
    return value;
  });
  // References and incomplete copy may be saved as drafts; publication validation
  // belongs to the separate public-blog phase.
  return result;
}
export function blogRevision(value) {
  if (typeof value !== "string" && typeof value !== "number") throw badInput("Reload this article before saving.");
  const revision = String(value);
  if (!/^[1-9][0-9]{0,14}$/.test(revision)) throw badInput("Reload this article before saving.");
  return revision;
}
