// Current application renderers, captured with isolated fictional store data.
// Keep new URLs when refreshing captures so browsers do not reuse older screens.
function screenshot(name, width, height, alt) {
  const sizes = width < 640
    ? "(max-width: 600px) 86vw, 390px"
    : "(max-width: 600px) 92vw, 1200px";
  const candidates = width < 640
    ? `/img/${name}-260.webp 260w`
    : `/img/${name}-640.webp 640w, /img/${name}-1280.webp 1280w`;
  const srcset = `${candidates}, /img/${name}.webp ${width}w`;
  return Object.freeze({
    available: true, src: `/img/${name}.webp`, srcset, sizes,
    width, height, alt, caption: "Current interface. Fictional sample data.",
  });
}

export const CURRENT_MARKETING_MEDIA = Object.freeze({
  exampleDesktop: screenshot("ann-skincare-boutique-current-desktop", 1440, 900,
    "Current Modern Boutique skincare sample storefront on desktop."),
  exampleMobile: screenshot("ann-skincare-boutique-current-mobile", 390, 844,
    "Current Modern Boutique skincare sample storefront on a phone."),
  annBuilder: screenshot("ann-skincare-boutique-current-builder-home-en", 1440, 960,
    "Current Ann builder with its English language selector, guided conversation and Modern Boutique skincare homepage preview."),
  annBuilderHindi: screenshot("ann-skincare-architectural-current-builder-home-hi", 1440, 960,
    "Current Ann builder with Hindi selected and the Bold Architectural skincare homepage preview. Product records remain as written."),
  productPhoto: screenshot("ann-skincare-boutique-current-product", 1440, 900,
    "Current Modern Boutique skincare product page with a fictional daily serum."),
  checkout: screenshot("ann-skincare-boutique-current-checkout", 390, 1000,
    "Current checkout with contact, email verification, delivery and payment fields, using fictional sample data."),
  dashboard: screenshot("home-current-dashboard", 1440, 960,
    "Current Example Studio dashboard with catalogue, orders, business reports, settings and Help and support. Fictional sample data."),
  orders: screenshot("home-current-orders", 1440, 960,
    "Current order desk with fictional sample orders and fulfilment statuses."),
  invoice: screenshot("home-current-invoice", 1440, 1000,
    "Current GST tax invoice renderer with fictional Example Studio details and illustrative invoice amounts."),
  themeEditor: screenshot("home-current-theme-editor", 1440, 960,
    "Current Ann theme editor with store sections and a fictional storefront preview."),
  catalogue: screenshot("home-current-catalogue", 1440, 960,
    "Current store catalogue with fictional products, prices and stock."),
  analytics: screenshot("home-current-analytics", 1440, 960,
    "Current store analytics with fictional sample order, cost and margin data."),
  discovery: Object.freeze({
    available: true, src: "/img/REPLACE-lebrands-space-homepage.webp",
    width: 1600, height: 900,
    alt: "The LeBrands.Space public discovery homepage.",
    caption: "LeBrands.Space public homepage.",
  }),
});

const currentHomepageImages = new Set([
  ...Object.values(CURRENT_MARKETING_MEDIA).flatMap(media => [
    media.src,
    ...(media.srcset || "").split(",").map(value => value.trim().split(" ")[0]).filter(Boolean),
  ]),
  "/img/home-founder-woman.webp",
  "/img/home-founder-man.webp",
  "/img/home-founder-ann-laptop.webp",
]);

// Exact, server-owned public files only. Never allow private preview media.
export function isCurrentHomepageImage(pathname) {
  return currentHomepageImages.has(pathname);
}
