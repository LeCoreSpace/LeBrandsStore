import { STYLE_IDS, STYLE_THEME_KEYS, styleSettings } from "./aura-styles.js";
export const ANN_REFERENCE_VERSION = "ann-v1";
export const ANN_STEPS = Object.freeze(["category","style","palette","fonts","collections","products","story","selling","business","policies","domain","payments","shipping","review"]);
export const ANN_PALETTES = Object.freeze(["white","ivory","stone","midnight"]);
export const ANN_FONTS = Object.freeze(["modern","serif","classic"]);
export const ANN_EXTRA_SECTIONS = Object.freeze({
  home: ["statement","lookbook","craft","founder","trust","reviews","faq"],
  collection: ["collection-description","related-collections"],
  product: ["material-care","size-guide","how-to-use","faq","reviews"],
  about: ["statement","craft","founder","faq"],
});
// A small, explicit contract shared by the future conversation and Aura canvas.
// Neither returning this object nor saving an Ann answer applies it to the store.
export function annPreviewConfiguration(answers = {}, saved = {}) {
  const chosen = STYLE_IDS.includes(answers.style_preset) ? answers.style_preset :
    STYLE_IDS.includes(saved.style_preset) ? saved.style_preset : "editorial";
  const theme = styleSettings(chosen);
  if (!answers.style_preset) {
    if (ANN_PALETTES.includes(saved.color_preset)) theme.color_preset = saved.color_preset;
    if (ANN_FONTS.includes(saved.font_preset)) theme.font_preset = saved.font_preset;
    if (/^#[a-f0-9]{6}$/i.test(saved.accent_color || "")) theme.accent_color = saved.accent_color;
    if (["square","rounded","pill"].includes(saved.button_style)) theme.button_style = saved.button_style;
  }
  for (const key of STYLE_THEME_KEYS) if (answers[key] !== undefined) theme[key] = answers[key];
  return {
    preview_only: true, reference_version: ANN_REFERENCE_VERSION, theme,
    brand: Object.fromEntries(["store_name","tagline","description"].filter(k => answers[k] !== undefined).map(k => [k, answers[k]])),
    category_id: answers.category_id ?? null, subcategory_id: answers.subcategory_id ?? null,
    collections: structuredClone(answers.collections || []),
    product_ideas: structuredClone(answers.product_ideas || []),
    section_options: structuredClone(answers.section_options || {}),
  };
}
