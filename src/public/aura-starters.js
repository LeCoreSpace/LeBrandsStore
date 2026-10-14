import { MENS_STARTER } from "./aura-starter-data.js";
import { SECTION_SCHEMAS } from "./aura-layout.js";
import { isMensClothing } from "./aura-taxonomy.js";

export const STARTER_PACK_ID = "c0010001-0000-4000-8000-000000000001";
const PREFIX = "/assets/img/aura-starters/c001-s001/v01/";
const imageByName = new Map(MENS_STARTER.images.map(image => [image.filename, image]));
export function starterAvailable(data) {
  return data?.aura_starter_enabled === true && isMensClothing(data.settings);
}
export function starterImage(filename) {
  const image = imageByName.get(filename);
  if (!image) throw new Error("Unknown Aura starter image.");
  return { url: PREFIX + filename, alt: image.alt, width: image.width, height: image.height };
}
/** Copy only schema-owned fields; exchange metadata never enters tenant layouts. */
export function prefilledSection(type, page, data, id = `default-${type}`) {
  if (!starterAvailable(data)) return null;
  const source = MENS_STARTER.content.sections.find(s => s.page_key === page && s.section_type === type);
  if (!source) return null;
  const schema = SECTION_SCHEMAS[type];
  const settings = { ...structuredClone(schema.defaults), ...structuredClone(source.settings) };
  const blocks = source.blocks.map((block, index) => ({
    id: block.id || `sample-${type}-${index + 1}`,
    type: "item",
    settings: structuredClone(block.settings || block),
  }));
  const section = { id, type, settings, blocks };
  for (const binding of source.media || []) {
    // Mobile art direction is handled in preview rendering, not an unknown schema field.
    if (binding.variant === "mobile") continue;
    let target = section;
    for (const key of binding.field_path.slice(0, -1)) target = target[key];
    target[binding.field_path.at(-1)] = starterImage(binding.filename);
  }
  if(type==="hero"&&settings.image)settings.image={...settings.image,focalX:0.88,focalY:0.5};
  // Commerce references bind only to the merchant's real catalogue when saved.
  if (type === "spotlight") {
    settings.product = data.products?.[0]?.id || null;
    settings.enabled = !!settings.product;
  }
  if (type === "featured-products") {
    section.blocks = (data.products || []).slice(0, 6).map((p, i) => ({ id: `featured-${i + 1}`, type: "item", settings: { product: p.id } }));
    settings.enabled = section.blocks.length > 0;
  }
  if (type === "reviews") settings.enabled = (data.reviews || []).length > 0;
  return section;
}

/** Preview-only catalogue. Never sent to save APIs or used on a live storefront. */
export function starterPreview(data, page) {
  if (!starterAvailable(data)) return data;
  const result = structuredClone(data);
  result.starter_preview = true;
  if (!(data.products || []).length) {
    const catalog = MENS_STARTER.content.sample_catalog;
    const productId = key => `c0010001-0000-4000-9000-${key.slice(1).padStart(12, "0")}`;
    const collectionId = key => `c0010001-0000-4000-9001-${String(catalog.collections.findIndex(c => c.collection_key === key) + 1).padStart(12, "0")}`;
    result.products = catalog.products.map(p => ({
      id: productId(p.product_key), status: "active", title: p.name,
      description: p.description.replace(/<[^>]*>/g, ""), price_paise: p.demo_price_paise,
      images: p.images.map(starterImage), tags: [], stock: null,
      collection_ids: p.collections.map(collectionId),
    }));
    result.collections = catalog.collections.map(c => ({
      id: collectionId(c.collection_key), title: c.name, slug: c.collection_key,
      description: c.description.replace(/<[^>]*>/g, ""), image: starterImage(c.cover),
      product_ids: c.product_keys.map(productId),
    }));
    // These substitutions live only in the preview clone, never the persisted layout.
    for (const layout of Object.values(result.layouts || {})) for (const section of layout) {
      if (section.type === "spotlight" && !section.settings.product) {
        section.settings.product = result.products[0].id; section.settings.enabled = true;
      }
      if (section.type === "featured-products" && !section.blocks.length) {
        section.settings.enabled = true;
        section.blocks = result.products.map((p, i) => ({ id: `demo-${i + 1}`, type: "item", settings: { product: p.id } }));
      }
    }
  }
  return result;
}
