import { TAXONOMY } from "./aura-taxonomy-data.js";
/** Curated AI-generated demonstration media, never merchant-owned inventory. */
export const SHOWCASE_MEDIA_PREFIX = "/assets/img/aura-showcases/v01/";
const image = (style, filename, alt) => Object.freeze({
  url: `${SHOWCASE_MEDIA_PREFIX}${style}/${filename}.webp`,
  alt, width: 1024, height: 1024,
});
const pack = (style, niche, heroAlt, products, collections, lifestyle) => Object.freeze({
  hero: image(style, `aura-${style}-${niche}-hero-desktop-v01`, heroAlt),
  products: Object.freeze(Object.fromEntries(products.map(([id, slug, alt]) =>
    [id, image(style, `aura-${style}-${niche}-${id}-${slug}-v01`, alt)]))),
  collections: Object.freeze(Object.fromEntries(collections.map(([id, slug, alt]) =>
    [id, image(style, `aura-${style}-${niche}-collection-${id}-${slug}-v01`, alt)]))),
  lifestyle: image(style, `aura-${style}-${niche}-lifestyle-l01-${lifestyle[0]}-v01`, lifestyle[1]),
});

export const SHOWCASE_MEDIA = Object.freeze({
  editorial: pack("editorial", "womens-clothing",
    "Illustrative womenswear campaign with a burgundy blouse and ivory trousers",
    [
      ["p01", "burgundy-silk-blouse", "Burgundy draped blouse, illustrative product"],
      ["p02", "ivory-tailored-trousers", "Ivory wide-leg trousers, illustrative product"],
      ["p03", "sand-linen-dress", "Sand-coloured sleeveless dress, illustrative product"],
      ["p04", "olive-fine-knit-top", "Olive sleeveless knit top, illustrative product"],
      ["p05", "stone-tailored-jacket", "Stone-coloured tailored jacket, illustrative product"],
    ],
    [
      ["c01", "soft-essentials", "Illustrative womenswear collection arranged on pale stone"],
      ["c02", "modern-tailoring", "Illustrative tailored jacket and ivory trousers"],
    ],
    ["city-in-silk", "Illustrative womenswear lifestyle photograph in a sunlit courtyard"]),
  boutique: pack("boutique", "skincare",
    "Illustrative skincare packaging arranged on pale mint platforms",
    [
      ["p01", "daily-serum", "Unbranded sage-glass dropper bottle, illustrative product"],
      ["p02", "everyday-moisturiser", "Unbranded ivory cream jar, illustrative product"],
      ["p03", "daily-cleanser", "Unbranded sage pump bottle, illustrative product"],
      ["p04", "gentle-cleansing-gel", "Unbranded pale-mint squeeze tube, illustrative product"],
      ["p05", "evening-face-oil", "Unbranded amber dropper bottle, illustrative product"],
    ],
    [
      ["c01", "daily-essentials", "Illustrative daily skincare packaging collection"],
      ["c02", "evening-rituals", "Illustrative evening skincare packaging collection"],
    ],
    ["a-moment-of-care", "Illustrative skincare lifestyle photograph with an unbranded jar"]),
  architectural: pack("architectural", "streetwear",
    "Illustrative streetwear campaign with dark garments and an orange crossbody bag",
    [
      ["p01", "graphite-heavyweight-tee", "Graphite oversized T-shirt, illustrative product"],
      ["p02", "black-cargo-trousers", "Black cargo trousers, illustrative product"],
      ["p03", "vermilion-crossbody", "Orange technical crossbody bag, illustrative product"],
      ["p04", "charcoal-oversized-hoodie", "Charcoal oversized hoodie, illustrative product"],
      ["p05", "chalk-utility-overshirt", "Chalk-coloured utility overshirt, illustrative product"],
    ],
    [
      ["c01", "heavyweight-uniform", "Illustrative heavyweight streetwear collection"],
      ["c02", "utility-in-motion", "Illustrative utility streetwear collection"],
    ],
    ["the-city-after-hours", "Illustrative streetwear lifestyle photograph in a concrete plaza"]),
  minimal: pack("minimal", "home-decor",
    "Illustrative ivory ceramics and oak home accessories",
    [
      ["p01", "sculptural-ceramic-vase", "Ivory sculptural vase, illustrative product"],
      ["p02", "stoneware-bowl", "Ivory shallow bowl, illustrative product"],
      ["p03", "natural-oak-tray", "Natural oak tray, illustrative product"],
      ["p04", "linen-table-lamp", "Oak and ivory-shade table lamp, illustrative product"],
      ["p05", "ivory-textured-cushion", "Ivory textured cushion, illustrative product"],
    ],
    [
      ["c01", "objects-of-calm", "Illustrative ceramic and oak home accessories collection"],
      ["c02", "soft-living", "Illustrative cushion and lamp collection"],
    ],
    ["room-to-breathe", "Illustrative calm reading corner with coordinated home accessories"]),
  vintage: pack("vintage", "leather-bags",
    "Illustrative brown leather bags in a warm atelier setting",
    [
      ["p01", "cognac-leather-satchel", "Cognac-coloured leather satchel, illustrative product"],
      ["p02", "chocolate-crossbody-bag", "Chocolate-coloured crossbody bag, illustrative product"],
      ["p03", "tan-leather-weekender", "Tan weekender bag, illustrative product"],
      ["p04", "mahogany-leather-backpack", "Mahogany-coloured backpack, illustrative product"],
      ["p05", "walnut-leather-tote", "Walnut-coloured tote bag, illustrative product"],
    ],
    [
      ["c01", "everyday-companions", "Illustrative everyday leather bag collection"],
      ["c02", "made-for-the-journey", "Illustrative travel bag collection"],
    ],
    ["carry-a-good-story", "Illustrative traveller carrying a cognac-coloured satchel"]),
});

export const SHOWCASE_PACKS = Object.freeze({
  editorial: { category_id: 1, slug: "womens-clothing", topic: "women's clothing" },
  boutique: { category_id: 2, slug: "skincare", topic: "skincare" },
  architectural: { category_id: 1, slug: "streetwear", topic: "streetwear" },
  minimal: { category_id: 4, slug: "home-decor", topic: "home decor" },
  vintage: { category_id: 1, slug: "bags-and-wallets", topic: "leather bags" },
});

/** Content identity is independent of the visual style, including fallbacks. */
export function resolveShowcasePack(data = {}) {
  const settings = data.settings || {};
  const category = TAXONOMY.categories.find(c => c.slug === settings.category);
  const niche = data.showcase_niche || {
    category_id: category?.id || (settings.category === "fashion" ? 1 : undefined),
    slug: settings.subcategory,
  };
  const exact = Object.entries(SHOWCASE_PACKS).find(([, p]) =>
    p.category_id === Number(niche.category_id) &&
    (p.slug === niche.slug || p.slug === "bags-and-wallets" && niche.slug === "leather-bags"));
  const key = exact?.[0] || (Number(niche.category_id) === 2 ? "boutique" : Number(niche.category_id) === 4 ? "minimal" : "editorial");
  return { key, exact: Boolean(exact), ...SHOWCASE_PACKS[key], media: SHOWCASE_MEDIA[key] };
}

const publicImages = new Set(Object.values(SHOWCASE_MEDIA).flatMap(media => [
  media.hero, ...Object.values(media.products), ...Object.values(media.collections), media.lifestyle,
]).map(item => item.url));
/** Exact allowlist: no arbitrary generated-output paths or user-supplied filenames. */
export const isShowcaseImage = url => publicImages.has(url);
