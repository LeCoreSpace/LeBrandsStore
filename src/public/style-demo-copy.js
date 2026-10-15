import { showcaseCatalogue, showcaseCopy } from "./aura-showcase.js";
import { resolveShowcasePack } from "./aura-showcase-assets.js";
/** Curated demonstration copy, not AI output or a rewrite of merchant content. */
const COPY = {
  editorial: {
    kicker: "Everyday, considered", title: "A quieter way to dress.",
    description: "Clean silhouettes, useful layers and a palette that works together. Explore a thoughtful starting point for your everyday wardrobe.",
    button: "Explore the collection", statement: "Less noise. More room for the pieces you reach for.",
    products: "The wardrobe edit", craft: "A closer look", founder: "Behind the collection",
  },
  boutique: {
    kicker: "Find your everyday favourites", title: "Good days start here.",
    description: "Meet easy-to-style shirts, relaxed layers and familiar favourites. A little inspiration for the way you like to get dressed.",
    button: "Find your favourites", statement: "A wardrobe that feels like you, from the first outfit to the last detail.",
    products: "Your next favourites", craft: "Details to discover", founder: "Get to know the brand",
  },
  architectural: {
    kicker: "Define your everyday", title: "Shape your own uniform.",
    description: "Strong silhouettes. Clear choices. Everyday pieces brought together with purpose, ready for your own point of view.",
    button: "Explore the line-up", statement: "Clear lines. Strong choices. Your everyday, defined.",
    products: "The line-up", craft: "Under the surface", founder: "The point of view",
  },
  minimal: {
    kicker: "Space for the essentials", title: "Simply, your everyday.",
    description: "A focused edit of shirts and layers. Take your time, find your pieces and make room for what you like.",
    button: "View the essentials", statement: "Fewer distractions. A clearer view of what matters to you.",
    products: "The essentials", craft: "Look closer", founder: "Our perspective",
  },
  vintage: {
    kicker: "Familiar pieces, fresh perspective", title: "A little character. Every day.",
    description: "Inspired by the charm of a well-loved wardrobe. Discover shirts, easy layers and combinations that feel familiar from the start.",
    button: "Discover the collection", statement: "Old-school charm, seen through a fresh pair of eyes.",
    products: "Familiar favourites", craft: "Details with character", founder: "The story behind the edit",
  },
};
export function styleDemonstration(data, style) {
  if (data.ann_style_copy_applied === style) return data;
  if (data.style_demo !== true || !COPY[style]) return data;
  const preview = structuredClone(data), copy = { ...COPY[style], ...(showcaseCopy(style) || {}) };
  const pack = resolveShowcasePack(data);
  const catalogue = showcaseCatalogue(pack.key);
  preview.showcase_media_key = pack.key;
  preview.showcase_media_exact = pack.exact;
  // Clone-only: replaces the demonstration catalogue, never merchant data.
  if (catalogue) { preview.products = catalogue.products; preview.collections = catalogue.collections; }
  for (const section of preview.layouts?.home || []) {
    if (section.type === "hero") Object.assign(section.settings, {
      kicker: copy.kicker, title: copy.title, description: copy.description, button_label: copy.button,
    });
    if (section.type === "statement") section.settings.text = copy.statement;
    if (section.type === "featured-products") section.settings.title = copy.products;
    if (section.type === "craft") section.settings.title = copy.craft;
    if (section.type === "founder") section.settings.kicker = copy.founder;
  }
  return preview;
}
