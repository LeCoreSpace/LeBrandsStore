// Ordered Aura starter layouts for the editor. Never used as the live fallback (see defaultPageLayouts).
import { SECTION_SCHEMAS, defaultPageLayouts } from "./aura-layout.js";

export const STARTER_PAGES = ["home", "collection", "product", "cart", "checkout"];
/** Extensible template metadata. Only the shared defaults exist for now; no assignment controls. */
export const TEMPLATE_META = Object.freeze({
  product: { id: "default", label: "Default product", shared: true },
  collection: { id: "default", label: "Default collection", shared: true },
});
const ORDER = {
  home: ["announcement", "header", "hero", "featured-collection", "featured-products", "statement", "spotlight", "lookbook", "craft", "founder", "gallery", "trust", "reviews", "faq", "footer"],
  collection: ["header", "collection-heading", "collection-nav", "product-grid", "collection-description", "featured-products", "faq", "trust", "footer"],
  product: ["header", "product-details", "shipping-info", "product-specs", "material-care", "size-guide", "how-to-use", "faq", "related-products", "reviews", "footer"],
  cart: ["header", "commerce", "shipping-info", "trust", "footer"],
  checkout: ["header", "commerce", "trust", "footer"],
};
const hasPolicy = (data, kinds) => (data.policies || []).some(p => kinds.includes(p.kind) && p.body);
export function starterLayouts(data = {}) {
  const legacy = defaultPageLayouts(data), s = data.settings || {};
  const out = {};
  for (const page of STARTER_PAGES) {
    const have = Object.fromEntries(legacy[page === "cart" || page === "checkout" ? "home" : page].map(item => [item.type, item]));
    out[page] = ORDER[page].map(type => {
      const base = (page === "cart" || page === "checkout") && type === "commerce" ? legacy[page].find(i => i.type === "commerce") : have[type];
      const item = structuredClone(base || { id: `default-${type}`, type, settings: structuredClone(SECTION_SCHEMAS[type].defaults), blocks: [] });
      const set = flag => { item.settings.enabled = Boolean(flag); };
      if (type === "featured-collection") set((data.products || []).length);
      else if (type === "lookbook") set(item.blocks.length);
      else if (type === "craft" || type === "gallery") set(item.blocks.length);
      else if (type === "reviews") set((data.reviews || []).length);
      else if (type === "shipping-info") set(hasPolicy(data, ["shipping", "cancellation-refund"]));
      else if (type === "related-products") set((data.products || []).length > 1);
      else if (type === "collection-nav") set((data.collections || []).length && (data.products || []).some(p => Array.isArray(p.collection_ids)));
      else if (["featured-products", "spotlight", "faq", "product-specs", "material-care", "size-guide", "how-to-use", "collection-heading", "collection-description"].includes(type)) set(false);
      else if (type === "trust" && page !== "home") set(hasPolicy(data, ["shipping", "cancellation-refund"]) || s.support_email);
      return item;
    });
  }
  return out;
}
export const isLegacyDefault = (layout, page, data) => !Array.isArray(layout) || JSON.stringify(layout) === JSON.stringify(defaultPageLayouts(data)[page]);
export function uniqueId(base, ids) {
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`, candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
}
/** Merge an existing draft into the starter order. Existing sections keep all settings and content. */
export function mergeStarter(existing, page, data = {}) {
  const starter = starterLayouts(data)[page];
  if (!starter || !Array.isArray(existing)) return existing;
  const used = new Set();
  const result = starter.map(item => {
    const hit = existing.find(e => e.type === item.type && !used.has(e.id));
    if (!hit) return item;
    used.add(hit.id);
    return structuredClone(hit);
  });
  const ids = new Set(result.map(i => i.id));
  existing.forEach((item, index) => {
    if (used.has(item.id)) return;
    const copy = structuredClone(item);
    copy.id = uniqueId(copy.id, ids);
    ids.add(copy.id);
    let after = -1;
    for (let i = index - 1; i >= 0 && after < 0; i--) after = result.findIndex(r => r.id === existing[i].id || (used.has(existing[i].id) && r.id === existing[i].id));
    let at = after < 0 ? Math.min(2, result.length - 1) : after + 1;
    if (result[at - 1]?.type === "footer" || at >= result.length) at = result.length - 1;
    result.splice(at, 0, copy);
  });
  return result;
}
