import { STYLE_IDS } from "../public/aura-styles.js";
import { ANN_STEPS, ANN_PALETTES, ANN_FONTS, ANN_EXTRA_SECTIONS } from "../public/ann-config.js";
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) => {
  if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) fail("Use the supported Ann answer fields.");
};
const text = (v, max) => {
  if (typeof v !== "string" || v.length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail("Use shorter plain text without markup.");
  return v.trim();
};
const positive = v => Number.isSafeInteger(v) && v > 0;
const key = v => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
const pick = (v, choices) => { if (!choices.includes(v)) fail("Choose one of the available options."); };
const ANSWERS = ["store_name","tagline","description","category_id","subcategory_id","style_preset","color_preset","font_preset","accent_color","button_style","collections","product_ideas","section_options"];
export function validateAnnSave(body) {
  keys(body, ["expected_revision","current_step","answers"]);
  if (!Number.isInteger(body.expected_revision) || body.expected_revision < 0 || body.expected_revision > 2147483645) fail("Include the current Ann revision.");
  pick(body.current_step, ANN_STEPS); keys(body.answers, ANSWERS);
  if (new TextEncoder().encode(JSON.stringify(body)).length > 60000) fail("These answers are too long. Shorten the descriptions.");
  return body;
}
export function mergeAnnAnswers(previous, patch) {
  const answers = structuredClone(previous || {}), cleared = [];
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete answers[k]; else answers[k] = structuredClone(v); }
  const categoryChanged = "category_id" in patch && previous?.category_id !== answers.category_id;
  if (categoryChanged && !("subcategory_id" in patch) && answers.subcategory_id !== undefined) {
    delete answers.subcategory_id; cleared.push("subcategory_id");
  }
  if ((categoryChanged || ("subcategory_id" in patch && previous?.subcategory_id !== answers.subcategory_id)) && !("product_ideas" in patch) && answers.product_ideas) {
    answers.product_ideas = answers.product_ideas.map(p => ({ ...p, attributes: [] }));
    cleared.push("product_ideas.attributes");
  }
  return { answers, cleared };
}
export function validateAnnAnswers(answers, reference) {
  keys(answers, ANSWERS);
  for (const [k, max] of [["store_name",120],["tagline",160],["description",1200]]) if (k in answers) answers[k] = text(answers[k], max);
  if ("store_name" in answers && !answers.store_name) fail("Enter a store name.");
  if ("category_id" in answers && (!positive(answers.category_id) || !reference.categories.some(c => Number(c.category_id) === answers.category_id))) fail("Choose a product category.");
  if ("subcategory_id" in answers && (!positive(answers.subcategory_id) || !reference.subcategories.some(s => Number(s.subcategory_id) === answers.subcategory_id && Number(s.category_id) === answers.category_id))) fail("Choose a subcategory belonging to this category.");
  for (const [k, options] of [["style_preset",STYLE_IDS],["color_preset",ANN_PALETTES],["font_preset",ANN_FONTS],["button_style",["square","rounded","pill"]]]) if (k in answers) pick(answers[k], options);
  if ("accent_color" in answers && (typeof answers.accent_color !== "string" || !/^#[a-f0-9]{6}$/i.test(answers.accent_color))) fail("Choose a valid accent colour.");
  const collections = answers.collections || [];
  if (!Array.isArray(collections) || collections.length > 10) fail("Plan up to ten collections.");
  const collectionKeys = new Set();
  for (const c of collections) {
    keys(c, ["key","name","description"]);
    if (!key(c.key) || collectionKeys.has(c.key)) fail("Use a unique collection key.");
    collectionKeys.add(c.key);
    c.name = text(c.name, 100); if (!c.name) fail("Name each collection.");
    if ("description" in c) c.description = text(c.description, 800);
  }
  const ideas = answers.product_ideas || [];
  if (!Array.isArray(ideas) || ideas.length > 50) fail("Plan up to fifty product ideas.");
  const ideaKeys = new Set(), perCollection = new Map();
  const attributes = new Map((reference.attributes || []).map(a => [Number(a.id), a]));
  for (const p of ideas) {
    keys(p, ["key","collection_key","name","description","attributes"]);
    if (!key(p.key) || ideaKeys.has(p.key) || !collectionKeys.has(p.collection_key)) fail("Assign each unique product idea to a collection.");
    ideaKeys.add(p.key);
    const count = (perCollection.get(p.collection_key) || 0) + 1;
    if (count > 5) fail("Plan up to five product ideas per collection.");
    perCollection.set(p.collection_key, count);
    p.name = text(p.name, 120); if (!p.name) fail("Name each product idea.");
    if ("description" in p) p.description = text(p.description, 1200);
    if (p.attributes !== undefined && (!Array.isArray(p.attributes) || p.attributes.length > 30)) fail("Choose up to thirty product attributes.");
    const seen = new Set();
    for (const selected of p.attributes || []) {
      keys(selected, ["attribute_id","value_ids"]);
      const attribute = attributes.get(selected.attribute_id);
      if (!attribute || Number(attribute.subcategory_id) !== answers.subcategory_id || seen.has(selected.attribute_id)) fail("Choose attributes for the selected subcategory.");
      seen.add(selected.attribute_id);
      if (!Array.isArray(selected.value_ids) || selected.value_ids.length > 20 || new Set(selected.value_ids).size !== selected.value_ids.length ||
        selected.value_ids.some(v => !positive(v) || !attribute.values.some(option => Number(option.id) === v))) fail("Choose valid attribute values.");
    }
  }
  if (answers.section_options !== undefined) {
    keys(answers.section_options, Object.keys(ANN_EXTRA_SECTIONS));
    for (const [page, list] of Object.entries(answers.section_options)) {
      if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(s => !ANN_EXTRA_SECTIONS[page].includes(s))) fail("Choose supported optional sections.");
    }
  }
  if (new TextEncoder().encode(JSON.stringify(answers)).length > 60000) fail("Saved answers would be too long. Shorten the descriptions.");
  return answers;
}
