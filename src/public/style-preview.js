import { renderAura } from "./aura.js";
import { applyDesignSections } from "./ann-section-layout.js";
import { applyDesignContent } from "./ann-section-content.js";
import { applyRichDesignText } from "./ann-rich-text.js";
import { starterPreview, prefilledSection } from "./aura-starters.js";
import { starterLayouts } from "./aura-skeleton.js";
import { safeImage } from "./aura-sections.js";
import { styleDemonstration } from "./style-demo-copy.js";
import { renderShowcase } from "./aura-showcase.js";

/** The preview may use demo inventory, but a style save never includes this clone. */
export function stylePreviewData(source, { showcase = false } = {}) {
  const data = structuredClone(source);
  const hasProducts = (data.products || []).some(p => p.status !== "archived");
  if (hasProducts && !showcase) {
    data.products = data.products.filter(p => p.status !== "archived");
    const defaults = starterLayouts(data);
    data.layouts = Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
      [key, data.layouts?.[key]?.length ? data.layouts[key] : value]));
    data.style_demo = false;
    return data;
  }
  // The first complete pack is a clearly labelled menswear demonstration,
  // not an assertion that an unrelated merchant sells clothing.
  const originalSettings = { ...(data.settings || {}) };
  // Shared showcases never inherit the merchant's saved copy, media or order.
  // designPreviewData adds the merchant design back explicitly when intended.
  if(showcase)delete originalSettings.ann_design;
  data.settings = { ...originalSettings, category: "fashion", subcategory: "mens-clothing" };
  data.aura_starter_enabled = true;
  data.aura_skeleton_enabled = true;
  const demo = starterPreview(data, "home", { sampleCatalog: true });
  demo.layouts = starterLayouts(demo);
  for (const [page, layout] of Object.entries(demo.layouts))
    demo.layouts[page] = layout.map(section => prefilledSection(section.type, page, demo, section.id) || section);
  demo.settings = { ...originalSettings };
  demo.style_demo = true;
  return demo;
}
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money = value => `₹${(Number(value || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export function demoCommerce(data, bag = new Map((data.products || []).slice(0, 2).map(p => [p.id, 1]))) {
  const picks = (data.products || []).filter(p => bag.has(p.id));
  const subtotal = picks.reduce((sum, p) => sum + Number(p.price_paise || 0) * bag.get(p.id), 0);
  const lines = picks.length ? picks.map(p => `<article class="commerce-line">${safeImage(p.images?.[0]?.url) ? `<img class="commerce-preview-thumb" src="${esc(safeImage(p.images[0].url))}" alt="${esc(p.title)}">` : "<span></span>"}<div><strong>${esc(p.title)}</strong><label>Quantity <input type="number" min="1" max="99" value="${bag.get(p.id)}" data-preview-quantity="${esc(p.id)}"></label><small>Preview item only</small><button type="button" class="commerce-text-link" data-preview-remove="${esc(p.id)}">Remove</button></div><strong>${money(p.price_paise * bag.get(p.id))}</strong></article>`).join("") : "<p>Your preview bag is empty. Browse products to add an item.</p>";
  const summary = `<h2>Order summary</h2>${picks.map(p => `<p>${esc(p.title)} × ${bag.get(p.id)} <strong>${money(p.price_paise * bag.get(p.id))}</strong></p>`).join("")}<p>Subtotal <strong>${money(subtotal)}</strong></p><p>Shipping and final totals are confirmed at live checkout.</p><button class="commerce-button" type="button" data-preview-checkout ${picks.length ? "" : "disabled"}>Explore checkout</button>`;
  return { lines, summary };
}
/** Real draft store with a saved design: never swaps in demo inventory. */
export function designPreviewData(source, design) {
  const data = design.catalogue_mode==="sample"?stylePreviewData(source,{showcase:true}):structuredClone(source);
  data.products = (data.products || []).filter(p => p.status !== "archived");
  data.collections = data.collections || [];
  const defaults = starterLayouts(data);
  data.layouts = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, data.layouts?.[key]?.length ? data.layouts[key] : value]));
  data.settings = { ...(data.settings || {}), ann_design: structuredClone(design) };
  data.style_demo = design.catalogue_mode==="sample";
  return data;
}
export function renderStylePreview(data, settings, options = {}) {
  const styled = styleDemonstration(data, settings.style_preset);
  const merged = { ...styled.settings, ...settings };
  const logo=safeImage(merged.logo_url);
  const finish=html=>{
    html=applyDesignContent(html,data.settings?.ann_design,options.page||"home",Boolean(options.designEdit));
    html=applyDesignSections(html,data.settings?.ann_design?.sections,options.page||"home");
    html=applyRichDesignText(html,data.settings?.ann_design);
    if(logo) {
      const mark=`<img class="sc-brand-logo" src="${esc(logo)}" alt="${esc(merged.brand_name || data.store?.name || "Brand logo")}" height="40">`;
      html=html.replace(/(<a class="sc-brand" href="\/">)[\s\S]*?(<\/a>)/g,(_,open,close)=>open+mark+close);
    }
    return html.replace("</head>",`${logo?`<link rel="icon" href="${esc(logo)}">`:""}<style>html{overflow-y:scroll;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#777 #f1f1f1}html,body{min-height:100%}.sc-brand-logo{display:block;width:auto;height:auto;max-width:180px;max-height:52px;object-fit:contain}${options.designEdit?'body{--ann-editing:1}.sc-motion-ready [data-showcase-reveal]{opacity:1!important;translate:0 0!important;scale:1!important;clip-path:none!important;transition:none!important}[data-design-copy],[data-design-image],[data-design-video]{cursor:pointer}[data-design-copy]:hover,[data-design-image]:hover,[data-design-video]:hover,[data-design-copy]:focus-visible,[data-design-image]:focus-visible{outline:2px dashed var(--acc,#661329);outline-offset:3px}[data-design-selected]{outline:2px solid var(--acc,#661329)!important;outline-offset:3px}':""}</style></head>`);
  };
  const showcase = renderShowcase(styled, merged, options);
  if (showcase) return finish(showcase);
  const html = renderAura({ ...styled, settings: { ...styled.settings, ...settings } }, {
    ...options, preview: true, commerce: true, readOnly: true, embeddedPreview: true,
  }).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Trusted parent binds navigation, catalogue, demo cart and motion. Keep
  // the sandbox script-free rather than weakening it with allow-scripts.
  // A real scrolling document, independent from the surrounding style controls.
  return finish(html);
}
