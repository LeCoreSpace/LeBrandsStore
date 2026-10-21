/**
 * Pure media placement recommendation model. No DOM, no I/O.
 * Sources inspected (ratios are derived from these selectors, not guessed):
 *  Saved Ann design renderer (settings.ann_design valid): public/aura-showcase.js CSS + LIVE_CSS
 *    .ed-hero-img 4/5, .bq-arch 4/5, .ar-hero-img 1, .mn-hero figure 1, .vt-mat 1, .vt-oval 4/5,
 *    .sc-img 1 (default) / .sc-editorial .sc-img 4/5, .ed-thumb/.bq-col-img/.ar-row-img/.vt-plate-img 1,
 *    .bq-moment-img 1, .ar-duo>div 1. Current product pages use commerce-signature.css:
 *    .cm-stage 4/5 and .cm-thumb 76px square (old showcase product CSS is not used).
 *  public/aura-conversion-styles.js: .sp-hero-media 1, .sp-col-img 4/3, .sp-moment-img 1,
 *    .cf-hero figure 4/5, .cf-ph and creator-feed .sc-img 4/5, .pd-hero-img 1, .pd-main 1, proof-detail .sc-img 1.
 *  Global Ann media slots: hero, lifestyle, collection0, collection1;
 *  reusable section media uses the flexible .lb-photo and .lb-grid frames.
 *  Ann header/footer render the brand as a text wordmark (.sc-brand), not a logo image.
 *  Legacy Aura renderer: public/aura.css + aura-styles.css + aura-extra-styles.css
 *    .au-hero-media 4/5 (architectural 1/1), .au-card-media 4/5 (editorial 3/4, boutique+architectural 1/1),
 *    .au-pgallery img 4/5, .au-look-item img 4/5 (overrides earlier .au-look img 3/4), .au-founder-media img 4/5,
 *    .au-craft img 4/3, .au-gallery-grid natural height, .au-brand img height 36 max-width 150,
 *    .au-press img height 34, .commerce-preview-thumb 72px 3/4 (cover).
 * Sizes are RECOMMENDED export dimensions only; uploads accept any shape within hard limits.
 */
import { AURA_STYLES,STYLE_IDS } from "./aura-styles.js";
import { isAnnDesign } from "./ann-design-model.js";
import { MEDIA_LIMITS } from "./product-media-processing.js";

const MiB = 1048576;
export const MEDIA_GUIDE_LIMITS = Object.freeze({ logo_bytes: 5 * MiB, image_bytes: MEDIA_LIMITS.maxBytes, video_bytes: MEDIA_LIMITS.maxBytes, max_pixels: MEDIA_LIMITS.maxPixels, max_axis: MEDIA_LIMITS.maxAxis });
export const MEDIA_GUIDE_CATEGORIES = Object.freeze([
  { id: "brand", name: "Brand and logo" }, { id: "home", name: "Home page" }, { id: "products", name: "Products" },
  { id: "collections", name: "Collections" }, { id: "stories", name: "Story and gallery sections" },
  { id: "blog", name: "Blog" }, { id: "commerce", name: "Cart, checkout and orders" },
].map(Object.freeze));
const THEME_NAMES = Object.fromEntries(AURA_STYLES.map(style=>[style.id,style.name]));
const themeName = id => THEME_NAMES[id] || "Aura default";
const IMG = ["PNG", "JPEG", "WebP"];
const PAGES = { home: "Home page", collection: "Collection page", product: "Product page", about: "About page", contact: "Contact page", blog: "Blog" };
const safeId = v => /^[A-Za-z0-9_-]{1,80}$/.test(String(v ?? "")) ? String(v) : "";

const R = { "4:5": [4, 5], "1:1": [1, 1], "3:4": [3, 4], "4:3": [4, 3], "3:2": [3, 2], "16:10": [16, 10], "16:9": [16, 9], "9:16": [9, 16] };
/** Recommended export box for a ratio at a given width; fluid ratios have no height. */
function box(w, ratio) {
  const r = R[ratio];
  return r ? { width: w, height: Math.round(w * r[1] / r[0]), ratio } : { width: w, height: 0, ratio: "Natural" };
}

const flex = (w, h) => ({ width: w, height: h, ratio: "Flexible" });
/** Collect section types from decoded draft layouts: [{page_key,layout}] */
function sectionTypes(layouts) {
  const out = new Map();
  for (const l of Array.isArray(layouts) ? layouts : []) {
    const page = String(l?.page_key || ""), lay = l?.layout;
    const arr = Array.isArray(lay) ? lay : Array.isArray(lay?.sections) ? lay.sections : [];
    for (const s of arr) {
      const t = String(s?.type || s?.section_type || "").slice(0, 60);
      if (!t || !PAGES[page]) continue;
      if (!out.has(t)) out.set(t, new Set());
      out.get(t).add(page);
    }
  }
  return out;
}

/** Per-theme source ratios. kind "ann" = saved Ann renderer, "legacy" = classic Aura renderer. */
function ratios(kind, s) {
  if (kind === "ann") {
    const hero = { editorial: "4:5", boutique: "4:5", "creator-feed": "4:5", vintage: "1:1" }[s] || "1:1";
    const card = s === "editorial" || s === "creator-feed" ? "4:5" : "1:1";
    const life = { vintage: "4:5" }[s] || (s === "editorial" ? "fluid" : s === "minimal" ? null : "1:1");
    const col = s === "social-pop" ? "4:3" : "1:1";
    // Product pages now use productPageCm / commerce-signature.css, not the old
    // showcase .sc-gal-main or .pd-main mockups. Main media stays 4:5 in every
    // saved Ann theme, with square 76px gallery selectors.
    return { hero, card, life, col, gallery: "4:5", gsub: "1:1", look: "4:5", founder: life || "1:1", craft: "4:3" };
  }
  const hero = s === "architectural" ? "1:1" : "4:5";
  const card = s === "editorial" ? "3:4" : s === "boutique" || s === "architectural" ? "1:1" : "4:5";
  return { hero, card, life: "fluid", col: card, gallery: "4:5", gsub: "4:5", look: "4:5", founder: "4:5", craft: "4:3" };
}

export function buildMediaSizeGuide({ settings = {}, layouts = [], storeId, theme = "current", category = "all" } = {}) {
  const design = isAnnDesign(settings?.ann_design) ? settings.ann_design : null;
  const legacy = STYLE_IDS.includes(settings?.style_preset) ? settings.style_preset : null;
  const savedId = design ? design.style : legacy || "aura";
  const kind = design ? "ann" : "legacy";
  const comparing = theme !== "current" && STYLE_IDS.includes(theme);
  const tid = comparing ? theme : savedId;
  const s = ratios(kind, tid);
  const types = sectionTypes(layouts);
  const sid = safeId(storeId), root = sid ? `/stores/${encodeURIComponent(sid)}` : "";
  const dest = { products: ["Products", `${root}/products`], editor: ["Page editor", `${root}/editor`], ann: ["Design builder", `${root}/build/ann`], blog: ["Blog", `${root}/blog`] };
  const loc = (k, label) => ({ page: k, label: label || dest[k][0], href: dest[k][1] });
  const usedOn = t => [...(types.get(t) || [])].map(p => PAGES[p]).filter(Boolean);
  const items = [];
  const add = (id, title, cat, placement, d, m, formats, max_bytes, notes, locations, active = true) => {
    const n = notes.filter(Boolean);
    if (!/^(brand-logo|press)$/.test(id)) n.push("Desktop and mobile boxes show the same uploaded file. Export once at the desktop size and keep the subject near the centre so both crops work.");
    items.push({ id, title, category: cat, placement, desktop: d, mobile: m, formats, max_bytes, notes: n, locations, active: claim ? active : true });
  };
  const L = MEDIA_GUIDE_LIMITS, SAME = "";
  const claim = !comparing && kind === "legacy" && types.size > 0;
  const sec = (t, extra) => { const u = claim ? usedOn(t) : []; return u.length ? ` Currently in your drafts: ${u.join(", ")}.${extra || ""}` : ""; };
  const cover = "Fills the frame and clips the overflow (cover), so keep the subject away from the edges.";

  add("brand-logo", "Store logo", "brand", "Brand settings logo",
    { width: 300, height: 72, ratio: "Natural" }, { width: 240, height: 56, ratio: "Natural" },
    [...IMG, "SVG"], L.logo_bytes,
    [kind === "ann" ? "The saved Ann design header and footer show the store name as a text wordmark, so a logo is not displayed there." : "Classic header shows the logo at 36 px high, up to 150 px wide, contained without cropping.",
     "Export a transparent PNG or SVG at about 2x display size. Logos are never cropped.", "SVG is accepted for logos only and is sanitized on upload."],
    [loc("editor", "Brand and header settings")]);
  add("home-hero-split", "Hero, split with text", "home", "Home hero, split layout",
    box(1600, s.hero), box(1080, kind === "ann" && tid === "editorial" ? "1:1" : s.hero), [...IMG], L.image_bytes,
    [`The frame is ${s.hero} on desktop. ${cover}`, kind === "ann" && tid === "editorial" ? "Editorial stacks to a square frame on narrow screens, so centre the subject." : SAME, "Stored as the hero image of your design."],
    [loc(kind === "ann" ? "ann" : "editor")]);
  if (kind === "legacy") {
    add("home-hero-fullbleed", "Hero, full width", "home", "Home hero, full-bleed layout",
      { width: 2400, height: 1350, ratio: "16:9" }, { width: 1080, height: 1350, ratio: "4:5" }, [...IMG], L.image_bytes,
      ["Fills at least 78% of the screen height at any width, so the crop changes with the device. Export wide but keep the subject near the centre.", "A dark gradient covers the lower part where the text sits. " + SAME],
      [loc("editor")], true);
    add("home-hero-video", "Hero video and poster", "home", "Home hero, video layout",
      { width: 1920, height: 1080, ratio: "16:9" }, { width: 1080, height: 1350, ratio: "4:5" }, ["MP4", "WebM", ...IMG], L.video_bytes,
      ["The video and its poster image both fill the frame (cover). Keep videos under 10 MiB and short.", "The poster image uses the same crop as the full-width hero."], [loc("editor")]);
  }
  add("product-gallery", "Product gallery photos", "products", "Product page gallery",
    box(1200, s.gallery), box(1080, s.gallery), [...IMG], L.image_bytes,
    [kind === "ann" ? `The shared product gallery stays ${s.gallery} in every theme; square gallery selectors clip the preview, not the main image.` : "Every photo shows at 4:5 and clips to fit; mobile becomes a swipe row at 86% width.",
     `Product upload tools prepare ${MEDIA_LIMITS.outW} x ${MEDIA_LIMITS.outH} (4:5) images. Collection cards may show a different crop; see Product cards.`],
    [loc("products")]);
  add("product-video", "Product videos", "products", "Video in the product media gallery",
    box(MEDIA_LIMITS.outW,"4:5"),box(1080,"4:5"),["MP4","WebM"],L.video_bytes,
    [`Use 4:5 framing to match the product gallery. The uploader supports up to ${MEDIA_LIMITS.maxAssets} media items per product.`,
     `Short clips of up to ${MEDIA_LIMITS.maxVideoSeconds} seconds are recommended. The browser offers WebM conversion where supported; MP4 remains an upload option.`],
    [loc("products")]);
  add("product-card", "Product cards", "products", "Product grids, home shelves, collection pages",
    box(1000, s.card), box(800, s.card), [...IMG], L.image_bytes,
    [`Cards show the first product photo at ${s.card} (cover).`, `Prepared 4:5 uploads are ${s.card === "4:5" ? "an exact fit" : "cropped to " + s.card}. Keep the product centred if you change theme.`],
    [loc("products")]);
  add("featured-product", "Featured product spotlight", "products", "Spotlight section",
    flex(1400, 1400), flex(1080, 900), [...IMG], L.image_bytes,
    ["Flexible ratio. The half-width panel stretches to the height of the text (at least 420 px tall) and the photo covers it, clipping the overflow.", "Centre the subject; a roughly square photo is a safe start."],
    [loc("editor")], types.size ? types.has("spotlight") : true);
  add("collection-cover", "Collection images", "collections", "Collection cards and lists",
    box(1200, s.col), box(900, s.col), [...IMG], L.image_bytes,
    [s.col === "fluid" ? "Shape follows the layout." : `Collection images show at ${s.col} (cover).`, kind === "ann" ? "Ann design stores the first two collection images with the design; others fall back to a product photo." : "Without a collection image, the first product photo is used."],
    [loc(kind === "ann" ? "ann" : "editor")]);
  if (s.life) add("home-lifestyle", "Lifestyle image", "home", "Home lifestyle or story image",
    box(1600, s.life === "fluid" ? "3:2" : s.life), box(1080, s.life === "fluid" ? "3:2" : s.life), [...IMG], L.image_bytes,
    [s.life === "fluid" ? "Shown at its natural proportions across the page width, so any landscape shape works." : `Frame is ${s.life} (cover).`, "Used by the story and lifestyle blocks."], [loc(kind === "ann" ? "ann" : "editor")]);
  add("lookbook", "Lookbook images", "stories", "Lookbook section",
    kind === "ann" ? flex(1200, 900) : box(1200, s.look), kind === "ann" ? flex(1000, 670) : box(900, s.look), [...IMG], L.image_bytes,
    [kind === "ann" ? "Saved Ann additions use image boxes of flexible shape (height 240 to 460 px, full column width, cover), so the crop varies with screen width. Centre the subject." : `Alternating image and text rows, ${s.look} (cover).${sec("lookbook")}`], [loc("editor")], types.has("lookbook"));
  add("gallery", "Gallery images", "stories", "Image gallery section",
    kind === "ann" ? flex(800, 750) : { width: 1200, height: 0, ratio: "Natural" }, kind === "ann" ? flex(600, 630) : { width: 900, height: 0, ratio: "Natural" }, [...IMG], L.image_bytes,
    [kind === "ann" ? "Saved Ann additions show gallery tiles in a 280 px high cover box (190 px on mobile, two columns), so tiles clip to a near square. Centre the subject." : "Masonry columns keep every photo at its natural proportions with no cropping. Mixed shapes are fine.", kind === "ann" ? "" : `Three columns on desktop, two on mobile.${sec("gallery")}`], [loc("editor")], types.has("gallery"));
  add("founder", "Founder or story photo", "stories", "Brand story section",
    kind === "ann" ? flex(1200, 900) : box(1200, s.founder), kind === "ann" ? flex(1000, 670) : box(1000, s.founder), [...IMG], L.image_bytes,
    [kind === "ann" ? "Saved Ann additions use a flexible cover box (240 to 460 px high). Centre the subject." : `Portrait frame ${s.founder} (cover).${sec("founder")}`, "Faces sit best in the upper half."], [loc("editor")], types.has("founder"));
  add("craft", "Craft and materials images", "stories", "Craft section",
    kind === "ann" ? flex(1200, 900) : box(1200, s.craft), kind === "ann" ? flex(1000, 670) : box(900, s.craft), [...IMG], L.image_bytes,
    [kind === "ann" ? "Saved Ann additions use a flexible cover box (240 to 460 px high). Centre the subject." : `Landscape frame ${s.craft} (cover).${sec("craft")}`], [loc("editor")], types.has("craft"));
  add("press", "Press logos", "stories", "Press section",
    { width: 240, height: 68, ratio: "Natural" }, { width: 240, height: 68, ratio: "Natural" }, [...IMG], L.image_bytes,
    ["Shown 34 px high with automatic width, never cropped.", `Use transparent PNG at 2x.${sec("press")}`], [loc("editor")], types.has("press"));
  if (tid === "boutique") add("before-after", "Before and after pair", "stories", "Before and After section (Modern Boutique only)",
    box(1000, "1:1"), box(900, "1:1"), [...IMG], L.image_bytes,
    ["Guidance only: this block is offered for Modern Boutique and its image shape is not fixed by a dedicated style rule. Use two images of the same shape.", "Keep both images the same size and framing so the comparison reads clearly."], [loc("editor")], types.has("before-after"));
  add("blog-list-card", "Blog list card cover", "blog", "Blog list page cards",
    box(1600, "16:10"), box(1000, "16:10"), [...IMG], L.image_bytes,
    ["Cards crop the cover to 16:10 (cover), so wide or tall covers lose their edges. Export 1600 x 1000.", "Ann designs render the blog inside the themed header and footer, but blog content uses the shared blog card styles."], [loc("blog")]);
  add("blog-hero", "Article cover image", "blog", "Top of a blog article",
    { width: 1600, height: 0, ratio: "Natural" }, { width: 1080, height: 0, ratio: "Natural" }, [...IMG], L.image_bytes,
    ["The cover shows at natural proportions on the article page. Use the same 16:10 file so the list card crop and the article match."], [loc("blog")]);
  add("blog-body", "Article images and image with text", "blog", "Inside blog articles",
    { width: 1400, height: 0, ratio: "Natural" }, { width: 1000, height: 0, ratio: "Natural" }, [...IMG], L.image_bytes,
    ["Article images follow the reading column width at their natural proportions.", SAME], [loc("blog")]);
  add("cart-thumb", "Cart, checkout and order thumbnails", "commerce", "Cart, checkout, order confirmation and tracking",
    { width: MEDIA_LIMITS.outW, height: MEDIA_LIMITS.outH, ratio: "Flexible" }, { width: MEDIA_LIMITS.outW, height: MEDIA_LIMITS.outH, ratio: "Flexible" }, [...IMG], L.image_bytes,
    ["These reuse the first product photo; there is no separate upload. Prepare the product photo once at 1200 x 1500 px.", "Thumbnail frames differ between cart, checkout and order screens. Keep the subject centred so the smaller cover crops stay readable."], [loc("products")]);

  const cats = MEDIA_GUIDE_CATEGORIES.map(c => ({ id: c.id, name: c.name }));
  const cat = cats.some(c => c.id === category) ? category : "all";
  const shown = items.filter(i => cat === "all" || i.category === cat);
  return {
    theme: { id: tid, name: themeName(tid), source: comparing ? "compare" : design ? "ann_design" : legacy ? "style_preset" : "aura_default" },
    saved_theme: { id: savedId, name: themeName(savedId) },
    themes: STYLE_IDS.map(id => ({ id, name: themeName(id) })),
    categories: cats, items: shown, limits: { ...MEDIA_GUIDE_LIMITS }, total: shown.length,
    notice: comparing ? `You are comparing another theme using ${kind==="ann"?"Ann design":"classic Aura"} layouts. This is a view only and does not change your store.` : design ? "Sizes follow your saved Ann design." : "Sizes follow your saved classic theme.",
  };
}
