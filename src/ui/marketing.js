import { MARKETING_MEDIA } from "./marketing-media.js";
import { FAVICON_LINKS } from "./favicon.js";
import { platformSeoHead, PLATFORM_DESCRIPTION, PLATFORM_FAQ } from "./platform-seo.js";

const TITLE = "LeBrands.Store | A flagship online store for Indian D2C brands";
const DESCRIPTION = PLATFORM_DESCRIPTION;
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
  ${FAVICON_LINKS}
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
  ${platformSeoHead({ canonical, title, description })}
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
  return `<header class="m-nav${pricing ? "" : " m-nav-home"}">
  <div class="m-nav-inner">
    <a class="m-wordmark" href="${pricing ? "https://lebrands.store" : "#top"}" aria-label="LeBrands.Store home"><img class="m-logo-light" src="/img/REPLACE-lebrands-light-transparent.webp" width="900" height="320" alt=""><img class="m-logo-dark" src="/img/REPLACE-lebrands-dark-transparent.webp" width="900" height="320" alt="">${pricing ? "" : '<img class="m-logo-hero" src="/img/REPLACE-lebrands-hero-transparent.png" width="900" height="320" alt="">'}</a>
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
      <a class="m-wordmark" href="https://lebrands.store" aria-label="LeBrands.Store home"><img class="m-logo-footer" src="/img/REPLACE-lebrands-hero-transparent.png" width="900" height="320" alt=""></a>
      <nav class="m-footer-links" aria-label="Footer">
        <a href="${homePrefix}#features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="${homePrefix}#faq">FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refund-policy">Refund policy</a>
        <a href="/contact">Contact</a>
        <a href="/support">Support</a>
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
  <div class="m-flow" aria-hidden="true"><svg viewBox="0 0 1000 6000" preserveAspectRatio="none" focusable="false"><defs><linearGradient id="m-flow-ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="6000"><stop offset="0" stop-color="#d49a93"/><stop offset=".35" stop-color="#a45566"/><stop offset=".7" stop-color="#d49a93"/><stop offset="1" stop-color="#a45566"/></linearGradient></defs><path class="m-flow-a" d="M363 0 L391 75 L396 150 L382 225 L357 300 L332 375 L315 450 L311 525 L317 600 L327 675 L333 750 L324 825 L297 900 L253 975 L198 1050 L143 1125 L102 1200 L82 1275 L88 1350 L119 1425 L164 1500 L214 1575 L257 1650 L285 1725 L296 1800 L295 1875 L289 1950 L287 2025 L297 2100 L320 2175 L353 2250 L387 2325 L412 2400 L418 2475 L399 2550 L358 2625 L300 2700 L237 2775 L183 2850 L146 2925 L131 3000 L137 3075 L157 3150 L181 3225 L199 3300 L205 3375 L200 3450 L188 3525 L179 3600 L181 3675 L201 3750 L240 3825 L293 3900 L351 3975 L400 4050 L431 4125 L436 4200 L416 4275 L377 4350 L330 4425 L285 4500 L253 4575 L236 4650 L234 4725 L239 4800 L242 4875 L236 4950 L215 5025 L183 5100 L145 5175 L113 5250 L97 5325 L105 5400 L137 5475 L189 5550 L250 5625 L309 5700 L354 5775 L378 5850 L380 5925 L366 6000"/><path class="m-flow-a" d="M394 0 L420 75 L423 150 L407 225 L382 300 L357 375 L341 450 L337 525 L343 600 L352 675 L354 750 L342 825 L311 900 L264 975 L207 1050 L153 1125 L114 1200 L97 1275 L107 1350 L140 1425 L188 1500 L239 1575 L282 1650 L309 1725 L320 1800 L319 1875 L314 1950 L315 2025 L327 2100 L352 2175 L385 2250 L418 2325 L441 2400 L443 2475 L420 2550 L374 2625 L314 2700 L250 2775 L196 2850 L160 2925 L147 3000 L155 3075 L176 3150 L199 3225 L216 3300 L222 3375 L217 3450 L206 3525 L199 3600 L205 3675 L229 3750 L272 3825 L327 3900 L385 3975 L433 4050 L461 4125 L463 4200 L440 4275 L399 4350 L350 4425 L305 4500 L273 4575 L257 4650 L254 4725 L258 4800 L259 4875 L250 4950 L228 5025 L194 5100 L157 5175 L127 5250 L114 5325 L126 5400 L162 5475 L218 5550 L281 5625 L340 5700 L384 5775 L406 5850 L407 5925 L392 6000"/><path class="m-flow-a" d="M425 0 L449 75 L450 150 L433 225 L407 300 L382 375 L367 450 L363 525 L368 600 L376 675 L375 750 L359 825 L325 900 L275 975 L217 1050 L163 1125 L126 1200 L113 1275 L126 1350 L163 1425 L213 1500 L265 1575 L307 1650 L334 1725 L345 1800 L344 1875 L341 1950 L343 2025 L357 2100 L384 2175 L417 2250 L449 2325 L469 2400 L467 2475 L440 2550 L390 2625 L327 2700 L262 2775 L208 2850 L174 2925 L163 3000 L173 3075 L194 3150 L218 3225 L234 3300 L240 3375 L234 3450 L225 3525 L221 3600 L230 3675 L258 3750 L304 3825 L361 3900 L420 3975 L466 4050 L491 4125 L490 4200 L463 4275 L419 4350 L369 4425 L324 4500 L292 4575 L277 4650 L274 4725 L277 4800 L276 4875 L264 4950 L240 5025 L205 5100 L168 5175 L141 5250 L132 5325 L148 5400 L188 5475 L247 5550 L312 5625 L371 5700 L414 5775 L434 5850 L434 5925 L418 6000"/><path class="m-flow-a" d="M456 0 L478 75 L477 150 L458 225 L432 300 L407 375 L392 450 L389 525 L394 600 L399 675 L395 750 L376 825 L338 900 L285 975 L226 1050 L173 1125 L138 1200 L129 1275 L146 1350 L186 1425 L238 1500 L291 1575 L333 1650 L359 1725 L370 1800 L370 1875 L368 1950 L372 2025 L388 2100 L416 2175 L450 2250 L480 2325 L496 2400 L490 2475 L458 2550 L405 2625 L340 2700 L274 2775 L221 2850 L189 2925 L180 3000 L191 3075 L213 3150 L236 3225 L252 3300 L257 3375 L252 3450 L244 3525 L243 3600 L256 3675 L287 3750 L336 3825 L396 3900 L454 3975 L499 4050 L521 4125 L516 4200 L486 4275 L439 4350 L388 4425 L343 4500 L311 4575 L296 4650 L293 4725 L295 4800 L292 4875 L278 4950 L252 5025 L216 5100 L180 5175 L155 5250 L150 5325 L171 5400 L215 5475 L277 5550 L343 5625 L403 5700 L444 5775 L463 5850 L460 5925 L444 6000"/><path class="m-flow-a" d="M487 0 L507 75 L504 150 L484 225 L457 300 L432 375 L418 450 L414 525 L418 600 L421 675 L414 750 L391 825 L350 900 L295 975 L235 1050 L184 1125 L151 1200 L146 1275 L167 1350 L210 1425 L264 1500 L317 1575 L359 1650 L385 1725 L395 1800 L396 1875 L395 1950 L401 2025 L419 2100 L448 2175 L482 2250 L510 2325 L523 2400 L512 2475 L476 2550 L420 2625 L352 2700 L286 2775 L234 2850 L203 2925 L196 3000 L209 3075 L231 3150 L255 3225 L270 3300 L275 3375 L271 3450 L264 3525 L266 3600 L282 3675 L318 3750 L370 3825 L431 3900 L489 3975 L531 4050 L550 4125 L541 4200 L508 4275 L459 4350 L407 4425 L361 4500 L330 4575 L315 4650 L312 4725 L312 4800 L307 4875 L292 4950 L263 5025 L227 5100 L193 5175 L171 5250 L170 5325 L195 5400 L243 5475 L308 5550 L375 5625 L434 5700 L474 5775 L491 5850 L487 5925 L469 6000"/><path class="m-flow-a" d="M518 0 L536 75 L530 150 L509 225 L481 300 L457 375 L443 450 L439 525 L442 600 L443 675 L433 750 L406 825 L361 900 L304 975 L244 1050 L194 1125 L165 1200 L163 1275 L188 1350 L234 1425 L290 1500 L343 1575 L385 1650 L411 1725 L421 1800 L422 1875 L423 1950 L431 2025 L451 2100 L480 2175 L514 2250 L540 2325 L549 2400 L534 2475 L493 2550 L433 2625 L363 2700 L297 2775 L246 2850 L217 2925 L213 3000 L227 3075 L250 3150 L273 3225 L289 3300 L293 3375 L289 3450 L285 3525 L289 3600 L310 3675 L349 3750 L404 3825 L466 3900 L523 3975 L563 4050 L579 4125 L566 4200 L529 4275 L478 4350 L425 4425 L379 4500 L349 4575 L334 4650 L330 4725 L329 4800 L323 4875 L304 4950 L275 5025 L239 5100 L206 5175 L186 5250 L190 5325 L219 5400 L272 5475 L339 5550 L408 5625 L466 5700 L504 5775 L519 5850 L514 5925 L495 6000"/><path class="m-flow-a" d="M549 0 L564 75 L557 150 L534 225 L506 300 L482 375 L468 450 L464 525 L465 600 L464 675 L450 750 L420 825 L372 900 L313 975 L253 1050 L205 1125 L179 1200 L181 1275 L210 1350 L259 1425 L316 1500 L370 1575 L412 1650 L437 1725 L447 1800 L449 1875 L451 1950 L461 2025 L482 2100 L513 2175 L545 2250 L569 2325 L574 2400 L554 2475 L510 2550 L446 2625 L374 2700 L308 2775 L258 2850 L232 2925 L229 3000 L245 3075 L269 3150 L292 3225 L307 3300 L311 3375 L309 3450 L306 3525 L314 3600 L338 3675 L380 3750 L438 3825 L501 3900 L557 3975 L595 4050 L607 4125 L590 4200 L550 4275 L497 4350 L443 4425 L397 4500 L367 4575 L353 4650 L348 4725 L346 4800 L337 4875 L317 4950 L286 5025 L250 5100 L219 5175 L203 5250 L211 5325 L245 5400 L301 5475 L371 5550 L440 5625 L498 5700 L535 5775 L547 5850 L540 5925 L521 6000"/><path class="m-flow-a" d="M580 0 L593 75 L583 150 L559 225 L530 300 L506 375 L492 450 L488 525 L488 600 L484 675 L467 750 L433 825 L382 900 L322 975 L262 1050 L216 1125 L193 1200 L199 1275 L232 1350 L284 1425 L343 1500 L398 1575 L439 1650 L463 1725 L473 1800 L476 1875 L479 1950 L491 2025 L514 2100 L545 2175 L576 2250 L597 2325 L598 2400 L574 2475 L525 2550 L458 2625 L385 2700 L319 2775 L271 2850 L246 2925 L246 3000 L263 3075 L288 3150 L311 3225 L326 3300 L330 3375 L328 3450 L328 3525 L339 3600 L367 3675 L413 3750 L473 3825 L537 3900 L592 3975 L627 4050 L634 4125 L614 4200 L571 4275 L515 4350 L460 4425 L415 4500 L385 4575 L371 4650 L366 4725 L362 4800 L351 4875 L329 4950 L297 5025 L262 5100 L233 5175 L220 5250 L233 5325 L271 5400 L331 5475 L403 5550 L473 5625 L530 5700 L565 5775 L576 5850 L567 5925 L547 6000"/><path class="m-flow-a" d="M611 0 L621 75 L609 150 L584 225 L554 300 L531 375 L517 450 L512 525 L510 600 L503 675 L483 750 L446 825 L392 900 L330 975 L271 1050 L227 1125 L208 1200 L219 1275 L255 1350 L310 1425 L371 1500 L426 1575 L466 1650 L490 1725 L500 1800 L503 1875 L508 1950 L522 2025 L546 2100 L577 2175 L607 2250 L625 2325 L622 2400 L593 2475 L540 2550 L470 2625 L395 2700 L329 2775 L283 2850 L261 2925 L263 3000 L281 3075 L307 3150 L330 3225 L344 3300 L349 3375 L349 3450 L351 3525 L365 3600 L397 3675 L446 3750 L508 3825 L572 3900 L626 3975 L657 4050 L661 4125 L637 4200 L590 4275 L533 4350 L477 4425 L432 4500 L403 4575 L388 4650 L383 4725 L378 4800 L365 4875 L341 4950 L309 5025 L274 5100 L247 5175 L238 5250 L255 5325 L298 5400 L362 5475 L436 5550 L507 5625 L562 5700 L595 5775 L604 5850 L593 5925 L572 6000"/><path class="m-flow-b" d="M798 0 L800 75 L790 150 L766 225 L727 300 L677 375 L621 450 L567 525 L523 600 L495 675 L486 750 L496 825 L523 900 L561 975 L604 1050 L644 1125 L676 1200 L697 1275 L706 1350 L707 1425 L703 1500 L701 1575 L706 1650 L721 1725 L748 1800 L784 1875 L826 1950 L865 2025 L896 2100 L911 2175 L908 2250 L885 2325 L845 2400 L793 2475 L737 2550 L683 2625 L639 2700 L609 2775 L594 2850 L592 2925 L601 3000 L613 3075 L622 3150 L625 3225 L618 3300 L603 3375 L581 3450 L560 3525 L544 3600 L541 3675 L553 3750 L583 3825 L628 3900 L685 3975 L745 4050 L801 4125 L846 4200 L875 4275 L886 4350 L879 4425 L858 4500 L830 4575 L800 4650 L776 4725 L760 4800 L755 4875 L757 4950 L764 5025 L770 5100 L768 5175 L755 5250 L728 5325 L687 5400 L638 5475 L586 5550 L538 5625 L502 5700 L483 5775 L484 5850 L504 5925 L539 6000"/><path class="m-flow-b" d="M826 0 L825 75 L812 150 L784 225 L742 300 L689 375 L633 450 L580 525 L537 600 L512 675 L506 750 L519 825 L549 900 L589 975 L633 1050 L673 1125 L705 1200 L725 1275 L734 1350 L734 1425 L732 1500 L731 1575 L738 1650 L756 1725 L785 1800 L823 1875 L864 1950 L903 2025 L931 2100 L943 2175 L936 2250 L910 2325 L866 2400 L812 2475 L754 2550 L700 2625 L657 2700 L628 2775 L614 2850 L614 2925 L622 3000 L634 3075 L643 3150 L644 3225 L636 3300 L620 3375 L599 3450 L579 3525 L566 3600 L565 3675 L582 3750 L615 3825 L664 3900 L723 3975 L784 4050 L840 4125 L883 4200 L910 4275 L918 4350 L909 4425 L886 4500 L857 4575 L828 4650 L803 4725 L788 4800 L783 4875 L786 4950 L792 5025 L795 5100 L791 5175 L774 5250 L744 5325 L701 5400 L651 5475 L598 5550 L551 5625 L517 5700 L501 5775 L506 5850 L529 5925 L567 6000"/><path class="m-flow-b" d="M853 0 L849 75 L833 150 L801 225 L756 300 L702 375 L645 450 L592 525 L552 600 L529 675 L526 750 L543 825 L575 900 L617 975 L662 1050 L702 1125 L734 1200 L753 1275 L762 1350 L763 1425 L761 1500 L762 1575 L772 1650 L792 1725 L823 1800 L862 1875 L903 1950 L940 2025 L965 2100 L974 2175 L963 2250 L933 2325 L887 2400 L830 2475 L771 2550 L717 2625 L675 2700 L647 2775 L634 2850 L635 2925 L644 3000 L655 3075 L663 3150 L663 3225 L654 3300 L638 3375 L617 3450 L598 3525 L588 3600 L591 3675 L611 3750 L649 3825 L701 3900 L761 3975 L823 4050 L878 4125 L920 4200 L945 4275 L950 4350 L939 4425 L915 4500 L884 4575 L855 4650 L831 4725 L816 4800 L811 4875 L814 4950 L818 5025 L820 5100 L813 5175 L793 5250 L760 5325 L715 5400 L663 5475 L610 5550 L565 5625 L533 5700 L520 5775 L528 5850 L555 5925 L596 6000"/><path class="m-flow-b" d="M879 0 L872 75 L852 150 L818 225 L770 300 L714 375 L656 450 L605 525 L567 600 L547 675 L547 750 L567 825 L602 900 L646 975 L691 1050 L732 1125 L763 1200 L782 1275 L790 1350 L791 1425 L791 1500 L794 1575 L806 1650 L828 1725 L861 1800 L900 1875 L941 1950 L977 2025 L1000 2100 L1005 2175 L990 2250 L956 2325 L906 2400 L847 2475 L788 2550 L734 2625 L692 2700 L666 2775 L655 2850 L656 2925 L665 3000 L676 3075 L683 3150 L682 3225 L672 3300 L655 3375 L635 3450 L619 3525 L611 3600 L618 3675 L642 3750 L683 3825 L738 3900 L800 3975 L862 4050 L917 4125 L957 4200 L979 4275 L982 4350 L968 4425 L943 4500 L912 4575 L882 4650 L858 4725 L844 4800 L839 4875 L841 4950 L844 5025 L844 5100 L834 5175 L811 5250 L775 5325 L728 5400 L674 5475 L622 5550 L578 5625 L550 5700 L540 5775 L552 5850 L582 5925 L625 6000"/><path class="m-flow-b" d="M904 0 L894 75 L871 150 L833 225 L783 300 L725 375 L668 450 L618 525 L582 600 L565 675 L569 750 L592 825 L629 900 L675 975 L721 1050 L762 1125 L792 1200 L810 1275 L819 1350 L820 1425 L821 1500 L826 1575 L840 1650 L865 1725 L899 1800 L939 1875 L980 1950 L1013 2025 L1033 2100 L1034 2175 L1015 2250 L977 2325 L925 2400 L864 2475 L804 2550 L750 2625 L710 2700 L685 2775 L675 2850 L677 2925 L687 3000 L697 3075 L703 3150 L701 3225 L690 3300 L673 3375 L654 3450 L640 3525 L635 3600 L646 3675 L674 3750 L718 3825 L776 3900 L840 3975 L902 4050 L956 4125 L994 4200 L1013 4275 L1014 4350 L997 4425 L970 4500 L938 4575 L908 4650 L885 4725 L872 4800 L867 4875 L868 4950 L870 5025 L867 5100 L854 5175 L828 5250 L789 5325 L740 5400 L686 5475 L634 5550 L592 5625 L566 5700 L561 5775 L576 5850 L609 5925 L655 6000"/><path class="m-flow-b" d="M928 0 L916 75 L889 150 L848 225 L795 300 L737 375 L679 450 L630 525 L597 600 L584 675 L591 750 L617 825 L657 900 L704 975 L751 1050 L792 1125 L821 1200 L840 1275 L848 1350 L850 1425 L852 1500 L859 1575 L875 1650 L902 1725 L938 1800 L978 1875 L1018 1950 L1049 2025 L1065 2100 L1063 2175 L1040 2250 L998 2325 L943 2400 L880 2475 L819 2550 L766 2625 L727 2700 L703 2775 L695 2850 L698 2925 L708 3000 L717 3075 L722 3150 L720 3225 L708 3300 L692 3375 L674 3450 L661 3525 L660 3600 L674 3675 L706 3750 L754 3825 L814 3900 L880 3975 L942 4050 L994 4125 L1031 4200 L1047 4275 L1045 4350 L1026 4425 L998 4500 L965 4575 L935 4650 L912 4725 L899 4800 L894 4875 L894 4950 L895 5025 L889 5100 L873 5175 L844 5250 L803 5325 L752 5400 L697 5475 L646 5550 L607 5625 L584 5700 L582 5775 L600 5850 L637 5925 L686 6000"/><path class="m-flow-b" d="M952 0 L936 75 L906 150 L862 225 L807 300 L748 375 L691 450 L644 525 L613 600 L603 675 L614 750 L643 825 L686 900 L734 975 L782 1050 L822 1125 L851 1200 L869 1275 L877 1350 L880 1425 L884 1500 L893 1575 L911 1650 L939 1725 L976 1800 L1017 1875 L1055 1950 L1084 2025 L1097 2100 L1091 2175 L1064 2250 L1018 2325 L960 2400 L896 2475 L834 2550 L782 2625 L744 2700 L722 2775 L715 2850 L719 2925 L729 3000 L738 3075 L742 3150 L738 3225 L727 3300 L710 3375 L694 3450 L684 3525 L686 3600 L704 3675 L740 3750 L791 3825 L854 3900 L920 3975 L982 4050 L1033 4125 L1067 4200 L1081 4275 L1076 4350 L1055 4425 L1025 4500 L991 4575 L961 4650 L939 4725 L926 4800 L921 4875 L920 4950 L919 5025 L911 5100 L892 5175 L860 5250 L816 5325 L763 5400 L708 5475 L659 5550 L621 5625 L602 5700 L604 5775 L626 5850 L666 5925 L717 6000"/><path class="m-flow-b" d="M975 0 L956 75 L922 150 L876 225 L819 300 L758 375 L702 450 L657 525 L630 600 L623 675 L638 750 L670 825 L715 900 L765 975 L813 1050 L853 1125 L882 1200 L899 1275 L907 1350 L911 1425 L916 1500 L927 1575 L947 1650 L977 1725 L1015 1800 L1056 1875 L1093 1950 L1119 2025 L1128 2100 L1118 2175 L1086 2250 L1037 2325 L977 2400 L911 2475 L849 2550 L798 2625 L761 2700 L741 2775 L735 2850 L740 2925 L749 3000 L758 3075 L762 3150 L757 3225 L745 3300 L729 3375 L714 3450 L707 3525 L713 3600 L735 3675 L774 3750 L829 3825 L894 3900 L961 3975 L1023 4050 L1072 4125 L1103 4200 L1114 4275 L1106 4350 L1083 4425 L1051 4500 L1017 4575 L987 4650 L965 4725 L952 4800 L947 4875 L945 4950 L942 5025 L931 5100 L910 5175 L875 5250 L829 5325 L775 5400 L720 5475 L671 5550 L637 5625 L621 5700 L626 5775 L652 5850 L695 5925 L748 6000"/></svg></div>
  <section class="m-hero" aria-labelledby="hero-title">
    <div class="m-hero-bg" aria-hidden="true">
      <div class="m-hero-grid"></div><span class="m-orb m-orb-a"></span><span class="m-orb m-orb-b"></span>
      <svg class="m-hero-flow" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" fill="none"><path class="m-flow m-flow-a" d="M-20 560 C220 470 330 640 560 520 S900 330 1220 400"/><path class="m-flow m-flow-b" d="M-20 180 C240 260 380 90 640 190 S980 330 1220 130"/></svg>
    </div>
    <div class="m-hero-inner">
      <div class="m-hero-copy">
        <p class="m-kicker">LeBrands.Store, live today</p>
        <h1 id="hero-title">A flagship store for your brand.</h1>
        <p class="m-hero-line" data-hero-line>Your products. Your flagship store.</p>
      </div>
      <div class="m-hs-scene">
      <div class="m-hs" data-hero-story role="region" aria-roledescription="carousel" aria-label="What LeBrands.Store does">
        <span class="m-hs-sheen" aria-hidden="true"></span>
        <div class="m-hs-chrome"><span class="m-hs-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="m-hs-url">app.lebrands.store</span></div>
        <div class="m-hs-kpis" role="group" aria-label="Illustrative sample figures">
          <div class="m-hs-kpi"><small>Orders today</small><b>24</b><span class="m-hs-bars" aria-hidden="true"><s style="--h:40%"></s><s style="--h:65%"></s><s style="--h:50%"></s><s style="--h:85%"></s><s style="--h:60%"></s><s style="--h:95%"></s><s style="--h:72%"></s></span></div>
          <div class="m-hs-kpi"><small>COD to collect</small><b>Rs. 38,420</b></div>
          <div class="m-hs-kpi"><small>Invoices issued</small><b>21</b></div>
          <em class="m-hs-sample">Sample data, illustrative</em>
        </div>
        <div class="m-hs-tabs" role="group" aria-label="Choose a feature">
          <button type="button" class="m-hs-tab" data-hs-tab="0" aria-current="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg><span>Storefront</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="1" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/></svg><span>Catalogue</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="2" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM3 11h18M7 15h3"/></svg><span>COD orders</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="3" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg><span>Customers</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="4" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg><span>GST invoice</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="5" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/></svg><span>Razorpay</span><i class="m-hs-prog"></i></button>
          <button type="button" class="m-hs-tab" data-hs-tab="6" aria-current="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7zM6 19a1.5 1.5 0 100-.01M17 19a1.5 1.5 0 100-.01"/></svg><span>Logistics</span><i class="m-hs-prog"></i></button>
        </div>
        <div class="m-hs-slides">
          <article class="m-hs-slide m-hs-slide-store is-active" data-hs-slide data-hs-line="Your products. Your flagship store." role="group" aria-roledescription="slide" aria-label="1 of 7: Premium storefront on desktop and mobile">
            <div class="m-hs-card m-hs-store"><div class="m-hs-store-desktop">${imageMarkup(MARKETING_MEDIA.exampleDesktop, { eager: true })}</div><div class="m-hs-store-phone">${imageMarkup(MARKETING_MEDIA.exampleMobile, { eager: true })}</div><span class="m-hs-store-cap">Example Studio, a concept store</span></div>
            <div class="m-hs-copy"><strong>A storefront that looks the part.</strong><p>Example Studio is a fictional clothing store concept, built with LeBrands.Store and shown on desktop and mobile.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="Your products. Your flagship store." role="group" aria-roledescription="slide" aria-label="2 of 7: Catalogue and collections" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <svg viewBox="0 0 240 70" class="m-hs-art" fill="none"><g class="m-t1"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(6 8)"/></g><g class="m-t2"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(88 8)"/></g><g class="m-t3"><path class="m-draw" pathLength="1" d="M10 14 L22 8 Q30 14 38 8 L50 14 L44 24 L40 21 L40 46 L20 46 L20 21 L16 24 Z" transform="translate(170 8)"/></g></svg>
              <div class="m-hs-rows"><span class="m-pill">New in</span><span class="m-pill">Basics</span><span class="m-pill">Festive</span><span class="m-pill m-pill-add">+ Collection</span></div>
            </div>
            <div class="m-hs-copy"><strong>Catalogue and collections.</strong><p>Add products with photos and prices, and group them into collections on your storefront.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="COD orders, from placed to delivered." role="group" aria-roledescription="slide" aria-label="3 of 7: Cash on Delivery orders" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-order"><span>Order 1042 <em>Sample</em></span><span>Rs. 1,852.20</span><span class="m-pill">Cash on Delivery</span></div>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Placed</span><span>Packed</span><span>Delivered</span></div>
            </div>
            <div class="m-hs-copy"><strong>COD checkout and orders.</strong><p>Customers pay on delivery. You follow each order from placed to packed to delivered, with COD limits and fraud checks built in.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="Your customers, all in one place." role="group" aria-roledescription="slide" aria-label="4 of 7: Customers" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-cust"><span><b>MK</b>Meera Kulkarni<em>3 orders</em></span><span><b>AS</b>Arjun Sethi<em>1 order</em></span><span><b>NF</b>Naz Fernandes<em>2 orders</em></span></div>
              <svg viewBox="0 0 300 30" class="m-hs-art" fill="none"><path class="m-draw" pathLength="1" d="M4 24C40 24 50 8 90 14S140 26 180 12 250 4 296 8"/></svg>
            </div>
            <div class="m-hs-copy"><strong>Customers you own.</strong><p>Every buyer, address and order history lives in your own customer list. We never market to your customers.</p></div>
          </article>
          <article class="m-hs-slide" data-hs-slide data-hs-line="GST invoices, correctly numbered." role="group" aria-roledescription="slide" aria-label="5 of 7: GST invoices" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Sample UI, illustrative</span>
              <div class="m-hs-inv"><span>Taxable value<b>Rs. 1,764.00</b></span><span>CGST 2.5%<b>Rs. 44.10</b></span><span>SGST 2.5%<b>Rs. 44.10</b></span><span class="m-hs-total">Total<b>Rs. 1,852.20</b></span></div>
              <svg viewBox="0 0 100 40" class="m-hs-stamp" fill="none"><rect class="m-draw" pathLength="1" x="2" y="2" width="96" height="36" rx="3"/><text x="50" y="26" text-anchor="middle">SAMPLE</text></svg>
            </div>
            <div class="m-hs-copy"><strong>GST invoices.</strong><p>Tax invoices with CGST, SGST or IGST worked out for you, numbered correctly every financial year. A valid GSTIN is required to publish.</p></div>
          </article>
          <article class="m-hs-slide m-hs-soon" data-hs-slide data-hs-line="Razorpay payments, with your own account." role="group" aria-roledescription="slide" aria-label="6 of 7: Razorpay payments" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Integration setup, illustrative</span>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Customer pays</span><span>Razorpay</span><span>Your account</span></div>
            </div>
            <div class="m-hs-copy"><strong>Razorpay payments. <em class="m-soon">Integration setup</em></strong><p>Online payments with your own Razorpay account. Contact us to discuss your setup.</p></div>
          </article>
          <article class="m-hs-slide m-hs-soon" data-hs-slide data-hs-line="Your logistics partner, set up with you." role="group" aria-roledescription="slide" aria-label="7 of 7: Logistics partners" hidden>
            <div class="m-hs-card"><span class="m-hs-tag">Integration setup, illustrative</span>
              <svg viewBox="0 0 300 40" class="m-hs-art m-hs-track" fill="none"><path class="m-draw" pathLength="1" d="M30 20H150H270"/><circle cx="30" cy="20" r="6"/><circle cx="150" cy="20" r="6"/><circle cx="270" cy="20" r="6"/><circle class="m-dot" cx="30" cy="20" r="3.5"/></svg>
              <div class="m-hs-steps"><span>Dispatch</span><span>Your partner</span><span>Customer</span></div>
            </div>
            <div class="m-hs-copy"><strong>Logistics partners. <em class="m-soon">Integration setup</em></strong><p>Shiprocket or any partner you choose can be connected for your brand. Contact us to discuss your setup.</p></div>
          </article>
        </div>
        <div class="m-hs-controls">
          <button type="button" data-hs-prev aria-label="Previous feature">&larr;</button>
          <button type="button" data-hs-next aria-label="Next feature">&rarr;</button>
          <button type="button" class="m-hs-toggle" data-hs-toggle aria-pressed="false" aria-label="Pause hero animation">Pause</button>
        </div>
        <p class="m-hs-live" data-hs-live aria-live="polite" aria-atomic="true"></p>
        <div class="m-hs-notifications" aria-hidden="true">
          <div class="m-hs-toast m-hs-toast-a"><i></i><span><b>New order</b>Cash on Delivery, Rs. 1,852.20. Sample.</span></div>
          <div class="m-hs-toast m-hs-toast-b"><i></i><span><b>Invoice ready</b>CGST and SGST split. Sample.</span></div>
        </div>
      </div>
      </div>
    </div>
    <span class="m-scroll-cue" aria-hidden="true">Scroll to explore <span></span></span>
  </section>

  <section class="m-discovery m-band-light m-ds" id="discovery" aria-labelledby="discovery-title">
    <div class="m-wrap m-ds-wrap">
      <div class="m-ds-copy m-reveal">
        <h2 id="discovery-title">Free discovery for your store.</h2>
        <p>Help shoppers find your brand through the LeBrands.Space virtual mall, at no extra cost.</p>
      </div>
      <figure class="m-ds-panel m-reveal m-reveal-delay">
        <div class="m-ds-map">
          <div class="m-ds-bar" aria-hidden="true"><i></i><i></i><i></i><span>lebrands.space</span></div>
          <a class="m-ds-shot" href="https://lebrands.space/" target="_blank" rel="noopener noreferrer" aria-label="Visit LeBrands.Space (opens in a new tab)"><img src="/img/REPLACE-lebrands-space-homepage.webp" width="1600" height="900" loading="lazy" decoding="async" alt="Screenshot of the LeBrands.Space homepage, showing the virtual mall and links to discover online brands"></a>
        </div>
        <figcaption>LeBrands.Space homepage (screenshot). <a class="m-ds-link" href="https://lebrands.space/" target="_blank" rel="noopener noreferrer">Explore LeBrands.Space <span aria-hidden="true">&rarr;</span></a></figcaption>
      </figure>
    </div>
  </section>

  <section class="m-principles m-band-dark" id="promises" aria-label="Our principles">
    <div class="m-wrap m-promise-wrap">
      <div class="m-promise m-reveal" data-promise-carousel role="region" aria-roledescription="carousel" aria-label="Our promises" tabindex="0">
        <div class="m-promise-stage" data-promise-stage>
          <article class="m-promise-slide is-active" data-promise-slide data-pv="0" role="group" aria-roledescription="slide" aria-label="1 of 3"><span class="m-promise-no" aria-hidden="true">01 <i>/ 03</i></span><p class="m-principle">Zero commission on your sales.</p></article>
          <article class="m-promise-slide" data-promise-slide data-pv="1" role="group" aria-roledescription="slide" aria-label="2 of 3"><span class="m-promise-no" aria-hidden="true">02 <i>/ 03</i></span><p class="m-principle">Your domain, your payments, your customer data.</p></article>
          <article class="m-promise-slide" data-promise-slide data-pv="2" role="group" aria-roledescription="slide" aria-label="3 of 3"><span class="m-promise-no" aria-hidden="true">03 <i>/ 03</i></span><p class="m-principle">We never market to your customers.</p></article>
        </div>
        <div class="m-promise-controls">
          <button class="m-promise-arrow" type="button" data-promise-prev aria-label="Previous promise">&larr;</button>
          <div class="m-promise-dots">
            <button type="button" class="m-promise-dot" data-promise-select="0" aria-label="Show promise 1 of 3" aria-current="true"></button>
            <button type="button" class="m-promise-dot" data-promise-select="1" aria-label="Show promise 2 of 3" aria-current="false"></button>
            <button type="button" class="m-promise-dot" data-promise-select="2" aria-label="Show promise 3 of 3" aria-current="false"></button>
          </div>
          <button class="m-promise-arrow" type="button" data-promise-next aria-label="Next promise">&rarr;</button>
          <button class="m-promise-play" type="button" data-promise-toggle aria-pressed="false" aria-label="Pause promises">Pause</button>
        </div>
        <p class="m-craft-live" data-promise-live aria-live="polite" aria-atomic="true"></p>
      </div>
    </div>
  </section>

  <section class="m-how m-band-light" id="features">
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
          <p class="m-clarification m-reveal">First publication requires platform approval.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="m-details m-band-dark" id="craft">
    <div class="m-wrap">
      <div class="m-details-head m-reveal">
        <div><span class="m-kicker">The store, behind the scenes</span><h2 class="m-section-title">Crafted details.</h2></div>
        <p>A storefront and the work that keeps it moving, considered together.</p>
      </div>
      <div class="m-reveal m-craft-reveal">
      <div class="m-craft-carousel" data-craft-carousel role="region" aria-roledescription="carousel" aria-label="Crafted details" tabindex="0">
        <div class="m-craft-stage" data-craft-stage>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="1 of 4: The store">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.productPhoto)}${MARKETING_MEDIA.productPhoto.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.productPhoto.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">01 <i>/ 04</i></span><h3>The store.</h3><p>Product pages, collections, cart and checkout designed to sell, on every screen size.</p></div>
          </article>
          <article class="m-craft-slide" data-craft-slide role="group" aria-roledescription="slide" aria-label="2 of 4: The checkout">
            <div class="m-craft-media">${imageMarkup(MARKETING_MEDIA.checkout)}${MARKETING_MEDIA.checkout.caption ? `<span class="m-media-caption">${MARKETING_MEDIA.checkout.caption}</span>` : ""}</div>
            <div class="m-craft-copy"><span class="m-craft-count">02 <i>/ 04</i></span><h3>The checkout.</h3><p>Cash on Delivery with built-in fraud protection, COD limits and order tracking for your customers.</p></div>
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
    </div>
  </section>

  <section class="m-pricing-tease m-band-dark">
    <div class="m-wrap m-pricing-inner m-reveal">
      <h2>Simple monthly pricing. No commission, ever.</h2>
      <a href="/pricing">See pricing <span aria-hidden="true">&rarr;</span></a>
    </div>
  </section>

  <section class="m-faq m-band-light" id="faq">
    <div class="m-wrap m-faq-inner">
      <h2 class="m-reveal">Good to know.</h2>
      <div class="m-faq-list">
        ${PLATFORM_FAQ.map(([question, answer]) => `<details class="m-faq-item m-reveal"><summary>${question}</summary><p>${answer}</p></details>`).join("\n")}
      </div>
    </div>
  </section>

  <section class="m-final m-band-dark">
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
