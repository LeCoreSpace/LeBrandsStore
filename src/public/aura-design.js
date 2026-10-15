/**
 * Saved Ann design: the merchant's chosen showcase style rendered from their
 * REAL catalogue. Triggered only by settings.ann_design. Never demo content.
 */
import { SHOWCASE_STYLES, renderDesignLive } from "./aura-showcase.js";
import { isAnnDesign } from "./ann-design-model.js";

export const DESIGN_PAGES = Object.freeze(["home", "collection", "product", "about", "contact"]);

/** The validated design object, or null when the store has none. */
export function annDesign(settings) {
  const d = settings?.ann_design;
  return isAnnDesign(d) ? d : null;
}

/** Returns { body, css, bodyClass, style } or null (use the normal Aura path). */
export function renderSavedDesign(data = {}, options = {}) {
  const design = annDesign(data.settings);
  const page = options.page || "home";
  if (!design || !DESIGN_PAGES.includes(page)) return null;
  return renderDesignLive(data, { ...data.settings, style_preset: design.style }, { ...options, page }, design);
}
