import { MARKETING_MEDIA } from "./marketing-media.js";

const TITLE = "LeBrands.Store | A flagship online store for Indian D2C brands";
const DESCRIPTION = "A flagship store for Indian D2C brands. Build and publish your storefront with LeBrands.Store.";
const SIGNUP = "https://app.lebrands.store/signup";
const LOGIN = "https://app.lebrands.store/login";

function imageMarkup(media, { eager = false, className = "", alt = media.alt } = {}) {
  if (!media.available) {
    return `<div class="m-asset-placeholder${className ? ` ${className}` : ""}" role="img" aria-label="${alt}. Awaiting supplied image at ${media.src}."><span><strong>Image awaiting supply</strong>${media.src}</span></div>`;
  }
  if (media.fallback) {
    const priority = eager
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy"';
    const webpSrcset = `${media.srcset}, ${media.src} ${media.width}w`;
    return `<picture class="m-responsive-media"><source type="image/avif" srcset="${media.avifSrcset}" sizes="${media.sizes}"><source type="image/webp" srcset="${webpSrcset}" sizes="${media.sizes}"><img class="${className}" src="${media.fallback}" width="${media.width}" height="${media.height}" alt="${alt}" ${priority} decoding="async"></picture>`;
  }
  const priority = eager
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy"';
  const srcset = media.srcset ? ` srcset="${media.srcset}" sizes="${media.sizes}"` : "";
  return `<img class="${className}" src="${media.src}"${srcset} width="${media.width}" height="${media.height}" alt="${alt}" ${priority} decoding="async">`;
}

function videoMarkup(media) {
  if (!media.available) {
    return `<div class="m-asset-placeholder" role="img" aria-label="${media.alt}. Awaiting video at ${media.src} and poster at ${media.poster.src}."><span><strong>Video awaiting supply</strong>${media.src}<br>Poster: ${media.poster.src}</span></div>`;
  }
  return `<div class="m-wizard-poster" data-wizard-poster>${imageMarkup(media.poster)}</div><video muted playsinline loop preload="none" aria-label="${media.alt}" aria-hidden="true"><source data-src="${media.src}" type="video/webm"></video><span class="m-media-caption">${media.caption}</span>`;
}

function shell({ title = TITLE, description = DESCRIPTION, canonical = "https://lebrands.store", pageClass = "", body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f4efe7" data-m-theme-color>
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LeBrands.Store">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://lebrands.store/img/REPLACE-example-desktop.jpg">
  <meta property="og:image:width" content="2880">
  <meta property="og:image:height" content="1800">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preload" href="/assets/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <script src="/assets/marketing.js"></script>
  <link rel="stylesheet" href="/assets/marketing.css">
</head>
<body class="${pageClass}">
${body}
</body>
</html>`;
}

function nav({ pricing = false } = {}) {
  return `<header class="m-nav">
  <div class="m-nav-inner">
    <a class="m-wordmark" href="${pricing ? "https://lebrands.store" : "#top"}" aria-label="LeBrands.Store home"><img class="m-logo-light" src="/img/REPLACE-lebrands-light-logo.webp" width="186" height="66" alt=""><img class="m-logo-dark" src="/img/REPLACE-lebrands-dark-logo.webp" width="186" height="66" alt="">${pricing ? "" : '<img class="m-logo-hero" src="/img/REPLACE-lebrands-hero-transparent.png" width="900" height="320" alt="">'}</a>
    <nav class="m-nav-links" aria-label="Main navigation">
      <a href="${pricing ? "/#features" : "#features"}">Features</a>
      <a href="/pricing">Pricing</a>
      <a href="${pricing ? "/#faq" : "#faq"}">FAQ</a>
      <a class="m-nav-login" href="${LOGIN}">Log in</a>
      <button class="m-theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" aria-pressed="false"><span class="m-theme-icon" aria-hidden="true"></span><span data-theme-label>Dark</span></button>
      <a class="m-nav-cta" href="${SIGNUP}">Open your store</a>
    </nav>
  </div>
</header>`;
}

function footer({ pricing = false } = {}) {
  const homePrefix = pricing ? "/" : "";
  return `<footer class="m-footer">
  <div class="m-wrap">
    <div class="m-footer-top m-reveal">
      <a class="m-wordmark" href="https://lebrands.store" aria-label="LeBrands.Store home"><img class="m-logo-light" src="/img/REPLACE-lebrands-light-logo.webp" width="186" height="66" alt=""><img class="m-logo-dark" src="/img/REPLACE-lebrands-dark-logo.webp" width="186" height="66" alt=""></a>
      <nav class="m-footer-links" aria-label="Footer">
        <a href="${homePrefix}#features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="${homePrefix}#faq">FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refund-policy">Refund policy</a>
        <a href="/contact">Contact</a>
      </nav>
    </div>
    <div class="m-footer-bottom m-reveal m-reveal-delay">
      <span>LeBrandsSpace Digital Private Limited, Chennai.</span>
      <span>© ${new Date().getFullYear()} LeBrands.Store</span>
    </div>
  </div>
</footer>`;
}

export function renderHome() {
  const body = `${nav()}
<main id="top">
  <section class="m-hero" aria-labelledby="hero-title">
    <div class="m-hero-bg" aria-hidden="true">
      <div class="m-hero-grid"></div><span class="m-orb m-orb-a"></span><span class="m-orb m-orb-b"></span>
      <svg class="m-hero-flow" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" fill="none"><path class="m-flow m-flow-a" d="M-20 560 C220 470 330 640 560 520 S900 330 1220 400"/><path class="m-flow m-flow-b" d="M-20 180 C240 260 380 90 640 190 S980 330 1220 130"/></svg>
      <span class="m-chip m-chip-1"><svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/></svg></span>
      <span class="m-chip m-chip-2"><svg viewBox="0 0 24 24"><path d="M7 5h10M7 9h10M10 9c0 5-3 6-3 6l8 4"/></svg></span>
      <span class="m-chip m-chip-3"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg></span>
      <span class="m-chip m-chip-4"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg></span>
    </div>
    <div class="m-hero-inner">
      <div class="m-hero-copy">
        <p class="m-kicker">LeBrands.Store, live today</p>
        <h1 id="hero-title">A flagship store for your brand.</h1>
        <p class="m-hero-line" data-hero-line>Your products. Your flagship store.</p>
        <div class="m-hero-actions">
          <a class="m-cta" href="${SIGNUP}">Open your store</a>
          <a class="m-text-link" href="#craft">Explore the store concept <span aria-hidden="true">&rarr;</span></a>
        </div>
        <p class="m-hero-note">First publication requires platform approval.</p>
      </div>
      <div class="m-hs" data-hero-story role="region" aria-roledescription="carousel" aria-label="What LeBrands.Store does">
        <div class="m-hs-tabs" role="group" aria-label="Choose a feature">
          <button type="button" class="m-hs-tab" data-hs-tab="0" aria-current="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/></svg><span>Catalogue</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="1" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM3 11h18M7 15h3"/></svg><span>COD orders</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="2" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg><span>Customers</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="3" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg><span>GST invoice</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab is-soon" data-hs-tab="4" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/></svg><span>Razorpay</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab is-soon" data-hs-tab="5" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7zM6 19a1.5 1.5 0 100-.01M17 19a1.5 1.5 0 100-.01"/></svg><span>Logistics</span><i class="m-hs-prog"></i></button>
        </div>
        <div class="m-hs-slides">
          <article class="m-hs-slide is-active" data-hs-slide data-hs-line="Your products. Your flagship store." role="group" aria-roledescription="slide" aria-label="1 of 6: Catalogue and collections">
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <svg viewBox="0 0 240 70" class="m-hs-art" fill="none"><g class="m-t1"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(6 8)"/></g><g class="m-t2"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(88 8)"/></g><g class="m-t3"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(170 8)"/></g></svg>
              <div class="m-hs-rows"><span class="m-pill">New in</span><span class="m-pill">Basics</span><span class="m-pill">Festive</span><span class="m-pill m-pill-add">+ Collection</span></div>
            </div>
            <div class="m-hs-copy"><strong>Catalogue and collections.</strong><p>Add products with photos and prices, and group them into collections on your storefront. Catalogue display is available. Advanced collections: Coming soon.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="COD orders, from placed to delivered." role="group" aria-roledescription="slide" aria-label="2 of 6: Cash on delivery orders" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-order"><span>Order 1042 <em>Sample</em></span><span>Rs. 1,852.20</span><span class="m-pill">Cash on delivery</span></div>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Placed</span><span>Packed</span><span>Delivered</span></div>
            </div>
            <div class="m-hs-copy"><strong>COD checkout and orders.</strong><p>Customers pay on delivery. You follow each order from placed to packed to delivered, with COD limits and fraud checks built in.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="Your customers, all in one place." role="group" aria-roledescription="slide" aria-label="3 of 6: Customers" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-cust"><span><b>MK</b>Meera Kulkarni<em>3 orders</em></span><span><b>AS</b>Arjun Sethi<em>1 order</em></span><span><b>NF</b>Naz Fernandes<em>2 orders</em></span></div>
              <svg viewBox="0 0 300 30" class="m-hs-art" fill="none"><path class="m-draw" pathLength="1" d="M4 24C40 24 50 8 90 14S140 26 180 12 250 4 296 8"/></svg>
            </div>
            <div class="m-hs-copy"><strong>Customers you own.</strong><p>Every buyer, address and order history lives in your own customer list. We never market to your customers.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="GST invoices, correctly numbered." role="group" aria-roledescription="slide" aria-label="4 of 6: GST invoices" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-inv"><span>Taxable value<b>Rs. 1,764.00</b></span><span>CGST 2.5%<b>Rs. 44.10</b></span><span>SGST 2.5%<b>Rs. 44.10</b></span><span class="m-hs-total">Total<b>Rs. 1,852.20</b></span></div>
              <svg viewBox="0 0 100 40" class="m-hs-stamp" fill="none"><rect class="m-draw" pathLength="1" x="2" y="2" width="96" height="36" rx="3"/><text x="50" y="26" text-anchor="middle">SAMPLE</text></svg>
            </div>
            <div class="m-hs-copy"><strong>GST invoices.</strong><p>Tax invoices with CGST, SGST or IGST worked out for you, numbered correctly every financial year. A valid GSTIN is required to publish.</p></div>
          </article>
          <article class="m-hs-slide m-hs-soon" data-hs-slide data-hs-line="Razorpay payments. Coming soon." role="group" aria-roledescription="slide" aria-label="5 of 6: Razorpay payments, coming soon" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Coming soon, not enabled yet</span>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Customer pays</span><span>Razorpay</span><span>Your account</span></div>
            </div>
            <div class="m-hs-copy"><strong>Razorpay payments. <em class="m-soon">Coming soon</em></strong><p>Online payments through your own Razorpay account. Cash on delivery is the only option today.</p></div>
          </article>
          <article class="m-hs-slide m-hs-soon" data-hs-slide data-hs-line="Your logistics partner. Coming soon." role="group" aria-roledescription="slide" aria-label="6 of 6: Logistics partners, coming soon" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Coming soon, not enabled yet</span>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Dispatch</span><span>Your partner</span><span>Customer</span></div>
            </div>
            <div class="m-hs-copy"><strong>Logistics partners. <em class="m-soon">Coming soon</em></strong><p>Shiprocket or any partner you choose can be connected for your brand. Contact us to discuss your setup.</p></div>
          </article>
        </div>
        <div class="m-hs-controls">
          <button type="button" data-hs-prev aria-label="Previous feature">&larr;</button>
          <button type="button" data-hs-next aria-label="Next feature">&rarr;</button>
          <button type="button" class="m-hs-toggle" data-hs-toggle aria-pressed="false" aria-label="Pause hero animation">Pause</button>
        </div>
        <p class="m-hs-live" data-hs-live aria-live="polite" aria-atomic="true"></p>
      </div>
    </div>
    <span class="m-scroll-cue" aria-hidden="true">Scroll to explore <span></span></span>
  </section>

  <section class="m-statement" aria-label="Our approach">
    <div class="m-wrap m-statement-inner"><span class="m-kicker m-reveal">Built around your point of view</span><p class="m-reveal">Most store builders give you a website. We give you a storefront that looks like you already made it.</p></div>
  </section>

  <section class="m-how" id="features">
    <div class="m-wrap">
      <div class="m-how-heading m-reveal">
        <div><span class="m-kicker">From first details to first look</span><h2 class="m-section-title">In one sitting.</h2></div>
        <p>A guided setup that gets the shape of your brand right before you go live.</p>
      </div>
      <div class="m-how-grid">
        <div class="m-wizard-media m-reveal">${videoMarkup(MARKETING_MEDIA.wizardVideo)}</div>
        <div>
          <div class="m-steps">
            <article class="m-step m-reveal"><span class="m-step-no">01</span><div><h3>Tell us about your brand.</h3></div></article>
            <article class="m-step m-reveal"><span class="m-step-no">02</span><div><h3>Choose your look and watch it build live.</h3></div></article>
            <article class="m-step m-reveal"><span class="m-step-no">03</span><div><h3>Add your products and publish.</h3><p>Your store is live at yourbrand.lebrands.store.</p></div></article>
          </div>
          <p class="m-clarification">First publication requires platform approval. Advanced collections: Coming soon.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="m-details" id="craft">
    <div class="m-wrap">
      <div class="m-details-head m-reveal">
        <div><span class="m-kicker">The store, behind the scenes</span><h2 class="m-section-title">Crafted details.</h2></div>
        <p>A storefront and the work that keeps it moving, considered together.</p>
      </div>
      <div class="m-craft-carousel" data-craft-carousel role="region" aria-roledescription="carousel" aria-label="Crafted details" tabindex="0">
        <div class="m-craft-stage" data-craft-stage>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="1 of 4: The store">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.productPhoto)}${MARKETING_MEDIA.productPhoto.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.productPhoto.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">01 <i>/ 04</i></span><h3>The store.</h3><p>Product pages, collections, cart and checkout designed to sell, on every screen size.</p><p class="m-clarification">Catalogue display is available. Advanced collections: Coming soon.</p></div>
          </article>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="2 of 4: The checkout">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.checkout)}${MARKETING_MEDIA.checkout.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.checkout.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">02 <i>/ 04</i></span><h3>The checkout.</h3><p>Cash on delivery with built-in fraud protection, COD limits and order tracking for your customers.</p><p class="m-clarification">Cash on delivery is the only payment option available today.</p></div>
          </article>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="3 of 4: The back office">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.dashboard)}${MARKETING_MEDIA.dashboard.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.dashboard.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">03 <i>/ 04</i></span><h3>The back office.</h3><p>Orders from packed to delivered, customers, and payment collection in one calm dashboard.</p></div>
          </article>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="4 of 4: The paperwork">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.invoice)}${MARKETING_MEDIA.invoice.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.invoice.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">04 <i>/ 04</i></span><h3>The paperwork.</h3><p>GST tax invoices with CGST, SGST or IGST worked out for you, numbered correctly every financial year.</p></div>
          </article>
        </div>
        <div class="m-craft-controls" data-craft-controls aria-label="Carousel controls">
          <div class="m-craft-arrows"><button type="button" data-craft-prev aria-label="Previous crafted detail">←</button><button type="button" data-craft-next aria-label="Next crafted detail">→</button></div>
          <div class="m-craft-selectors" role="group" aria-label="Choose a crafted detail">
            <button type="button" data-craft-select="0" aria-label="Show The store" aria-current="true">01</button>
            <button type="button" data-craft-select="1" aria-label="Show The checkout" aria-current="false">02</button>
            <button type="button" data-craft-select="2" aria-label="Show The back office" aria-current="false">03</button>
            <button type="button" data-craft-select="3" aria-label="Show The paperwork" aria-current="false">04</button>
          </div>
          <button class="m-craft-play" type="button" data-craft-toggle aria-pressed="false">Pause</button>
        </div>
        <p class="m-craft-live" data-craft-live aria-live="polite" aria-atomic="true">The store, 1 of 4</p>
      </div>
    </div>
  </section>


  <section class="m-principles" aria-label="Our principles">
    <div class="m-wrap m-principles-list">
      <p class="m-principle m-reveal">Zero commission on your sales.</p>
      <p class="m-principle m-reveal">Your domain, your payments, your customer data.</p>
      <p class="m-principle m-reveal">We never market to your customers.</p>
      <p class="m-clarification m-reveal">Your own domain and online payments are coming soon. Cash on delivery is available today.</p>
    </div>
  </section>

  <section class="m-coming" id="integrations">
    <div class="m-wrap m-coming-inner">
      <h2 class="m-reveal">Coming next.</h2>
      <div class="m-coming-list m-reveal">
        <p>Online payments with your own Razorpay account. <span>Coming soon</span></p>
        <p>Shiprocket or your chosen logistics partner. <span>Coming soon</span></p>
        <p>Your own domain. <span>Coming soon</span></p>
        <p>Order emails. <span>Coming soon</span></p>
        <p>Drag-and-drop page editor. <span>Coming soon</span></p>
        <p>A second theme, Bazaar. <span>Coming soon</span></p>
        <p class="m-integration-note m-reveal">Razorpay payments and integrations with any logistics partner can be added for your brand. <a href="/contact">Contact us to discuss your setup.</a></p>
      </div>
    </div>
  </section>

  <section class="m-showcase" id="showcase">
    <div class="m-wrap">
      <div class="m-showcase-head m-reveal">
        <h2>Example Studio, imagined.</h2>
        <p>A fictional clothing store concept, built with LeBrands.Store.</p>
      </div>
      <div class="m-showcase-frame m-reveal">
        <div class="m-showcase-desktop">${imageMarkup(MARKETING_MEDIA.exampleDesktop)}<span class="m-device-caption">Example store concept</span></div>
        <div class="m-showcase-mobile">${imageMarkup(MARKETING_MEDIA.exampleMobile)}</div>
      </div>
      <a class="m-showcase-cta" href="${SIGNUP}">Build a store like this <span aria-hidden="true">&rarr;</span></a>
    </div>
  </section>

  <section class="m-pricing-tease">
    <div class="m-wrap m-pricing-inner m-reveal">
      <h2>Simple monthly pricing. No commission, ever.</h2>
      <a href="/pricing">See pricing <span aria-hidden="true">&rarr;</span></a>
    </div>
  </section>

  <section class="m-faq" id="faq">
    <div class="m-wrap m-faq-inner">
      <h2 class="m-reveal">Good to know.</h2>
      <div class="m-faq-list">
        <details class="m-faq-item m-reveal"><summary>Do you take a commission?</summary><p>No. Your sales are entirely yours.</p></details>
        <details class="m-faq-item m-reveal"><summary>Do I need GST registration?</summary><p>Yes. A valid GSTIN is required to publish, so every invoice your store issues is compliant.</p></details>
        <details class="m-faq-item m-reveal"><summary>How do payments work?</summary><p>Cash on delivery today. Online payments through your own Razorpay account are coming soon, and the money goes straight to you.</p></details>
        <details class="m-faq-item m-reveal"><summary>Can I use my own domain?</summary><p>Coming soon. Your store starts at yourbrand.lebrands.store.</p></details>
        <details class="m-faq-item m-reveal"><summary>Who owns my customer data?</summary><p>You do. We never market to your customers.</p></details>
        <details class="m-faq-item m-reveal"><summary>How long does setup take?</summary><p>Most brands finish the guided setup in one sitting.</p></details>
      </div>
    </div>
  </section>

  <section class="m-final">
    <div class="m-wrap m-final-inner">
      <h2 class="m-reveal">Your brand is ready. Your store can be too.</h2>
      <a class="m-cta m-reveal" href="${SIGNUP}">Open your store</a>
    </div>
  </section>
</main>
${footer()}`;
  return shell({ body });
}

export function renderPricing() {
  const body = `<div class="m-pricing-page">
  ${nav({ pricing: true })}
  <main class="m-pricing-content">
    <section aria-labelledby="pricing-title">
      <h1 id="pricing-title">Pricing is being finalised.</h1>
      <p>Pricing is being finalised. Talk to us.</p>
      <a href="mailto:support@lebrands.store">Talk to us</a>
    </section>
  </main>
  ${footer({ pricing: true })}
</div>`;
  return shell({
    title: "Pricing | LeBrands.Store",
    description: "Pricing is being finalised. Talk to the LeBrands.Store team.",
    canonical: "https://lebrands.store/pricing",
    pageClass: "m-pricing-document",
    body
  });
}
