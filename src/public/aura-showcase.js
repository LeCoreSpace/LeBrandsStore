/**
 * Style showcases: five deliberately different, script-free store compositions.
 * Used ONLY for the cloned style_demo catalogue. Real merchant pages, stored
 * layouts outside the saved Ann design renderer never pass through this module.
 */
import { SHOWCASE_MEDIA, isShowcaseImage, resolveShowcasePack } from "./aura-showcase-assets.js";
import { safeImage } from "./aura-sections.js";
import { homeRich, productRich, collectionRich } from "./aura-showcase-sections.js";
import { RICH_CSS } from "./aura-showcase-rich-css.js";
import { showcaseProfile, renderNicheSections, NICHE_SECTION_CSS, profileGuidance } from "./aura-showcase-profiles.js";
import { styleSettings, STYLE_IDS } from "./aura-styles.js";
import { CONVERSION_COPY, CONVERSION_NEUTRAL, CONVERSION_KIND, CONVERSION_CSS, CONVERSION_TABBAR, isConversionStyle, conversionTopper, buildConversion } from "./aura-conversion-styles.js";
import { contrastColor } from "./validation.js";

export const SHOWCASE_STYLES = STYLE_IDS;
export const SHOWCASE_PAGES = Object.freeze(["home", "collection", "product", "cart", "checkout", "about", "contact"]);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rupees = paise => `\u20B9${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = n => String(n + 1).padStart(2, "0");

/** Niche of the sample imagery, shown honestly in the demo ribbon. */
export const SHOWCASE_WORLD = {
  editorial: "women's clothing", boutique: "skincare", architectural: "streetwear",
  minimal: "home decor", vintage: "leather bags",
};

const DEF = {
  editorial: {
    copy: { kicker: "Issue 01, the quiet edit", title: "Dress like the page turns.", description: "Silk, linen and tailoring laid out like a magazine spread. A sample wardrobe to show how an editorial store reads, scrolls and sells.", button: "Open the issue",
      statement: "Clothes are better when they are given room to speak.", products: "The wardrobe edit", collections: "Contents", about: "A note from the editor",
      story: ["Every page of an editorial store is composed. Large type sets the mood, photographs get space and the product follows like a caption.", "This is a style demonstration. The pieces, prices and words are samples that show the layout, not a real range.", "Replace everything with your own story, photography and products when you build the store."] },
    products: [["p01", "Burgundy silk blouse", "Fluid sample blouse in a deep wine tone.", 8900], ["p02", "Ivory tailored trousers", "Sample high-waisted trousers in soft ivory.", 6400], ["p03", "Sand linen dress", "Sample relaxed dress in a warm sand weave.", 9800], ["p04", "Olive fine knit top", "Sample close-fit knit in muted olive.", 4900], ["p05", "Stone tailored jacket", "Sample structured jacket in pale stone.", 14500]],
    collections: [["c01", "Soft essentials", "Easy layers with a gentle hand.", ["p01", "p03", "p04"]], ["c02", "Modern tailoring", "Clean lines for the working week.", ["p02", "p05"]]],
  },
  boutique: {
    copy: { kicker: "Daily ritual, made visible", title: "Good days start here.", description: "A soft, rounded storefront with a browsable shelf and a simple routine. Sample products show how a boutique store feels in the hand.", button: "Shop the shelf",
      statement: "Small steps, set out kindly, one shelf at a time.", products: "Your next favourites", collections: "Browse the shelves", about: "Hello, we are glad you are here",
      story: ["A boutique store is warm and close. Rounded shapes, gentle colour and a clear path from first look to bag.", "This is a style demonstration. Products, prices and words are samples, and no claims about results or ingredients are made.", "Swap in your own products, photography and voice when you build the store."] },
    products: [["p01", "Daily serum", "Sample serum bottle with a dropper.", 1850], ["p02", "Everyday moisturiser", "Sample moisturiser jar in a soft finish.", 1450], ["p03", "Daily cleanser", "Sample cleanser tube for the morning shelf.", 950], ["p04", "Gentle cleansing gel", "Sample gel cleanser in a clear bottle.", 890], ["p05", "Evening face oil", "Sample oil bottle for the evening shelf.", 2250]],
    collections: [["c01", "Daily essentials", "The morning shelf, set out simply.", ["p01", "p02", "p03", "p04"]], ["c02", "Evening rituals", "A slower end to the day.", ["p05", "p01"]]],
  },
  architectural: {
    copy: { kicker: "Drop 01 / sample", title: "Built loud. Worn daily.", description: "Hard grid, heavy type and a vermilion signal colour. A sample streetwear range to show how a confident storefront scrolls and sells.", button: "Enter the drop",
      statement: "No filler. Pieces, grid, go.", products: "The line-up", collections: "Index", about: "The brief",
      story: ["An architectural store is built on a grid. Edges are sharp, type is heavy and every product is a block you can read at a glance.", "This is a style demonstration. The pieces, prices and words are samples to show the structure.", "Bring your own range, photography and voice when you build the store."] },
    products: [["p01", "Graphite heavyweight tee", "Sample boxy tee in graphite.", 2490], ["p02", "Black cargo trousers", "Sample utility trousers in black.", 4290], ["p03", "Vermilion crossbody", "Sample compact crossbody in vermilion.", 3190], ["p04", "Charcoal oversized hoodie", "Sample oversized hoodie in charcoal.", 4990], ["p05", "Chalk utility overshirt", "Sample overshirt in chalk.", 5490]],
    collections: [["c01", "Heavyweight uniform", "Dense fabrics, square cuts.", ["p01", "p04", "p02"]], ["c02", "Utility in motion", "Pockets, straps and layers.", ["p03", "p05"]]],
  },
  minimal: {
    copy: { kicker: "Objects, slowly", title: "Room to breathe.", description: "A quiet storefront where white space does the selling. A sample home range shows how little a good store needs.", button: "View the objects",
      statement: "Fewer things, placed well.", products: "Index of objects", collections: "Rooms", about: "Our approach",
      story: ["A minimal store removes everything that is not the product. Space, thin rules and small type make each object easy to look at.", "This is a style demonstration. Products, prices and words are samples.", "Add your own objects, photography and voice when you build the store."] },
    products: [["p01", "Sculptural ceramic vase", "Sample vase in a matte ceramic finish.", 3890], ["p02", "Stoneware bowl", "Sample bowl in speckled stoneware.", 1790], ["p03", "Natural oak tray", "Sample tray in pale oak.", 2650], ["p04", "Linen table lamp", "Sample lamp with a linen shade.", 6400], ["p05", "Ivory textured cushion", "Sample cushion in ivory texture.", 1990]],
    collections: [["c01", "Objects of calm", "Ceramics and wood for a clear surface.", ["p01", "p02", "p03"]], ["c02", "Soft living", "Light and texture for the corner.", ["p04", "p05"]]],
  },
  vintage: {
    copy: { kicker: "Catalogue No. 1, sample edition", title: "Made to be carried a long way.", description: "A heritage catalogue layout with framed plates, hang tags and ruled borders. Sample leather goods show how a vintage store tells its story.", button: "Turn the page",
      statement: "A good bag keeps the stories you give it.", products: "From the catalogue", collections: "The plates", about: "From the workshop desk",
      story: ["A vintage store reads like a printed catalogue. Ruled borders, framed plates and tags give every item a place and a name.", "This is a style demonstration. Products, prices and words are samples, and no craft or sourcing claims are made.", "Replace it all with your own history, photography and products when you build the store."] },
    products: [["p01", "Cognac leather satchel", "Sample satchel in cognac tones.", 14900], ["p02", "Chocolate crossbody bag", "Sample crossbody in deep brown.", 9800], ["p03", "Tan leather weekender", "Sample weekender in warm tan.", 17900], ["p04", "Mahogany leather backpack", "Sample backpack in mahogany.", 12900], ["p05", "Walnut leather tote", "Sample tote in walnut.", 10900]],
    collections: [["c01", "Everyday companions", "Satchels, totes and crossbodies.", ["p01", "p02", "p05"]], ["c02", "Made for the journey", "Weekenders and backpacks.", ["p03", "p04"]]],
  },
};

for (const id of Object.keys(CONVERSION_COPY)) DEF[id] = { copy: CONVERSION_COPY[id] };

/** Exact curated demo images, or merchant images that pass the storefront validator. */
const okUrl = u => typeof u === "string" && (isShowcaseImage(u) || Boolean(safeImage(u))) && !/[\s"'<>]/.test(u);
const img = (o, alt, key) => o && okUrl(o.url)
  ? `<img${key && (LIVE?.edit||EDIT_SAMPLE) ? ` data-design-image="${key}"` : ""} src="${esc(o.url)}" alt="${esc(alt ?? o.alt ?? "")}" width="${Number(o.width) || 1024}" height="${Number(o.height) || 1024}" loading="lazy" decoding="async">` : "";

export const showcaseCopy = style => DEF[style]?.copy || null;

/** Demo catalogue clone for a style: never merchant data. */
export function showcaseCatalogue(style) {
  const def = DEF[style], media = SHOWCASE_MEDIA?.[style];
  if (!def?.products || !media) return null;
  const ids = {};
  const products = def.products.map(([key, title, description, rupee]) => {
    const id = `sc-${style}-${key}`; ids[key] = id;
    const image = media.products?.[key];
    return { id, title, description, price_paise: rupee * 100, status: "active", demo: true, collection_ids: [],
      images: image && okUrl(image.url) ? [{ url: image.url, alt: image.alt || title, width: image.width, height: image.height }] : [],
      content: { features: [] } };
  });
  const collections = def.collections.map(([key, title, description, members]) => {
    const id = `sc-${style}-${key}`, image = media.collections?.[key];
    const product_ids = members.map(m => ids[m]);
    for (const p of products) if (product_ids.includes(p.id) && !p.collection_ids.length) p.collection_ids = [id];
    return { id, slug: `${style}-${key}`, title, description, product_ids,
      image: image && okUrl(image.url) ? { url: image.url, alt: image.alt || title, width: image.width, height: image.height } : null };
  });
  return { products, collections };
}

export function isShowcase(data, style) {
  return data?.style_demo === true && SHOWCASE_STYLES.includes(style) && Boolean(resolveShowcasePack(data).media);
}

/* ---- saved design: neutral, editable brand copy (no demo or instruction text) ---- */
const NEUTRAL = {
  editorial: { kicker: "Issue 01", description: b => `The latest from ${b}, presented one story at a time.`, button: "Shop the edit", products: "The edit", collections: "Contents" },
  boutique: { kicker: "New in store", description: b => `Welcome to ${b}. Explore the range and take your time.`, button: "Shop now", products: "Your next favourites", collections: "Browse the collections" },
  architectural: { kicker: "Drop 01", description: b => `${b}. Clear lines, strong choices and a range built to stand out.`, button: "Shop the line-up", products: "The line-up", collections: "Index" },
  minimal: { kicker: "The range", description: b => `A quiet look at the ${b} range.`, button: "View the range", products: "Index", collections: "Collections" },
  vintage: { kicker: "Catalogue No. 1", description: b => `A catalogue of favourites from ${b}, chosen with care.`, button: "Browse the catalogue", products: "From the catalogue", collections: "The plates" },
};
Object.assign(NEUTRAL, CONVERSION_NEUTRAL);
const COPY_CAP = { kicker: 80, title: 120, description: 300, button: 40, statement: 200, products: 60, collections: 60, about: 80, story0: 400, story1: 400, story2: 400, footer: 160 };
export function designNeutralCopy(style, brand = "Your brand") {
  const d = DEF[style], n = NEUTRAL[style];
  if (!d || !n) return null;
  const story = n.story?.(brand);
  return { kicker: n.kicker, title: d.copy.title, description: n.description(brand), button: n.button, statement: d.copy.statement,
    products: n.products, collections: n.collections, about: d.copy.about,
    story0: story?.[0] || `Every product at ${brand} is chosen with care. Tell visitors what makes your range yours.`,
    story1: story?.[1] || "Share how you make, source or choose what you sell, and who is behind the brand.",
    story2: story?.[2] || "Add the values and the details your customers should know before they buy.",
    footer: brand };
}
export function designSeedCopy(data, settings = {}) {
  const style = settings.style_preset, def = DEF[style];
  if (!def) return null;
  const brand = settings.brand_name || data?.store?.name || "Your brand";
  const n = designNeutralCopy(style, brand);
  const home = data?.layouts?.home || [];
  const hero = home.find(s => s.type === "hero")?.settings || {};
  const stmt = home.find(s => s.type === "statement")?.settings?.text;
  const t = v => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const current = context(data, settings, {}).copy;
  const pick = (v, d, nv) => { const s = t(v); return s || t(d) || nv; };
  const out = { ...n,
    kicker: pick(hero.kicker, def.copy.kicker, n.kicker), title: pick(hero.title, def.copy.title, n.title),
    description: pick(hero.description, def.copy.description, n.description), button: pick(hero.button_label, def.copy.button, n.button),
    statement: pick(stmt, current.statement, n.statement),
    products: pick(current.products, def.copy.products, n.products),
    collections: pick(current.collections, def.copy.collections, n.collections),
    about: pick(current.about, def.copy.about, n.about) };
  for (const k of Object.keys(out)) out[k] = String(out[k]).slice(0, COPY_CAP[k]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */
function context(data, settings, options) {
  const pack = resolveShowcasePack(data);
  const style = settings.style_preset, media = structuredClone(pack.media), def = DEF[style];
  const products = (data.products || []).filter(p => p.status !== "archived");
  const collections = structuredClone(data.collections || []);
  const hero = (data.layouts?.home || []).find(s => s.type === "hero")?.settings || {};
  const brand = settings.brand_name || data.store?.name || "Your brand";
  const copy = {
    ...def.copy,
    kicker: hero.kicker || def.copy.kicker, title: hero.title || def.copy.title,
    description: hero.description || def.copy.description, button: hero.button_label || def.copy.button,
  };
  const world = data.showcase_topic || SHOWCASE_WORLD[style];
  if (data.showcase_topic) {
    copy.statement = (data.layouts?.home || []).find(s => s.type === "statement")?.settings?.text || `Explore your own approach to ${world.toLowerCase()}.`;
    copy.about = `A considered view of ${world.toLowerCase()}.`;
    copy.story = [copy.description, "Explore this illustrative collection and make it your own with your products, imagery and verified details."];
  }
  if (data.style_demo && data.showcase_voice) {
    for (const key of ["products", "collections", "about"]) if (data.showcase_voice[key]) copy[key] = data.showcase_voice[key];
  }
  const design=data.settings?.ann_design;
  if(design?.version===1&&design.style===style){
    Object.assign(copy,design.copy||{});
    copy.story=[copy.story0,copy.story1,copy.story2].filter(Boolean);
    for(const key of ["hero","lifestyle"])if(design.media?.[key])media[key]=design.media[key];
    for(let i=0;i<2;i++)if(design.media?.[`collection${i}`]){
      media.collections[`c0${i+1}`]=design.media[`collection${i}`];
      if(collections[i])collections[i].image=design.media[`collection${i}`];
    }
  }
  return { style, media, def, products, collections, brand, copy, world: pack.topic,
    profile: showcaseProfile({ ...data, showcase_niche: data.showcase_niche || pack }, style), options, page: options.page || "home" };
}
const pImg = (p, i = 0) => p?.images?.[i]?.url ? img(p.images[i]) : "";
const pHref = p => `/products/${encodeURIComponent(p.id)}`;
const cHref = c => `/collections/${encodeURIComponent(c.slug || c.id)}`;
const cImg = (c, x, i) => img(c.image || x.products.find(p => (c.product_ids || []).includes(p.id))?.images?.[0], c.title, LIVE && c.image && i < 2 ? `collection${i}` : undefined);
const rv = (i = 0) => `class="rv" style="--i:${i}"`;
let LIVE = null;
let EDIT_SAMPLE=false;
const dc = key => LIVE?.edit||EDIT_SAMPLE ? ` data-design-copy="${key}"` : "";
const rvc = (cls, i = 0) => `class="rv ${cls}" style="--i:${i}"`;

const card = (p, i, extra = "") => `<a class="sc-card rv${LIVE ? " au-card" : ""}"${LIVE ? ` data-title="${esc(String(p.title || "").toLowerCase())}" data-price="${Number(p.price_paise) || 0}" data-available="${p.stock == null || Number(p.stock) > 0 ? 1 : 0}" data-index="${i}"` : ""} style="--i:${i}" href="${pHref(p)}"><span class="sc-img">${pImg(p)}</span><span class="sc-meta"><span class="sc-n">${num(i)}</span><b>${esc(p.title)}</b><span class="sc-price">${rupees(p.price_paise)}${LIVE ? "" : "<small>illustrative</small>"}</span>${extra}</span></a>`;

const NAV = [["Home", "/"], ["Shop", "/collections/all"], ["About", "/pages/about"], ["Contact", "/pages/contact"]];

function header(x) {
  const links = NAV.map(([l, h]) => `<a href="${h}">${l}</a>`).join("");
  const topper = conversionTopper(x, Boolean(LIVE), esc) ?? (LIVE ? (x.copy.kicker ? ({
    architectural: `<div class="sc-ticker" aria-hidden="true"><div>${Array(8).fill(`<span>${esc(x.copy.kicker)}</span>`).join("")}</div></div>`,
    boutique: `<div class="sc-announce">${esc(x.copy.kicker)}</div>`, vintage: `<div class="sc-announce">${esc(x.copy.kicker)}</div>`,
    editorial: `<div class="sc-announce"><span>${esc(x.copy.kicker)}</span></div>`, minimal: "" })[x.style] : "") : {
    architectural: `<div class="sc-ticker" aria-hidden="true"><div>${Array(8).fill(`<span>${esc(x.brand)} / sample drop / illustrative prices</span>`).join("")}</div></div>`,
    boutique: `<div class="sc-announce">Sample store. Browse, bag and check out in preview only.</div>`,
    vintage: `<div class="sc-announce">Sample edition. Prices are illustrative.</div>`,
    editorial: `<div class="sc-announce"><span>Style demo</span><span>Issue 01</span><span>Sample prices</span></div>`,
    minimal: "",
  }[x.style]) ?? "";
  return `${topper}<header class="sc-hd${LIVE ? " aura-header" : ""}"><button type="button" class="sc-burger" data-menu-open aria-expanded="false" aria-controls="au-menu">Menu</button><a class="sc-brand" href="/">${esc(x.brand)}</a><nav class="sc-nav" aria-label="Primary">${links}</nav><span class="sc-tools"><button type="button" class="sc-search" data-search-open aria-label="Search products" aria-haspopup="dialog" aria-controls="au-search-sc">Search</button><button type="button" class="sc-bag" data-cart-open>Bag <span data-cart-count>0</span></button></span></header>
  <dialog class="au-search-dialog sc-searchbox" id="au-search-sc" aria-label="Search products"><div class="sc-sh"><h2>${LIVE ? "Search products" : "Search the sample range"}</h2><button type="button" data-search-close aria-label="Close search">Close</button></div><form class="au-search" role="search" action="/collections/all" method="get"><label class="sc-sr" for="au-q-sc">Search products</label><input id="au-q-sc" name="q" type="search" placeholder="Search products" autocomplete="off"><button type="submit">Search</button></form></dialog>
  <nav id="au-menu" class="sc-menu" hidden aria-label="Menu"><button type="button" data-menu-close>Close</button>${links}</nav>`;
}
function footer(x) {
  return `<footer class="sc-ft"><div class="sc-ft-in"><a class="sc-brand" href="/">${esc(x.brand)}</a><nav aria-label="Footer">${NAV.map(([l, h]) => `<a href="${h}">${l}</a>`).join("")}${LIVE ? (x.policies || []).filter(p => /^[a-z0-9-]+$/.test(String(p.kind || ""))).map(p => `<a href="/policies/${p.kind}">${esc(p.title || p.kind)}</a>`).join("") : ""}</nav>${LIVE ? `<p${dc("footer")}>${esc(x.copy.footer || x.brand)}</p>` : `<p>Style demonstration. The ${esc(x.world)} products, photographs and prices are illustrative samples, not a real range. Nothing here is saved, ordered or published.</p>`}</div></footer>${x.style === "boutique" || CONVERSION_TABBAR.includes(x.style) ? `<nav class="sc-tabbar" aria-label="Quick"><a href="/">Home</a><a href="/collections/all">Shop</a><button type="button" data-cart-open>Bag <span data-cart-count>0</span></button></nav>` : ""}`;
}
const cta = (label, href = "/collections/all", cls = "", attr = "") => `<a class="sc-btn ${cls}"${attr} href="${href}">${esc(label)}</a>`;
const CONV = buildConversion({ esc, rupees, img, pImg, pHref, cHref, cImg, rv, dc, num, cta, card, live: () => LIVE });

/* ---- home compositions: five different section mixes ---- */
const HOME = {
  ...CONV.HOME,
  editorial: x => { const [a, b, c, d, e] = x.products, cs = x.collections;
    return `<section class="ed-hero"><div class="ed-hero-copy"><p ${rv()}${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p class="ed-lede rv" style="--i:2"${dc("description")}>${esc(x.copy.description)}</p>${cta(x.copy.button, "/collections/all", "", dc("button"))}</div><figure class="ed-hero-img">${img(x.media.hero, undefined, "hero")}${LIVE ? "" : "<figcaption>Plate 01. Illustrative sample photograph</figcaption>"}</figure></section>
    <section class="ed-quote"><blockquote ${rv()}${dc("statement")}>${esc(x.copy.statement)}</blockquote></section>
    <section class="ed-spreads"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><div class="ed-spread-grid">${[a, b, c, d, e].filter(Boolean).map((p, i) => card(p, i)).join("")}</div></section>
    <section class="ed-plate"><figure>${img(x.media.lifestyle, undefined, "lifestyle")}<figcaption><span>Plate 02</span>${esc(x.media.lifestyle?.alt || "")}</figcaption></figure></section>
    <section class="ed-contents"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2><ol>${cs.map((c, i) => `<li ${rv(i)}><a href="${cHref(c)}"><span>${num(i)}</span><strong>${esc(c.title)}</strong><em>${esc(c.description || "")}</em><span class="ed-thumb">${cImg(c, x, i)}</span></a></li>`).join("")}</ol></section>
    <section class="ed-note"><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("story0")}>${esc(x.copy.story[0])}</p>${cta("Read the note", "/pages/about", "ghost")}</section>`; },
  boutique: x => { const ps = x.products, cs = x.collections;
    return `<section class="bq-hero"><div class="bq-hero-copy"><span class="bq-chip rv"${dc("kicker")}>${esc(x.copy.kicker)}</span><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p ${rv(2)}${dc("description")}>${esc(x.copy.description)}</p><div class="bq-actions rv" style="--i:3">${cta(x.copy.button, "/collections/all", "", dc("button"))}${cta("Our story", "/pages/about", "ghost")}</div></div><div class="bq-hero-media rv" style="--i:2"><div class="bq-arch">${img(x.media.hero, undefined, "hero")}</div>${ps[0] ? `<a class="bq-float" href="${pHref(ps[0])}"><span class="bq-float-img">${pImg(ps[0])}</span><span><b>${esc(ps[0].title)}</b><small>${rupees(ps[0].price_paise)}${LIVE ? "" : " illustrative"}</small></span></a>` : ""}</div></section>
    <section class="bq-shelf"><div class="bq-head"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><span>Swipe the shelf</span></div><div class="bq-rail">${ps.map((p, i) => card(p, i)).join("")}</div></section>
    ${LIVE ? "" : `<section class="bq-routine"><h2 ${rv()}>A simple daily rhythm</h2><ol>${[["Cleanse", ps[2]], ["Treat", ps[0]], ["Settle", ps[1]]].map(([t, p], i) => `<li ${rv(i)}><span>${i + 1}</span><b>${t}</b>${p ? `<a href="${pHref(p)}">${esc(p.title)}</a>` : ""}</li>`).join("")}</ol></section>`}
    <section class="bq-cols">${cs.map((c, i) => `<a class="bq-col rv" style="--i:${i}" href="${cHref(c)}"><span class="bq-col-img">${cImg(c, x, i)}</span><b>${esc(c.title)}</b><small>${esc(c.description || "")}</small></a>`).join("")}</section>
    <section class="bq-moment"><div class="bq-moment-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="bq-moment-copy"><h2 ${rv()}${dc("statement")}>${esc(x.copy.statement)}</h2>${cta("Browse everything")}</div></section>`; },
  architectural: x => { const ps = x.products, cs = x.collections;
    return `<section class="ar-hero"><div class="ar-hero-copy"><p class="ar-tag rv"${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p ${rv(2)}${dc("description")}>${esc(x.copy.description)}</p>${cta(x.copy.button, "/collections/all", "", dc("button"))}</div><div class="ar-hero-img rv">${img(x.media.hero, undefined, "hero")}<span class="ar-stamp">01</span></div></section>
    <section class="ar-stats"><div><b>${String(ps.length).padStart(2, "0")}</b><span>${LIVE ? "products" : "sample pieces"}</span></div><div><b>${String(cs.length).padStart(2, "0")}</b><span>collections</span></div>${LIVE ? "" : "<div><b>00</b><span>real orders</span></div>"}</section>
    <section class="ar-grid-sec"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><div class="ar-bento">${ps.map((p, i) => card(p, i)).join("")}</div></section>
    <section class="ar-band"><p ${rv()}${dc("statement")}>${esc(x.copy.statement)}</p></section>
    <section class="ar-index"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2>${cs.map((c, i) => `<a class="ar-row rv" style="--i:${i}" href="${cHref(c)}"><span>${num(i)}</span><strong>${esc(c.title)}</strong><em>${esc(c.description || "")}</em><span class="ar-row-img">${cImg(c, x, i)}</span><span class="ar-arrow">Go</span></a>`).join("")}</section>
    <section class="ar-duo"><div class="rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="ar-duo-copy"><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("story0")}>${esc(x.copy.story[0])}</p>${cta("Read the brief", "/pages/about", "ghost")}</div></section>`; },
  minimal: x => { const ps = x.products, cs = x.collections;
    return `<section class="mn-hero"><p ${rv()}${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><figure class="rv" style="--i:2">${img(x.media.hero, undefined, "hero")}</figure><p class="mn-lede rv" style="--i:3"${dc("description")}>${esc(x.copy.description)}</p>${cta(x.copy.button, "/collections/all", "text", dc("button"))}</section>
    <section class="mn-index"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><ul>${ps.map((p, i) => `<li class="rv" style="--i:${i}"><a href="${pHref(p)}"><span class="mn-i">${num(i)}</span><b>${esc(p.title)}</b><span class="mn-pr">${rupees(p.price_paise)}</span><span class="mn-pop">${pImg(p)}</span></a></li>`).join("")}</ul></section>
    <section class="mn-feature">${ps[3] ? `<a class="rv" href="${pHref(ps[3])}"><span class="sc-img">${pImg(ps[3])}</span><span class="mn-cap"><b>${esc(ps[3].title)}</b><small>${rupees(ps[3].price_paise)}${LIVE ? "" : " illustrative"}</small></span></a>` : ""}</section>
    <section class="mn-rooms"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2><div>${cs.map((c, i) => `<a class="rv" style="--i:${i}" href="${cHref(c)}"><span class="sc-img">${cImg(c, x, i)}</span><b>${esc(c.title)}</b><small>${esc(c.description || "")}</small></a>`).join("")}</div></section>
    <section class="mn-end"><p ${rv()}${dc("statement")}>${esc(x.copy.statement)}</p></section>`; },
  vintage: x => { const ps = x.products, cs = x.collections;
    return `<section class="vt-hero"><div class="vt-orn rv" aria-hidden="true"><i></i><span>&#9830;</span><i></i></div><p class="vt-kick rv" style="--i:1"${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(2)}${dc("title")}>${esc(x.copy.title)}</h1><div class="vt-mat rv" style="--i:3">${img(x.media.hero, undefined, "hero")}${LIVE ? "" : `<span class="vt-seal">Sample<br>edition</span>`}</div><p class="vt-lede rv" style="--i:4"${dc("description")}>${esc(x.copy.description)}</p>${cta(x.copy.button, "/collections/all", "", dc("button"))}</section>
    <section class="vt-cat"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><div class="vt-tags">${ps.map((p, i) => `<a class="vt-tag rv" style="--i:${i}" href="${pHref(p)}"><span class="vt-hole"></span><span class="vt-tagimg">${pImg(p)}</span><b>${esc(p.title)}</b><small>No. ${num(i)}</small><span class="sc-price">${rupees(p.price_paise)}${LIVE ? "" : "<small>illustrative</small>"}</span></a>`).join("")}</div></section>
    <section class="vt-plates"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2><div>${cs.map((c, i) => `<a class="vt-plate rv" style="--i:${i}" href="${cHref(c)}"><span class="vt-plate-img">${cImg(c, x, i)}</span><span class="vt-cap">Plate ${i + 1}. ${esc(c.title)}</span><small>${esc(c.description || "")}</small></a>`).join("")}</div></section>
    <section class="vt-story"><div class="vt-oval rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("statement")}>${esc(x.copy.statement)}</p>${cta("Read on", "/pages/about", "ghost")}</div></section>`; },
};

/* ---- shared page bodies, restyled and re-arranged by each style ---- */
function collectionPage(x) {
  const id = x.options.collectionId;
  const rich = LIVE || isConversionStyle(x.style) ? { top: "", bottom: "" } : collectionRich(x.style, x);
  const col = id ? x.collections.find(c => String(c.id) === String(id) || c.slug === id) : null;
  const list = col ? x.products.filter(p => (col.product_ids || []).includes(p.id)) : x.products;
  const chips = [`<a class="${col ? "" : "on"}" href="/collections/all">All</a>`, ...x.collections.map(c => `<a class="${col?.id === c.id ? "on" : ""}" href="${cHref(c)}">${esc(c.title)}</a>`)].join("");
  return `<section class="sc-chead"><p ${rv()}>${LIVE ? "Collection" : `${esc(x.world)} sample range`}</p><h1 ${rv(1)}>${esc(col?.title || "Shop all")}</h1><p ${rv(2)}>${esc(col?.description || (LIVE ? "" : x.copy.statement))}</p></section><nav class="sc-chips" aria-label="Collections">${chips}</nav>
  ${rich.top}<section class="sc-list ${list.length ? "" : "empty"}"${LIVE && list.length ? " data-catalog" : ""}>${list.length ? list.map((p, i) => CONV.cardX(x, p, i)).join("") : `<p class="sc-empty">${LIVE ? "Products are being added to this collection." : "No sample products in this collection yet."}</p>`}</section>${LIVE ? `<p class="sc-empty" data-catalog-empty hidden>No products match your search.</p>` : ""}${rich.bottom}`;
}
function productPageLive(x) {
  const p = x.products.find(i => String(i.id) === String(x.options.productId)) || x.products[0];
  if (!p) return `<section class="sc-chead"><h1>Product not found</h1><p><a class="sc-btn" href="/collections/all">Browse the range</a></p></section>`;
  const pics = (p.images || []).slice(0, 6).map((im, i) => img(im, p.title).replace("<img ", `<img data-gallery-image="${i}" `)).filter(Boolean);
  const features = (p.content?.features || []).map(f => `<li><span>${esc(f.label)}</span>${esc(f.value)}</li>`).join("");
  const rest = x.products.filter(i => i.id !== p.id).slice(0, 4), o = x.options;
  const avail = p.stock == null || Number(p.stock) > 0, on = o.commerce && (!o.readOnly || o.embeddedPreview);
  const max = p.stock == null ? 99 : Math.max(1, Math.min(99, Number(p.stock)));
  const buy = on ? `<div class="au-buy"><label for="aura-quantity">Quantity</label><input id="aura-quantity" type="number" min="1" max="${max}" value="1" inputmode="numeric" aria-label="Quantity"><button class="au-btn" type="button" data-add-product="${esc(p.id)}"${avail ? "" : ' disabled aria-disabled="true"'}>${avail ? "Add to cart" : "Sold out"}</button></div><p class="au-feedback" data-commerce-feedback role="status"></p>`
    : `<div class="au-buy"><button class="au-btn" type="button" disabled aria-disabled="true">${o.commerce ? "Add to cart on the live store" : "Shopping unavailable"}</button></div>`;
  return `<section class="sc-prod"><div class="sc-gal"><div class="sc-gal-main">${pics[0] || ""}</div>${pics.length > 1 ? `<div class="sc-gal-sub">${pics.slice(1).map(i => `<div>${i}</div>`).join("")}</div>` : ""}</div>
  <div class="sc-info"><p class="sc-crumb"><a href="/">Home</a> / <a href="/collections/all">Shop</a></p><h1>${esc(p.title)}</h1><p class="sc-pp">${rupees(p.price_paise)}${p.compare_at_paise ? ` <del>${rupees(p.compare_at_paise)}</del>` : ""}</p><p class="sc-desc" style="white-space:pre-line">${esc(p.description || "")}</p>${features ? `<ul class="sc-feat">${features}</ul>` : ""}${buy}</div></section>
  ${rest.length ? `<section class="sc-rel"><h2>You may also like</h2><div class="sc-list">${rest.map((r, i) => card(r, i)).join("")}</div></section>` : ""}${on ? `<div class="au-sticky-buy"><b>${rupees(p.price_paise)}</b><button type="button" class="au-btn"${avail ? ` data-add-product="${esc(p.id)}"` : ' disabled aria-disabled="true"'}>${avail ? "Add to cart" : "Sold out"}</button></div>` : ""}`;
}
function contactPageLive(x) {
  const st = x.settings || {};
  const rows = [st.support_email && `<a href="mailto:${esc(st.support_email)}">${esc(st.support_email)}</a>`, st.support_phone && `<a href="tel:${esc(String(st.support_phone).replace(/[^\d+]/g, ""))}">${esc(st.support_phone)}</a>`, st.address && `<p>${esc(st.address).replace(/\n/g, "<br>")}</p>`].filter(Boolean);
  return `<section class="sc-contact"><div><p>Contact</p><h1>Get in touch.</h1>${rows.length ? `<div class="sc-crow">${rows.join("")}</div>` : "<p>Contact details will appear here soon.</p>"}</div><div class="sc-about-img">${img(x.media.lifestyle, undefined, "lifestyle")}</div></section>`;
}
function productPage(x) {
  if (CONV.PRODUCT[x.style]) return CONV.PRODUCT[x.style](x);
  if (LIVE) return productPageLive(x);
  const p = x.products.find(i => String(i.id) === String(x.options.productId)) || x.products[0];
  if (!p) return `<section class="sc-chead"><h1>No sample product</h1></section>`;
  const features = (p.content?.features || []).map(f => `<li><span>${esc(f.label)}</span>${esc(f.value)}</li>`).join("");
  const rest = x.products.filter(i => i.id !== p.id).slice(0, 4);
  const rich = productRich(x.style, x, p);
  return `<section class="sc-prod"><div class="sc-gal"><div class="sc-gal-main rv">${img(p.images?.[0], p.title).replace("<img ", "<img data-gallery-image ")}</div><div class="sc-gal-sub"><div>${img(x.media.hero, "Styling reference")}</div><div>${img(x.media.lifestyle, "Lifestyle reference")}</div></div></div>
  <div class="sc-info"><p class="sc-crumb"><a href="/">Home</a> / <a href="/collections/all">Shop</a></p><h1 ${rv()}>${esc(p.title)}</h1><p class="sc-pp">${rupees(p.price_paise)} <small>illustrative demo price</small></p><p class="sc-desc">${esc(p.description || "")}</p>${features ? `<ul class="sc-feat">${features}</ul>` : ""}
  <div class="au-buy"><button type="button">Add to bag (preview)</button></div>${rich.offer}${rich.aside}
  <details open><summary>About this demo</summary><p>This is a sample product from a style demonstration. Photography is an illustrative placeholder and no order or payment is ever made.</p></details>
  <details><summary>${esc(x.profile.guides[2])}</summary><p>${esc(profileGuidance(x.profile)[2])}</p></details>
  <details><summary>Shipping and returns</summary><p>Add your own delivery and returns terms when you build the store. None are shown in this demo.</p></details></div></section>
  <section class="sc-rel"><h2 ${rv()}>You may also browse</h2><div class="sc-list">${rest.map((r, i) => card(r, i)).join("")}</div></section>${rich.below}
  <div class="au-sticky-buy"><b>${rupees(p.price_paise)}</b><button type="button">Add to bag (preview)</button></div>`;
}
const cartPage = x => `<section class="sc-chead">${CONV.steps(x, "cart")}<h1>Your bag</h1><p>${CONV.lead(x, "cart", "A sample bag. Nothing here is a real order.")}</p></section><section class="sc-cart"><div data-cart-page-lines class="commerce-lines"></div><aside class="sc-sum" data-cart-summary></aside></section>`;
const checkoutPage = x => `<section class="sc-chead">${CONV.steps(x, "checkout")}<h1>Checkout</h1><p class="commerce-readonly-note">${CONV.lead(x, "checkout", "Interactive preview only. This sample bag never creates an order or takes a payment.")}</p></section><section class="sc-cart"><form class="sc-form"><fieldset disabled><legend>Contact</legend><label>Email<input type="email" placeholder="you@example.com"></label><legend>Delivery</legend><label>Full name<input type="text"></label><label>Address<input type="text"></label><label>City<input type="text"></label><label>PIN code<input type="text"></label></fieldset></form><aside class="sc-sum" data-checkout-summary></aside></section>`;
const aboutPage = x => CONV.ABOUT[x.style]?.(x) || `<section class="sc-about"><div class="sc-about-copy"><p ${rv()}>About</p><h1 ${rv(1)}${dc("about")}>${esc(x.copy.about)}</h1>${x.copy.story.map((t, i) => `<p ${rv(i + 2)}${dc("story" + i)}>${esc(t)}</p>`).join("")}${cta(LIVE ? "Browse the range" : "Browse the sample range")}</div><div class="sc-about-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div></section>`;
const contactPage = x => LIVE ? contactPageLive(x) : `<section class="sc-contact"><div><p ${rv()}>Contact</p><h1 ${rv(1)}>Say hello.</h1><p ${rv(2)}>This page shows where your contact details and enquiry form will sit. Add real details when you build the store.</p><div class="sc-cimg rv">${img(x.media.hero, undefined, "hero")}</div></div><form class="sc-form"><fieldset disabled><label>Name<input type="text"></label><label>Email<input type="email"></label><label>Message<textarea rows="5"></textarea></label><button type="button">Send (preview only)</button></fieldset></form></section>`;

const EXTRA_PAGES = { home: ["statement", "lookbook", "craft", "founder", "trust", "reviews", "faq"], about: ["statement", "craft", "founder", "faq"], collection: ["collection-description", "related-collections"], product: ["material-care", "size-guide", "how-to-use", "faq", "reviews"] };
const clean = v => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const LABEL = t => t.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
/** Optional sections chosen in Ann, rendered from the projected (niche-aware) layout sections. */
function extras(x, data) {
  const chosen = data.showcase_options?.[x.page];
  if (!Array.isArray(chosen) || !EXTRA_PAGES[x.page]) return "";
  return chosen.filter(t => EXTRA_PAGES[x.page].includes(t)).map((type, k) => {
    const sec = (data.layouts?.[x.page] || []).find(i => i.type === type && !i.hidden);
    if (!sec) return "";
    const st = sec.settings || {};
    const title = clean(st.title || st.heading || st.kicker) || LABEL(type);
    // Reviews and trust marks are never invented for a demo.
    if (type === "reviews" || type === "trust") return `<section class="sc-extra"><h2 ${rv(k)}>${esc(title)}</h2><p>${type === "reviews" ? "Customer reviews appear here once your store has real ones." : "Add your verified details here when you build the store."}</p></section>`;
    const body = clean(st.text || st.body || st.description || st.content);
    const items = (sec.blocks || []).map(b => { const t = b.settings || b; return [clean(t.title || t.question || t.name || t.label), clean(t.text || t.answer || t.description || t.value || t.body)]; }).filter(([a, c]) => a || c).slice(0, 6);
    if (!body && !items.length) return "";
    return `<section class="sc-extra"><h2 ${rv(k)}>${esc(title)}</h2>${body ? `<p ${rv(k)}>${esc(body)}</p>` : ""}${items.length ? `<ul>${items.map(([a, c], i) => `<li ${rv(i)}>${a ? `<b>${esc(a)}</b>` : ""}${c ? `<span>${esc(c)}</span>` : ""}</li>`).join("")}</ul>` : ""}</section>`;
  }).join("");
}
const BODY = { collection: collectionPage, product: productPage, cart: cartPage, checkout: checkoutPage, about: aboutPage, contact: contactPage };

const KIND = { editorial: "clip", boutique: "pop", architectural: "slide", minimal: "fade", vintage: "drop", ...CONVERSION_KIND };
const kindOf = style => KIND[style] || "fade";
/** top after the hero, mid after the third section, bottom before the last one. */
function withHomeRich(html, rich) {
  const parts = html.split("</section>"), last = parts.pop();
  const ins = new Map();
  ins.set(0, rich.top); ins.set(Math.min(2, parts.length - 1), (ins.get(Math.min(2, parts.length - 1)) || "") + rich.mid);
  ins.set(parts.length - 2 < 0 ? 0 : parts.length - 2, (ins.get(parts.length - 2 < 0 ? 0 : parts.length - 2) || "") + rich.bottom);
  return parts.map((part, i) => part + "</section>" + (ins.get(i) || "")).join("") + last;
}
function themeOverrides(style, settings) {
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accent_color || "") ? settings.accent_color : null;
  const font = ["modern","serif","classic"].includes(settings.font_preset) ? settings.font_preset : styleSettings(style).font_preset;
  const display = { modern: '"Instrument Sans",system-ui,sans-serif', serif: '"Aura Editorial",Georgia,serif', classic: '"Aura Classic",Georgia,serif' }[font];
  const preset = ["white","ivory","stone","midnight"].includes(settings.color_preset) ? settings.color_preset : "white";
  const palette = { ivory: ["#f6f0e6","#29241e","#ebe3d4","#d7ccbb"], stone: ["#e9e8e4","#252723","#dddcd6","#c7c7c0"], midnight: ["#12151d","#eeeef2","#1b2030","#41485b"] }[preset];
  // These three footers stay dark even when the page palette changes.
  // Minimal stays white; the remaining footers use the palette's tint/ink pair.
  const footerInk = ["editorial","architectural","vintage"].includes(style) ? "#ffffff"
    : style === "minimal" ? "#131313" : "var(--ink)";
  const radius = { square: "2px", rounded: "6px", pill: "999px" }[settings.button_style];
  const overrides = [
    `.sc .sc-ft{color:${footerInk}}.sc .sc-ft a,.sc .sc-ft .sc-brand,.sc .sc-ft p{color:inherit}.sc .sc-ft p{opacity:1;font-size:14px;line-height:1.65}.sc .sc-ft nav{font-size:14px}.sc .sc-ft nav a:hover,.sc .sc-ft nav a:focus-visible{text-decoration:underline;text-underline-offset:4px}.sc .sc-ft nav a:focus-visible{outline:2px solid currentColor;outline-offset:4px}`,
    accent ? `.sc{--acc:${accent};--acc-ink:${contrastColor(accent) || "#ffffff"}}.sc .sc-btn:not(.ghost):not(.text){color:var(--acc-ink)}` : "",
    font !== styleSettings(style).font_preset ? `.sc{--disp:${display};--body:"Instrument Sans",system-ui,sans-serif;--hw:400}` : "",
    palette ? `.sc{--paper:${palette[0]};--ink:${palette[1]};--tint:${palette[2]};--line:${palette[3]};background:var(--paper)}.sc .sc-hd,.sc .sc-searchbox,.sc .sc-menu,.sc .sc-tabbar,.sc .sc-form input,.sc .sc-form textarea{background:var(--paper);color:var(--ink)}` : "",
    radius ? `.sc .sc-btn{border-radius:${radius}}` : "",
    ".sc .sc-btn.ghost{background:transparent;color:var(--ink)}.sc .sc-btn.text{background:none;color:var(--ink)}",
  ].join("");
  return { overrides, font, preset };
}
export function renderShowcase(data, settings, options = {}) {
  EDIT_SAMPLE=Boolean(options.designEdit&&data.settings?.ann_design?.version===1);
  const page = options.page || "home";
  if (!isShowcase(data, settings.style_preset) || !SHOWCASE_PAGES.includes(page)) return null;
  const x = context(data, settings, options);
  let main = page === "home" ? (isConversionStyle(x.style) ? HOME[x.style](x) : withHomeRich(HOME[x.style](x), homeRich(x.style, x))) : BODY[page](x);
  main += renderNicheSections(x, data) + extras(x, data);
  main = main.replace(/class="([^"]*\brv\b[^"]*)"/g, `class="$1" data-showcase-reveal data-reveal-kind="${kindOf(x.style)}"`)
    .replace(/data-showcase-reveal(?!=| data-reveal-kind)/g, `data-showcase-reveal data-reveal-kind="${kindOf(x.style)}"`);
  const { overrides, font, preset } = themeOverrides(x.style, settings);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(x.brand)} style demo</title><style>${CSS}${RICH_CSS}${NICHE_SECTION_CSS}${overrides}</style></head>
<body data-aura data-showcase="${x.style}" data-style="${x.style}" data-font="${font}" data-preset="${preset}" data-page="${page}" class="sc sc-${x.style}"><div class="sc-demo">Style demo. Sample ${esc(x.world)} products and illustrative prices. Nothing is saved, ordered or published.</div>${header(x)}<main class="sc-main sc-p-${page}">${main}</main>${footer(x)}</body></html>`;
}

/* ------------------------------------------------------------------ */
const BASE_CSS = `
@font-face{font-family:"Instrument Sans";src:url(/assets/instrument-sans-latin.woff2) format("woff2");font-weight:400 700;font-display:swap}@font-face{font-family:"Aura Editorial";src:url(/assets/aura-editorial.ttf) format("truetype");font-weight:100 900;font-display:swap}@font-face{font-family:"Aura Classic";src:url(/assets/aura-classic.ttf) format("truetype");font-weight:400;font-display:swap}
.sc *{box-sizing:border-box}.sc{margin:0;background:#fff;color:var(--ink);font:16px/1.55 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.sc img{display:block;width:100%;height:100%;object-fit:cover}.sc a{color:inherit;text-decoration:none}.sc button{font:inherit;cursor:pointer}.sc h1,.sc h2{font-family:var(--disp);margin:0;font-weight:var(--hw,400)}
.sc p{margin:0}.sc small{font-size:.75em;opacity:.7}.sc-demo{font:11px/1.4 var(--body);letter-spacing:.05em;padding:.45rem 1rem;text-align:center;background:var(--tint);color:var(--ink)}
.sc-btn{display:inline-block;padding:.85rem 1.6rem;background:var(--acc);color:#fff;font-weight:600;letter-spacing:.02em;transition:transform .35s,background .35s,box-shadow .35s}.sc-btn:hover{transform:translateY(-2px)}.sc-btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px currentColor}.sc-btn.text{background:none;color:var(--ink);padding:.2rem 0;border-bottom:1px solid currentColor;border-radius:0}
.sc-hd{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.5rem;position:sticky;top:0;z-index:20;background:#fff}.sc-nav{display:flex;gap:1.5rem}.sc-burger{display:none;background:none;border:0;color:inherit;padding:.4rem 0}.sc-bag,.sc-search{background:none;border:0;color:inherit;font-weight:600}.sc-tools{display:flex;gap:1rem;align-items:center}.sc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.sc-searchbox{border:0;padding:1.5rem;width:min(30rem,92vw);background:#fff;color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.3);top:12vh}.sc-searchbox::backdrop{background:rgba(20,20,20,.45)}.sc-sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.sc-sh h2{font-size:1.4rem}.sc-sh button,.sc-searchbox form button{border:1px solid var(--ink);background:none;color:inherit;padding:.5rem .9rem}.sc-searchbox form{display:flex;gap:.5rem}.sc-searchbox input{flex:1;padding:.7rem;border:1px solid var(--line);font:inherit}.au-search-results{list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:.4rem}.au-search-results li{padding:.5rem 0;border-top:1px solid var(--line)}.sc-extra{padding:3rem 1.5rem;max-width:56rem;margin:auto;display:grid;gap:1rem;border-top:1px solid var(--line)}.sc-extra h2{font-size:clamp(1.8rem,4vw,2.8rem)}.sc-extra ul{list-style:none;padding:0;display:grid;gap:.8rem}.sc-extra li{display:grid;gap:.2rem;padding:.8rem 0;border-top:1px solid var(--line)}
.sc-menu{position:fixed;inset:0;z-index:50;background:#fff;display:flex;flex-direction:column;gap:1.2rem;padding:2rem;font:2rem var(--disp)}.sc-menu[hidden]{display:none}.sc-menu button{align-self:flex-end;background:none;border:1px solid;padding:.4rem .9rem;color:inherit}
.sc-img{display:block;overflow:hidden;aspect-ratio:1}.sc-img img{transition:transform .9s cubic-bezier(.2,.7,.2,1)}.sc-card:hover .sc-img img{transform:scale(1.05)}
.sc-card{display:block}.sc-meta{display:flex;flex-wrap:wrap;gap:.2rem .8rem;padding:.7rem 0;align-items:baseline}.sc-n{opacity:.5;font-size:.8em}.sc-price{margin-left:auto}.sc-price small{margin-left:.4rem}
.sc-chead{padding:3rem 1.5rem 1.5rem}.sc-chead h1{font-size:clamp(2.4rem,7vw,5rem)}.sc-chips{display:flex;gap:.6rem;flex-wrap:wrap;padding:0 1.5rem 1.5rem}.sc-chips a{padding:.4rem 1rem;border:1px solid var(--line);transition:background .3s,color .3s}.sc-chips a.on,.sc-chips a:hover{background:var(--acc);color:#fff;border-color:var(--acc)}
.sc-list{display:grid;gap:1.5rem;padding:0 1.5rem 3rem;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.sc-empty{grid-column:1/-1;padding:3rem;text-align:center;background:var(--tint)}
.sc-prod{display:grid;grid-template-columns:1.2fr 1fr;gap:3rem;padding:2rem 1.5rem}.sc-gal-main{aspect-ratio:1;overflow:hidden}.sc-gal-sub{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.sc-gal-sub div{aspect-ratio:1;overflow:hidden}
.sc-info{display:grid;gap:1rem;align-content:start;position:sticky;top:5rem;align-self:start}.sc-info h1{font-size:clamp(2rem,4vw,3.4rem)}.sc-pp{font-size:1.4rem}.sc-feat{list-style:none;padding:0;display:grid;gap:.3rem}.sc-feat span{display:inline-block;min-width:7rem;opacity:.6}.sc-crumb{font-size:.8rem;opacity:.7}
.au-buy button,.sc-form button,.commerce-button{width:100%;padding:1rem;background:var(--acc);color:#fff;border:0;font-weight:600;transition:transform .3s,opacity .3s}.au-buy button:hover{transform:translateY(-2px)}.commerce-button:disabled,.sc-form button:disabled{opacity:.5;cursor:not-allowed}
.sc-info details{border-top:1px solid var(--line);padding:.8rem 0}.sc-info summary{cursor:pointer;font-weight:600}.sc-info details p{margin-top:.5rem;opacity:.8}
.au-sticky-buy{display:none}.sc-rel{padding:2rem 0}.sc-rel h2{padding:0 1.5rem;font-size:2rem}.sc-rel .sc-list{padding-top:1.5rem}
.sc-cart{display:grid;grid-template-columns:1.4fr 1fr;gap:2rem;padding:0 1.5rem 4rem}.commerce-line{display:grid;grid-template-columns:90px 1fr auto;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--line);align-items:center}.commerce-line img{width:90px;height:90px}.commerce-line label{display:block;margin:.3rem 0}.commerce-line input{width:4rem;padding:.3rem;margin-left:.4rem}.commerce-text-link{background:none;border:0;text-decoration:underline;color:inherit;padding:0}
.sc-sum{background:var(--tint);padding:1.5rem;align-self:start;display:grid;gap:.5rem}.sc-sum p{display:flex;justify-content:space-between;gap:1rem}.sc-sum h2{font-size:1.6rem}
.sc-form fieldset{border:0;padding:0;display:grid;gap:1rem;margin:0}.sc-form legend{font:600 1.1rem var(--disp);padding:0}.sc-form label{display:grid;gap:.3rem;font-size:.85rem}.sc-form input,.sc-form textarea{padding:.8rem;border:1px solid var(--line);font:inherit;background:#fff}
.sc-about,.sc-contact{display:grid;grid-template-columns:1fr 1fr;gap:3rem;padding:3rem 1.5rem;align-items:start}.sc-about h1,.sc-contact h1{font-size:clamp(2.4rem,6vw,4.6rem);margin:.5rem 0 1.2rem}.sc-about-copy,.sc-contact>div{display:grid;gap:1rem;justify-items:start}.sc-about-img,.sc-cimg{aspect-ratio:1;overflow:hidden;width:100%}
.sc-ft{background:var(--ftbg,var(--tint));padding:3rem 1.5rem 4rem;margin-top:2rem}.sc-ft-in{display:grid;gap:1.2rem;max-width:60rem}.sc-ft nav{display:flex;gap:1.4rem;flex-wrap:wrap}.sc-ft p{font-size:.8rem;opacity:.75;max-width:40rem}
@keyframes sc-rise{from{opacity:0;transform:translateY(26px)}}@keyframes sc-clip{from{opacity:0;clip-path:inset(0 0 100% 0);transform:translateY(20px)}}@keyframes sc-pop{from{opacity:0;transform:scale(.92) translateY(12px)}}@keyframes sc-slide{from{opacity:0;transform:translateX(-48px)}}@keyframes sc-fade{from{opacity:0}}@keyframes sc-drop{from{opacity:0;transform:translateY(-14px)}}@keyframes sc-in{from{opacity:0}}@keyframes sc-tick{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:no-preference){.sc-main{animation:var(--pg,sc-in) .6s both}}
/* ============ EDITORIAL: magazine, burgundy ============ */
.sc-editorial{--ink:#1d1418;--acc:#6b1735;--tint:#f7edf0;--line:#e5d3d8;--disp:"Aura Editorial",Georgia,serif;--body:"Instrument Sans",system-ui,sans-serif;--rv:sc-clip;--dur:1.2s;--pg:sc-fade;--ftbg:#6b1735}
.sc-editorial .sc-demo{background:#fff;border-bottom:1px solid var(--line)}.sc-editorial .sc-announce{display:flex;justify-content:space-between;padding:.5rem 1.5rem;font:italic .8rem var(--disp);border-bottom:1px solid var(--ink)}
.sc-editorial .sc-hd{display:grid;grid-template-columns:1fr auto 1fr;border-bottom:1px solid var(--ink)}.sc-editorial .sc-brand{grid-column:2;grid-row:1;font:italic clamp(1.8rem,4vw,3rem)/1 var(--disp);color:var(--acc)}.sc-editorial .sc-nav{grid-column:1;grid-row:1;font-size:.8rem;text-transform:uppercase;letter-spacing:.14em}.sc-editorial .sc-tools{justify-self:end;grid-column:3;grid-row:1}
.sc-editorial .sc-btn{border-radius:0;background:var(--acc);text-transform:uppercase;letter-spacing:.16em;font-size:.72rem}.sc-editorial .sc-btn:hover{background:var(--ink)}
.ed-hero{display:grid;grid-template-columns:repeat(12,1fr);padding:2rem 1.5rem 0;align-items:end;min-height:80vh}.ed-hero-copy{grid-column:1/8;grid-row:1;z-index:2;display:grid;gap:1.4rem;justify-items:start;padding-bottom:3rem}.ed-hero-copy>p:first-child{font:italic 1rem var(--disp);color:var(--acc)}.ed-hero h1{font-size:clamp(3.4rem,10.5vw,10rem);line-height:.88;letter-spacing:-.03em;font-style:italic;mix-blend-mode:multiply}.ed-lede{max-width:26rem;font-size:1.05rem}
.ed-hero-img{grid-column:7/13;grid-row:1;margin:0;aspect-ratio:4/5;overflow:hidden;position:relative}.ed-hero-img figcaption,.ed-plate figcaption{font:italic .75rem var(--disp);padding:.5rem 0}.ed-hero-img img{animation:none}
.ed-quote{background:var(--acc);color:#fff;padding:7rem 1.5rem;text-align:center;margin-top:4rem}.ed-quote blockquote{margin:0 auto;max-width:56rem;font:italic clamp(2rem,5vw,4.4rem)/1.08 var(--disp)}
.ed-spreads{padding:6rem 1.5rem 3rem}.ed-spreads h2{font-size:clamp(2.4rem,6vw,5rem);font-style:italic;margin-bottom:3rem;border-bottom:1px solid var(--ink);padding-bottom:1rem}.ed-spread-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:3rem 2rem}
.ed-spread-grid .sc-card:nth-child(1){grid-column:1/6}.ed-spread-grid .sc-card:nth-child(2){grid-column:7/11;margin-top:7rem}.ed-spread-grid .sc-card:nth-child(3){grid-column:2/7}.ed-spread-grid .sc-card:nth-child(4){grid-column:8/12;margin-top:5rem}.ed-spread-grid .sc-card:nth-child(5){grid-column:3/9}
.sc-editorial .sc-img{aspect-ratio:4/5}.sc-editorial .sc-meta b{font:italic 1.4rem var(--disp);font-weight:400}.sc-editorial .sc-card:hover b{color:var(--acc);text-decoration:underline;text-underline-offset:5px}
.ed-plate{padding:3rem 0}.ed-plate figure{margin:0;position:relative;height:80vh;overflow:hidden}.ed-plate figcaption{position:absolute;left:1.5rem;bottom:1.5rem;color:#fff;background:var(--acc);padding:.6rem 1rem}.ed-plate figcaption span{margin-right:.8rem;opacity:.7}
.ed-contents{padding:4rem 1.5rem}.ed-contents h2{font-size:3rem;font-style:italic}.ed-contents ol{list-style:none;padding:0;margin:2rem 0 0}.ed-contents a{display:grid;grid-template-columns:4rem 1fr 1fr 9rem;gap:1.5rem;align-items:center;padding:1.6rem 0;border-top:1px solid var(--ink);position:relative;transition:padding .5s,color .5s}.ed-contents a:hover{padding-left:1.5rem;color:var(--acc)}.ed-contents strong{font:italic 2.2rem var(--disp);font-weight:400}.ed-thumb{aspect-ratio:1;overflow:hidden;clip-path:inset(0 0 0 100%);transition:clip-path .7s}.ed-contents a:hover .ed-thumb{clip-path:inset(0)}
.ed-note{padding:5rem 1.5rem;max-width:44rem;margin:auto;display:grid;gap:1.4rem;justify-items:start}.ed-note h2{font:italic 3rem var(--disp)}.ed-note p{font-size:1.2rem}
.sc-editorial .sc-list{grid-template-columns:repeat(2,1fr);gap:3rem 2rem}.sc-editorial .sc-list .sc-card:nth-child(even){margin-top:4rem}.sc-editorial .sc-chead h1{font-style:italic}
/* ============ BOUTIQUE: soft, rounded, teal and peach ============ */
.sc-boutique{--ink:#17302b;--acc:#245c52;--tint:#e5f0ec;--line:#cfe0da;--peach:#f4bfa5;--disp:"Instrument Sans",system-ui,sans-serif;--body:"Instrument Sans",system-ui,sans-serif;--rv:sc-pop;--dur:.8s;--pg:sc-pop;--hw:700;--ease:cubic-bezier(.3,1.4,.5,1)}
.sc-boutique .sc-announce{background:var(--acc);color:#fff;text-align:center;font-size:.78rem;padding:.4rem}.sc-boutique .sc-hd{margin:.8rem 1rem;border-radius:999px;box-shadow:0 8px 24px rgba(36,92,82,.14);padding:.7rem 1.4rem;background:#fff}.sc-boutique .sc-brand{font:800 1.3rem var(--disp);color:var(--acc)}.sc-boutique .sc-nav a{padding:.4rem .9rem;border-radius:999px;transition:background .3s}.sc-boutique .sc-nav a:hover{background:var(--tint)}.sc-boutique .sc-bag{background:var(--acc);color:#fff;border-radius:999px;padding:.5rem 1.1rem}
.sc-boutique .sc-btn{border-radius:999px;background:var(--acc)}.sc-boutique .sc-btn:hover{box-shadow:0 10px 22px rgba(36,92,82,.3)}.sc-boutique .sc-btn.ghost{color:var(--acc)}
.bq-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:2rem;align-items:center;padding:3rem 1.5rem;background:radial-gradient(circle at 80% 20%,var(--tint) 0 38%,transparent 39%)}.bq-chip{display:inline-block;padding:.35rem .9rem;background:var(--peach);border-radius:999px;font-size:.78rem;font-weight:700}.bq-hero h1{font-size:clamp(2.8rem,6.5vw,5.6rem);line-height:1;margin:1rem 0;color:var(--acc);letter-spacing:-.02em}.bq-hero-copy p{max-width:30rem;font-size:1.1rem}.bq-actions{display:flex;gap:.8rem;margin-top:1.6rem;flex-wrap:wrap}
.bq-hero-media{position:relative}.bq-arch{aspect-ratio:4/5;border-radius:999px 999px 2rem 2rem;overflow:hidden;box-shadow:0 30px 60px rgba(36,92,82,.2)}.bq-float{position:absolute;left:-1rem;bottom:2rem;display:flex;gap:.7rem;align-items:center;background:#fff;border-radius:1.2rem;padding:.6rem 1rem .6rem .6rem;box-shadow:0 14px 34px rgba(23,48,43,.2);animation:bq-bob 5s ease-in-out infinite}.bq-float-img{width:52px;height:52px;border-radius:.8rem;overflow:hidden}.bq-float small{display:block}
@keyframes bq-bob{50%{transform:translateY(-8px)}}@media (prefers-reduced-motion:reduce){.bq-float{animation:none}}
.bq-shelf{padding:3rem 0 2rem;background:var(--tint);border-radius:2.5rem;margin:1rem}.bq-head{display:flex;justify-content:space-between;align-items:baseline;padding:0 1.5rem}.bq-head h2{font-size:2.2rem;color:var(--acc)}.bq-rail{display:flex;gap:1.2rem;overflow-x:auto;scroll-snap-type:x mandatory;padding:1.5rem;scrollbar-width:none}.bq-rail .sc-card{flex:0 0 min(70%,260px);scroll-snap-align:start;background:#fff;border-radius:1.6rem;padding:.7rem;transition:transform .4s,box-shadow .4s}.bq-rail .sc-card:hover{transform:translateY(-8px) rotate(-1deg);box-shadow:0 20px 34px rgba(36,92,82,.18)}.sc-boutique .sc-img{border-radius:1.2rem}.sc-boutique .sc-meta{padding:.8rem .4rem .3rem}.sc-boutique .sc-n{display:none}
.bq-routine{padding:4rem 1.5rem;text-align:center}.bq-routine h2{font-size:2.2rem;color:var(--acc)}.bq-routine ol{list-style:none;padding:0;display:flex;justify-content:center;gap:1.2rem;flex-wrap:wrap;margin-top:2rem}.bq-routine li{background:var(--peach);border-radius:2rem;padding:1.6rem;width:15rem;display:grid;gap:.4rem;justify-items:center}.bq-routine li:nth-child(2){background:var(--tint);transform:translateY(1.2rem)}.bq-routine li span{width:2.2rem;height:2.2rem;border-radius:50%;background:var(--acc);color:#fff;display:grid;place-items:center;font-weight:800}.bq-routine a{text-decoration:underline}
.bq-cols{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;padding:2rem 1.5rem}.bq-col{display:grid;gap:.4rem}.bq-col-img{aspect-ratio:1;border-radius:2rem;overflow:hidden;display:block}.bq-col-img img{transition:transform .8s}.bq-col:hover img{transform:scale(1.06)}.bq-col b{font-size:1.4rem;color:var(--acc)}
.bq-moment{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:2rem;padding:2rem 1.5rem;background:var(--peach);border-radius:2.5rem;margin:1rem}.bq-moment-img{aspect-ratio:1;border-radius:50%;overflow:hidden}.bq-moment h2{font-size:clamp(1.8rem,4vw,3rem);margin-bottom:1.2rem}
.sc-boutique .sc-list{grid-template-columns:repeat(3,1fr)}.sc-boutique .sc-list .sc-card{background:var(--tint);padding:.7rem;border-radius:1.6rem}.sc-boutique .sc-chead{text-align:center;background:var(--tint);border-radius:0 0 3rem 3rem;margin-bottom:1.5rem}.sc-boutique .sc-chips{justify-content:center}.sc-boutique .sc-chips a{border-radius:999px}.sc-boutique .sc-gal-main,.sc-boutique .sc-gal-sub div,.sc-boutique .sc-about-img{border-radius:2rem}.sc-boutique .sc-sum{border-radius:1.6rem}.sc-boutique .au-buy button,.sc-boutique .commerce-button{border-radius:999px}.sc-boutique .sc-ft{border-radius:2.5rem 2.5rem 0 0;--ftbg:var(--tint)}
.sc-tabbar{display:none}
/* ============ ARCHITECTURAL: grid, ticker, vermilion ============ */
.sc-architectural{--ink:#131313;--acc:#b3320e;--tint:#ecebe7;--line:#131313;--disp:"Instrument Sans",system-ui,sans-serif;--body:"Instrument Sans",system-ui,sans-serif;--rv:sc-slide;--dur:.55s;--ease:steps(6,end);--pg:sc-slide;--hw:800;--ftbg:#131313}
.sc-architectural h1,.sc-architectural h2{text-transform:uppercase;letter-spacing:-.02em;line-height:.9}.sc-architectural .sc-ticker{background:var(--acc);color:#fff;overflow:hidden;white-space:nowrap;font:700 .78rem var(--disp);text-transform:uppercase;letter-spacing:.14em;padding:.4rem 0}.sc-architectural .sc-ticker div{display:inline-flex;gap:3rem;animation:sc-tick 22s linear infinite;width:max-content}
@media (prefers-reduced-motion:reduce){.sc-architectural .sc-ticker div{animation:none}}
.sc-architectural .sc-demo{background:var(--ink);color:#fff}.sc-architectural .sc-hd{border-bottom:3px solid var(--ink);padding:.7rem 1rem}.sc-architectural .sc-brand{font:800 1.8rem var(--disp);text-transform:uppercase;letter-spacing:-.04em}.sc-architectural .sc-nav{counter-reset:n;text-transform:uppercase;font-weight:700;font-size:.85rem;gap:0}.sc-architectural .sc-nav a{counter-increment:n;padding:.5rem 1rem;border-left:2px solid var(--ink);transition:background .15s,color .15s}.sc-architectural .sc-nav a::before{content:"0" counter(n) " ";color:var(--acc);margin-right:.3rem}.sc-architectural .sc-nav a:hover{background:var(--ink);color:#fff}.sc-architectural .sc-bag{background:var(--ink);color:#fff;padding:.6rem 1rem;text-transform:uppercase}
.sc-architectural .sc-btn{background:var(--ink);border-radius:0;text-transform:uppercase;box-shadow:5px 5px 0 var(--acc);transition:transform .15s,box-shadow .15s}.sc-architectural .sc-btn:hover{transform:translate(5px,5px);box-shadow:0 0 0 var(--acc)}.sc-architectural .sc-btn.ghost{background:#fff;color:var(--ink);box-shadow:5px 5px 0 var(--ink)}
.ar-hero{display:grid;grid-template-columns:1.1fr 1fr;border-bottom:3px solid var(--ink);min-height:78vh}.ar-hero-copy{padding:3rem 1.5rem;display:grid;gap:1.4rem;align-content:end;justify-items:start}.ar-tag{background:var(--acc);color:#fff;padding:.25rem .7rem;text-transform:uppercase;font-weight:700;font-size:.8rem}.ar-hero h1{font-size:clamp(3.6rem,10vw,9.5rem)}.ar-hero-copy p{max-width:28rem}.ar-hero-img{position:relative;border-left:3px solid var(--ink);background:var(--acc)}.ar-hero-img img{mix-blend-mode:multiply;filter:grayscale(1) contrast(1.1);transition:filter .5s}.ar-hero-img:hover img{filter:none;mix-blend-mode:normal}.ar-stamp{position:absolute;right:1rem;top:1rem;font:800 4rem var(--disp);color:#fff}
.ar-stats{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:3px solid var(--ink)}.ar-stats div{padding:1.4rem 1.5rem;border-right:3px solid var(--ink);display:grid}.ar-stats div:last-child{border:0}.ar-stats b{font:800 clamp(2.4rem,6vw,5rem)/1 var(--disp);color:var(--acc)}.ar-stats span{text-transform:uppercase;font-size:.78rem;font-weight:700}
.ar-grid-sec{padding:3rem 1rem}.ar-grid-sec h2{font-size:clamp(2.6rem,8vw,6rem);margin-bottom:1.5rem}.ar-bento{display:grid;grid-template-columns:repeat(4,1fr);border:3px solid var(--ink)}.ar-bento .sc-card{border:1.5px solid var(--ink);padding:.7rem;background:#fff;transition:background .15s,color .15s}.ar-bento .sc-card:first-child{grid-column:span 2;grid-row:span 2}.ar-bento .sc-card:hover{background:var(--acc);color:#fff}
.sc-architectural .sc-img{filter:grayscale(.85);transition:filter .3s}.sc-architectural .sc-card:hover .sc-img{filter:none}.sc-architectural .sc-meta{text-transform:uppercase;font-weight:700;font-size:.88rem}
.ar-band{background:var(--acc);color:#fff;padding:5rem 1.5rem;border-block:3px solid var(--ink)}.ar-band p{font:800 clamp(2.4rem,8vw,7rem)/.92 var(--disp);text-transform:uppercase;max-width:60rem}
.ar-index{padding:3rem 1rem}.ar-index h2{font-size:3rem;margin-bottom:1rem}.ar-row{display:grid;grid-template-columns:4rem 1.2fr 1.5fr 8rem 4rem;gap:1rem;align-items:center;padding:1rem;border-top:3px solid var(--ink);transition:background .15s,color .15s}.ar-row:last-child{border-bottom:3px solid var(--ink)}.ar-row:hover{background:var(--ink);color:#fff}.ar-row strong{font:800 clamp(1.4rem,3.5vw,2.8rem) var(--disp);text-transform:uppercase}.ar-row-img{aspect-ratio:1;overflow:hidden;display:block}.ar-arrow{font-weight:800;color:var(--acc);text-transform:uppercase}
.ar-duo{display:grid;grid-template-columns:1fr 1fr;border-top:3px solid var(--ink)}.ar-duo>div:first-child{aspect-ratio:1;border-right:3px solid var(--ink)}.ar-duo-copy{padding:3rem 1.5rem;display:grid;gap:1.2rem;align-content:center;justify-items:start}.ar-duo h2{font-size:clamp(2.4rem,6vw,5rem)}
.sc-architectural .sc-list{grid-template-columns:repeat(4,1fr);gap:0;padding:0 1rem 3rem}.sc-architectural .sc-list .sc-card{border:1.5px solid var(--ink);padding:.7rem}.sc-architectural .sc-chips a{border:2px solid var(--ink);text-transform:uppercase;font-weight:700}.sc-architectural .sc-chead h1{font-size:clamp(3rem,10vw,8rem)}.sc-architectural .sc-gal-main,.sc-architectural .sc-gal-sub div,.sc-architectural .sc-about-img{border:3px solid var(--ink)}.sc-architectural .sc-sum{background:#fff;border:3px solid var(--ink);box-shadow:8px 8px 0 var(--acc)}.sc-architectural .sc-form input,.sc-architectural .sc-form textarea{border:2px solid var(--ink)}
/* ============ MINIMAL: air, thin rules, warm stone ============ */
.sc-minimal{--ink:#202020;--acc:#202020;--tint:#efebe3;--line:#d9d4c9;--clay:#a35f3c;--disp:"Instrument Sans",system-ui,sans-serif;--body:"Instrument Sans",system-ui,sans-serif;--rv:sc-fade;--dur:1.6s;--ease:ease;--pg:sc-fade;--hw:400}
.sc-editorial,.sc-vintage{font-synthesis:none}.sc-editorial *,.sc-vintage *{font-synthesis:none}.sc-minimal{font-size:15px;letter-spacing:.01em}.sc-minimal .sc-demo{background:#fff;color:#777}.sc-minimal .sc-hd{justify-content:center;flex-direction:column;gap:.8rem;padding:2rem 1.5rem 1rem;position:static;text-align:center;position:relative}.sc-minimal .sc-brand{font:400 .95rem var(--disp);letter-spacing:.5em;text-transform:uppercase}.sc-minimal .sc-nav{gap:2.2rem;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#777}.sc-minimal .sc-nav a:hover{color:var(--ink)}.sc-minimal .sc-tools{position:absolute;right:1.5rem;top:2rem;font-size:.8rem}.sc-minimal .sc-bag,.sc-minimal .sc-search{font-weight:400}.sc-minimal .sc-btn{background:none;color:var(--ink);padding:.3rem 0;border-bottom:1px solid var(--ink)}.sc-minimal .sc-btn.ghost{box-shadow:none}.sc-minimal .sc-btn:hover{transform:none;border-color:var(--clay);color:var(--clay)}
.mn-hero{display:grid;justify-items:center;text-align:center;gap:1.6rem;padding:6rem 1.5rem 4rem}.mn-hero>p:first-child{font-size:.75rem;letter-spacing:.3em;text-transform:uppercase;color:var(--clay)}.mn-hero h1{font-size:clamp(2.4rem,6vw,5rem);letter-spacing:-.01em}.mn-hero figure{margin:2rem 0;width:min(560px,86vw);aspect-ratio:1;overflow:hidden;background:var(--tint)}.mn-lede{max-width:26rem;color:#555}
.mn-index{max-width:46rem;margin:4rem auto;padding:0 1.5rem}.mn-index h2{font-size:.75rem;letter-spacing:.3em;text-transform:uppercase;color:var(--clay);margin-bottom:1.5rem;font-weight:400}.mn-index ul{list-style:none;padding:0;margin:0}.mn-index li a{display:grid;grid-template-columns:3rem 1fr auto;gap:1rem;padding:1.4rem 0;border-top:1px solid var(--line);position:relative;transition:padding .6s,color .4s}.mn-index li:last-child a{border-bottom:1px solid var(--line)}.mn-index a:hover{padding-left:1rem;color:var(--clay)}.mn-index b{font-weight:400;font-size:1.5rem}.mn-i{color:#999;font-size:.8rem;align-self:center}.mn-pop{position:absolute;right:4rem;top:50%;width:140px;aspect-ratio:1;transform:translateY(-50%) scale(.9);opacity:0;pointer-events:none;transition:opacity .6s,transform .6s;z-index:3;overflow:hidden}.mn-index a:hover .mn-pop{opacity:1;transform:translateY(-50%) scale(1)}
.mn-feature{display:grid;justify-items:center;padding:3rem 1.5rem}.mn-feature a{width:min(440px,90vw);display:grid;gap:.8rem}.mn-cap{display:flex;justify-content:space-between;font-size:.85rem}
.mn-rooms{max-width:60rem;margin:5rem auto;padding:0 1.5rem}.mn-rooms h2{font-size:.75rem;letter-spacing:.3em;text-transform:uppercase;color:var(--clay);font-weight:400;margin-bottom:1.5rem}.mn-rooms>div{display:grid;grid-template-columns:1fr 1fr;gap:3rem}.mn-rooms a{display:grid;gap:.4rem}.mn-rooms .sc-img img{transition:transform 1.6s}.mn-rooms a:hover img{transform:scale(1.03)}.mn-end{padding:8rem 1.5rem;text-align:center}.mn-end p{font:400 clamp(1.6rem,3.5vw,2.8rem) var(--disp);max-width:36rem;margin:auto}
.sc-minimal .sc-list{grid-template-columns:repeat(2,1fr);gap:4rem 3rem;max-width:56rem;margin:auto}.sc-minimal .sc-chead,.sc-minimal .sc-chips{text-align:center;justify-content:center}.sc-minimal .sc-chead h1{font-weight:400}.sc-minimal .sc-chips a{border:0;color:#888}.sc-minimal .sc-chips a.on{background:none;color:var(--clay);border-bottom:1px solid var(--clay)}.sc-minimal .sc-chips a:hover{background:none;color:var(--ink)}.sc-minimal .sc-meta{justify-content:space-between;padding:.8rem 0}.sc-minimal .sc-n{display:none}.sc-minimal .sc-sum{background:none;border-top:1px solid var(--ink);padding:1rem 0}.sc-minimal .sc-ft{background:#fff;border-top:1px solid var(--line)}.sc-minimal .au-buy button,.sc-minimal .commerce-button,.sc-minimal .sc-form button{background:var(--ink)}.sc-minimal .sc-prod{max-width:62rem;margin:auto;grid-template-columns:1fr 1fr;gap:5rem}
/* ============ VINTAGE: catalogue, hang tags, double rules, saddle brown ============ */
.sc-vintage{--ink:#2b1d15;--acc:#65402d;--tint:#f4e8d6;--line:#cdb48d;--gold:#b08a4e;--disp:"Aura Classic",Georgia,serif;--body:"Aura Classic",Georgia,serif;--rv:sc-drop;--dur:1s;--pg:sc-in;--ftbg:#2b1d15}
.sc-vintage .sc-announce{background:var(--acc);color:#f4e8d6;text-align:center;font:italic .8rem var(--disp);padding:.4rem}.sc-vintage .sc-hd{justify-content:center;flex-direction:column;border-bottom:4px double var(--acc);margin:0 1rem;padding:1.4rem 0 .8rem}.sc-vintage .sc-brand{font:700 italic clamp(1.8rem,4vw,2.8rem) var(--disp);color:var(--acc)}.sc-vintage .sc-nav{gap:2rem;font:italic 1rem var(--disp)}.sc-vintage .sc-nav a:hover{text-decoration:underline;text-underline-offset:4px}.sc-vintage .sc-tools{position:absolute;right:1.5rem;top:1.6rem}.sc-vintage .sc-hd{position:relative}
.sc-vintage .sc-btn{border-radius:0;background:var(--acc);border:1px solid var(--gold);outline:1px solid var(--acc);outline-offset:3px;font-family:var(--disp);font-style:italic}.sc-vintage .sc-btn.ghost{background:none}
.vt-hero{display:grid;justify-items:center;text-align:center;gap:1.2rem;padding:3rem 1.5rem}.vt-orn{display:flex;align-items:center;gap:1rem;color:var(--gold);width:min(22rem,80%)}.vt-orn i{flex:1;height:1px;background:var(--gold)}.vt-kick{font:italic 1.1rem var(--disp);color:var(--acc)}.vt-hero h1{font-size:clamp(2.4rem,6vw,5rem);line-height:1.05;max-width:46rem;font-weight:700}
.vt-mat{position:relative;width:min(600px,90vw);padding:1.2rem;background:var(--tint);border:1px solid var(--gold);outline:1px solid var(--gold);outline-offset:-10px;aspect-ratio:1}.vt-mat img{border:1px solid var(--acc)}.vt-seal{position:absolute;right:-1rem;bottom:-1.4rem;width:5.6rem;height:5.6rem;border-radius:50%;background:var(--acc);color:#f4e8d6;display:grid;place-items:center;text-align:center;font:italic .8rem/1.1 var(--disp);border:3px double #f4e8d6;box-shadow:0 0 0 2px var(--acc);transform:rotate(-12deg);transition:transform .8s}.vt-mat:hover .vt-seal{transform:rotate(8deg)}.vt-lede{max-width:34rem;font-size:1.1rem}
.vt-cat{background:var(--tint);padding:4rem 1.5rem;border-block:1px solid var(--gold)}.vt-cat h2,.vt-plates h2{text-align:center;font:italic 700 2.4rem var(--disp);color:var(--acc);margin-bottom:2.5rem}.vt-tags{display:flex;flex-wrap:wrap;justify-content:center;gap:2rem;max-width:62rem;margin:auto}.vt-tag{width:min(100%,250px);background:#fff;border:1px solid var(--line);padding:1.6rem .9rem .9rem;display:grid;gap:.3rem;text-align:center;position:relative;transform:rotate(var(--r,0deg));transition:transform .5s cubic-bezier(.3,1.5,.5,1),box-shadow .5s}.vt-tag:nth-child(odd){--r:-1.5deg}.vt-tag:nth-child(even){--r:1.2deg}.vt-tag:hover{transform:rotate(0) translateY(-8px);box-shadow:0 18px 30px rgba(43,29,21,.2)}.vt-hole{position:absolute;top:.5rem;left:50%;width:.7rem;height:.7rem;border-radius:50%;border:1px solid var(--gold);transform:translateX(-50%);background:var(--tint)}.vt-tagimg{aspect-ratio:1;overflow:hidden;display:block;border:1px solid var(--line)}.vt-tag b{font:700 1.05rem var(--disp)}.vt-tag small{font-style:italic}.vt-tag .sc-price{margin:0}
.vt-plates{padding:4rem 1.5rem}.vt-plates>div{display:grid;grid-template-columns:1fr 1fr;gap:3rem;max-width:56rem;margin:auto}.vt-plate{display:grid;gap:.4rem;text-align:center}.vt-plate-img{display:block;aspect-ratio:1;border:1px solid var(--gold);padding:.7rem;outline:1px solid var(--gold);outline-offset:-6px;overflow:hidden;background:#fff}.vt-plate-img img{transition:transform 1s}.vt-plate:hover img{transform:scale(1.04)}.vt-cap{font:italic 1.2rem var(--disp);color:var(--acc)}
.vt-story{display:grid;grid-template-columns:1fr 1.2fr;gap:3rem;align-items:center;padding:3rem 1.5rem 4rem;max-width:62rem;margin:auto}.vt-oval{aspect-ratio:4/5;border-radius:50%;overflow:hidden;border:6px double var(--acc)}.vt-story h2{font:italic 700 2.6rem var(--disp);color:var(--acc)}.vt-story p{margin:1rem 0 1.6rem;font-size:1.25rem}
.sc-vintage .sc-list{grid-template-columns:repeat(3,1fr);gap:2rem;max-width:62rem;margin:auto}.sc-vintage .sc-list .sc-card{border:1px solid var(--line);padding:.8rem;background:#fff;transition:transform .5s,box-shadow .5s}.sc-vintage .sc-list .sc-card:hover{transform:rotate(-1deg) translateY(-4px);box-shadow:0 14px 24px rgba(43,29,21,.18)}.sc-vintage .sc-chead{text-align:center;border-bottom:4px double var(--acc);margin:0 1rem 1.5rem}.sc-vintage .sc-chead h1{font-style:italic;font-weight:700}.sc-vintage .sc-chips{justify-content:center}.sc-vintage .sc-chips a{font-style:italic;border-color:var(--gold)}.sc-vintage .sc-gal-main,.sc-vintage .sc-gal-sub div,.sc-vintage .sc-about-img{border:1px solid var(--gold);padding:.6rem;background:var(--tint)}.sc-vintage .sc-sum{border:1px solid var(--gold);outline:1px solid var(--gold);outline-offset:-6px}.sc-vintage .sc-ft{color:#f4e8d6}
/* ============ responsive ============ */
@media (max-width:760px){
.sc-nav{display:none}.sc-burger{display:block}.sc-hd{padding:.8rem 1rem}.sc-minimal .sc-hd,.sc-vintage .sc-hd{flex-direction:row;justify-content:space-between}.sc-minimal .sc-tools,.sc-vintage .sc-tools{position:static}.sc-editorial .sc-hd{grid-template-columns:auto 1fr auto}.sc-editorial .sc-burger{grid-column:1;grid-row:1}.sc-editorial .sc-brand{grid-column:2;text-align:center}.sc-editorial .sc-tools{grid-column:3}
.sc-prod,.sc-cart,.sc-about,.sc-contact,.bq-hero,.bq-moment,.ar-hero,.ar-duo,.vt-story{grid-template-columns:1fr}.sc-info{position:static}.sc-prod{gap:1.5rem}.sc-list,.sc-boutique .sc-list,.sc-architectural .sc-list,.sc-vintage .sc-list{grid-template-columns:1fr 1fr;gap:1rem}.sc-minimal .sc-list,.sc-editorial .sc-list{grid-template-columns:1fr 1fr;gap:2rem 1rem}
.ed-hero{display:block;min-height:0}.ed-hero-img{margin-top:-2rem;aspect-ratio:1}.ed-hero h1{font-size:clamp(3.2rem,17vw,5rem)}.ed-spread-grid{display:grid;grid-template-columns:1fr;gap:2rem}.ed-spread-grid .sc-card{grid-column:auto!important;margin:0!important}.ed-spread-grid .sc-card:nth-child(even){margin-left:2.5rem!important}.ed-plate figure{height:60vh}.ed-contents a{grid-template-columns:2.4rem 1fr 4.5rem}.ed-contents em{display:none}
.bq-rail .sc-card{flex-basis:72%}.bq-cols{grid-template-columns:1fr}.bq-routine li:nth-child(2){transform:none}.sc-boutique{padding-bottom:4.5rem}.sc-tabbar{display:flex;position:fixed;bottom:.7rem;left:.7rem;right:.7rem;z-index:30;background:var(--acc);border-radius:999px;justify-content:space-around;padding:.7rem;box-shadow:0 12px 30px rgba(23,48,43,.35)}.sc-tabbar a,.sc-tabbar button{color:#fff;background:none;border:0;font-weight:700}
.ar-hero-img{border-left:0;border-top:3px solid var(--ink);aspect-ratio:1}.ar-stats b{font-size:2.2rem}.ar-bento{grid-template-columns:1fr 1fr}.ar-row{grid-template-columns:2.4rem 1fr 4rem}.ar-row em,.ar-arrow{display:none}.ar-duo>div:first-child{border-right:0}
.mn-rooms>div,.vt-plates>div{grid-template-columns:1fr}.mn-hero{padding-top:3rem}.mn-pop{display:none}.sc-minimal .sc-prod{gap:2rem}.vt-seal{right:0}
.au-sticky-buy{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:25;background:#fff;border-top:1px solid var(--line);padding:.7rem 1rem;gap:1rem;align-items:center;justify-content:space-between}.au-sticky-buy button{padding:.8rem 1.2rem;background:var(--acc);color:#fff;border:0;font-weight:600}.sc-boutique .au-sticky-buy{bottom:4.2rem}.commerce-line{grid-template-columns:70px 1fr auto}.commerce-line img{width:70px;height:70px}}
`;
const CSS = BASE_CSS + CONVERSION_CSS;

/* ---- saved design (real catalogue, no demo content) ---- */
const liveMedia = o => o && typeof o === "object" && okUrl(o.url) ? { url: o.url, alt: String(o.alt || "").replace(/^illustrative\s+/i, "").replace(/^./, c => c.toUpperCase()), width: Number(o.width) || 1024, height: Number(o.height) || 1024 } : null;
export function renderDesignLive(data, settings, options, design) {
  EDIT_SAMPLE=false;
  const style = design.style, page = options.page || "home";
  if (!DEF[style] || !HOME[style] || !(page === "home" || ["collection", "product", "about", "contact"].includes(page))) return null;
  const pack = SHOWCASE_MEDIA?.[design.media_pack || style] || {}, m = design.media || {};
  const brand = settings.brand_name || data.store?.name || "Your brand";
  const dm = design.copy && typeof design.copy === "object" ? design.copy : {};
  const base = designNeutralCopy(style, brand), copy = { ...base };
  for (const k of Object.keys(base)) if (typeof dm[k] === "string" && dm[k].trim()) copy[k] = dm[k];
  copy.story = [copy.story0, copy.story1, copy.story2].filter(Boolean);
  const media = { hero: liveMedia(m.hero) || liveMedia(pack.hero), lifestyle: liveMedia(m.lifestyle) || liveMedia(pack.lifestyle), products: {}, collections: {} };
  const collections = (Array.isArray(data.collections) ? data.collections : []).map((c, i) => ({ ...c,
    image: i < 2 ? (liveMedia(m["collection" + i]) || liveMedia(pack.collections?.["c0" + (i + 1)])) : null }));
  const products = (Array.isArray(data.products) ? data.products : []).filter(p => p.status !== "archived");
  const x = { style, media, def: DEF[style], products, collections, brand, copy, world: "", profile: null, options, page, settings, policies: data.policies || [] };
  const { overrides, font, preset } = themeOverrides(style, settings);
  LIVE = { edit: options.designEdit === true };
  try {
    let main = page === "home" ? HOME[style](x) : BODY[page](x);
    if (page === "home" && !products.length) main += '<section class="sc-sec"><p class="sc-empty">Products are being added. Check back soon.</p></section>';
    main = main.replace(/class="([^"]*\brv\b[^"]*)"/g, `class="$1" data-showcase-reveal data-reveal-kind="${kindOf(style)}"`)
      .replace(/data-showcase-reveal(?!=| data-reveal-kind)/g, `data-showcase-reveal data-reveal-kind="${kindOf(style)}"`);
    return { body: `${header(x)}<main class="sc-main sc-p-${page}">${main}</main>${footer(x)}`,
      css: `${CSS}${RICH_CSS}${overrides}${LIVE_CSS}`, bodyClass: `sc sc-${style}`, style, font, preset };
  } finally { LIVE = null; }
}
const LIVE_CSS = `.sc .au-buy{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:1.2rem 0}.sc .au-buy input{width:4.5rem;padding:.7rem;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit}.sc .au-btn{padding:.85rem 1.6rem;border:0;background:var(--acc);color:var(--acc-ink,#fff);font-weight:600;border-radius:var(--rad,0)}.sc .au-btn[disabled]{opacity:.5;cursor:not-allowed}.sc .au-feedback{font-size:.85rem}.sc .sc-crow{display:grid;gap:.5rem;margin:1rem 0}.sc .ar-stats{grid-template-columns:repeat(2,1fr)}.sc [hidden]{display:none!important}.sc [data-design-copy],.sc [data-design-image]{cursor:text}.sc [data-design-image]{cursor:pointer}.sc [data-design-copy]:hover,.sc [data-design-image]:hover{outline:2px dashed var(--acc);outline-offset:3px}.sc [data-design-selected]{outline:2px solid var(--acc)!important;outline-offset:3px}`;
