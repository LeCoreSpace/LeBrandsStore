import { renderCommerceBody } from "./commerce-view.js";
import { formatPhone } from "./commerce-rules.js";
import { sanitizeRichText } from "./aura-layout.js";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const UU = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MEDIA = new RegExp(`^https://media\\.lebrands\\.store/stores/${UU}/${UU}\\.(?:png|jpe?g|svg|webp)$`, "i");
export const safeImage = (u) => (MEDIA.test(String(u || "")) || /^\/assets\/img\/[\w./-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(String(u || ""))) ? String(u) : "";
export const money = (p) => `₹${(Math.max(0, Number(p) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const policyTitle = (k) => ({ privacy: "Privacy", terms: "Terms & Conditions", shipping: "Shipping", "cancellation-refund": "Cancellation & Refund", contact: "Contact", pricing: "Pricing" })[k] || "Policy";
const POLICIES = ["privacy", "terms", "shipping", "cancellation-refund", "pricing"];
const str = (v) => typeof v === "string" ? v.trim() : "";
const blocks = (s) => (Array.isArray(s.blocks) ? s.blocks : []).map((b) => b?.settings || {});
const off = (s) => s?.settings?.enabled === false;

function img(image, { eager = false, cls = "", label = "" } = {}) {
  const url = safeImage(image?.url);
  if (!url) return "";
  const w = Number(image.width) > 0 ? ` width="${Math.round(image.width)}"` : "";
  const h = Number(image.height) > 0 ? ` height="${Math.round(image.height)}"` : "";
  const responsive=Number(image.width)>0?` srcset="${esc(url)} ${Math.round(image.width)}w" sizes="(max-width: 680px) 100vw, 50vw"`:"";
  return `<img class="${cls}" src="${esc(url)}"${responsive} alt="${esc(image.alt || label)}"${w}${h} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function card(p, ctx, eager = false, index = 0) {
  const im = img(p.images?.[0], { eager, label: p.title });
  return `<a class="au-card" data-title="${esc(String(p.title || "").toLowerCase())}" data-price="${Number(p.price_paise) || 0}" data-available="${available(p) ? 1 : 0}" data-index="${index}" href="/products/${encodeURIComponent(p.id || "")}"><span class="au-card-media">${im || `<span class="au-card-blank">${esc((p.title || "").slice(0, 1))}</span>`}</span><span class="au-card-name">${esc(p.title || "Untitled product")}</span><span class="au-card-price">${money(p.price_paise)}${p.compare_at_paise ? ` <del>${money(p.compare_at_paise)}</del>` : ""}${available(p) ? "" : " · Sold out"}</span></a>`;
}
const heading = (t, extra = "") => t ? `<div class="au-head"><h2>${esc(t)}</h2>${extra}</div>` : "";

const rich = (v) => { try { return sanitizeRichText(String(v || ""), 10000); } catch { return esc(String(v || "").replace(/<[^>]*>/g, "")); } };
const link = (u) => /^\/(?!\/)/.test(String(u || "")) || /^https:\/\//.test(String(u || "")) ? String(u) : "";
const available = (p) => p.stock == null || Number(p.stock) > 0;
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
    const links = list.filter((l) => l?.label && link(l.url)).map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("");
    const logo = c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.brand)}" height="36">` : `<span class="au-wordmark">${esc(c.brand)}</span>`;
    const bag = c.options.commerce ? `<button type="button" class="au-bag" data-cart-open aria-label="${c.options.readOnly ? "Cart preview, shopping disabled" : "Open cart"}" ${c.options.readOnly ? 'disabled aria-disabled="true"' : ""}>Bag <span data-cart-count>0</span></button>` : "";
    const search = `<form class="au-search" role="search" action="/collections/all" method="get"><label class="au-sr" for="au-q-${esc(s.id)}">Search products</label><input id="au-q-${esc(s.id)}" name="q" type="search" placeholder="Search" autocomplete="off"><button type="submit" class="au-btn-quiet">Search</button></form>`;
    return `<header class="aura-header au-header ${s.settings?.logo_position === "center" ? "is-center" : ""}"><a class="au-brand" href="/" aria-label="${esc(c.brand)} home">${logo}</a><nav class="au-nav" aria-label="Main navigation">${links}</nav><div class="au-actions">${search}${bag}<button type="button" class="au-menu-btn" data-menu-open aria-expanded="false" aria-controls="au-menu">Menu</button></div></header><div class="au-menu" id="au-menu" hidden><div class="au-menu-head"><span class="au-wordmark">${esc(c.brand)}</span><button type="button" class="au-menu-btn" data-menu-close>Close</button></div>${search.replaceAll(`au-q-${esc(s.id)}`, `au-mq-${esc(s.id)}`)}<nav aria-label="Menu">${links}</nav></div>`;
  },
  hero(s, c) {
    const x = s.settings || {};
    if (off(s)) return "";
    const image = x.image?.url ? x.image : c.products[0]?.images?.[0];
    const variant = ["split", "fullbleed", "video"].includes(x.variant) ? x.variant : "split";
    const title = str(x.title);
    const video = variant === "video" && x.video?.url && safeImage(x.poster?.url) && /^https:\/\/media\.lebrands\.store\//.test(x.video.url);
    const media = video
      ? `<video src="${esc(x.video.url)}" poster="${esc(x.poster.url)}" autoplay muted loop playsinline preload="none" aria-label="${esc(x.video.alt || "")}"></video>`
      : img(image, { eager: true, label: c.brand });
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
    let list = c.products;
    const cid = s.settings?.collection;
    if (cid && list.some((p) => Array.isArray(p.collection_ids))) list = list.filter((p) => (p.collection_ids || []).includes(cid));
    if (!list.length) return "";
    const n = [3, 6, 9].includes(Number(s.settings?.limit)) ? Number(s.settings.limit) : 3;
    return `<section class="au-section">${heading(str(s.settings?.title), '<a class="au-link" href="/collections/all">View all</a>')}<div class="au-grid">${list.slice(0, n).map((p) => card(p, c)).join("")}</div></section>`;
  },
  spotlight(s, c) {
    if (off(s)) return "";
    const p = c.products.find((i) => String(i.id) === String(s.settings?.product));
    if (!p || !img(p.images?.[0])) return "";
    return `<section class="au-spotlight"><div class="au-spot-media">${img(p.images[0], { label: p.title })}</div><div class="au-spot-copy"><h2>${esc(p.title)}</h2><div class="au-rich">${c.renderDescription(String(p.description || "").slice(0, 260))}</div><p class="au-card-price">${money(p.price_paise)}</p><a class="au-btn" href="/products/${encodeURIComponent(p.id)}">View product</a></div></section>`;
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
    return `<footer class="aura-footer au-footer"><div><a class="au-wordmark" href="/">${esc(c.brand)}</a>${line ? `<p>${esc(line)}</p>` : ""}</div><nav aria-label="Store links and policies">${mine || '<a href="/collections/all">Collection</a><a href="/pages/about">About</a><a href="/pages/contact">Contact</a>'}<a href="/track">Track order</a>${POLICIES.map((k) => `<a href="/policies/${k}">${policyTitle(k)}</a>`).join("")}</nav>${social ? `<nav class="au-social" aria-label="Social">${social}</nav>` : ""}</footer>`;
  },
  "product-grid"(s, c) {
    let list = c.products;
    const cid = s.settings?.collection;
    if (cid && list.some((p) => Array.isArray(p.collection_ids))) list = list.filter((p) => (p.collection_ids || []).includes(cid));
    const title = str(s.settings?.title) || "Collection";
    const tools = list.length > 1 ? `<div class="au-tools"><p class="au-count" data-catalog-count role="status"></p><label class="au-sr" for="au-sort">Sort products</label><select id="au-sort" data-catalog-sort><option value="">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="available">Availability</option></select></div>` : "";
    return `<section class="au-page"><h1>${esc(title)}</h1>${c.settings.description ? `<p class="au-lede">${esc(c.settings.description)}</p>` : ""}${tools}${list.length ? `<div class="au-grid" data-catalog>${list.map((p, i) => card(p, c, false, i)).join("")}</div><p class="au-noresult" data-catalog-empty hidden>No products match your search.</p>` : `<div class="au-empty"><h2>The collection is taking shape.</h2></div>`}</section>`;
  },
  "product-details"(s, c) {
    const p = c.product;
    if (!p) return "";
    const o = c.options;
    const imgs = (p.images || []).map((im, i) => img(im, { eager: i === 0, label: p.title }).replace("<img ", `<img data-gallery-image="${i}" `)).join("");
    const buy = o.commerce && !o.readOnly
      ? `<div class="au-buy"><label for="aura-quantity">Quantity</label><input id="aura-quantity" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="Quantity"><button class="au-btn" type="button" data-add-product="${esc(p.id)}">Add to cart</button></div><p class="au-feedback" data-commerce-feedback role="status"></p>`
      : o.commerce ? `<div class="au-buy"><button class="au-btn" type="button" disabled aria-disabled="true">Add to cart on the live store</button></div><p class="au-feedback" role="status">Read-only preview. Shopping is available on the live store.</p>`
        : `<button class="au-btn" disabled aria-disabled="true">Checkout opening soon</button>`;
    return `<section class="au-product"><div class="au-pgallery">${imgs}</div><div class="au-pdetail"><h1>${esc(p.title || "Untitled product")}</h1><p class="au-price"><strong>${money(p.price_paise)}</strong>${p.compare_at_paise ? ` <del>${money(p.compare_at_paise)}</del>` : ""}</p><div class="aura-description au-desc">${c.renderDescription(p.description || "")}</div>${buy}</div></section>`;
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
    return renderCommerceBody(c.data, c.options);
  },
};

const alias = (h) => h.replace(/class="au-hero /, 'class="aura-hero au-hero ').replace(/class="au-(section|statement|spotlight|founder|trust|page)\b/g, 'class="aura-$1 au-$1').replace(/class="aura-section au-section au-/g, 'class="aura-section au-section au-');
export function renderSection(section, ctx) {
  const fn = Object.hasOwn(SECTION_RENDERERS,section?.type)?SECTION_RENDERERS[section.type]:null;
  if (!fn) return "";
  const html = alias(fn(section, ctx) || "");
  return section.type === "hero" && ctx.products?.length === 1
    ? html.replace('class="aura-hero ', 'class="aura-hero aura-hero-spotlight ')
    : html;
}
