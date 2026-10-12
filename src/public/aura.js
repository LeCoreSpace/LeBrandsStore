import { contrastColor } from "./validation.js";
import { renderSection, safeImage, policyTitle, imageSourceSet, HERO_IMAGE_SIZES } from "./aura-sections.js";
import { getPageKey, defaultPageLayouts } from "./aura-layout.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const slug = (value) => String(value ?? "").replace(/[^a-z0-9-]/gi, "");
function accentTextColor(hex, backgrounds = ["#f8f6ef"]) {
  const lum = (h) => { const l = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722; };
  const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  return [].concat(backgrounds).every((bg) => ratio(lum(hex), lum(bg)) >= 4.5) ? hex : "";
}
function _unusedAccent(hex, background = "#f8f6ef") {
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

const PRESETS = ["ivory", "stone", "midnight", "white"];
const PRESET_ALIAS = { porcelain: "ivory", sand: "ivory", ink: "midnight" };
const policyName = policyTitle;
export function renderAura(data = {}, options = {}) {
  const settings = data.settings || {};
  const store = data.store || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const page = options.page || "home";
  const brand = settings.brand_name || store.name || "Your brand";
  const description = settings.description || "";
  const subdomain = slug(settings.subdomain || store.subdomain);
  const rawPreset = PRESET_ALIAS[settings.color_preset] || settings.color_preset;
  const preset = PRESETS.includes(rawPreset) ? rawPreset : "ivory";
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accent_color || "") ? settings.accent_color : "#3d4a43";
  const accentInk = contrastColor(accent) || "#ffffff";
  const paper = { ivory: "#f6f0e6", stone: "#e9e8e4", midnight: "#12151d", white: "#ffffff" }[preset];
  const surface = { ivory: "#ebe3d4", stone: "#dddcd6", midnight: "#1b2030", white: "#f3f3f1" }[preset];
  let accentLabel = accentTextColor(accent, [paper, surface]) || "";
  if (!accentLabel) accentLabel = preset === "midnight" ? "#eeeef2" : "#2f3a34";
  const fonts = {
    serif: { display: '"Aura Editorial", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif' },
    modern: { display: '"Instrument Sans", system-ui, sans-serif', body: '"Instrument Sans", system-ui, sans-serif' },
    classic: { display: '"Aura Classic", Georgia, serif', body: '"Instrument Sans", system-ui, sans-serif' },
  };
  const font = fonts[settings.font_preset] || fonts.serif;
  const radius = settings.button_style === "pill" ? "999px" : settings.button_style === "square" ? "2px" : "6px";
  const product = products.find((i) => String(i.id) === String(options.productId)) || (page === "product" ? undefined : products[0]);
  const prodForPage = page === "product" ? (products.find((i) => String(i.id) === String(options.productId)) || products[0]) : product;
  const commercePage = options.commerce && ["cart", "checkout", "track", "confirmation"].includes(page);
  const title = page === "home" ? brand : page === "collection" ? `Shop all · ${brand}` : page === "about" ? `Our story · ${brand}`
    : page === "contact" ? `Contact · ${brand}` : page === "policy" ? `${policyName(options.policyKind)} · ${brand}`
      : page === "404" ? `Page not found · ${brand}` : page === "product" ? `${prodForPage?.title || "Product"} · ${brand}`
        : page === "cart" ? `Your bag · ${brand}` : page === "checkout" ? `Checkout · ${brand}` : page === "track" ? `Track your order · ${brand}`
          : page === "confirmation" ? `Order confirmed · ${brand}` : brand;
  const descriptionText = String(description).replace(/\s+/g, " ").slice(0, 155);
  const canonicalPath = page === "collection" ? "/collections/all" : page === "product" ? `/products/${encodeURIComponent(prodForPage?.id || "")}`
    : page === "about" ? "/pages/about" : page === "contact" ? "/pages/contact" : page === "policy" ? `/policies/${slug(options.policyKind)}` : "/";
  const canonicalUrl = subdomain && !commercePage ? `https://${subdomain}.lebrands.store${canonicalPath}` : "";
  const logoUrl = safeImage(settings.logo_url);
  const pageKey = getPageKey({ ...options, page });
  const layouts = data.layouts && typeof data.layouts === "object" ? data.layouts : defaultPageLayouts(data);
  const sections = Array.isArray(layouts[pageKey]) ? layouts[pageKey] : [];
  const hero = sections.find(section=>section.type==="hero"&&section.settings?.enabled!==false);
  const heroImage = hero?.settings?.variant==="video"?hero.settings.poster:hero?.settings?.image;
  const heroResource = imageSourceSet(heroImage);
  const heroSizes = hero?.settings?.variant==="fullbleed"||hero?.settings?.variant==="video"?"100vw":HERO_IMAGE_SIZES;
  const heroPreload = heroResource.url ? `<link rel="preload" as="image" href="${esc(heroResource.url)}"${heroResource.srcset?` imagesrcset="${esc(heroResource.srcset)}" imagesizes="${esc(heroSizes)}"`:""} fetchpriority="high">` : "";
  const ctx = { data, options: { ...options, page }, settings, brand, products, product: prodForPage, logoUrl, renderDescription };
  const out = [];
  let mainOpen = false;
  for (const section of sections) {
    const html = renderSection(section, ctx);
    if (!html) continue;
    const framing = ["header", "footer", "announcement"].includes(section.type) || section.type === "commerce";
    if (!framing && !mainOpen) { out.push("<main>"); mainOpen = true; }
    if (framing && mainOpen) { out.push("</main>"); mainOpen = false; }
    out.push(html);
  }
  if (mainOpen) out.push("</main>");
  const body = out.join("");
  const noindex = page === "404" || options.preview || commercePage;
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${heroPreload}
      <title>${esc(title)}</title>
      <meta name="description" content="${esc(descriptionText)}">
      <meta name="theme-color" content="${esc(paper)}">
      ${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="${esc(brand)}">
      <meta property="og:title" content="${esc(title)}">
      <meta property="og:description" content="${esc(descriptionText)}">
      ${canonicalUrl ? `<link rel="canonical" href="${esc(canonicalUrl)}"><meta property="og:url" content="${esc(canonicalUrl)}">` : ""}
      <link rel="preload" href="/assets/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
      <link rel="stylesheet" href="/assets/aura.css">
      <style>:root{--accent:${accent};--accent-ink:${accentInk};--accent-label:${accentLabel};--display:${font.display};--body:${font.body};--radius:${radius}}</style>
      ${options.commerce ? `<link rel="stylesheet" href="/assets/commerce.css">` : ""}
    </head>
    <body data-aura data-preset="${preset}" data-font="${esc(fonts[settings.font_preset] ? settings.font_preset : "serif")}">${body}${options.commerce && !commercePage ? `<template data-commerce-config data-store-key="${esc(store.store_id || options.storeKey || "")}" data-site-key="${esc(options.siteKey || "")}" data-page="${esc(page)}" data-read-only="${options.readOnly === true ? "true" : "false"}"></template>` : ""}<script type="module" src="/assets/aura-ui.js"></script>${options.commerce ? '<div id="commerce-mount"></div><script type="module" src="/assets/commerce.js"></script>' : ""}</body>
  </html>`;
}
