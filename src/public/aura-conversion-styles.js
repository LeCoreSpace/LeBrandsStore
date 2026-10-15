/**
 * Product-page-first showcase styles: Social Pop, Creator Feed, Proof & Detail.
 * Each is a whole-store composition (home, collection, product, about, cart and
 * checkout framing) with its own structure and language, not a reskin.
 * Pure string builders. Helpers come from aura-showcase.js so media, product
 * names, prices and photos always come from the resolved content pack and the
 * real catalogue, never from the visual style.
 *
 * No invented facts: highlights come from real product features or the real
 * description, specification rows come from catalogue fields, and policy links
 * only appear when the store has those policies.
 */
export const CONVERSION_STYLES = Object.freeze(["social-pop", "creator-feed", "proof-detail"]);
export const isConversionStyle = style => CONVERSION_STYLES.includes(style);
export const CONVERSION_KIND = Object.freeze({ "social-pop": "pop", "creator-feed": "slide", "proof-detail": "fade" });
/** Mobile quick navigation bar, as the boutique style already has. */
export const CONVERSION_TABBAR = Object.freeze(["social-pop", "creator-feed"]);

export const CONVERSION_COPY = Object.freeze({
  "social-pop": { kicker: "A little more you", title: "Make everyday a bit more fun.",
    description: "Bright picks, quick highlights and photos that show you exactly what you are getting. Start with the good bits, then look closer.",
    button: "Shop the picks", statement: "Good things, easy to spot.", products: "Fresh picks", collections: "Shop by collection", about: "Hi, glad you stopped by",
    story: ["We like products that are simple to understand and a pleasure to use. Big photos, short highlights and a clear price are the whole idea.", "This is a style demonstration. Products, prices and words are samples that show the layout.", "Swap in your own products, photos and voice when you build the store."] },
  "creator-feed": { kicker: "Seen in real life", title: "See it first. Then take it home.",
    description: "Scroll through photos of the products in use, read the short notes underneath, then shop the one you like right from the picture.",
    button: "Start scrolling", statement: "Real photos first. Details one tap away.", products: "Latest from the shelf", collections: "Browse the collections", about: "A few words from us",
    story: ["A feed-style store lets the photos lead. Each picture gets a short, friendly caption and the way to buy sits right beside it.", "This is a style demonstration. Products, prices and words are samples, and no customer posts are shown.", "Add your own photos and captions when you build the store."] },
  "proof-detail": { kicker: "Clear details", title: "Know exactly what you are buying.",
    description: "Photos, descriptions and prices sit side by side, so you can compare and decide at your own pace.",
    button: "See the details", statement: "Details first. Decisions made easy.", products: "The range, in detail", collections: "Browse by collection", about: "How we describe our products",
    story: ["A details-led store explains each product plainly: what it is, what it costs and what to check before you buy.", "This is a style demonstration. Products, prices and words are samples, and no certifications or test results are claimed.", "Add your own descriptions and specifications when you build the store."] },
});

export const CONVERSION_NEUTRAL = Object.freeze({
  "social-pop": { kicker: "A little more you", description: b => `Welcome to ${b}. Browse the highlights and find something you will enjoy.`, button: "Shop now", products: "Fresh picks", collections: "Shop by collection",
    story: b => [`Your day, your taste, your kind of find. Welcome to ${b}.`, "A small detail can bring a little more personality to the everyday. Take a look around and see what feels like you.", "Find something you like? Explore the product details and make it part of your day."] },
  "creator-feed": { kicker: "A closer look", description: b => `A closer look at ${b}. Explore the products and the details.`, button: "Start browsing", products: "Take a closer look", collections: "Collections",
    story: b => [`Get to know ${b}, one detail at a time.`, "Sometimes it is the little things that catch your eye. Explore the range, take a closer look and picture your own everyday.", "Your next find starts with a little curiosity. Browse at your own pace and see what fits your life."] },
  "proof-detail": { kicker: "Product details", description: b => `The ${b} range with clear photos, descriptions and prices.`, button: "View the range", products: "The range", collections: "Collections",
    story: b => [`Explore the ${b} range with a closer look at each product.`, "The right choice starts with the details. Read the product information, compare what matters to you and take the time you need.", "Before ordering, review the store's delivery and returns terms. Contact us if you need more information."] },
});

/** Announcement strip. Returns null for the five original styles. */
export function conversionTopper(x, live, esc) {
  if (!isConversionStyle(x.style)) return null;
  if (live) return x.copy.kicker && x.style !== "proof-detail" ? `<div class="sc-announce">${esc(x.copy.kicker)}</div>` : "";
  return {
    "social-pop": `<div class="sc-announce">Sample store. Browse, bag and check out in preview only.</div>`,
    "creator-feed": `<div class="sc-announce">Sample store with sample photos. Nothing here is real.</div>`,
    "proof-detail": `<div class="sc-announce">Style demonstration. Products and prices are samples.</div>`,
  }[x.style];
}

const LEAD = {
  "social-pop": { cart: "Nice picks. This is a sample bag, so nothing here is a real order.", checkout: "Interactive preview only. This sample bag never creates an order or takes a payment." },
  "creator-feed": { cart: "Your bag, with the photos you picked. Sample bag only: no real order is made.", checkout: "Interactive preview only. This sample bag never creates an order or takes a payment." },
  "proof-detail": { cart: "Check each item, quantity and total. This sample bag is not a real order.", checkout: "Interactive preview only. This sample bag never creates an order or takes a payment." },
};

export function buildConversion(h) {
  const { esc, rupees, img, pImg, pHref, cHref, cImg, rv, dc, num, cta, card, live } = h;
  const feats = p => (p.content?.features || []).filter(f => f && f.label && f.value);
  const sentences = t => String(t || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const hl = p => {
    const f = feats(p).slice(0, 3).map(i => `${i.label}: ${i.value}`);
    if (f.length) return f;
    return sentences(p.description).slice(0, 3).map(s => s.length > 90 ? `${s.slice(0, 87).replace(/\s+\S*$/, "")}...` : s);
  };
  const avail = p => p.stock == null ? "" : Number(p.stock) > 0 ? "In stock" : "Sold out";
  const price = p => `${rupees(p.price_paise)}${p.compare_at_paise ? ` <del>${rupees(p.compare_at_paise)}</del>` : ""}`;
  const colsOf = (x, p) => x.collections.filter(c => (c.product_ids || []).includes(p.id) || (p.collection_ids || []).includes(c.id)).map(c => c.title);
  const prodOf = x => x.products.find(i => String(i.id) === String(x.options.productId)) || x.products[0];
  const none = `<section class="sc-chead"><h1>Product not found</h1><p><a class="sc-btn" href="/collections/all">Browse the range</a></p></section>`;
  const on = x => Boolean(x.options?.commerce && (!x.options.readOnly || x.options.embeddedPreview));
  const word = "Add to cart";
  const noPhoto = '<div class="cv-no-photo" role="img" aria-label="Product image unavailable">Product image unavailable</div>';

  /** Delivery and returns terms near the buy button (Baymard). Only real policies. */
  const terms = x => {
    if (!live()) return `<p class="cv-terms">Delivery and returns terms from your store policies appear here.</p>`;
    const links = (x.policies || []).filter(p => /^[a-z0-9-]+$/.test(String(p.kind || "")) && /ship|deliver|return|refund/i.test(p.kind))
      .map(p => `<a href="/policies/${p.kind}">${esc(p.title || p.kind)}</a>`);
    return links.length ? `<p class="cv-terms">Before you buy: ${links.join(", ")}.</p>` : "";
  };
  const buy = (x, p) => {
    if (!live()) return `<div class="au-buy"><button type="button">Add to bag (preview)</button></div>`;
    const ok = p.stock == null || Number(p.stock) > 0, o = x.options;
    const max = p.stock == null ? 99 : Math.max(1, Math.min(99, Number(p.stock)));
    return on(x)
      ? `<div class="au-buy"><label for="aura-quantity">Quantity</label><input id="aura-quantity" type="number" min="1" max="${max}" value="1" inputmode="numeric" aria-label="Quantity"><button class="au-btn" type="button" data-add-product="${esc(p.id)}"${ok ? "" : ' disabled aria-disabled="true"'}>${ok ? word : "Sold out"}</button></div><p class="au-feedback" data-commerce-feedback role="status"></p>`
      : `<div class="au-buy"><button class="au-btn" type="button" disabled aria-disabled="true">${o.commerce ? "Add to cart on the live store" : "Shopping unavailable"}</button></div>`;
  };
  const mini = (x, p) => {
    if (!live()) return `<div class="au-buy cf-mini"><button type="button">Add to bag (preview)</button></div>`;
    if (!on(x)) return "";
    const ok = p.stock == null || Number(p.stock) > 0;
    return `<div class="au-buy cf-mini"><button class="au-btn" type="button" data-add-product="${esc(p.id)}"${ok ? "" : ' disabled aria-disabled="true"'}>${ok ? word : "Sold out"}</button></div>`;
  };
  const sticky = (x, p) => {
    if (!live()) return `<div class="au-sticky-buy"><b>${rupees(p.price_paise)}</b><button type="button">Add to bag (preview)</button></div>`;
    if (!on(x)) return "";
    const ok = p.stock == null || Number(p.stock) > 0;
    return `<div class="au-sticky-buy"><b>${rupees(p.price_paise)}</b><button type="button" class="au-btn"${ok ? ` data-add-product="${esc(p.id)}"` : ' disabled aria-disabled="true"'}>${ok ? word : "Sold out"}</button></div>`;
  };
  const gallery = (x, p) => {
    const pics = (p.images || []).slice(0, 8).map((im, i) => img(im, p.title).replace("<img ", `<img data-gallery-image="${i}" `)).filter(Boolean);
    if (!live()) { const a = img(x.media.lifestyle, "Styling reference"), b = img(x.media.hero, "Campaign reference"); if (a) pics.push(a); if (b) pics.push(b); }
    return pics;
  };
  const desc = p => p.description ? `<p class="cv-desc" style="white-space:pre-line">${esc(p.description)}</p>` : "";
  const dl = (rows, cls) => `<dl class="${cls}">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${b}</dd>`).join("")}</dl>`;
  const rest = (x, p, n) => x.products.filter(i => i.id !== p.id).slice(0, n);
  const crumb = `<p class="cv-crumb"><a href="/">Home</a> / <a href="/collections/all">Shop</a></p>`;

  const cardExtra = (x, p) => {
    if (x.style === "social-pop") { const t = hl(p)[0]; return t ? `<span class="sp-chip">${esc(t)}</span>` : ""; }
    if (x.style === "proof-detail") { const t = hl(p)[0]; return t ? `<span class="pd-snip">${esc(t)}</span>` : ""; }
    if (x.style === "creator-feed") { const t = sentences(p.description)[0]; return t ? `<span class="cf-snip">${esc(t.length > 110 ? `${t.slice(0, 107).replace(/\s+\S*$/, "")}...` : t)}</span>` : ""; }
    return "";
  };
  const cardX = (x, p, i) => card(p, i, cardExtra(x, p));
  const cols = (x, cls, inner) => x.collections.length ? x.collections.map((c, i) => inner(c, i)).join("") : "";

  /* ------------------------------ HOME ------------------------------ */
  const HOME = {
    "social-pop": x => {
      const ps = x.products, cs = x.collections, first = ps[0];
      return `<section class="sp-hero"><div class="sp-hero-copy"><span class="sp-kick rv"${dc("kicker")}>${esc(x.copy.kicker)}</span><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p ${rv(2)}${dc("description")}>${esc(x.copy.description)}</p><div class="sp-actions rv" style="--i:3">${cta(x.copy.button, "/collections/all", "", dc("button"))}${cta("Our story", "/pages/about", "ghost")}</div></div><div class="sp-hero-media rv" style="--i:2">${img(x.media.hero, undefined, "hero")}${first ? `<a class="sp-sticker" href="${pHref(first)}"><b>${esc(first.title)}</b><span>${rupees(first.price_paise)}</span></a>` : ""}</div></section>
      <section class="sp-strip" aria-label="The store at a glance"><span>${ps.length} ${ps.length === 1 ? "product" : "products"}</span><span>${cs.length} ${cs.length === 1 ? "collection" : "collections"}</span></section>
      <section class="sp-band"><p ${rv()}${dc("statement")}>${esc(x.copy.statement)}</p></section>
      <section class="sp-picks"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><div class="sp-grid">${ps.map((p, i) => cardX(x, p, i)).join("")}</div></section>
      ${cs.length ? `<section class="sp-cols"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2><div>${cols(x, "", (c, i) => `<a class="sp-col rv" style="--i:${i}" href="${cHref(c)}"><span class="sp-col-img">${cImg(c, x, i)}</span><span class="sp-col-t"><b>${esc(c.title)}</b><small>${esc(c.description || "")}</small></span></a>`)}</div></section>` : ""}
      <section class="sp-moment"><div class="sp-moment-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="sp-moment-copy"><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("story0")}>${esc(x.copy.story[0] || "")}</p>${cta("Read our story", "/pages/about", "ghost")}</div></section>`;
    },
    "creator-feed": x => {
      const ps = x.products, cs = x.collections;
      const post = (p, i) => `<article class="cf-post rv" style="--i:${i % 3}"><a class="cf-ph" href="${pHref(p)}">${pImg(p) || ""}</a><div class="cf-cap"><b>${esc(p.title)}</b><span class="cf-pr">${rupees(p.price_paise)}</span>${cardExtra(x, p)}<a class="cf-more" href="${pHref(p)}">See details</a></div></article>`;
      const note = `<article class="cf-post cf-note-post rv"><div class="cf-ph">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="cf-cap"><p${dc("story0")}>${esc(x.copy.story[0] || "")}</p></div></article>`;
      const feed = ps.map((p, i) => post(p, i));
      if (feed.length >= 2) feed.splice(2, 0, note); else feed.push(note);
      return `<section class="cf-top"><p class="cf-kick rv"${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p ${rv(2)}${dc("description")}>${esc(x.copy.description)}</p></section>
      ${cs.length ? `<nav class="cf-stories" aria-label="Collections">${cs.map((c, i) => `<a class="cf-story" href="${cHref(c)}"><span class="cf-ring">${cImg(c, x, i)}</span>${esc(c.title)}</a>`).join("")}</nav>` : ""}
      <section class="cf-hero"><figure class="rv">${img(x.media.hero, undefined, "hero")}<figcaption><p${dc("statement")}>${esc(x.copy.statement)}</p>${cta(x.copy.button, "/collections/all", "", dc("button"))}</figcaption></figure></section>
      <section class="cf-feed"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2>${feed.join("")}</section>
      <section class="cf-about"><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("story1")}>${esc(x.copy.story[1] || "")}</p>${cs.length ? `<h3 class="cf-ch"${dc("collections")}>${esc(x.copy.collections)}</h3><p class="cf-links">${cs.map(c => `<a href="${cHref(c)}">${esc(c.title)}</a>`).join("")}</p>` : ""}${cta("Read more", "/pages/about", "ghost")}</section>`;
    },
    "proof-detail": x => {
      const ps = x.products, cs = x.collections;
      return `<section class="pd-hero"><div class="pd-hero-copy"><p class="pd-kick rv"${dc("kicker")}>${esc(x.copy.kicker)}</p><h1 ${rv(1)}${dc("title")}>${esc(x.copy.title)}</h1><p class="pd-lede rv" style="--i:2"${dc("description")}>${esc(x.copy.description)}</p><div class="pd-actions">${cta(x.copy.button, "/collections/all", "", dc("button"))}${cta("How we describe things", "/pages/about", "ghost")}</div></div><figure class="pd-hero-img rv" style="--i:2">${img(x.media.hero, undefined, "hero")}</figure></section>
      <section class="pd-statement"><p ${rv()}${dc("statement")}>${esc(x.copy.statement)}</p></section>
      <section class="pd-how" aria-label="What each product page shows"><article class="rv"><h3>Photos</h3><p>Every photo the store has added to a product is shown on its page.</p></article><article class="rv" style="--i:1"><h3>Description</h3><p>The words come from the store, with specifications listed separately.</p></article><article class="rv" style="--i:2"><h3>Price and terms</h3><p>The price sits beside the buy button, with the store policies linked nearby where they exist.</p></article></section>
      <section class="pd-range"><h2 ${rv()}${dc("products")}>${esc(x.copy.products)}</h2><div class="pd-rows">${ps.map((p, i) => cardX(x, p, i)).join("")}</div></section>
      ${cs.length ? `<section class="pd-cols"><h2 ${rv()}${dc("collections")}>${esc(x.copy.collections)}</h2><ol>${cs.map((c, i) => `<li class="rv" style="--i:${i}"><a href="${cHref(c)}"><span class="pd-n">${num(i)}</span><span class="pd-ct"><b>${esc(c.title)}</b><small>${esc(c.description || "")}</small></span><span class="pd-cimg">${cImg(c, x, i)}</span></a></li>`).join("")}</ol></section>` : ""}
      <section class="pd-note"><div class="pd-note-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div><h2 ${rv()}${dc("about")}>${esc(x.copy.about)}</h2><p ${rv(1)}${dc("story0")}>${esc(x.copy.story[0] || "")}</p>${cta("Read more", "/pages/about", "ghost")}</div></section>`;
    },
  };

  /* ------------------------------ PRODUCT ------------------------------ */
  const PRODUCT = {
    "social-pop": x => {
      const p = prodOf(x); if (!p) return none;
      const pics = gallery(x, p), hls = hl(p), av = avail(p), feat = feats(p), more = rest(x, p, 6);
      return `<section class="sp-pdp"><div class="sp-reel" role="region" aria-label="Photos of ${esc(p.title)}" tabindex="0">${pics.length ? pics.map((i, k) => `<div class="sp-shot" style="--i:${k}">${i}</div>`).join("") : `<div class="sp-shot">${noPhoto}</div>`}</div>
      <div class="sp-panel">${crumb}<h1>${esc(p.title)}</h1><p class="sp-price"><strong>${price(p)}</strong>${av ? `<span class="sp-stock">${av}</span>` : ""}</p>${hls.length ? `<ul class="sp-hl" aria-label="Highlights">${hls.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}${buy(x, p)}${terms(x)}</div></section>
      ${p.description || feat.length ? `<section class="sp-info"><h2>About this one</h2>${desc(p)}${feat.length ? `<dl class="sp-facts">${feat.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join("")}</dl>` : ""}</section>` : ""}
      ${more.length ? `<section class="sp-more"><h2>More to love</h2><div class="sp-rail">${more.map((r, i) => cardX(x, r, i)).join("")}</div></section>` : ""}${sticky(x, p)}`;
    },
    "creator-feed": x => {
      const p = prodOf(x); if (!p) return none;
      const pics = gallery(x, p), feat = feats(p), av = avail(p), more = rest(x, p, 4);
      const caps = ["Here is how it looks.", "A closer look.", "Another angle.", "And one more."];
      const posts = pics.map((i, k) => `<figure class="cf-post"><div class="cf-ph">${i}</div><figcaption class="cf-cap"><span>${esc(caps[k % caps.length])}</span>${k === 0 ? `<b>${esc(p.title)}, ${rupees(p.price_paise)}</b>${mini(x, p)}` : ""}</figcaption></figure>`).join("");
      return `<section class="cf-pdp"><div class="cf-pfeed">${posts || `<figure class="cf-post"><div class="cf-ph">${noPhoto}</div></figure>`}</div>
      <aside class="cf-side">${crumb}<h1>${esc(p.title)}</h1><p class="cf-price">${price(p)}${av ? ` <span class="cf-stock">${av}</span>` : ""}</p>${p.description ? `<h2>About this one</h2>${desc(p)}` : ""}${feat.length ? `<h2>Good to know</h2><ul class="cf-know">${feat.map(f => `<li><b>${esc(f.label)}</b> ${esc(f.value)}</li>`).join("")}</ul>` : ""}${buy(x, p)}${terms(x)}</aside>
      ${more.length ? `<section class="cf-more-sec"><h2>Keep scrolling</h2><div class="sc-list">${more.map((r, i) => cardX(x, r, i)).join("")}</div></section>` : ""}</section>${sticky(x, p)}`;
    },
    "proof-detail": x => {
      const p = prodOf(x); if (!p) return none;
      const pics = gallery(x, p), feat = feats(p), av = avail(p), cs = colsOf(x, p), more = rest(x, p, 4);
      const rows = [["Price", rupees(p.price_paise)], av && ["Availability", av], cs.length && ["Collection", esc(cs.join(", "))], ...feat.map(f => [f.label, esc(f.value)])].filter(Boolean);
      return `<section class="pd-pdp"><div class="pd-gal"><div class="pd-main">${pics[0] || noPhoto}</div>${pics.length > 1 ? `<div class="pd-thumbs">${pics.slice(1).map(i => `<div>${i}</div>`).join("")}</div>` : ""}</div>
      <div class="pd-buy">${crumb}<h1>${esc(p.title)}</h1><p class="pd-price">${price(p)}</p>${av ? `<p class="pd-av">${av}</p>` : ""}${buy(x, p)}${terms(x)}</div></section>
      <section class="pd-sec"><details open><summary>Overview</summary>${desc(p) || `<p class="cv-desc">The store has not added a description yet.</p>`}</details>
      <details open><summary>Product facts</summary>${dl(rows, "pd-spec")}</details></section>
      ${more.length ? `<section class="pd-rel"><h2>Compare with other products</h2><div class="pd-rows">${more.map((r, i) => cardX(x, r, i)).join("")}</div></section>` : ""}${sticky(x, p)}`;
    },
  };

  /* ------------------------------ ABOUT ------------------------------ */
  const browse = () => cta(live() ? "Browse the range" : "Browse the sample range");
  const ABOUT = {
    "social-pop": x => `<section class="sp-about"><div class="sp-about-head"><p class="sp-kick rv">About</p><h1 ${rv(1)}${dc("about")}>${esc(x.copy.about)}</h1></div><div class="sp-about-cards">${x.copy.story.map((t, i) => `<article class="sp-acard rv" style="--i:${i}"><p${dc("story" + i)}>${esc(t)}</p></article>`).join("")}</div><div class="sp-about-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="sp-about-cta">${browse()}</div></section>`,
    "creator-feed": x => `<section class="cf-aboutp"><figure class="cf-post rv"><div class="cf-ph">${img(x.media.lifestyle, undefined, "lifestyle")}</div></figure><div class="cf-note"><p class="cf-kick">About</p><h1 ${rv(1)}${dc("about")}>${esc(x.copy.about)}</h1>${x.copy.story.map((t, i) => `<p ${rv(i + 2)}${dc("story" + i)}>${esc(t)}</p>`).join("")}${browse()}</div></section>`,
    "proof-detail": x => {
      const heads = ["Who we are", "How we choose", "What to know"];
      return `<section class="pd-about"><header><p class="pd-kick">About</p><h1 ${rv(1)}${dc("about")}>${esc(x.copy.about)}</h1></header><div class="pd-about-grid"><div class="pd-about-img rv">${img(x.media.lifestyle, undefined, "lifestyle")}</div><div class="pd-about-copy">${x.copy.story.map((t, i) => `<section class="rv" style="--i:${i}"><h2>${heads[i] || "More"}</h2><p${dc("story" + i)}>${esc(t)}</p></section>`).join("")}${browse()}</div></div></section>`;
    },
  };

  const steps = (x, kind) => isConversionStyle(x.style)
    ? `<ol class="sc-steps" aria-label="Checkout progress"><li class="${kind === "cart" ? "now" : "done"}"${kind === "cart" ? ' aria-current="step"' : ""}>Bag</li><li class="${kind === "checkout" ? "now" : ""}"${kind === "checkout" ? ' aria-current="step"' : ""}>Details</li><li>Review</li></ol>` : "";
  const lead = (x, kind, fallback) => LEAD[x.style]?.[kind] || fallback;

  return { HOME, PRODUCT, ABOUT, cardExtra, cardX, steps, lead };
}

export const CONVERSION_CSS = `
.cv-no-photo{display:grid;place-items:center;min-height:100%;padding:2rem;text-align:center;font-size:.9rem}
.sc.sc-social-pop,.sc.sc-creator-feed,.sc.sc-proof-detail{background:var(--paper)}
.sc-social-pop,.sc-creator-feed,.sc-proof-detail{--body:"Instrument Sans",system-ui,sans-serif;--disp:"Instrument Sans",system-ui,sans-serif}
.sc-social-pop .sc-steps,.sc-creator-feed .sc-steps,.sc-proof-detail .sc-steps{display:flex;gap:.5rem;list-style:none;margin:0 0 1rem;padding:0;flex-wrap:wrap;font-size:.8rem;font-weight:700}
.sc-steps li{padding:.2rem .8rem;border:1px solid var(--line);border-radius:999px;opacity:.6}.sc-steps li.now{opacity:1;background:var(--acc);border-color:var(--acc);color:#fff}.sc-steps li.done{opacity:.9}
.cv-terms{font-size:.85rem;opacity:.85}.cv-terms a{text-decoration:underline}.cv-crumb{font-size:.8rem;opacity:.7}.cv-desc{max-width:42rem}
.sc-social-pop .au-feedback,.sc-creator-feed .au-feedback,.sc-proof-detail .au-feedback{font-size:.85rem;min-height:1.2em}
.sc-social-pop .au-buy,.sc-creator-feed .au-buy,.sc-proof-detail .au-buy{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.sc-social-pop .au-buy label,.sc-creator-feed .au-buy label,.sc-proof-detail .au-buy label{font-size:.8rem;font-weight:700}
.sc-social-pop .au-buy input,.sc-creator-feed .au-buy input,.sc-proof-detail .au-buy input{width:4.5rem;padding:.7rem;border:1.5px solid var(--ink);background:#fff;color:var(--ink);font:inherit}
.sc-social-pop .au-buy button,.sc-creator-feed .au-buy button,.sc-proof-detail .au-buy button{flex:1 1 10rem;width:auto}
.sc-social-pop a:focus-visible,.sc-social-pop button:focus-visible,.sc-social-pop input:focus-visible,.sc-social-pop .sp-reel:focus-visible,.sc-creator-feed a:focus-visible,.sc-creator-feed button:focus-visible,.sc-creator-feed input:focus-visible,.sc-proof-detail a:focus-visible,.sc-proof-detail button:focus-visible,.sc-proof-detail input:focus-visible,.sc-proof-detail summary:focus-visible{outline:3px solid var(--acc);outline-offset:3px}
.sc-social-pop,.sc-creator-feed,.sc-proof-detail{overflow-wrap:anywhere}

/* ===== Social Pop: bold media, upbeat highlights, rounded panels ===== */
.sc-social-pop{--ink:#1e1b3a;--acc:#5b3df5;--tint:#ece8ff;--line:#d9d2fb;--sun:#ffcf3f;--coral:#ff6b57;--mint:#8fe3c8;--paper:#fff8ee;--hw:800;--rv:sc-pop;--dur:.7s;--pg:sc-pop;--ease:cubic-bezier(.3,1.3,.5,1)}
.sc-social-pop h1,.sc-social-pop h2{letter-spacing:-.035em;line-height:1}
.sc-social-pop .sc-announce{background:var(--ink);color:var(--sun);text-align:center;font-size:.8rem;font-weight:700;padding:.45rem 1rem}
.sc-social-pop .sc-hd{margin:.7rem;border-radius:999px;background:#fff;box-shadow:0 0 0 2px var(--ink),4px 4px 0 var(--ink);padding:.6rem 1.2rem}
.sc-social-pop .sc-brand{font-weight:800;font-size:1.25rem;letter-spacing:-.03em}
.sc-social-pop .sc-btn{border-radius:999px;background:var(--acc);border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink);padding:.75rem 1.5rem;font-weight:800}
.sc-social-pop .sc-btn:hover{transform:translate(-1px,-2px);box-shadow:5px 5px 0 var(--ink)}
.sc-social-pop .sc-btn.ghost{background:#fff;color:var(--ink);box-shadow:3px 3px 0 var(--ink)}
.sc-social-pop .sc-card{background:#fff;border:2px solid var(--ink);border-radius:1.4rem;overflow:hidden;box-shadow:4px 4px 0 var(--ink);transition:transform .35s var(--ease),box-shadow .35s}
.sc-social-pop .sc-card:hover{transform:translate(-2px,-3px) rotate(-.5deg);box-shadow:7px 7px 0 var(--ink)}
.sc-social-pop .sc-card .sc-img{border-bottom:2px solid var(--ink)}
.sc-social-pop .sc-card:nth-child(3n+1) .sc-img{background:var(--sun)}.sc-social-pop .sc-card:nth-child(3n+2) .sc-img{background:var(--mint)}.sc-social-pop .sc-card:nth-child(3n) .sc-img{background:#ffd0c8}
.sc-social-pop .sc-meta{padding:.8rem 1rem 1rem}.sc-social-pop .sc-n{display:none}
.sc-social-pop .sc-price{background:var(--sun);border:2px solid var(--ink);border-radius:999px;padding:0 .7rem;font-weight:800}
.sp-chip{flex-basis:100%;font-size:.8rem;background:var(--tint);border-radius:999px;padding:.2rem .75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.sp-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:2rem;padding:1.5rem 1.5rem 2rem;align-items:center}
.sp-kick{display:inline-block;background:var(--sun);border:2px solid var(--ink);border-radius:999px;padding:.25rem .9rem;font-weight:800;font-size:.85rem}
.sp-hero h1{font-size:clamp(2.6rem,8vw,6rem);margin:1rem 0}.sp-hero p{font-size:1.15rem;max-width:34rem}.sp-actions{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.4rem}
.sp-hero-media{position:relative;aspect-ratio:1;border-radius:2.5rem;overflow:hidden;border:2px solid var(--ink);background:var(--coral);box-shadow:8px 8px 0 var(--ink);transform:rotate(1.5deg)}
.sp-sticker{position:absolute;left:1rem;bottom:1rem;right:1rem;display:flex;justify-content:space-between;gap:.6rem;align-items:center;background:var(--sun);border:2px solid var(--ink);border-radius:999px;padding:.5rem 1rem;font-size:.9rem}.sp-sticker b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-strip{display:flex;gap:.6rem;flex-wrap:wrap;padding:0 1.5rem}.sp-strip span{border:2px solid var(--ink);border-radius:999px;padding:.25rem .9rem;background:#fff;font-weight:700;font-size:.85rem}
.sp-band{background:var(--acc);color:#fff;margin:2.5rem 0;padding:2.2rem 1.5rem;border-block:2px solid var(--ink);text-align:center;font:800 clamp(1.6rem,4vw,3rem)/1.05 var(--disp);letter-spacing:-.03em;transform:rotate(-1deg)}
.sp-picks,.sp-cols{padding:1rem 1.5rem 2rem}.sp-picks h2,.sp-cols h2,.sp-more h2,.sp-info h2{font-size:clamp(1.8rem,4vw,3rem);margin-bottom:1.2rem}
.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1.4rem}
.sp-cols>div{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.2rem}
.sp-col{display:grid;border:2px solid var(--ink);border-radius:2rem;overflow:hidden;background:var(--mint);box-shadow:5px 5px 0 var(--ink);transition:transform .35s var(--ease)}.sp-col:hover{transform:translateY(-4px) rotate(.6deg)}.sp-col:nth-child(2n){background:#ffd0c8}.sp-col:nth-child(3n){background:var(--sun)}
.sp-col-img{display:block;aspect-ratio:4/3;overflow:hidden;border-bottom:2px solid var(--ink)}.sp-col-t{display:grid;padding:.9rem 1.1rem}.sp-col-t b{font-size:1.2rem}
.sp-moment{display:grid;grid-template-columns:1fr 1fr;gap:2rem;padding:2rem 1.5rem;align-items:center}.sp-moment-img{aspect-ratio:1;border:2px solid var(--ink);border-radius:2.5rem;overflow:hidden;box-shadow:6px 6px 0 var(--ink)}.sp-moment-copy{display:grid;gap:1rem;justify-items:start}.sp-moment-copy h2{font-size:clamp(1.8rem,4vw,3rem)}
.sp-pdp{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:1.6rem;padding:1.2rem 1.5rem;align-items:start}
.sp-reel{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.sp-shot{border:2px solid var(--ink);border-radius:1.8rem;overflow:hidden;aspect-ratio:1;background:var(--tint);box-shadow:5px 5px 0 var(--ink)}.sp-shot:first-child{grid-column:1/-1}.sp-shot:nth-child(2){background:var(--sun)}.sp-shot:nth-child(3){background:var(--mint)}
.sp-panel{position:sticky;top:5.5rem;background:var(--sun);border:2px solid var(--ink);border-radius:2rem;padding:1.4rem;display:grid;gap:.9rem;box-shadow:6px 6px 0 var(--ink)}
.sp-panel h1{font-size:clamp(1.9rem,3.6vw,3rem)}
.sp-price{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;font-size:1.5rem;font-weight:800}.sp-price del{font-size:1rem;opacity:.6;font-weight:500}.sp-stock{font-size:.8rem;font-weight:700;background:#fff;border:2px solid var(--ink);border-radius:999px;padding:.1rem .7rem}
.sp-hl{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}.sp-hl li{background:#fff;border:2px solid var(--ink);border-radius:999px;padding:.3rem .9rem;font-size:.9rem;font-weight:600}.sp-hl li:nth-child(2){background:var(--mint)}.sp-hl li:nth-child(3){background:#ffd0c8}
.sc-social-pop .au-buy button{border-radius:999px;background:var(--ink);border:0;color:#fff;font-weight:800}.sc-social-pop .au-buy input{border-radius:999px;text-align:center}
.sp-info{padding:1.5rem;max-width:58rem}.sp-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.8rem;margin:1.2rem 0 0}.sp-facts div{background:#fff;border:2px solid var(--ink);border-radius:1.2rem;padding:.8rem 1rem}.sp-facts dt{font-size:.75rem;font-weight:700;opacity:.7}.sp-facts dd{margin:0;font-weight:700}
.sp-more{padding:1rem 1.5rem 2rem}.sp-rail{display:flex;gap:1.2rem;overflow-x:auto;padding:.4rem .4rem 1.2rem;scroll-snap-type:x proximity}.sp-rail .sc-card{flex:0 0 min(15rem,70%);scroll-snap-align:start}
.sp-about{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:2rem 1.5rem;align-items:start}.sp-about-head{grid-column:1/-1}.sp-about-head h1{font-size:clamp(2.4rem,6vw,5rem);margin-top:.8rem}
.sp-about-cards{display:grid;gap:1rem}.sp-acard{background:#fff;border:2px solid var(--ink);border-radius:1.6rem;padding:1.2rem 1.4rem;box-shadow:4px 4px 0 var(--ink);font-size:1.1rem}.sp-acard:nth-child(1){background:var(--sun)}.sp-acard:nth-child(2){background:var(--mint)}.sp-acard:nth-child(3){background:#ffd0c8}
.sp-about-img{aspect-ratio:1;border:2px solid var(--ink);border-radius:2.5rem;overflow:hidden;box-shadow:6px 6px 0 var(--ink)}.sp-about-cta{grid-column:1/-1}
.sc-social-pop .sc-chead{padding:2rem 1.5rem 1rem}.sc-social-pop .sc-chips a{border:2px solid var(--ink);border-radius:999px;font-weight:700;background:#fff}.sc-social-pop .sc-chips a.on,.sc-social-pop .sc-chips a:hover{background:var(--ink);color:#fff}
.sc-social-pop .sc-list{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1.4rem}
.sc-social-pop .sc-sum,.sc-social-pop .sc-form fieldset{border:2px solid var(--ink);border-radius:1.6rem;background:#fff;box-shadow:4px 4px 0 var(--ink)}
.sc-social-pop .sc-ft{background:var(--ink);color:#fff;border-radius:2.5rem 2.5rem 0 0}
.sc-social-pop .au-sticky-buy{border-radius:999px;margin:0 .7rem;border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}.sc-social-pop .au-sticky-buy button{border-radius:999px;background:var(--ink)}

/* ===== Creator Feed: immersive vertical photos, conversational captions ===== */
.sc-creator-feed{--ink:#241f1c;--acc:#b4533c;--tint:#f0e4d8;--line:#e2d3c3;--paper:#f7f0e8;--hw:700;--rv:sc-slide;--dur:.9s;--pg:sc-fade}
.sc-creator-feed h1,.sc-creator-feed h2{letter-spacing:-.02em;line-height:1.08}
.sc-creator-feed .sc-announce{background:var(--ink);color:var(--paper);text-align:center;font-size:.8rem;padding:.45rem 1rem}
.sc-creator-feed .sc-hd{display:grid;grid-template-columns:1fr auto 1fr;background:var(--paper);border-bottom:1px solid var(--line);padding:.9rem 1.5rem}
.sc-creator-feed .sc-brand{grid-column:2;grid-row:1;font-weight:800;font-size:1.3rem;letter-spacing:-.02em}.sc-creator-feed .sc-nav{grid-column:1;grid-row:1}.sc-creator-feed .sc-tools{grid-column:3;grid-row:1;justify-self:end}
.sc-creator-feed .sc-btn{border-radius:999px;padding:.7rem 1.3rem}
.sc-creator-feed .sc-card{background:none}.sc-creator-feed .sc-card .sc-img{aspect-ratio:4/5;border-radius:1.2rem;background:var(--tint)}.sc-creator-feed .sc-meta{padding:.6rem .2rem}
.sc-creator-feed .cf-snip,.cf-snip{flex-basis:100%;font-size:.88rem;opacity:.85}
.cf-top{max-width:40rem;margin:0 auto;padding:2.5rem 1.2rem 1rem;text-align:center}.cf-kick{font-weight:700;color:var(--acc)}.cf-top h1{font-size:clamp(2.2rem,6vw,3.8rem);margin:.5rem 0 .8rem}.cf-top p:last-child{font-size:1.1rem}
.cf-stories{display:flex;gap:1rem;overflow-x:auto;padding:1rem 1.2rem;max-width:44rem;margin:0 auto;scrollbar-width:none}.cf-story{flex:0 0 auto;width:5rem;text-align:center;font-size:.75rem;font-weight:600}.cf-ring{display:block;width:4.4rem;height:4.4rem;border-radius:50%;overflow:hidden;border:2px solid var(--line);margin:0 auto .35rem;background:var(--tint)}
.cf-hero{max-width:34rem;margin:1rem auto;padding:0 1.2rem}.cf-hero figure{margin:0;position:relative;aspect-ratio:4/5;border-radius:1.6rem;overflow:hidden;background:var(--tint)}.cf-hero figcaption{position:absolute;inset:auto 0 0 0;padding:3.5rem 1.2rem 1.2rem;background:linear-gradient(transparent,rgba(20,14,10,.78));color:#fff;display:grid;gap:.8rem;justify-items:start}.cf-hero figcaption p{font:700 1.35rem/1.2 var(--disp)}
.cf-feed{max-width:34rem;margin:0 auto;padding:1.5rem 1.2rem 2rem;display:grid;gap:2.2rem}.cf-feed>h2{font-size:1.6rem}
.cf-post{margin:0}.cf-ph{display:block;aspect-ratio:4/5;border-radius:1.4rem;overflow:hidden;background:var(--tint)}.cf-ph img{transition:transform .9s cubic-bezier(.2,.7,.2,1)}a.cf-ph:hover img{transform:scale(1.03)}
.cf-cap{display:flex;flex-wrap:wrap;gap:.3rem .8rem;align-items:baseline;padding:.7rem .2rem;font-size:1rem}.cf-cap b{font-weight:700}.cf-pr{margin-left:auto;font-weight:700}.cf-more{font-weight:700;color:var(--acc);text-decoration:underline;text-underline-offset:3px}.cf-note-post .cf-cap p{font-size:1.1rem}
.cf-about,.cf-note{max-width:34rem;margin:0 auto;padding:1rem 1.2rem 3rem;display:grid;gap:1rem;justify-items:start}.cf-about h2{font-size:2rem}.cf-ch{font-size:1.1rem;margin:.6rem 0 0}.cf-links{display:flex;flex-wrap:wrap;gap:.5rem}.cf-links a{padding:.35rem .9rem;border:1.5px solid var(--ink);border-radius:999px;font-weight:600;font-size:.9rem}
.cf-pdp{display:grid;grid-template-columns:minmax(0,34rem) minmax(0,24rem);gap:2.5rem;justify-content:center;padding:1.5rem 1.2rem;align-items:start}
.cf-pfeed{display:grid;gap:1.4rem}.cf-pfeed .cf-ph{border-radius:1.4rem}
.cf-side{position:sticky;top:5rem;display:grid;gap:.9rem;background:#fff;border-radius:1.6rem;padding:1.4rem;border:1px solid var(--line)}.cf-side h1{font-size:clamp(1.7rem,3vw,2.3rem)}.cf-side h2{font-size:1rem;margin-top:.4rem}
.cf-price{font-size:1.4rem;font-weight:800}.cf-price del{font-size:1rem;opacity:.6;font-weight:500}.cf-stock{font-size:.8rem;font-weight:700;color:var(--acc);margin-left:.4rem}
.cf-know{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}.cf-know li{padding:.5rem 0;border-top:1px solid var(--line)}
.cf-mini{margin-left:auto}.sc-creator-feed .cf-mini button{flex:0 0 auto;border-radius:999px;padding:.55rem 1.1rem}
.sc-creator-feed .au-buy button{border-radius:999px;background:var(--acc);border:0;color:#fff;font-weight:700}.sc-creator-feed .au-buy input{border-radius:.8rem}
.cf-more-sec{grid-column:1/-1;padding-top:1rem}.cf-more-sec h2{font-size:1.5rem;margin-bottom:1rem}.cf-more-sec .sc-list{padding:0;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.cf-aboutp{display:grid;gap:1rem;padding:1.5rem 0 3rem}.cf-aboutp>.cf-post{max-width:34rem;margin:0 auto;padding:0 1.2rem;width:100%}.cf-note h1{font-size:clamp(2rem,5vw,3rem)}.cf-note p{font-size:1.1rem}
.sc-creator-feed .sc-chead{max-width:34rem;margin:0 auto;padding:2.2rem 1.2rem 1rem;text-align:center}.sc-creator-feed .sc-chips{justify-content:center}.sc-creator-feed .sc-chips a{border-radius:999px;font-weight:600}
.sc-creator-feed .sc-list{grid-template-columns:1fr;max-width:34rem;margin:0 auto;gap:2rem}
.sc-creator-feed .sc-sum,.sc-creator-feed .sc-form fieldset{background:#fff;border:1px solid var(--line);border-radius:1.4rem}
.sc-creator-feed .sc-ft{background:var(--ink);color:var(--paper)}
.sc-creator-feed .au-sticky-buy{border-radius:999px;margin:0 .7rem;border:1px solid var(--line)}.sc-creator-feed .au-sticky-buy button{border-radius:999px;background:var(--acc)}

/* ===== Proof & Detail: calm, precise, details-led ===== */
.sc-proof-detail{--ink:#17222d;--acc:#2c4a6b;--tint:#e8eef4;--line:#cdd7e0;--paper:#f6f8fa;--hw:600;--rv:sc-fade;--dur:.6s;--pg:sc-fade}
.sc-proof-detail h1,.sc-proof-detail h2{letter-spacing:-.015em;line-height:1.12}
.sc-proof-detail .sc-announce{background:var(--tint);color:var(--ink);text-align:center;font-size:.78rem;padding:.4rem 1rem}
.sc-proof-detail .sc-hd{background:var(--paper);border-bottom:1px solid var(--line)}.sc-proof-detail .sc-brand{font-weight:700;font-size:1.15rem}
.sc-proof-detail .sc-btn{border-radius:.5rem}.sc-proof-detail .sc-btn.ghost{background:#fff}
.sc-proof-detail .sc-card{background:none}
.pd-hero{display:grid;grid-template-columns:1fr 1fr;gap:3rem;padding:3rem 1.5rem 2rem;align-items:center}.pd-kick{color:var(--acc);font-weight:700;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase}
.pd-hero h1{font-size:clamp(2.2rem,5vw,4rem);margin:.6rem 0 1rem}.pd-lede{font-size:1.15rem;max-width:34rem}.pd-actions{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.4rem}
.pd-hero-img{margin:0;aspect-ratio:1;border:1px solid var(--line);border-radius:.8rem;overflow:hidden;background:#fff;padding:.6rem}.pd-hero-img img{border-radius:.4rem}
.pd-statement{max-width:44rem;margin:0 auto;padding:1rem 1.5rem 2rem;font:600 1.5rem/1.3 var(--disp);color:var(--acc)}
.pd-how{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:0 1.5rem 2rem}.pd-how article{background:#fff;border:1px solid var(--line);border-radius:.8rem;padding:1.2rem}.pd-how h3{margin:0 0 .4rem;font-size:1rem}.pd-how p{font-size:.95rem;opacity:.85}
.pd-range,.pd-cols{padding:1rem 1.5rem 2rem}.pd-range h2,.pd-cols h2,.pd-rel h2{font-size:clamp(1.6rem,3vw,2.2rem);margin-bottom:1rem}
.sc-proof-detail .sc-list,.sc-proof-detail .pd-rows{display:block;padding:0 1.5rem 3rem;border-top:1px solid var(--line)}.pd-range .pd-rows{padding:0}
.sc-proof-detail .sc-card{display:grid;grid-template-columns:5.5rem minmax(0,1fr);gap:0 1rem;align-items:center;padding:.9rem 0;border-bottom:1px solid var(--line)}
.sc-proof-detail .sc-card .sc-img{aspect-ratio:1;border-radius:.4rem;border:1px solid var(--line);background:#fff}.sc-proof-detail .sc-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;padding:0;gap:.2rem 1rem}.sc-proof-detail .sc-n{display:none}.sc-proof-detail .sc-meta b{font-weight:600}
.pd-snip{grid-column:1/-1;font-size:.88rem;opacity:.8}
.pd-cols ol{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.pd-cols a{display:grid;grid-template-columns:2.4rem minmax(0,1fr) 5rem;gap:1rem;align-items:center;padding:.9rem 0;border-bottom:1px solid var(--line)}.pd-n{opacity:.55;font-variant-numeric:tabular-nums}.pd-ct{display:grid}.pd-ct small{opacity:.75}.pd-cimg{aspect-ratio:1;border-radius:.4rem;overflow:hidden;border:1px solid var(--line)}
.pd-note{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;padding:2rem 1.5rem;align-items:center}.pd-note-img{aspect-ratio:1;border:1px solid var(--line);border-radius:.8rem;overflow:hidden}.pd-note h2{font-size:clamp(1.6rem,3vw,2.2rem);margin-bottom:.8rem}.pd-note p{margin-bottom:1.2rem;max-width:34rem}
.pd-pdp{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:2.5rem;padding:1.5rem;align-items:start}
.pd-gal{display:grid;gap:.8rem}.pd-main{aspect-ratio:1;border:1px solid var(--line);border-radius:.8rem;overflow:hidden;background:#fff}.pd-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}.pd-thumbs div{aspect-ratio:1;border:1px solid var(--line);border-radius:.5rem;overflow:hidden;background:#fff}
.pd-buy{position:sticky;top:5rem;background:#fff;border:1px solid var(--line);border-radius:.9rem;padding:1.4rem;display:grid;gap:.9rem}.pd-buy h1{font-size:clamp(1.7rem,3vw,2.4rem)}.pd-price{font-size:1.5rem;font-weight:700}.pd-price del{font-size:1rem;opacity:.6;font-weight:400}.pd-av{font-size:.9rem;font-weight:600;color:var(--acc)}
.sc-proof-detail .au-buy button{border-radius:.5rem;background:var(--acc);border:0;color:#fff;font-weight:600}.sc-proof-detail .au-buy input{border-radius:.4rem}
.pd-sec{padding:0 1.5rem;margin:0 auto 1rem;max-width:58rem}.pd-sec details{border:1px solid var(--line);border-radius:.8rem;background:#fff;padding:1rem 1.2rem;margin-bottom:.8rem}.pd-sec summary{font-weight:700;cursor:pointer}.pd-sec details>p{margin-top:.7rem}
.pd-spec{display:grid;grid-template-columns:minmax(7rem,.4fr) 1fr;margin:.8rem 0 0}.pd-spec dt,.pd-spec dd{padding:.55rem 0;border-top:1px solid var(--line);margin:0}.pd-spec dt{opacity:.7}
.pd-rel{padding:1rem 1.5rem 2rem}.pd-rel .pd-rows{padding:0}
.pd-about{padding:2.5rem 1.5rem}.pd-about h1{font-size:clamp(2rem,5vw,3.4rem);margin:.5rem 0 2rem}.pd-about-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:3rem;align-items:start}.pd-about-img{aspect-ratio:1;border:1px solid var(--line);border-radius:.8rem;overflow:hidden;position:sticky;top:5rem}.pd-about-copy section{border-top:1px solid var(--line);padding:1rem 0 1.4rem}.pd-about-copy h2{font-size:1.1rem;margin-bottom:.5rem;color:var(--acc)}
.sc-proof-detail .sc-chead{padding:2.5rem 1.5rem 1rem}.sc-proof-detail .sc-chips a{border-radius:.5rem}
.sc-proof-detail .sc-sum,.sc-proof-detail .sc-form fieldset{background:#fff;border:1px solid var(--line);border-radius:.8rem}
.sc-proof-detail .sc-ft{background:var(--tint)}
.sc-proof-detail .au-sticky-buy{border-top:1px solid var(--line)}.sc-proof-detail .au-sticky-buy button{border-radius:.5rem;background:var(--acc)}

body[data-page=checkout] .sc-tabbar,.sc-p-checkout .au-sticky-buy{display:none}
@media (prefers-reduced-motion:reduce){.sc-social-pop .sc-card,.sp-col,.sc-social-pop .sc-btn,.cf-ph img{transition:none}.sp-hero-media,.sp-band{transform:none}}

@media (max-width:760px){
.sc-social-pop,.sc-creator-feed{padding-bottom:4.5rem}
.sp-hero,.sp-moment,.sp-about,.pd-hero,.pd-note,.pd-about-grid{grid-template-columns:1fr}.sp-hero{padding-top:.5rem}.sp-hero-media{transform:none}.sp-band{transform:none}
.sp-pdp,.pd-pdp{grid-template-columns:1fr;padding:.8rem}
.sp-reel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:.8rem;margin:0 -.8rem;padding:0 .8rem .8rem;scroll-padding:.8rem}.sp-shot{flex:0 0 84%;scroll-snap-align:center}.sp-shot:first-child{flex-basis:84%}
.sp-panel,.pd-buy,.cf-side{position:static}
.sp-grid{grid-template-columns:1fr 1fr;gap:.9rem}.sp-chip{display:none}.sp-sticker{font-size:.8rem}.sp-picks,.sp-cols{padding-inline:1rem}
.sc-social-pop .sc-list{grid-template-columns:1fr 1fr;gap:.9rem}
.cf-pdp{display:flex;flex-direction:column;gap:1rem;padding:0 0 1rem}.cf-pfeed{display:contents}.cf-pdp>.cf-pfeed>.cf-post{order:3}.cf-pdp>.cf-pfeed>.cf-post:first-child{order:1}.cf-side{order:2;margin:0 .8rem}.cf-more-sec{order:4;padding:0 .8rem}.cf-pfeed .cf-ph{border-radius:0}.cf-pdp .cf-cap{padding:.6rem 1rem}
.cf-hero,.cf-feed,.cf-top{padding-inline:.8rem}
.sc-creator-feed .sc-hd{grid-template-columns:auto 1fr auto}.sc-creator-feed .sc-burger{grid-column:1;grid-row:1}.sc-creator-feed .sc-brand{text-align:center}
.pd-how{grid-template-columns:1fr;padding-inline:1rem}.pd-hero{padding:1.5rem 1rem}.pd-range,.pd-cols,.pd-rel{padding-inline:1rem}.sc-proof-detail .sc-list{padding-inline:1rem}
.pd-sec{padding-inline:1rem}.pd-spec{grid-template-columns:1fr 1.4fr}.pd-about-img{position:static}.pd-cols a{grid-template-columns:2rem minmax(0,1fr) 4rem}
.sc-social-pop .au-sticky-buy,.sc-creator-feed .au-sticky-buy{bottom:4.2rem}
}
@media (max-width:420px){.sp-grid,.sc-social-pop .sc-list{grid-template-columns:1fr 1fr;gap:.7rem}.sp-hero h1{font-size:clamp(2.2rem,13vw,3rem)}.sc-social-pop .sc-hd{margin:.5rem}.sc-social-pop .sc-meta{padding:.6rem .7rem .8rem}}
`;
