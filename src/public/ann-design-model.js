import { STYLE_IDS } from "./aura-styles.js";
// Shared, bounded document model. No HTML, scripts or arbitrary media URLs.
export const DESIGN_COPY_LIMITS = Object.freeze({
  kicker: 160, title: 240, description: 2000, button: 80,
  statement: 2000, products: 160, collections: 160, about: 240,
  story0: 2000, story1: 2000, story2: 2000, footer: 1000,
});
export const DESIGN_MEDIA_KEYS = Object.freeze(["hero", "lifestyle", "collection0", "collection1"]);
// Generated only from trusted section markup. Keep page, slot and field counts
// bounded; no CSS selectors, arbitrary paths or HTML cross the save boundary.
const FIELD = /^section\.(home|collection|product|about|contact)\.(main-(?:[0-9]|[12][0-9]|3[0-9])|slot-[a-z][a-z0-9-]{0,60}-[0-9]{1,2})\.(text(?:[0-9]|[1-5][0-9])|image[0-9]|video[0-9])$/;
export const isDesignCopyKey = key => Object.hasOwn(DESIGN_COPY_LIMITS,key) ||
  typeof key==="string" && FIELD.test(key) && /\.text\d+$/.test(key);
export const isDesignMediaKey = key => DESIGN_MEDIA_KEYS.includes(key) ||
  typeof key==="string" && FIELD.test(key) && /\.(image|video)\d+$/.test(key);
export const getDesignCopyLimit = key => isDesignCopyKey(key) ? DESIGN_COPY_LIMITS[key] || 2000 : 0;
export function isAnnDesign(value) {
  return value?.version === 1 && STYLE_IDS.includes(value.style) &&
    value.copy !== null && typeof value.copy === "object" && !Array.isArray(value.copy) &&
    value.media !== null && typeof value.media === "object" && !Array.isArray(value.media);
}
