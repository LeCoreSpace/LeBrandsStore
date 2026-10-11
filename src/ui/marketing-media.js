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
    available: true,
    src: "/img/REPLACE-store-photo.webp",
    fallback: "/img/REPLACE-store-photo.jpg",
    srcset: "/img/REPLACE-store-photo-640.webp 640w, /img/REPLACE-store-photo-1280.webp 1280w",
    avifSrcset: "/img/REPLACE-store-photo-640.avif 640w, /img/REPLACE-store-photo-1280.avif 1280w",
    sizes: "(max-width: 600px) 92vw, (max-width: 900px) 88vw, 58vw",
    width: 2880,
    height: 1100,
    alt: "Fictional Example Studio handmade cotton apparel storefront, a demo store and not an actual customer.",
    caption: "Example store"
  }),
  checkout: Object.freeze({
    available: true,
    src: "/img/REPLACE-checkout.webp",
    fallback: "/img/REPLACE-checkout.jpg",
    srcset: "/img/REPLACE-checkout-390.webp 390w, /img/REPLACE-checkout-640.webp 640w",
    avifSrcset: "/img/REPLACE-checkout-390.avif 390w, /img/REPLACE-checkout-640.avif 640w, /img/REPLACE-checkout.avif 780w",
    sizes: "(max-width: 600px) 92vw, 44vw",
    width: 780,
    height: 1688,
    alt: "Fictional Example Studio cash on delivery checkout, a demo store screen and not an actual customer.",
    caption: "Example store"
  }),
  dashboard: Object.freeze({
    available: true,
    src: "/img/REPLACE-dashboard.webp",
    fallback: "/img/REPLACE-dashboard.jpg",
    srcset: "/img/REPLACE-dashboard-640.webp 640w, /img/REPLACE-dashboard-1280.webp 1280w",
    avifSrcset: "/img/REPLACE-dashboard-640.avif 640w, /img/REPLACE-dashboard-1280.avif 1280w",
    sizes: "(max-width: 600px) 92vw, 58vw",
    width: 2880,
    height: 1800,
    alt: "Fictional Example Studio order dashboard with sample demo data, not an actual customer dashboard.",
    caption: "Example store"
  }),
  invoice: Object.freeze({
    available: true,
    src: "/img/REPLACE-invoice.webp",
    fallback: "/img/REPLACE-invoice.jpg",
    srcset: "/img/REPLACE-invoice-640.webp 640w, /img/REPLACE-invoice-1280.webp 1280w",
    avifSrcset: "/img/REPLACE-invoice-640.avif 640w, /img/REPLACE-invoice-1280.avif 1280w",
    sizes: "(max-width: 600px) 92vw, 44vw",
    width: 2132,
    height: 1286,
    alt: "Fictional Example Studio sample GST invoice with a SAMPLE watermark, not an actual customer invoice.",
    caption: "Example store"
  }),
  wizardVideo: Object.freeze({
    available: true,
    src: "/img/REPLACE-wizard-loop.webm",
    poster: Object.freeze({
      available: true,
      src: "/img/REPLACE-wizard-poster.webp",
      fallback: "/img/REPLACE-wizard-poster.jpg",
      srcset: "/img/REPLACE-wizard-poster-640.webp 640w, /img/REPLACE-wizard-poster-1280.webp 1280w",
      avifSrcset: "/img/REPLACE-wizard-poster-640.avif 640w, /img/REPLACE-wizard-poster-1280.avif 1280w, /img/REPLACE-wizard-poster.avif 1600w",
      sizes: "(max-width: 600px) 92vw, 58vw",
      width: 1600,
      height: 900,
      alt: "Fictional Example Studio wizard first frame, a demo store and not an actual customer."
    }),
    width: 1600,
    height: 900,
    alt: "Fictional Example Studio setup wizard with a live preview, a demo store and not an actual customer.",
    caption: "Example store"
  })
});
