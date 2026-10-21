/**
 * Saved Ann design: the merchant's chosen showcase style rendered from their
 * REAL catalogue. Triggered only by settings.ann_design. Never demo content.
 */
import { SHOWCASE_STYLES, renderDesignLive } from "./aura-showcase.js";
import { isAnnDesign } from "./ann-design-model.js";
import { applyDesignSections } from "./ann-section-layout.js";
import { applyDesignContent } from "./ann-section-content.js";
import { applyRichDesignText } from "./ann-rich-text.js";
import { injectSectionInstances,SECTION_INSTANCE_CSS } from "./section-instances.js";

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
  if (!design || ![...DESIGN_PAGES,"blog","blog-article","cart","checkout","track","confirmation"].includes(page)) return null;
  const rendered=renderDesignLive(data, { ...data.settings, style_preset: design.style }, { ...options, page }, design);
  if(rendered?.body&&DESIGN_PAGES.includes(page)){
    rendered.body=injectSectionInstances(rendered.body,design.sections,data,options);
    rendered.css=(rendered.css||"")+SECTION_INSTANCE_CSS;
  }
  // Commerce uses the shared transactional form, not editable theme sections.
  if(rendered?.body&&DESIGN_PAGES.includes(page))rendered.body=applyRichDesignText(applyDesignSections(applyDesignContent(rendered.body,design,page,Boolean(options.designEdit)),design.sections,page),design);
  return rendered;
}
