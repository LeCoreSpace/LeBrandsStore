// Exact shared-image allow-list. Tenant media validation remains unchanged.
export const STARTER_IMAGE_URLS = Object.freeze([
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-desktop-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-hero-mobile-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p02-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p03-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p04-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p05-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p06-front-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-back-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-detail-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-model-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-01-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-02-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-lookbook-03-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-shirts-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-layers-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-collection-everyday-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-fabric-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-craft-construction-v01.webp",
  "/assets/img/aura-starters/c001-s001/v01/c001-s001-founder-portrait-v01.webp"
]);
export const isStarterImage = url => STARTER_IMAGE_URLS.includes(url);
