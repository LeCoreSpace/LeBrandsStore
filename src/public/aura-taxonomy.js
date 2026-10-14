import { TAXONOMY } from "./aura-taxonomy-data.js";

// Old saved values remain valid; they are never silently rewritten.
export const LEGACY_CATEGORY_ALIASES = Object.freeze({
  fashion: 1, beauty: 2, jewellery: 3, "home-decor": 4,
  "food-beverages": 6, wellness: 7, kids: 9, pets: 10,
});
export const PRODUCT_CATEGORIES = TAXONOMY.categories.map(c => ({ value: c.slug, label: c.name, id: c.id }));
export function categoryRecord(value) {
  return TAXONOMY.categories.find(c => c.slug === value || c.id === LEGACY_CATEGORY_ALIASES[value]) || null;
}
export function subcategoriesFor(value) {
  const parent = categoryRecord(value);
  return parent ? TAXONOMY.subcategories.filter(s => s.category_id === parent.id) : [];
}
export function validCategoryPair(category, subcategory) {
  return !subcategory || subcategoriesFor(category).some(s => s.slug === subcategory);
}
export function isMensClothing(settings = {}) {
  return categoryRecord(settings.category)?.id === 1 && settings.subcategory === "mens-clothing";
}
