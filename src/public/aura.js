import { contrastColor } from "./validation.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const slug = (value) => String(value ?? "").replace(/[^a-z0-9-]/gi, "");
const safeImage = (url) => /^https:\/\/media\.lebrands\.store\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|svg|webp)$/i.test(String(url || ""))
  ? String(url)
  : "";
const money = (paise) => `₹${(Math.max(0, Number(paise) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const policyKinds = ["privacy", "terms", "shipping", "cancellation-refund", "contact", "pricing"];
const policyTitle = (kind) => ({
  privacy: "Privacy",
  terms: "Terms & Conditions",
  shipping: "Shipping",
  "cancellation-refund": "Cancellation & Refund",
  contact: "Contact",
  pricing: "Pricing",
})[kind] || "Policy";
const pageUrl = (name) => ({
  home: "/",
  collection: "/collections/all",
  about: "/pages/about",
  contact: "/pages/contact",
})[name] || "/";

function imageMarkup(image, label, extra = "") {
  const url = safeImage(image?.url);
  return url
    ? `<img ${extra} src="${esc(url)}" alt="${esc(image?.alt || label)}">`
    : `<div class="aura-placeholder ${extra ? "aura-placeholder-large" : ""}" role="img" aria-label="${esc(label)}"><span>${esc((label || "A").slice(0, 1).toUpperCase())}</span></div>`;
}

function productCard(product) {
  return `<a class="aura-product" href="/products/${encodeURIComponent(product.id || "")}">
    ${imageMarkup(product.images?.[0], product.title || "Product image")}
    <span class="aura-product-name">${esc(product.title || "Untitled product")}</span>
    <span class="aura-price">${money(product.price_paise)}</span>
  </a>`;
}

function accentTextColor(hex, background = "#f8f6ef") {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const paper = [1, 3, 5].map((index) => parseInt(background.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const paperLuminance = paper[0] * 0.2126 + paper[1] * 0.7152 + paper[2] * 0.0722;
  const contrast = (Math.max(luminance, paperLuminance) + 0.05) / (Math.min(luminance, paperLuminance) + 0.05);
  return contrast >= 4.5 ? hex : "#526b53";
}

export function escapeHtml(value) {
  return esc(value);
}
export function renderDescription(value) {
  // Small, safe rich-text subset: bold, italic and unordered lists. Escape
  // first; never interpret user HTML, URLs, attributes or executable markup.
  const lines = esc(value).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>").split("\n");
  let list = false;
  let html = "";
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!list) html += "<ul>";
      list = true;
      html += `<li>${line.replace(/^\s*-\s+/, "")}</li>`;
    } else {
      if (list) html += "</ul>";
      list = false;
      html += `${line}<br>`;
    }
  }
  return html + (list ? "</ul>" : "");
}

export function renderAura(data = {}, options = {}) {
  const settings = data.settings || {};
  const store = data.store || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const page = options.page || "home";
  const brand = settings.brand_name || store.name || "Your brand";
  const tagline = settings.tagline || "Made with care. Chosen with purpose.";
  const description = settings.description || "A thoughtful collection, made for the everyday.";
  const subdomain = slug(settings.subdomain || store.subdomain);
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accent_color || "") ? settings.accent_color : "#526b53";
  const accentInk = contrastColor(accent) || "#ffffff";
  const accentLabel = accentTextColor(accent);
  const fonts = {
    serif: {
      display: '"Fraunces", Georgia, "Times New Roman", serif',
      body: '"DM Sans", "Avenir Next", system-ui, sans-serif',
    },
    modern: {
      display: '"DM Sans", "Avenir Next", system-ui, sans-serif',
      body: '"DM Sans", "Avenir Next", system-ui, sans-serif',
    },
    classic: {
      display: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      body: 'Georgia, "Times New Roman", serif',
    },
  };
  const font = fonts[settings.font_preset] || fonts.serif;
  const radius = settings.button_style === "pill" ? "999px" : settings.button_style === "square" ? "2px" : "6px";
  const product = products.find((item) => String(item.id) === String(options.productId)) || products[0];
  const title = page === "home" ? brand
    : page === "collection" ? `Shop all · ${brand}`
      : page === "about" ? `Our story · ${brand}`
        : page === "contact" ? `Contact · ${brand}`
          : page === "policy" ? `${policyTitle(options.policyKind)} · ${brand}`
            : page === "404" ? `Page not found · ${brand}`
              : page === "product" ? `${product?.title || "Product"} · ${brand}`
                : brand;
  const descriptionText = String(description).replace(/\s+/g, " ").slice(0, 155);
  const canonicalPath = page === "collection" ? "/collections/all"
    : page === "product" ? `/products/${encodeURIComponent(product?.id || "")}`
      : page === "about" ? "/pages/about"
        : page === "contact" ? "/pages/contact"
          : page === "policy" ? `/policies/${slug(options.policyKind)}`
            : "/";
  const canonicalUrl = subdomain ? `https://${subdomain}.lebrands.store${canonicalPath}` : "";
  const logoUrl = safeImage(settings.logo_url);
  const navigation = `<a href="${pageUrl("home")}">Home</a>
    <a href="${pageUrl("collection")}">Collection</a>
    <a href="${pageUrl("about")}">About</a>
    <a href="${pageUrl("contact")}">Contact</a>`;
  const footerLinks = `<a href="${pageUrl("collection")}">Collection</a>
    <a href="${pageUrl("about")}">About</a>
    <a href="${pageUrl("contact")}">Contact</a>
    ${policyKinds.map((kind) => `<a href="/policies/${kind}">${policyTitle(kind)}</a>`).join("")}`;
  const header = `<header class="aura-header">
    <a class="aura-brand" href="/" aria-label="${esc(brand)} home">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(brand)}">` : `<span class="aura-wordmark">${esc(brand)}</span>`}
    </a>
    <nav aria-label="Main navigation">${navigation}</nav>
    <a class="aura-shop-link" href="/collections/all">Shop</a>
  </header>`;
  const footer = `<footer class="aura-footer">
    <div class="aura-footer-brand">
      <a class="aura-wordmark" href="/">${esc(brand)}</a>
      <p>${esc(tagline)}</p>
    </div>
    <nav aria-label="Store links and policies">${footerLinks}</nav>
    <small>Made for a more considered everyday.</small>
  </footer>`;

  let content = "";
  if (page === "home") {
    const spotlight = products.length <= 2;
    const featured = products.slice(0, spotlight ? 1 : 3);
    const heroLogo = logoUrl
      ? `<img class="aura-hero-logo" src="${esc(logoUrl)}" alt="${esc(brand)}">`
      : "";
    content = `<main>
      <section class="aura-hero ${spotlight ? "aura-hero-spotlight" : ""}">
        <div class="aura-hero-copy">
          ${heroLogo}
          <span class="aura-kicker">${esc(settings.category || "Independent label")}</span>
          <h1>${esc(tagline)}</h1>
          <p>${esc(description)}</p>
          <a class="aura-button" href="/collections/all">Explore the collection</a>
        </div>
        <div class="aura-hero-art">
          ${product?.images?.[0]
            ? imageMarkup(product.images[0], product.title || brand)
            : `<div class="aura-art-shape"><span>${esc(brand.slice(0, 1))}</span></div>`}
          ${spotlight && product ? `<div class="aura-spotlight-label">
            <small>The edit</small>
            <strong>${esc(product.title || "A considered favourite")}</strong>
            <span>${money(product.price_paise)}</span>
          </div>` : ""}
        </div>
      </section>
      ${featured.length ? `<section class="aura-section">
        <div class="aura-section-head">
          <div><span class="aura-kicker">${spotlight ? "A closer look" : "Selected for you"}</span><h2>${spotlight ? "A little something special" : "The collection"}</h2></div>
          <a href="/collections/all">View all</a>
        </div>
        <div class="aura-products">${featured.map(productCard).join("")}</div>
      </section>` : ""}
      <section class="aura-story">
        <span class="aura-kicker">A note from the studio</span>
        <h2>Good things take thought.</h2>
        <p>${esc(description)}</p>
        <a href="/pages/about">Get to know us</a>
      </section>
    </main>`;
  } else if (page === "collection") {
    content = `<main class="aura-page">
      <span class="aura-kicker">Made to be kept</span>
      <h1>The collection</h1>
      <p>${esc(description)}</p>
      ${products.length
        ? `<div class="aura-products aura-collection">${products.map(productCard).join("")}</div>`
        : `<div class="aura-empty">
          <div class="aura-art-shape"><span>${esc(brand.slice(0, 1))}</span></div>
          <h2>A collection is taking shape.</h2>
          <p>Check back soon for the first pieces from ${esc(brand)}.</p>
        </div>`}
    </main>`;
  } else if (page === "product") {
    content = product ? `<main class="aura-product-page">
      <div class="aura-gallery">
        ${(product.images || []).map((image, index) => imageMarkup(image, product.title || "Product image", `data-gallery-image="${index}"`)).join("") || imageMarkup(null, product.title)}
      </div>
      <section class="aura-detail">
        <span class="aura-kicker">${esc(settings.category || "From the studio")}</span>
        <h1>${esc(product.title || "Untitled product")}</h1>
        <div class="aura-price-line">
          <strong>${money(product.price_paise)}</strong>
          ${product.compare_at_paise ? `<del>${money(product.compare_at_paise)}</del>` : ""}
        </div>
        <div class="aura-description">${renderDescription(product.description || "Details coming soon.")}</div>
        <button class="aura-button" disabled aria-disabled="true">Add to cart · Checkout opening soon</button>
        <small>Thoughtfully made, ready to be yours.</small>
      </section>
    </main>` : `<main class="aura-page">
      <span class="aura-kicker">The collection</span>
      <h1>There are no products yet.</h1>
      <p>Visit again when the first piece is ready.</p>
      <a class="aura-button" href="/collections/all">Back to the collection</a>
    </main>`;
  } else if (page === "about") {
    content = `<main class="aura-page aura-about">
      <span class="aura-kicker">The people behind it</span>
      <h1>${esc(brand)}, by design.</h1>
      <p class="aura-about-lead">${esc(tagline)}</p>
      <div class="aura-story-block">
        <div class="aura-art-shape"><span>${esc(brand.slice(0, 1))}</span></div>
        <div><h2>Made with care. Shared with purpose.</h2><p>${esc(description)}</p></div>
      </div>
    </main>`;
  } else if (page === "contact") {
    content = `<main class="aura-page aura-contact">
      <span class="aura-kicker">We'd love to hear from you</span>
      <h1>Say hello.</h1>
      <p>For questions about an order or the collection, get in touch with our studio.</p>
      <div class="aura-contact-details">
        ${settings.support_email ? `<a href="mailto:${esc(settings.support_email)}">${esc(settings.support_email)}</a>` : ""}
        ${settings.support_phone ? `<a href="tel:${esc(String(settings.support_phone).replace(/[^\d+]/g, ""))}">${esc(settings.support_phone)}</a>` : ""}
        ${settings.address ? `<p>${esc(settings.address).replace(/\n/g, "<br>")}</p>` : ""}
      </div>
    </main>`;
  } else if (page === "policy") {
    const policy = (data.policies || []).find((item) => item.kind === options.policyKind);
    content = `<main class="aura-page aura-policy">
      <span class="aura-kicker">${esc(brand)}</span>
      <h1>${esc(policy?.title || policyTitle(options.policyKind))}</h1>
      ${policy?.body
        ? `<div class="aura-policy-body">${esc(policy.body).replace(/\n/g, "<br>")}</div>`
        : `<p>This policy is being prepared by ${esc(brand)}. Please contact us if you have a question.</p>`}
    </main>`;
  } else {
    content = `<main class="aura-page aura-404">
      <span class="aura-kicker">A little detour</span>
      <h1>This page isn't here.</h1>
      <p>Let's take you somewhere that is.</p>
      <a class="aura-button" href="/">Return home</a>
    </main>`;
  }

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${esc(title)}</title>
      <meta name="description" content="${esc(descriptionText)}">
      <meta name="theme-color" content="${esc(accent)}">
      ${page === "404" || options.preview ? '<meta name="robots" content="noindex, nofollow">' : ""}
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="${esc(brand)}">
      <meta property="og:title" content="${esc(title)}">
      <meta property="og:description" content="${esc(descriptionText)}">
      ${canonicalUrl ? `<link rel="canonical" href="${esc(canonicalUrl)}"><meta property="og:url" content="${esc(canonicalUrl)}">` : ""}
      <style>
        @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap");
        :root {
          --accent: ${accent};
          --accent-ink: ${accentInk};
          --accent-label: ${accentLabel};
          --ink: #293b32;
          --muted: #727b70;
          --paper: #f8f6ef;
          --line: #e1e2d9;
          --serif: ${font.display};
          --sans: ${font.body};
          --radius: ${radius};
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.65 var(--sans); }
        a { color: inherit; text-decoration: none; }
        a:hover { text-decoration: underline; text-underline-offset: 4px; }
        .aura-header {
          height: 78px; max-width: 1280px; margin: auto; padding: 0 5vw;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--line);
        }
        .aura-brand { display: flex; align-items: center; min-width: 100px; }
        .aura-brand img { width: auto; max-width: 132px; height: 39px; object-fit: contain; }
        .aura-wordmark { font: 500 20px var(--serif); letter-spacing: -.04em; }
        .aura-header nav { display: flex; gap: 28px; }
        .aura-header nav a, .aura-shop-link { font-size: 11px; }
        .aura-shop-link {
          padding: 8px 14px; border: 1px solid var(--line); border-radius: var(--radius);
        }
        .aura-hero {
          min-height: 590px; max-width: 1280px; margin: auto; padding: 65px 8vw 74px;
          display: grid; grid-template-columns: .88fr 1.12fr; align-items: center; gap: 8vw;
        }
        .aura-hero-copy { max-width: 455px; }
        .aura-hero-logo { display: block; width: auto; max-width: 138px; height: 44px; object-fit: contain; object-position: left center; margin: 0 0 28px; }
        .aura-kicker { color: var(--accent-label); font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
        h1, h2 { font-family: var(--serif); font-weight: 400; letter-spacing: -.045em; line-height: 1.05; }
        .aura-hero h1 { margin: 20px 0; font-size: clamp(46px, 6vw, 76px); }
        .aura-hero-copy p, .aura-page > p { max-width: 420px; color: var(--muted); }
        .aura-button {
          display: inline-flex; min-height: 45px; align-items: center; justify-content: center;
          margin-top: 19px; padding: 0 19px; border: 0; border-radius: var(--radius);
          background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700;
        }
        .aura-button[disabled] { cursor: not-allowed; opacity: .75; }
        .aura-hero-art {
          position: relative; height: 420px; display: grid; place-items: center;
          overflow: hidden; background: #e9e6da;
        }
        .aura-hero-art > img { width: 100%; height: 100%; object-fit: cover; }
        .aura-art-shape {
          position: relative; width: 72%; height: 83%; display: grid; place-items: center;
          background: linear-gradient(145deg, #d9dfd1, #eeeadc 60%, #d9c8aa);
        }
        .aura-art-shape::before, .aura-art-shape::after {
          position: absolute; width: 64%; height: 64%; border: 1px solid rgba(74, 93, 68, .25);
          border-radius: 50%; content: "";
        }
        .aura-art-shape::after { width: 44%; height: 44%; }
        .aura-art-shape span { color: var(--accent); font: 400 clamp(60px, 9vw, 118px) var(--serif); opacity: .76; }
        .aura-spotlight-label {
          position: absolute; bottom: 20px; left: 20px; min-width: 165px; padding: 12px 16px;
          display: grid; gap: 2px; background: var(--paper);
        }
        .aura-spotlight-label small { color: var(--muted); font-size: 8px; letter-spacing: .14em; text-transform: uppercase; }
        .aura-spotlight-label strong { font: 500 16px var(--serif); }
        .aura-spotlight-label span { font-size: 11px; }
        .aura-placeholder {
          height: 260px; display: grid; place-items: center; background: linear-gradient(140deg, #e9e6da, #d8e0d3);
          color: var(--accent); font: 400 60px var(--serif);
        }
        .aura-placeholder-large { min-height: 420px; height: 100%; }
        .aura-section { max-width: 1280px; margin: auto; padding: 65px 8vw 90px; }
        .aura-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 27px; }
        .aura-section-head h2 { margin: 9px 0 0; font-size: 37px; }
        .aura-section-head > a { font-size: 11px; }
        .aura-products { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
        .aura-product { display: grid; gap: 7px; }
        .aura-product img, .aura-product .aura-placeholder { width: 100%; height: 300px; display: block; object-fit: cover; background: #e9e6da; }
        .aura-product-name { font: 500 17px var(--serif); }
        .aura-price { color: var(--muted); font-size: 12px; }
        .aura-story { padding: 90px 22px; background: #eeeee5; text-align: center; }
        .aura-story .aura-kicker { display: block; }
        .aura-story h2 { margin: 17px 0; font-size: clamp(36px, 5vw, 56px); }
        .aura-story p { max-width: 520px; margin: 0 auto; color: var(--muted); }
        .aura-story > a { display: inline-block; margin-top: 18px; font-size: 11px; font-weight: 700; }
        .aura-footer {
          max-width: 1280px; margin: auto; padding: 45px 8vw; display: grid;
          grid-template-columns: 1fr auto; align-items: start; gap: 26px; border-top: 1px solid var(--line);
        }
        .aura-footer p, .aura-footer small { color: var(--muted); font-size: 10px; }
        .aura-footer nav { max-width: 460px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 14px; }
        .aura-footer nav a { font-size: 10px; }
        .aura-footer small { grid-column: 1 / -1; }
        .aura-page { max-width: 1100px; min-height: 63vh; margin: auto; padding: 100px 8vw; }
        .aura-page > h1 { margin: 15px 0; font-size: clamp(48px, 7vw, 76px); }
        .aura-collection { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 50px; }
        .aura-empty { max-width: 510px; margin: 55px auto; text-align: center; }
        .aura-empty .aura-art-shape { height: 230px; margin: auto; }
        .aura-empty h2 { font-size: 30px; }
        .aura-empty p { color: var(--muted); }
        .aura-product-page {
          max-width: 1200px; margin: auto; padding: 65px 7vw 90px; display: grid;
          grid-template-columns: 1.1fr .9fr; align-items: center; gap: 8vw;
        }
        .aura-gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .aura-gallery img, .aura-gallery .aura-placeholder { width: 100%; height: 300px; object-fit: cover; background: #e9e6da; }
        .aura-gallery img:first-child { grid-column: 1 / -1; height: 480px; }
        .aura-detail { max-width: 430px; }
        .aura-detail h1 { margin: 14px 0; font-size: clamp(42px, 5vw, 64px); }
        .aura-price-line { display: flex; align-items: center; gap: 12px; font-size: 17px; }
        .aura-price-line del { color: var(--muted); font-size: 13px; }
        .aura-detail > p, .aura-description { color: var(--muted); }
        .aura-detail > small { display: block; margin-top: 15px; color: var(--muted); font-size: 10px; }
        .aura-about-lead { color: var(--accent-label) !important; font: 400 26px var(--serif); }
        .aura-story-block { margin-top: 58px; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 9vw; }
        .aura-story-block .aura-art-shape { width: 100%; height: 330px; }
        .aura-story-block h2 { font-size: 37px; }
        .aura-story-block p, .aura-contact > p { color: var(--muted); }
        .aura-contact-details { margin-top: 30px; display: grid; gap: 9px; }
        .aura-contact-details a { font-size: 17px; }
        .aura-contact-details p { color: var(--muted); }
        .aura-policy-body { max-width: 720px; margin-top: 35px; color: #58665c; line-height: 1.8; }
        .aura-404 { min-height: 70vh; }
        .aura-404 h1 { max-width: 700px; font-size: clamp(55px, 9vw, 96px); }
        @media (max-width: 680px) {
          .aura-header { height: 66px; padding: 0 18px; }
          .aura-header nav { gap: 13px; }
          .aura-header nav a { font-size: 9px; }
          .aura-header nav a:nth-child(3), .aura-header nav a:nth-child(4) { display: none; }
          .aura-shop-link { padding: 7px 10px; }
          .aura-hero { min-height: 0; padding: 44px 22px 50px; grid-template-columns: 1fr; gap: 27px; }
          .aura-hero h1 { font-size: 50px; }
          .aura-hero-art { height: 340px; }
          .aura-section { padding: 54px 22px; }
          .aura-section-head h2 { font-size: 30px; }
          .aura-products, .aura-collection { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 17px 12px; }
          .aura-product img, .aura-product .aura-placeholder { height: 210px; }
          .aura-footer { padding: 34px 22px; grid-template-columns: 1fr; }
          .aura-footer nav { justify-content: flex-start; }
          .aura-page { min-height: 62vh; padding: 69px 23px; }
          .aura-page > h1 { font-size: 53px; }
          .aura-product-page { padding: 30px 20px 65px; grid-template-columns: 1fr; gap: 28px; }
          .aura-gallery { gap: 8px; }
          .aura-gallery img, .aura-gallery .aura-placeholder { height: 190px; }
          .aura-gallery img:first-child { height: 330px; }
          .aura-detail h1 { font-size: 48px; }
          .aura-story-block { grid-template-columns: 1fr; gap: 24px; }
          .aura-story-block .aura-art-shape { height: 250px; }
          .aura-placeholder-large { min-height: 320px; }
          .aura-story { padding: 67px 22px; }
        }
      </style>
    </head>
    <body>${header}${content}${footer}</body>
  </html>`;
}
