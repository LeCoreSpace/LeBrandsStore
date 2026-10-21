export const BAG_ICON = '<svg class="lb-bag-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.2 8.5h13.6l.9 11.5H4.3L5.2 8.5Z"/><path d="M8.7 8.5V7a3.3 3.3 0 0 1 6.6 0v1.5"/></svg>';
export function bagControl({ cls = "", extra = "", label = "", disabled = false } = {}) {
  const name = label || (disabled ? "Bag preview, shopping disabled" : "Open bag");
  const state = disabled ? ' disabled aria-disabled="true"' : "";
  return `<button type="button" class="lb-bag ${cls}" data-cart-open${extra}${state}>${BAG_ICON}<span class="lb-bag-text lb-sr">${esc(name)}, items:</span><span class="lb-bag-count" data-cart-count>0</span></button>`;
}
export const BAG_CSS = `.lb-bag{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 4px;background:none;border:0;border-radius:999px;color:inherit;font:inherit;cursor:pointer;gap:0;-webkit-tap-highlight-color:transparent}
.lb-bag .lb-bag-icon{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;display:block}
.lb-bag .lb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.lb-bag .lb-bag-count{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;display:grid;place-items:center;border-radius:999px;background:var(--lb-badge,var(--accent,var(--acc,var(--cm-accent,#222))));color:var(--lb-badge-ink,var(--accent-ink,var(--cm-accent-ink,#fff)));font:700 11px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:0;white-space:nowrap;box-shadow:0 0 0 2px var(--lb-ring,var(--paper,var(--cm-card,#fff)))}
body .aura-header .lb-bag[data-cart-open]{min-width:44px;min-height:44px}
.lb-bag:hover{opacity:.82}.lb-bag:focus-visible{outline:2px solid currentColor;outline-offset:2px}.lb-bag:disabled{opacity:.5;cursor:not-allowed}
.sc-tabbar .lb-bag{color:#fff;--lb-badge:#fff;--lb-badge-ink:var(--acc,#222);--lb-ring:var(--acc,#222)}
.sc-boutique .sc-bag.lb-bag{background:var(--acc);color:#fff;padding:0 10px;--lb-badge:#fff;--lb-badge-ink:var(--acc);--lb-ring:var(--acc)}
.sc-architectural .sc-bag.lb-bag{background:var(--ink);color:#fff;border-radius:0;--lb-badge:var(--acc);--lb-badge-ink:#fff;--lb-ring:var(--ink)}
.cm-bag.lb-bag{border:1.5px solid var(--cm-ink);background:var(--cm-card);color:var(--cm-ink);min-width:46px;padding:0 10px}.cm-bag.lb-bag:hover{background:var(--cm-ink);color:var(--cm-card);opacity:1}
.au-bag.lb-bag,.sc-bag.lb-bag,.cm-bag.lb-bag{gap:0}.au-bag.lb-bag{border:0;padding:0 4px;background:none;color:var(--ink)}.lb-bag.lb-bag .lb-bag-count{min-width:18px;height:18px;padding:0 5px;font:700 11px/1 system-ui,sans-serif;background:var(--lb-badge,var(--accent,var(--acc,var(--cm-accent,#222))));color:var(--lb-badge-ink,var(--accent-ink,var(--cm-accent-ink,#fff)))}
@media (max-width:640px){.lb-bag .lb-bag-icon{width:22px;height:22px}}`;
import { renderCommerceBody } from "./commerce-view.js";
import {validateDesignMenus,renderDesignMenu} from "./ann-menu-model.js";
import { formatPhone } from "./commerce-rules.js";
import { sanitizeRichText } from "./aura-layout.js";
import { normalisePageSize } from "./catalog-page.js";
import { productDetailRows } from "./product-details.js";
import { hasOptions, renderOptionBuy, renderOptionSticky, OPTION_CSS, productHref } from "./commerce-options.js";
export { OPTION_CSS };

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const UU = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MEDIA = new RegExp(`^https://media\\.lebrands\\.store/stores/${UU}/${UU}\\.(?:png|jpe?g|svg|webp)$`, "i");
export const safeImage = (u) => (MEDIA.test(String(u || "")) || /^\/assets\/img\/[\w./-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(String(u || ""))) ? String(u) : "";
const PRODUCT_VIDEO = new RegExp(`^https://media\\.lebrands\\.store/stores/${UU}/${UU}\\.(?:mp4|webm)$`, "i");
export function productVideo(media,label="Product video") {
  if(media?.type!=="video"||!PRODUCT_VIDEO.test(String(media.url||"")))return "";
  const mime=/\.webm$/i.test(media.url)?"video/webm":"video/mp4";
  return `<video class="au-product-video" controls playsinline preload="metadata" aria-label="${esc(media.alt||label)}" style="display:block;width:100%;aspect-ratio:4/5;object-fit:contain;background:#f5f5f5"><source src="${esc(media.url)}" type="${mime}">Your browser cannot play this video. <a href="${esc(media.url)}">Open product video</a></video>`;
}
export const money = (p) => `₹${(Math.max(0, Number(p) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const policyTitle = (k) => ({ privacy: "Privacy", terms: "Terms & Conditions", shipping: "Shipping", "cancellation-refund": "Cancellation & Refund", contact: "Contact", pricing: "Pricing" })[k] || "Policy";
const POLICIES = ["privacy", "terms", "shipping", "cancellation-refund", "pricing"];
const str = (v) => typeof v === "string" ? v.trim() : "";
const blocks = (s) => (Array.isArray(s.blocks) ? s.blocks : []).map((b) => b?.settings || {});
const off = (s) => s?.settings?.enabled === false;
const detailKey = (v) => str(v).normalize("NFKC").toLowerCase();
const detailsOf = (c) => c.options?.page === "product" && c.product ? productDetailRows(c.product) : [];
const mergeDetails = (rows, details) => { if (!details.length) return rows; const n = new Set(details.map((r) => detailKey(r.label))); return [...rows.filter(([k]) => !n.has(detailKey(k))), ...details.map((r) => [r.label, r.value])]; };
const specsOwn = (c) => (c.layout || []).some((i) => i.type === "product-specs" && i.settings?.enabled !== false);

export const HERO_IMAGE_SIZES = "(max-width: 680px) 100vw, 50vw";
export function imageSourceSet(image) {
  const url = safeImage(image?.url);
  if (!url) return {url:"",srcset:""};
  const candidates=[...(image.sources||[]),{url,width:image.width}];
  const widths=new Set(),urls=new Set();
  const sources=candidates.filter(s=>safeImage(s.url)&&Number.isInteger(s.width)&&s.width>0)
    .sort((a,b)=>a.width-b.width)
    .filter(s=>!widths.has(s.width)&&!urls.has(s.url)&&widths.add(s.width)&&urls.add(s.url));
  return {url,srcset:sources.map(s=>`${safeImage(s.url)} ${s.width}w`).join(", ")};
}
function img(image, { eager = false, cls = "", label = "", sizes = HERO_IMAGE_SIZES } = {}) {
  const {url,srcset}=imageSourceSet(image);
  if (!url) return "";
  const w = Number(image.width) > 0 ? ` width="${Math.round(image.width)}"` : "";
  const h = Number(image.height) > 0 ? ` height="${Math.round(image.height)}"` : "";
  const responsive=srcset?` srcset="${esc(srcset)}" sizes="${esc(sizes)}"`:"";
  const focal=Number.isFinite(image.focalX)&&image.focalX>=0&&image.focalX<=1&&Number.isFinite(image.focalY)&&image.focalY>=0&&image.focalY<=1
    ? ` style="object-position:${image.focalX*100}% ${image.focalY*100}%"`:"";
  return `<img class="${cls}" src="${esc(url)}"${responsive}${focal} alt="${esc(image.alt || label)}"${w}${h} ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" fetchpriority="low"'} decoding="async">`;
}
function card(p, ctx, eager = false, index = 0) {
  const im = img(p.images?.[0], { label: p.title, sizes:"(max-width: 680px) 50vw, (max-width: 1024px) 33vw, 25vw" });
  return `<a class="au-card" data-title="${esc(String(p.title || "").toLowerCase())}" data-price="${Number(p.price_paise) || 0}" data-available="${available(p) ? 1 : 0}" data-index="${index}"${Array.isArray(p.collection_ids) ? ` data-collections="${esc(p.collection_ids.join(" "))}"` : ""} href="${productHref(p)}"><span class="au-card-media">${im || `<span class="au-card-blank">${esc((p.title || "").slice(0, 1))}</span>`}</span><span class="au-card-name">${esc(p.title || "Untitled product")}</span><span class="au-card-price">${money(p.price_paise)}${p.compare_at_paise ? ` <del>${money(p.compare_at_paise)}</del>` : ""}${available(p) ? "" : " · Sold out"}</span></a>`;
}
const heading = (t, extra = "") => t ? `<div class="au-head"><h2>${esc(t)}</h2>${extra}</div>` : "";

const rich = (v) => { try { return sanitizeRichText(String(v || ""), 10000); } catch { return esc(String(v || "").replace(/<[^>]*>/g, "")); } };
const link = (u) => /^\/(?!\/)/.test(String(u || "")) || /^https:\/\//.test(String(u || "")) ? String(u) : "";
const available = (p) => p.stock == null || Number(p.stock) > 0;
const collectionsOf = (c) => (Array.isArray(c.data.collections) ? c.data.collections : []).filter((k) => k?.id && str(k.title || k.name));
const colHref = (k) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(k.slug || "")) && k.slug !== "all" ? "/collections/" + k.slug : "";
const activeCollection = (c) => { const id = c.options?.collectionId; return id ? collectionsOf(c).find((k) => String(k.id) === String(id)) || null : null; };
const inCollection = (k, p) => Array.isArray(k.product_ids) ? k.product_ids.includes(p.id) : (p.collection_ids || []).includes(k.id);
const gridProducts = (c, cid) => {
  const k = activeCollection(c) || (cid ? collectionsOf(c).find((i) => String(i.id) === String(cid)) : null);
  if (k && (Array.isArray(k.product_ids) || c.products.some((p) => Array.isArray(p.collection_ids)))) return c.products.filter((p) => inCollection(k, p));
  if (cid && c.products.some((p) => Array.isArray(p.collection_ids))) return c.products.filter((p) => (p.collection_ids || []).includes(cid));
  return c.products;
};
const colCover = (k, c) => k.cover?.url ? k.cover : c.products.find((p) => inCollection(k, p) && p.images?.[0]?.url)?.images[0];
const withCollections = (html, ids) => ids.length ? html.replace(/ data-collections="[^"]*"/, "").replace("<a ", `<a data-collections="${esc(ids.join(" "))}" `) : html;
const content = (c) => (c.product && c.product.content && typeof c.product.content === "object") ? c.product.content : {};
const has = (c, key) => { const v = content(c)[key]; return v !== undefined && v !== null; };
const ownsFaq = (c) => (c.options?.page === "collection" && activeCollection(c)) || has(c, "faq");
const entityFaq = (c) => { const k = c.options?.page === "collection" ? activeCollection(c) : null; const src = k ? k.faq : content(c).faq; return (Array.isArray(src) ? src : []).filter((b) => str(b?.question) && plainText(b?.answer)); };
const GROUPS = {
  cart: [["Cart items", "Lines the customer added, with quantity and remove controls."], ["Optional extras", "Supported extras such as gift options, when the store offers them."], ["Recommendations", "Products suggested next to the bag."], ["Summary", "Subtotal, shipping and total."], ["Checkout", "The button that moves the customer on."]],
  checkout: [["Contact", "Name, email and phone."], ["Address", "Delivery address with pincode."], ["Shipping", "Delivery options and charges."], ["Payment", "Payment methods the store has enabled."], ["Notes (optional)", "A note for the order."], ["Summary", "Items, charges and total."], ["Place order", "Final confirmation button."]],
};
function commerceSkeleton(page) {
  return `<section class="au-page au-cskel" data-editor-skeleton="${page}"><h1>${page === "cart" ? "Your bag" : "Checkout"}</h1><p class="au-skel-tag">Editor outline only. Customers see the live ${page} here. Nothing on this outline can be submitted.</p><ol class="au-cskel-list">${GROUPS[page].map(([h, t]) => `<li class="au-cskel-group"><h2>${h}</h2><p>${t}</p><div class="au-skel-lines" aria-hidden="true"><i></i><i></i></div></li>`).join("")}</ol></section>`;
}
const SKEL = {
  hero: ["Home hero", "Headline, image and button."], "featured-collection": ["Featured collections", "Collection cards and cover images."], "featured-products": ["Featured products", "Hand picked products."],
  statement: ["Brand statement", "One short statement."], spotlight: ["Product spotlight", "One product with a large image."], lookbook: ["Lookbook", "Image and text stories."],
  craft: ["Materials and craft", "Images of how it is made."], founder: ["Founder story", "Name, portrait and story."], trust: ["Reassurance", "Shipping, returns and contact links."],
  reviews: ["Reviews", "Real customer reviews only."], faq: ["FAQ", "Questions and answers."],
  "collection-heading": ["Collection heading", "Intro line for this collection."], "collection-nav": ["Collection navigation", "Links between collections."],
  "collection-tools": ["Filters and sort", "Sort and stock filter for the grid."], "product-grid": ["Product grid", "Products in this collection."],
  "collection-pagination": ["Pagination", "Page controls appear on the live store only when needed."], "collection-description": ["Collection description", "Longer text about the collection."],
  "related-collections": ["Related collections", "Other collections to browse."],
  "product-details": ["Product gallery and buy controls", "Images, price, quantity and add to cart."], "shipping-info": ["Delivery and returns", "Shipping and return notes."],
  "product-specs": ["Description and features", "Details and specifications."], "material-care": ["Materials and care", "Fabric and care notes."], "size-guide": ["Size guide", "Measurements by size."],
  "how-to-use": ["How to use", "Steps for use."], "related-products": ["Related products", "Other products to browse."],
};
export function skeletonHtml(section) {
  const e = SKEL[section.type];
  if (!e) return "";
  const hidden = section.settings?.enabled === false;
  return `<section class="au-section au-skel"><p class="au-skel-tag">${hidden ? "Hidden" : "Empty"}. Not shown on the live store.</p><h2>${esc(e[0])}</h2><p class="au-skel-hint">${esc(e[1])}</p><div class="au-skel-lines" aria-hidden="true"><i></i><i></i><i></i></div></section>`;
}
export const SECTION_RENDERERS = {
  announcement(s) {
    const t = str(s.settings?.text);
    if (!t || off(s)) return "";
    const u = link(s.settings.url);
    return `<div class="au-announce">${u ? `<a href="${esc(u)}">${esc(t)}</a>` : esc(t)}</div>`;
  },
  header(s, c) {
    if (off(s)) return "";
    const defaults = [{ label: "Collection", url: "/collections/all" }, { label: "About", url: "/pages/about" }, { label: "Contact", url: "/pages/contact" }];
    const list = Array.isArray(s.settings?.links) && s.settings.links.length ? s.settings.links : defaults;
    const menus=c.settings?.ann_design?.menus;
    let links = menus?renderDesignMenu(validateDesignMenus(menus).header):list.filter((l) => l?.label && link(l.url)).map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("");
    if(c.data?.blog_enabled&&!links.includes('href="/blog"'))links+='<a href="/blog">Blog</a>';
    const logo = c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.brand)}" height="36">` : `<span class="au-wordmark">${esc(c.brand)}</span>`;
    const bag = bagControl({ cls: "au-bag au-icon-button", disabled: Boolean(c.options.readOnly || !c.options.commerce) });
    const search = `<button type="button" class="au-icon-button" data-search-open aria-label="Search products" aria-haspopup="dialog" aria-controls="au-search-${esc(s.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>`;
    const overlay = `<dialog class="au-search-dialog" id="au-search-${esc(s.id)}" aria-label="Search products"><div class="au-search-head"><h2>Find your next favourite</h2><button type="button" class="au-btn-quiet" data-search-close aria-label="Close search">Close</button></div><form class="au-search" role="search" action="/collections/all" method="get"><label class="au-sr" for="au-q-${esc(s.id)}">Search products</label><input id="au-q-${esc(s.id)}" name="q" type="search" placeholder="Search products" autocomplete="off"><button type="submit" class="au-btn-quiet">Search</button></form></dialog>`;
    return `<header class="aura-header au-header ${s.settings?.logo_position === "center" ? "is-center" : ""}"><a class="au-brand" href="/" aria-label="${esc(c.brand)} home">${logo}</a><nav class="au-nav" aria-label="Main navigation">${links}</nav><div class="au-actions">${search}${bag}<button type="button" class="au-menu-btn" data-menu-open aria-expanded="false" aria-controls="au-menu">Menu</button></div></header>${overlay}<div class="au-menu" id="au-menu" hidden><div class="au-menu-head"><span class="au-wordmark">${esc(c.brand)}</span><button type="button" class="au-menu-btn" data-menu-close>Close</button></div><nav aria-label="Menu">${links}</nav></div>`;
  },
  hero(s, c) {
    const x = s.settings || {};
    if (off(s)) return "";
    const image = x.image?.url ? x.image : c.products[0]?.images?.[0];
    const variant = ["split", "fullbleed", "video"].includes(x.variant) ? x.variant : "split";
    const title = str(x.title);
    const video = variant === "video" && x.video?.url && safeImage(x.poster?.url) && /^https:\/\/media\.lebrands\.store\//.test(x.video.url);
    let media = video
      ? `<video src="${esc(x.video.url)}" poster="${esc(x.poster.url)}" autoplay muted loop playsinline preload="none" aria-label="${esc(x.video.alt || "")}"></video>`
      : img(image, { eager: true, label: c.brand });
    if(!video&&image?.url==="/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-desktop-v01.webp") {
      media=`<picture style="display:block;width:100%;height:100%"><source media="(max-width: 767px)" srcset="/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-mobile-v01.webp">${media}</picture>`;
    }
    const label = str(x.button_label), url = link(x.button_url) || "/collections/all";
    const copy = `<div class="au-hero-copy">${str(x.kicker) ? `<p class="au-eyebrow">${esc(x.kicker)}</p>` : ""}${title ? `<h1>${esc(title)}</h1>` : ""}${str(x.description) ? `<div class="au-rich">${rich(x.description)}</div>` : ""}${label ? `<a class="au-btn" href="${esc(url)}">${esc(label)}</a>` : ""}</div>`;
    const mode = media ? variant : "split";
    return `<section class="au-hero is-${mode} ${media ? "" : "no-media"}">${media ? `<div class="au-hero-media">${media}</div>` : ""}${copy}</section>`;
  },
  statement(s) {
    const t = str(s.settings?.text);
    return t && !off(s) ? `<section class="au-statement">${str(s.settings.kicker) ? `<p class="au-eyebrow">${esc(s.settings.kicker)}</p>` : ""}<p>${esc(t)}</p></section>` : "";
  },
  "featured-collection"(s, c) {
    if (off(s)) return "";
    const cols = collectionsOf(c).filter((k) => colHref(k));
    const cid = s.settings?.collection;
    if (cols.length && !cid) {
      const n = [3, 6, 9].includes(Number(s.settings?.limit)) ? Number(s.settings.limit) : 3;
      return `<section class="au-section">${heading(str(s.settings?.title), '<a class="au-link" href="/collections/all">View all</a>')}<div class="au-grid au-collection-cards">${cols.slice(0, n).map((k) => { const im = img(colCover(k, c), { label: k.title, sizes: "(max-width: 680px) 50vw, 33vw" }); return `<a class="au-card au-collection-card" href="${esc(colHref(k))}"><span class="au-card-media">${im || `<span class="au-card-blank">${esc(String(k.title).slice(0, 1))}</span>`}</span><span class="au-card-name">${esc(k.title)}</span></a>`; }).join("")}</div></section>`;
    }
    let list = gridProducts(c, cid);
    if (!list.length) return "";
    const n = [3, 6, 9].includes(Number(s.settings?.limit)) ? Number(s.settings.limit) : 3;
    return `<section class="au-section">${heading(str(s.settings?.title), '<a class="au-link" href="/collections/all">View all</a>')}<div class="au-grid">${list.slice(0, n).map((p) => card(p, c)).join("")}</div></section>`;
  },
  spotlight(s, c) {
    if (off(s)) return "";
    const p = c.products.find((i) => String(i.id) === String(s.settings?.product));
    if (!p || !img(p.images?.[0])) return "";
    return `<section class="au-spotlight"><div class="au-spot-media">${img(p.images[0], { label: p.title })}</div><div class="au-spot-copy"><h2>${esc(p.title)}</h2><div class="au-rich">${c.renderDescription(String(p.description || "").slice(0, 260))}</div><p class="au-card-price">${money(p.price_paise)}</p><a class="au-btn" href="${productHref(p)}">View product</a></div></section>`;
  },
  lookbook(s) {
    const items = (s.blocks || []).map((b) => b.settings || {}).filter((b) => safeImage(b.image?.url));
    if (off(s) || !items.length) return "";
    return `<section class="au-section au-lookbook">${items.map((b) => { const u = link(b.url); return `<article class="au-look-item"><div>${img(b.image)}</div><div class="au-look-copy">${str(b.title) ? `<h2>${esc(b.title)}</h2>` : ""}${str(b.text) ? `<div class="au-rich">${rich(b.text)}</div>` : ""}${u && str(b.label) ? `<a class="au-link" href="${esc(u)}">${esc(b.label)}</a>` : ""}</div></article>`; }).join("")}</section>`;
  },
  founder(s) {
    const x = s.settings || {};
    const story = str(x.story);
    if (off(s) || !story || !str(x.name) || !safeImage(x.portrait?.url)) return "";
    return `<section class="au-founder"><div class="au-founder-media">${img(x.portrait, { label: x.name })}</div><div><div class="au-rich">${rich(story)}</div><p class="au-sign">${esc(x.name)}</p></div></section>`;
  },
  craft(s) {
    const items = (s.blocks || []).map((b) => b.settings || {}).filter((b) => safeImage(b.image?.url));
    if (off(s) || !items.length) return "";
    return `<section class="au-section">${heading(str(s.settings?.title))}<div class="au-craft">${items.map((b) => `<figure>${img(b.image)}${str(b.caption) ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`).join("")}</div></section>`;
  },
  reviews(s, c) {
    const list = (Array.isArray(c.data.reviews) ? c.data.reviews : []).filter((r) => str(r?.body || r?.text));
    if (off(s) || !list.length) return "";
    const n = [3, 6, 9].includes(Number(s.settings?.limit)) ? Number(s.settings.limit) : 3;
    return `<section class="au-section">${heading(str(s.settings?.title))}<div class="au-reviews">${list.slice(0, n).map((r) => `<blockquote><p>${esc(r.body || r.text)}</p><cite>${esc(r.author || r.name || "")}</cite></blockquote>`).join("")}</div></section>`;
  },
  press(s) {
    const items = (s.blocks || []).map((b) => b.settings || {}).filter((b) => str(b.name));
    if (off(s) || !items.length) return "";
    return `<section class="au-section au-press">${heading(str(s.settings?.title))}<div>${items.map((b) => { const u = link(b.url); const inner = safeImage(b.logo?.url) ? img(b.logo, { label: b.name }) : `<span>${esc(b.name)}</span>`; return u ? `<a href="${esc(u)}" rel="noopener">${inner}</a>` : `<span class="au-press-item">${inner}</span>`; }).join("")}</div></section>`;
  },
  gallery(s) {
    const items = (s.blocks || []).map((b) => b.settings || {}).filter((b) => safeImage(b.image?.url));
    if (off(s) || !items.length) return "";
    return `<section class="au-section"><div class="au-gallery-grid">${items.map((b) => img(b.image)).join("")}</div></section>`;
  },
  trust(s, c) {
    if (off(s)) return "";
    const x = c.settings;
    const items = [["Shipping", "/policies/shipping"], ["Cancellation & Refund", "/policies/cancellation-refund"]].map(([l, u]) => `<a href="${u}">${l}</a>`);
    if (x.support_email) items.push(`<a href="mailto:${esc(x.support_email)}">${esc(x.support_email)}</a>`);
    return `<section class="au-trust">${items.join("")}</section>`;
  },
  footer(s, c) {
    if (off(s)) return "";
    const custom = (list) => (Array.isArray(list) ? list : []).filter((l) => l?.label && link(l.url)).map((l) => `<a href="${esc(l.url)}"${/^https:/.test(l.url) ? ' rel="noopener"' : ""}>${esc(l.label)}</a>`).join("");
    const mine = custom(s.settings?.links);
    const social = custom(s.settings?.social_links);
    const line = str(s.settings?.brand_line);
    const menus=c.settings?.ann_design?.menus;
    let links=menus?renderDesignMenu(validateDesignMenus(menus).footer,{footer:true}):(mine||'<a href="/collections/all">Collection</a><a href="/pages/about">About</a><a href="/pages/contact">Contact</a>')+'<a href="/track">Track order</a>'+POLICIES.map(k=>`<a href="/policies/${k}">${policyTitle(k)}</a>`).join("");
    if(c.data?.blog_enabled&&!links.includes('href="/blog"'))links+='<a href="/blog">Blog</a>';
    return `<footer class="aura-footer au-footer"><div><a class="au-wordmark" href="/">${esc(c.brand)}</a>${line ? `<p>${esc(line)}</p>` : ""}</div><nav aria-label="Store links and policies">${links}</nav>${social ? `<nav class="au-social" aria-label="Social">${social}</nav>` : ""}</footer>`;
  },
  "product-grid"(s, c) {
    const k = activeCollection(c);
    const list = gridProducts(c, s.settings?.collection);
    const headSec = (c.layout || []).some((i) => i.type === "collection-heading" && i.settings?.enabled !== false);
    const title = k ? k.title : str(s.settings?.title) || "Collection";
    const separate = (c.layout || []).some((i) => i.type === "collection-tools" && i.settings?.enabled !== false);
    const pag = (c.layout || []).find((i) => i.type === "collection-pagination" && i.settings?.enabled !== false);
    const size = pag ? normalisePageSize(pag.settings?.page_size) : 0;
    const desc = k ? str(k.description) : c.settings.description;
    const tools = list.length > 1 && !separate ? `<div class="au-tools"><p class="au-count" data-catalog-count role="status"></p>${list.some((p) => !available(p)) ? '<label class="au-check"><input type="checkbox" data-catalog-stock> In stock only</label>' : ""}<label class="au-sr" for="au-sort">Sort products</label><select id="au-sort" data-catalog-sort><option value="">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="available">Availability</option></select></div>` : "";
    return `<section class="au-page">${headSec ? "" : `<h1>${esc(title)}</h1>${desc ? `<p class="au-lede">${esc(desc)}</p>` : ""}`}${tools}${list.length ? `<div class="au-grid" data-catalog${size ? ` data-page-size="${size}"` : ""}>${list.map((p, i) => withCollections(card(p, c, false, i), collectionsOf(c).filter((x) => inCollection(x, p)).map((x) => x.id))).join("")}</div><p class="au-noresult" data-catalog-empty hidden>No products match your search.</p>` : `<div class="au-empty"><h2>The collection is taking shape.</h2></div>`}</section>`;
  },
  "product-details"(s, c) {
    const p = c.product;
    if (!p) return "";
    const o = c.options;
    const imgs = (p.images || []).map((im, i) => im.type==="video"?productVideo(im,p.title):img(im, { eager: i === 0, label: p.title }).replace("<img ", `<img data-gallery-image="${i}" `)).join("");
    const vo = hasOptions(p);
    const buy = vo && o.commerce && !o.readOnly ? renderOptionBuy(p, { esc, money })
      : o.commerce && !o.readOnly
      ? `<div class="au-buy"><label for="aura-quantity">Quantity</label><input id="aura-quantity" type="number" min="1" max="${p.stock == null ? 99 : Math.max(1, Math.min(99, Number(p.stock)))}" value="1" inputmode="numeric" aria-label="Quantity"><button class="au-btn" type="button" data-add-product="${esc(p.id)}"${available(p) ? "" : ' disabled aria-disabled="true"'}>${available(p) ? "Add to cart" : "Sold out"}</button></div><p class="au-feedback" data-commerce-feedback role="status"></p>`
      : o.commerce ? `<div class="au-buy"><button class="au-btn" type="button" disabled aria-disabled="true">Add to cart on the live store</button></div><p class="au-feedback" role="status">Read-only preview. Shopping is available on the live store.</p>`
        : `<button class="au-btn" disabled aria-disabled="true">${o.preview || o.embeddedPreview ? "Preview only: checkout on the live store" : "Shopping unavailable"}</button>`;
    const sticky = o.commerce && vo && !o.readOnly ? `<div class="au-sticky-buy"><span>${esc(p.title || "Product")}<strong data-opt-price>${money(p.price_paise)}</strong></span>${renderOptionSticky(p, { esc, money })}</div>` : o.commerce ? `<div class="au-sticky-buy"><span>${esc(p.title || "Product")}<strong>${money(p.price_paise)}</strong></span><button class="au-btn" type="button"${o.readOnly || !available(p) ? ' disabled aria-disabled="true"' : ` data-add-product="${esc(p.id)}"`}>${!available(p) ? "Sold out" : o.readOnly ? "Preview only" : "Add to cart"}</button></div>` : "";
    return `<section class="au-product"><div class="au-pgallery">${imgs}</div><div class="au-pdetail"><h1>${esc(p.title || "Untitled product")}</h1><p class="au-price"><strong data-opt-price>${money(p.price_paise)}</strong>${p.compare_at_paise ? ` <del>${money(p.compare_at_paise)}</del>` : ""}</p><div class="aura-description au-desc">${c.renderDescription(p.description || "")}</div>${(() => { const d = specsOwn(c) ? [] : detailsOf(c); return d.length ? `<section class="au-product-details-block" aria-labelledby="au-pd-h"><h2 id="au-pd-h" class="au-sr">Product details</h2><dl class="au-specs au-product-details" data-product-details style="overflow-wrap:anywhere">${d.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join("")}</dl></section>` : ""; })()}${buy}</div>${sticky}</section>`;
  },
  about(s, c) {
    const x = s.settings || {};
    return `<section class="au-page"><h1>${esc(str(x.title) || c.brand)}</h1>${str(x.body) ? `<div class="au-body au-rich">${rich(x.body)}</div>` : ""}</section>`;
  },
  contact(s, c) {
    const x = c.settings;
    const rows = [x.support_email && `<a href="mailto:${esc(x.support_email)}">${esc(x.support_email)}</a>`, x.support_phone && `<a href="tel:${esc(String(x.support_phone).replace(/[^\d+]/g, ""))}">${esc(formatPhone(x.support_phone))}</a>`, x.address && `<p>${esc(x.address).replace(/\n/g, "<br>")}</p>`].filter(Boolean);
    return `<section class="au-page"><h1>${esc(str(s.settings?.title) || "Contact")}</h1><div class="au-contact">${rows.join("")}</div></section>`;
  },
  policy(s, c) {
    const kind = c.options.policyKind;
    const p = (c.data.policies || []).find((i) => i.kind === kind);
    return `<section class="au-page au-policy"><h1>${esc(p?.title || policyTitle(kind))}</h1>${p?.body ? `<div class="au-body">${esc(p.body).replace(/\n/g, "<br>")}</div>` : `<p>This policy is being prepared by ${esc(c.brand)}.</p>`}</section>`;
  },
  "not-found"(s, c) {
    if (off(s)) return "";
    return `<section class="au-page au-notfound"><h1>${esc(s.settings.title)}</h1><p class="au-lede">${esc(s.settings.text)}</p><p><a class="au-btn" href="/collections/all">Browse the collection</a></p></section>`;
  },
  commerce(s, c) {
    if (c.options.editorSkeleton && ["cart", "checkout"].includes(c.options.page)) return commerceSkeleton(c.options.page);
    return renderCommerceBody(c.data, c.options);
  },
};

const plainText = (v) => str(v).replace(/<[^>]*>/g, "").trim();
const cardsOf = (list, c) => `<div class="au-grid">${list.map((p) => card(p, c)).join("")}</div>`;
Object.assign(SECTION_RENDERERS, {
  faq(s, c) {
    const mine = entityFaq(c);
    const items = mine.length || ownsFaq(c) ? mine : blocks(s).filter((b) => str(b.question) && plainText(b.answer));
    if (off(s) || !items.length) return "";
    return `<section class="au-section au-faq">${heading(str(s.settings?.title))}<div class="au-faq-list">${items.map((b) => `<details><summary>${esc(b.question)}</summary><div class="au-rich">${rich(b.answer)}</div></details>`).join("")}</div></section>`;
  },
  "material-care"(s, c) {
    const body = has(c, "materials_care") ? content(c).materials_care : s.settings?.body;
    if (off(s) || !plainText(body)) return "";
    return `<section class="au-section au-info">${heading(str(s.settings.title) || "Materials and care")}<div class="au-rich">${rich(body)}</div></section>`;
  },
  "how-to-use"(s, c) {
    const mine = (Array.isArray(content(c).how_to_use) ? content(c).how_to_use : []).filter((b) => str(b?.title));
    const items = mine.length || has(c, "how_to_use") ? mine : blocks(s).filter((b) => str(b.title));
    if (off(s) || !items.length) return "";
    return `<section class="au-section au-info">${heading(str(s.settings?.title) || "How to use")}<ol class="au-steps">${items.map((b) => `<li><strong>${esc(b.title)}</strong>${str(b.text) ? `<span>${esc(b.text)}</span>` : ""}</li>`).join("")}</ol></section>`;
  },
  "product-specs"(s, c) {
    const mine = (Array.isArray(content(c).features) ? content(c).features : []).filter((b) => str(b?.label) && str(b?.value)).map((b) => [b.label, b.value]);
    const rows = mine.length || has(c, "features") ? mine : blocks(s).filter((b) => str(b.label) && str(b.value)).map((b) => [b.label, b.value]);
    rows.splice(0, rows.length, ...mergeDetails(rows, detailsOf(c)));
    if (s.settings?.show_sku !== false && str(c.product?.sku)) rows.push(["SKU", c.product.sku]);
    if (off(s) || !rows.length) return "";
    return `<section class="au-section au-info">${heading(str(s.settings?.title) || "Specifications")}<dl class="au-specs">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
  },
  "size-guide"(s, c) {
    const mine = (Array.isArray(content(c).size_guide) ? content(c).size_guide : []).filter((b) => str(b?.size));
    const rows = mine.length || has(c, "size_guide") ? mine : blocks(s).filter((b) => str(b.size));
    if (off(s) || !rows.length) return "";
    const x = { ...(s.settings || {}), ...(has(c, "size_note") ? { note: content(c).size_note ? `<p>${esc(content(c).size_note)}</p>` : "" } : {}) };
    return `<section class="au-section au-info">${heading(str(x.title) || "Size guide")}<table class="au-size"><thead><tr><th scope="col">${esc(str(x.heading_a) || "Size")}</th><th scope="col">${esc(str(x.heading_b) || "Measurement")}</th></tr></thead><tbody>${rows.map((b) => `<tr><th scope="row">${esc(b.size)}</th><td>${esc(b.measurement || "")}</td></tr>`).join("")}</tbody></table>${plainText(x.note) ? `<div class="au-rich">${rich(x.note)}</div>` : ""}</section>`;
  },
  "shipping-info"(s, c) {
    if (off(s)) return "";
    const x = s.settings || {};
    const policies = Array.isArray(c.data.policies) ? c.data.policies : [];
    const links = x.show_policy_links === false ? [] : [["shipping", "Shipping policy"], ["cancellation-refund", "Cancellation and refund policy"]].filter(([k]) => policies.some((p) => p.kind === k && p.body)).map(([k, l]) => `<a class="au-link" href="/policies/${k}">${l}</a>`);
    const body = has(c, "delivery_returns") ? content(c).delivery_returns : x.body;
    if (!plainText(body) && !links.length) return "";
    return `<section class="au-section au-info">${heading(str(x.title) || "Shipping and returns")}${plainText(body) ? `<div class="au-rich">${rich(body)}</div>` : ""}${links.length ? `<p class="au-info-links">${links.join("")}</p>` : ""}</section>`;
  },
  "related-products"(s, c) {
    if (off(s) || !c.product) return "";
    const mine = c.product.collection_ids || [];
    const shared = (p) => (p.collection_ids || []).some((id) => mine.includes(id)) ? 0 : 1;
    const others = c.products.filter((p) => String(p.id) !== String(c.product.id)).map((p, i) => [p, i]).sort((a, b) => shared(a[0]) - shared(b[0]) || a[1] - b[1]).map((e) => e[0]);
    const n = [3, 4, 6].includes(Number(s.settings?.limit)) ? Number(s.settings.limit) : 4;
    return others.length ? `<section class="au-section">${heading(str(s.settings?.title) || "You may also like")}${cardsOf(others.slice(0, n), c)}</section>` : "";
  },
  "featured-products"(s, c) {
    const list = blocks(s).map((b) => c.products.find((p) => String(p.id) === String(b.product))).filter(Boolean);
    if (off(s) || !list.length) return "";
    return `<section class="au-section">${heading(str(s.settings?.title))}${cardsOf(list, c)}</section>`;
  },
  "collection-heading"(s, c) {
    const x = s.settings || {}, k = activeCollection(c);
    const desc = k ? str(k.description) : str(x.intro);
    if (off(s) || (!k && !str(x.kicker) && !desc)) return "";
    return `<section class="au-section au-collection-head">${str(x.kicker) ? `<p class="au-eyebrow">${esc(x.kicker)}</p>` : ""}${k ? `<h1>${esc(k.title)}</h1>` : ""}${desc ? `<p class="au-lede">${esc(desc)}</p>` : ""}</section>`;
  },
  "collection-nav"(s, c) {
    const cur = activeCollection(c);
    const cols = collectionsOf(c).filter((k) => colHref(k) || c.products.some((p) => (p.collection_ids || []).includes(k.id)));
    if (off(s) || !cols.length) return "";
    const chip = (k) => colHref(k) ? `<a class="au-chip" href="${esc(colHref(k))}" aria-current="${cur && cur.id === k.id ? "page" : "false"}">${esc(k.title || k.name)}</a>` : `<button type="button" class="au-chip" data-catalog-collection="${esc(k.id)}" aria-pressed="false">${esc(k.title || k.name)}</button>`;
    const all = cols.some((k) => colHref(k)) ? `<a class="au-chip" href="/collections/all" aria-current="${cur ? "false" : "page"}">All</a>` : `<button type="button" class="au-chip" data-catalog-collection="" aria-pressed="true">All</button>`;
    return `<nav class="au-section au-collection-nav" aria-label="${esc(str(s.settings?.title) || "Browse")}">${all}${cols.map(chip).join("")}</nav>`;
  },
  "collection-tools"(s, c) {
    let list = c.products;
    if (off(s) || list.length < 2) return "";
    return `<section class="au-section au-tools" aria-label="${esc(str(s.settings?.title) || "Filter and sort")}"><p class="au-count" data-catalog-count role="status"></p>${list.some((p) => !available(p)) ? '<label class="au-check"><input type="checkbox" data-catalog-stock> In stock only</label>' : ""}<label class="au-sr" for="au-sort">Sort products</label><select id="au-sort" data-catalog-sort><option value="">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="available">Availability</option></select></section>`;
  },
  "collection-pagination"(s, c) {
    if (off(s)) return "";
    const size = normalisePageSize(s.settings?.page_size);
    const total = gridProducts(c, c.layout?.find((i) => i.type === "product-grid")?.settings?.collection).length;
    if (c.options?.editorSkeleton && total <= size) return `<nav class="au-section au-pagination au-skel" aria-label="Pagination outline"><span class="au-chip">Previous</span><span class="au-chip">Page 1</span><span class="au-chip">Next</span></nav>`;
    if (total <= size) return "";
    return `<nav class="au-section au-pagination" data-catalog-pagination aria-label="Pagination"><button type="button" class="au-chip" data-page-prev>Previous</button><span data-page-status role="status"></span><button type="button" class="au-chip" data-page-next>Next</button></nav>`;
  },
  "related-collections"(s, c) {
    const cur = activeCollection(c), all = collectionsOf(c).filter((k) => colHref(k) && (!cur || k.id !== cur.id));
    const picked = cur && Array.isArray(cur.related_ids) && cur.related_ids.length ? cur.related_ids.map((id) => all.find((k) => k.id === id)).filter(Boolean) : [];
    const cols = picked.length ? picked : all;
    if (off(s) || !cols.length) return "";
    return `<section class="au-section">${heading(str(s.settings?.title) || "More collections")}<nav class="au-collection-nav" aria-label="Related collections">${cols.map((k) => `<a class="au-chip" href="${esc(colHref(k))}">${esc(k.title)}</a>`).join("")}</nav></section>`;
  },
  "collection-description"(s) {
    if (off(s) || !plainText(s.settings?.body)) return "";
    return `<section class="au-section au-info">${heading(str(s.settings.title))}<div class="au-rich">${rich(s.settings.body)}</div></section>`;
  },
});

const alias = (h) => h.replace(/class="au-hero /, 'class="aura-hero au-hero ').replace(/class="au-(section|statement|spotlight|founder|trust|page)\b/g, 'class="aura-$1 au-$1').replace(/class="aura-section au-section au-/g, 'class="aura-section au-section au-');
export function renderSection(section, ctx) {
  const fn = Object.hasOwn(SECTION_RENDERERS,section?.type)?SECTION_RENDERERS[section.type]:null;
  if (!fn) return "";
  let html = alias(fn(section, ctx) || "");
  if (ctx.options?.editorSkeleton && section.type === "hero" && !str(section.settings?.title) && !str(section.settings?.button_label)) html = "";
  if (ctx.options?.editorSkeleton && section.type === "featured-collection" && !(ctx.data.collections || []).length && !section.settings?.collection) html = "";
  if (!html && ctx.options?.editorSkeleton) html = alias(skeletonHtml(section));
  // Editor-only selection hook. Never set on the live storefront.
  if (html && ctx.options?.editorAnnotate && /^[A-Za-z0-9_-]{1,64}$/.test(section.id)) html = html.replace(/^(\s*<[a-z0-9]+)/i, `$1 data-lb-section="${section.id}"`);
  return section.type === "hero" && ctx.products?.length === 1
    ? html.replace('class="aura-hero ', 'class="aura-hero aura-hero-spotlight ')
    : html;
}
