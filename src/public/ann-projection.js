// Pure helpers for Ann. Nothing here touches the network, the DOM or stored data.
import { ANN_EXTRA_SECTIONS } from "./ann-config.js";
import { applyAnnCategoryCopy, annCategoryContext } from "./ann-category-copy.js";
import { styleDemonstration } from "./style-demo-copy.js";
import { starterLayouts } from "./aura-skeleton.js";
import { categoryRecord } from "./aura-taxonomy.js";

export const ANN_ANSWER_KEYS = Object.freeze(["store_name","tagline","description","category_id","subcategory_id","style_preset","color_preset","font_preset","accent_color","button_style","collections","product_ideas","section_options"]);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clone = v => (v === undefined ? v : structuredClone(v));

/** Registration details and matching taxonomy slugs. Never saved on load. */
export function initialAnswers(settings = {}, store = {}, reference = {}) {
  const a = {};
  const plain = value => String(value).replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "‹").replace(/&gt;/g, "›")
    .replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const name = settings.brand_name || store.name;
  if (name) a.store_name = plain(name).slice(0, 120);
  if (settings.tagline) a.tagline = plain(settings.tagline).slice(0, 160);
  if (settings.description) a.description = plain(settings.description).slice(0, 1200);
  const legacy = categoryRecord(settings.category);
  const cat = (reference.categories || []).find(c => c.slug && c.slug === settings.category ||
    legacy && Number(c.category_id) === legacy.id);
  if (cat) {
    a.category_id = Number(cat.category_id);
    const sub = (reference.subcategories || []).find(s => s.slug && s.slug === settings.subcategory && Number(s.category_id) === a.category_id);
    if (sub) a.subcategory_id = Number(sub.subcategory_id);
  }
  return a;
}

/** Only changed answers; null removes an answer the server still holds. */
export function diffAnswers(saved = {}, working = {}) {
  const patch = {};
  for (const k of ANN_ANSWER_KEYS) {
    const w = working[k], s = saved[k];
    if (w === undefined || w === null) { if (s !== undefined && s !== null) patch[k] = null; }
    else if (!same(w, s)) patch[k] = clone(w);
  }
  return patch;
}

/** Local mirror of server rules so the preview matches immediately. */
export function changeCategory(answers, categoryId) {
  const next = clone(answers), cleared = { subcategory: false, attributes: 0 };
  if (next.category_id === categoryId) return { answers: next, cleared };
  next.category_id = categoryId;
  if (next.subcategory_id !== undefined) { delete next.subcategory_id; cleared.subcategory = true; }
  cleared.attributes = clearAttributes(next);
  return { answers: next, cleared };
}
export function changeSubcategory(answers, subcategoryId) {
  const next = clone(answers);
  if (next.subcategory_id === subcategoryId) return { answers: next, cleared: { attributes: 0 } };
  next.subcategory_id = subcategoryId;
  return { answers: next, cleared: { attributes: clearAttributes(next) } };
}
function clearAttributes(answers) {
  let count = 0;
  answers.product_ideas = (answers.product_ideas || []).map(p => {
    count += (p.attributes || []).length;
    return { ...p, attributes: [] };
  });
  if (!answers.product_ideas.length) delete answers.product_ideas;
  return count;
}

export function nextKey(prefix, existing) {
  const used = new Set(existing);
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Count available planning answers, never navigation or launch readiness. */
export function annAnsweredStages(a = {}, reference = {}) {
  const answered = new Set();
  const named = x => typeof x?.name === "string" && x.name.trim().length > 0;
  const categories = reference.categories || [];
  const cat = categories.find(c => Number(c.category_id) === Number(a.category_id));
  const subs = (reference.subcategories || []).filter(s => Number(s.category_id) === Number(a.category_id));
  if (cat && (!subs.length || subs.some(s => Number(s.subcategory_id) === Number(a.subcategory_id)))) answered.add("category");
  if (["editorial", "boutique", "architectural", "minimal", "vintage"].includes(a.style_preset)) answered.add("style");
  if (["white", "ivory", "stone", "midnight"].includes(a.color_preset) &&
      /^#[0-9a-f]{6}$/i.test(a.accent_color || "") &&
      ["square", "rounded", "pill"].includes(a.button_style)) answered.add("palette");
  if (["modern", "serif", "classic"].includes(a.font_preset)) answered.add("fonts");
  const cols = a.collections || [], ideas = a.product_ideas || [];
  if (cols.length && cols.every(named)) answered.add("collections");
  if (cols.length && cols.every(c => ideas.some(p => p.collection_key === c.key && named(p)))) answered.add("products");
  if (String(a.store_name || "").trim() && String(a.description || "").trim()) answered.add("story");
  return answered;
}

/** Messages that block saving, in plain words. Empty array means safe to send. */
export function planProblems(answers = {}) {
  const out = [];
  if ("store_name" in answers && !String(answers.store_name || "").trim()) out.push("Enter a store name.");
  const keys = new Set((answers.collections || []).map(c => c.key));
  (answers.collections || []).forEach((c, i) => { if (!String(c.name || "").trim()) out.push(`Name collection ${i + 1}.`); });
  (answers.product_ideas || []).forEach((p, i) => {
    if (!String(p.name || "").trim()) out.push(`Name product idea ${i + 1}.`);
    if (!keys.has(p.collection_key)) out.push(`Put product idea ${i + 1} in a collection.`);
  });
  return out;
}

/**
 * Clone the catalogue and overlay the plan. Real products, layouts and
 * collections in `base` are never mutated. Planned items reuse existing sample
 * imagery and prices. `prefilled(type, page, data, id)` supplies a section.
 */
export function projectAnnPreview(base, config = {}, { prefilled, attributes = [] } = {}) {
  const previewBase = structuredClone(base);
  const selectedNiche = annCategoryContext(config);
  if (selectedNiche) previewBase.showcase_niche = { category_id: selectedNiche.category.id, slug: selectedNiche.subcategory?.slug || "", topic: selectedNiche.topic };
  const data = styleDemonstration(previewBase, config.theme?.style_preset);
  if (data.style_demo) data.ann_style_copy_applied = config.theme?.style_preset;
  applyAnnCategoryCopy(data, config);
  const brand = config.brand || {};
  data.settings = { ...(data.settings || {}), ...(config.theme || {}) };
  if (brand.store_name) { data.settings.brand_name = brand.store_name; data.store = { ...(data.store || {}), name: brand.store_name }; }
  const inherited = initialAnswers(base.settings || {});
  const useTagline = brand.tagline !== undefined && (!data.style_demo || brand.tagline !== inherited.tagline);
  const useDescription = brand.description !== undefined && (!data.style_demo || brand.description !== inherited.description);
  if (useTagline) data.settings.tagline = brand.tagline;
  if (useDescription) data.settings.description = brand.description;
  for (const section of data.layouts?.home || []) {
    if (section.type !== "hero") continue;
    section.settings ||= {};
    if (useTagline && brand.tagline) section.settings.title = brand.tagline;
    if (useDescription) section.settings.description = brand.description;
  }
  const demo = data.style_demo === true;
  const cols = data.collections = data.collections || [], prods = data.products = data.products || [];
  const applied = data.settings.ann_application || {};
  const byKey = new Map();
  (config.collections || []).forEach((c, i) => {
    let target = cols.find(item => item.id === applied.collections?.[c.key]) || (demo ? cols[i] : null);
    const linked = !demo && Boolean(target && applied.collections?.[c.key] === target.id);
    if (!target) {
      const seed = cols.length ? cols[i % cols.length] : null;
      target = { ...clone(seed), id: `ann-collection-${c.key}`, slug: c.key, product_ids: [] };
      cols.push(target);
    }
    if (!linked) { target.title = c.name; target.description = c.description || ""; }
    byKey.set(c.key, target);
  });
  const pool = prods.slice();
  (config.product_ideas || []).forEach((p, i) => {
    let target = pool.find(item => item.id === applied.products?.[p.key]) || (demo ? pool[i] : null);
    if (!demo && target && target.id === applied.products?.[p.key]) return;
    if (!target) {
      const seed = pool.length ? pool[i % pool.length] : null;
      if (!seed) return;
      target = { ...clone(seed), id: `ann-product-${p.key}`, status: "active", collection_ids: [] };
      prods.push(target);
    }
    target.title = p.name; target.description = p.description || "";
    target.content = { ...target.content, features: (p.attributes || []).flatMap(selected => {
      const attribute = attributes.find(a => Number(a.id) === selected.attribute_id);
      if (!attribute) return [];
      const values = (attribute.values || []).filter(v => selected.value_ids.includes(Number(v.id))).map(v => v.value);
      return values.length ? [{ label: attribute.name, value: values.join(", ") }] : [];
    }) };
    const col = byKey.get(p.collection_key);
    if (col) {
      for (const c of cols) if (Array.isArray(c.product_ids)) c.product_ids = c.product_ids.filter(id => id !== target.id);
      col.product_ids = [...(col.product_ids || []), target.id];
      target.collection_ids = [col.id];
    }
  });
  const unavailable = [];
  for (const [page, chosen] of Object.entries(config.section_options || {})) {
    const allowed = ANN_EXTRA_SECTIONS[page], layout = data.layouts?.[page];
    if (!allowed || !Array.isArray(layout)) { if (chosen.length) unavailable.push(...chosen.map(t => `${page}:${t}`)); continue; }
    const next = layout.filter(s => !allowed.includes(s.type) || chosen.includes(s.type))
      .map(s => allowed.includes(s.type) && chosen.includes(s.type) ? { ...s, hidden: false } : s);
    for (const type of chosen) {
      if (next.some(s => s.type === type)) continue;
      const section = prefilled ? prefilled(type, page, data, `ann-${page}-${type}`) : null;
      if (section) {
        const order = (starterLayouts(data)[page] || []).map(s => s.type);
        const rank = order.indexOf(type);
        const before = next.findIndex(s => s.type === "footer" ||
          (rank >= 0 && order.indexOf(s.type) > rank));
        next.splice(before < 0 ? next.length : before, 0, { ...section, hidden: false });
      } else unavailable.push(`${page}:${type}`);
    }
    data.layouts[page] = next;
  }
  // Added sections receive the selected niche's starter copy too.
  if (data.ann_category_copy_applied) {
    const brandHome = (data.layouts.home || []).filter(s => s.type === "hero").map(s => structuredClone(s.settings));
    applyAnnCategoryCopy(data, config, { sectionsOnly: true });
    (data.layouts.home || []).filter(s => s.type === "hero").forEach((s, i) => { s.settings = brandHome[i]; });
    if (useTagline) data.settings.tagline = brand.tagline;
    if (useDescription) data.settings.description = brand.description;
  }
  // Transient, demo-clone only: lets the showcase renderer honour explicit toggles.
  if (data.style_demo === true) {
    data.showcase_options = structuredClone(config.section_options || {});
    const niche = annCategoryContext(config);
    if (niche) data.showcase_niche = { category_id: niche.category.id, slug: niche.subcategory?.slug || "", topic: niche.topic };
  }
  return { data, unavailable };
}

/** Optional sections currently shown per page, from layouts. */
export function currentExtras(layouts = {}) {
  const out = {};
  for (const [page, allowed] of Object.entries(ANN_EXTRA_SECTIONS))
    out[page] = (layouts[page] || []).map(s => s.type).filter(t => allowed.includes(t));
  return out;
}
