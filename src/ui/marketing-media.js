export const MARKETING_MEDIA = Object.freeze({
  stonescenceDesktop: Object.freeze({
    available: true,
    src: "/img/stonescence-desktop-1200.webp",
    srcset: "/img/stonescence-desktop-640.webp 640w, /img/stonescence-desktop-1200.webp 1200w",
    sizes: "(max-width: 600px) 92vw, (max-width: 900px) 88vw, 58vw",
    width: 1200,
    height: 675,
    alt: "The live Stonescence storefront, shown on a laptop"
  }),
  stonescenceMobile: Object.freeze({
    available: true,
    src: "/img/stonescence-mobile-390.webp",
    srcset: "/img/stonescence-mobile-260.webp 260w, /img/stonescence-mobile-390.webp 390w",
    sizes: "(max-width: 600px) 111px, 205px",
    width: 390,
    height: 844,
    alt: "The live Stonescence storefront, shown on a phone"
  }),
  productPhoto: Object.freeze({
    available: false,
    src: "/img/REPLACE-store-photo.jpg",
    width: 1200,
    height: 900,
    alt: "Store product photography supplied by LeBrands"
  }),
  checkout: Object.freeze({
    available: false,
    src: "/img/REPLACE-checkout.jpg",
    width: 1200,
    height: 900,
    alt: "Cash on delivery checkout screenshot supplied by LeBrands"
  }),
  dashboard: Object.freeze({
    available: false,
    src: "/img/REPLACE-dashboard.jpg",
    width: 1200,
    height: 900,
    alt: "Store order dashboard screenshot supplied by LeBrands"
  }),
  invoice: Object.freeze({
    available: false,
    src: "/img/REPLACE-invoice.jpg",
    width: 1200,
    height: 900,
    alt: "GST tax invoice example supplied by LeBrands"
  }),
  wizardVideo: Object.freeze({
    available: false,
    src: "/img/REPLACE-wizard-loop.webm",
    poster: "/img/REPLACE-wizard-poster.jpg",
    width: 1200,
    height: 800,
    alt: "Guided store setup live preview supplied by LeBrands"
  })
});
