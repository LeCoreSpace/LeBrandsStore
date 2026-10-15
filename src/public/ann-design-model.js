// Shared, bounded document model. No HTML, scripts or arbitrary media URLs.
export const DESIGN_COPY_LIMITS = Object.freeze({
  kicker: 160, title: 240, description: 2000, button: 80,
  statement: 2000, products: 160, collections: 160, about: 240,
  story0: 2000, story1: 2000, story2: 2000, footer: 1000,
});
export const DESIGN_MEDIA_KEYS = Object.freeze(["hero", "lifestyle", "collection0", "collection1"]);
export function isAnnDesign(value) {
  return value?.version === 1 && ["editorial", "boutique", "architectural", "minimal", "vintage"].includes(value.style) &&
    value.copy !== null && typeof value.copy === "object" && !Array.isArray(value.copy) &&
    value.media !== null && typeof value.media === "object" && !Array.isArray(value.media);
}
