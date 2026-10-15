/**
 * Rich, demo-only showcase sections: offers, reviews, UGC strips, bundles,
 * trust badges, FAQs and care notes. Every claim is labelled illustrative.
 * Bundle totals are exact sums of the projected product prices.
 */
import { safeImage } from "./aura-sections.js";
import * as Profiles from "./aura-showcase-profiles.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rupees = paise => `\u20B9${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const tag = text => `<em class="sc-demo-tag">${esc(text)}</em>`;
const ILL = "Illustrative demo";
const pHref = p => `/products/${encodeURIComponent(p.id)}`;
const pic = (o, alt) => safeImage(o?.url) ? `<img src="${esc(safeImage(o.url))}" alt="${esc(alt ?? o.alt ?? "")}" width="${Number(o.width) || 1024}" height="${Number(o.height) || 1024}" loading="lazy" decoding="async">` : "";
const DEFAULT_WORLD = { editorial: /women|cloth|apparel|dress|fashion/i, boutique: /skin/i, architectural: /street|cloth|apparel|men/i, minimal: /decor|home/i, vintage: /bag|leather/i };
/** True when the selected niche is the style's own sample world (or unknown). */
const inWorld = (style, profile) => !profile?.topic || DEFAULT_WORLD[style]?.test(profile.topic);
const lower = t => String(t || "products").toLowerCase();
const stepper = id => `<span class="sc-car-btns"><button type="button" data-showcase-prev="${id}" aria-label="Previous">Prev</button><button type="button" data-showcase-next="${id}" aria-label="Next">Next</button></span>`;

/** Horizontal track. Native scroll: touch, keyboard (focusable) and visible scrollbar. */
function carousel(id, title, items, kicker = "") {
  return `<div class="sc-car" data-showcase-reveal><div class="sc-car-bar"><div>${kicker ? `<p class="sc-kick">${esc(kicker)}</p>` : ""}<h2>${esc(title)}</h2></div>${stepper(id)}</div><div class="sc-car-track" id="${id}" data-showcase-carousel tabindex="0" role="region" aria-label="${esc(title)}">${items.join("")}</div></div>`;
}

const REVIEWS = {
  editorial: [["The drape looks lovely and the colour photographs beautifully.", "Sample reviewer A"], ["Easy to style across a few outfits.", "Sample reviewer B"], ["Clean lines and a calm palette.", "Sample reviewer C"]],
  boutique: [["The bottle looks lovely on a shelf and the texture is light.", "Sample reviewer A"], ["A simple routine that is easy to follow.", "Sample reviewer B"], ["Pretty packaging, easy to use daily.", "Sample reviewer C"]],
  architectural: [["Heavy fabric, clean cut, easy to layer.", "Sample reviewer A"], ["The fit reads sharp in every photo.", "Sample reviewer B"], ["Pockets in the right places.", "Sample reviewer C"]],
  minimal: [["It sits quietly on the shelf and suits the room.", "Sample reviewer A"], ["Simple shapes that go with everything.", "Sample reviewer B"], ["Calm, tidy, easy to place.", "Sample reviewer C"]],
  vintage: [["Warm colour and a classic shape in the photographs.", "Sample reviewer A"], ["It looks like it would carry well on a long day.", "Sample reviewer B"], ["A handsome catalogue piece.", "Sample reviewer C"]],
};
const FAQ = {
  editorial: [["How should I care for silk and linen?", "Follow the care label on each garment. As general guidance, delicate fabrics suit gentle washing or dry cleaning."], ["Where will sizing help appear?", "A size guide can sit here. This demo shows the placement only."], ["What about delivery and returns?", "Your own delivery and returns terms will appear here. This demo makes no promise."], ["Can I see more photos?", "Yes, tap any product photo to enlarge it in the preview."]],
  boutique: [["How do I check what is in a product?", "Always read the ingredient list on the pack. Add yours here when you build the store."], ["Should I patch test?", "Patch testing before first use is general good practice. Add your own guidance here."], ["How is delivery handled?", "Your delivery terms will appear here. This demo makes no promise."], ["Can I return a product?", "Your returns terms will appear here once written."]],
  architectural: [["How should I wash heavy cotton?", "Follow the care label on each piece. As general guidance, wash dark pieces inside out."], ["Where does the size chart go?", "Here. This demo shows the placement only."], ["Delivery times?", "Your own delivery terms will appear here. No dispatch promise is made in this demo."], ["Returns?", "Your returns terms will appear here once written."]],
  minimal: [["How do I care for ceramics and wood?", "As general guidance, wipe wood with a dry cloth and hand wash ceramics gently. Follow your maker's notes."], ["Are measurements shown?", "Add dimensions here. This demo shows the placement only."], ["Delivery?", "Your own delivery terms will appear here. This demo makes no promise."], ["Returns?", "Your returns terms will appear here once written."]],
  vintage: [["How do I look after leather?", "As general guidance, keep leather dry and away from direct heat, and wipe with a soft cloth. Add your own care notes here."], ["Where do measurements go?", "Here. This demo shows the placement only."], ["Delivery?", "Your own delivery terms will appear here. This demo makes no promise."], ["Returns?", "Your returns terms will appear here once written."]],
};
const OFFERS = [["Sample welcome offer", "SAMPLE10", "Shows where a code and amount appear. No discount is configured."], ["Sample set offer", "SETDEMO", "Shows a bundle promotion placement. No real saving applies."], ["Sample delivery note", "DELIVERY", "Shows where delivery terms go. No delivery promise is made."]];
const BADGES = [["Payment options", "Methods appear here once you configure them"], ["Delivery details", "Your own timings and areas appear here"], ["Returns terms", "Your own policy appears here"], ["Secure checkout", "Shown only when it is really set up"]];

function faqItems(style, profile) {
  if (!profile?.guides?.length) return FAQ[style];
  let advice = [];
  try { const g = Profiles.profileGuidance?.(profile); advice = Array.isArray(g) ? g.map(i => typeof i === "string" ? i : i?.text || i?.body || i?.copy || "") : typeof g === "string" ? [g] : []; } catch { advice = []; }
  const topic = lower(profile.topic);
  const items = profile.guides.map((h, i) => [h, advice[i] || `Add your own ${topic} details here. This demo shows where this guidance sits and makes no product claims.`]);
  items.push(["Delivery and returns", "Your own delivery and returns terms will appear here. This demo makes no promise."]);
  return items;
}
export const faq = (style, title = "Questions and care", cols = "", profile = null) => `<section class="sc-sec sc-faq ${cols}"><div class="sc-faq-head" data-showcase-reveal><h2>${esc(title)}</h2><p>Sample questions for illustration. Replace them with your own policies. ${tag(ILL)}</p></div><div class="sc-faq-list">${faqItems(style, profile).map(([q, a], i) => `<details data-showcase-reveal style="--i:${i}"${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>`;

export const offers = (variant = "row") => `<section class="sc-sec sc-offers sc-offers-${variant}" aria-label="Illustrative offers">${OFFERS.map(([t, code, note], i) => `<div class="sc-offer" data-showcase-reveal style="--i:${i}"><b>${esc(t)}</b><code>${esc(code)}</code><span>${esc(note)}</span>${tag(ILL + ", not a real offer")}</div>`).join("")}</section>`;

export const badges = (variant = "grid") => `<section class="sc-sec sc-badges sc-badges-${variant}" aria-label="Illustrative trust and delivery badges"><ul>${BADGES.map(([t, n], i) => `<li data-showcase-reveal style="--i:${i}"><b>${esc(t)}</b><span>${esc(n)}</span>${tag(ILL + ", not configured")}</li>`).join("")}</ul></section>`;

const NEUTRAL_REVIEWS = topic => [[`The photos show the ${topic} clearly and the page is easy to follow.`, "Sample reviewer A"], ["Clear layout and easy to compare the options.", "Sample reviewer B"], ["The product details are simple to find.", "Sample reviewer C"]];
export function reviews(style, variant = "grid", title = "What shoppers could say", profile = null) {
  const set = inWorld(style, profile) ? REVIEWS[style] : NEUTRAL_REVIEWS(lower(profile.topic));
  const cards = set.map(([text, who], i) => `<figure class="sc-review" data-showcase-reveal style="--i:${i}"><span class="sc-rating" aria-label="Illustrative rating">Illustrative rating</span><blockquote>${esc(text)}</blockquote><figcaption>${esc(who)} ${tag(ILL + " review, not a real customer")}</figcaption></figure>`);
  const head = `<div class="sc-head" data-showcase-reveal><h2>${esc(title)}</h2><p>Sample reviews show where social proof sits. ${tag(ILL)}</p></div>`;
  if (variant === "carousel") return `<section class="sc-sec sc-reviews">${head}${carousel("sc-reviews-track", "Sample reviews", cards)}</section>`;
  return `<section class="sc-sec sc-reviews sc-reviews-${variant}">${head}<div class="sc-review-grid">${cards.join("")}</div></section>`;
}

/** Strip of existing curated images presented as sample community photos. */
export function ugc(x, id = "sc-ugc-track", title = "Seen in the community") {
  const imgs = [x.media.lifestyle, x.media.hero, ...x.products.map(p => p.images?.[0]), ...Object.values(x.media.collections || {})].filter(o => o?.url);
  const items = imgs.slice(0, 8).map((o, i) => `<figure class="sc-ugc" style="--i:${i}">${pic(o, "Illustrative community photo")}<figcaption>Sample photo ${String(i + 1).padStart(2, "0")} ${tag(ILL + ", not a real customer")}</figcaption></figure>`);
  return `<section class="sc-sec sc-ugcs">${carousel(id, title, items, "Illustrative social proof")}</section>`;
}

/** Exact-sum bundle from current projected products. */
export function bundle(x, picks, name, variant = "card", note = "") {
  if (!inWorld(x.style, x.profile)) { name = "Complete the set"; note = `Sample ${lower(x.profile.topic)} products shown together.`; }
  const list = picks.filter(Boolean);
  if (list.length < 2) return "";
  const total = list.reduce((s, p) => s + Number(p.price_paise || 0), 0);
  return `<section class="sc-sec sc-bundle sc-bundle-${variant}"><article data-showcase-reveal><div class="sc-bundle-imgs">${list.map(p => `<a href="${pHref(p)}" aria-label="${esc(p.title)}">${pic(p.images?.[0], p.title)}</a>`).join("")}</div><div class="sc-bundle-copy"><p class="sc-kick">Illustrative bundle</p><h2>${esc(name)}</h2>${note ? `<p>${esc(note)}</p>` : ""}<ul>${list.map(p => `<li><a href="${pHref(p)}">${esc(p.title)}</a><span>${rupees(p.price_paise)}</span></li>`).join("")}</ul><p class="sc-bundle-total"><span>Set total</span><b>${rupees(total)}</b></p><p class="sc-small">Exact sum of the sample prices above, no discount applied. ${tag(ILL)}</p><button type="button" data-showcase-bundle data-product-ids="${esc(list.map(p => p.id).join(" "))}">Add set to preview bag</button></div></article></section>`;
}

/* ---------------- arrangements ---------------- */
const NAMES = { editorial: "The pairing", boutique: "Build a routine", architectural: "Loadout", minimal: "A small set", vintage: "The gift set" };
const NOTES = { editorial: "A blouse and trousers, seen together.", boutique: "Three sample steps, shown as one set.", architectural: "Pieces that work as one outfit.", minimal: "Two objects that sit well together.", vintage: "Companions for the journey." };
const PICK = { editorial: [0, 1], boutique: [2, 0, 1], architectural: [0, 1, 2], minimal: [1, 2], vintage: [0, 2] };

/** home: three insertion zones, different order and variants per style. */
export function homeRich(style, x) {
  const set = bundle(x, (PICK[style] || [0, 1]).map(i => x.products[i]), NAMES[style], style === "vintage" ? "tag" : style === "architectural" ? "block" : "card", NOTES[style]);
  const out = {
    editorial: { top: offers("rule"), mid: reviews(style, "pull", "Notes from readers", x.profile) + ugc(x, "sc-ugc-track", "Readers' plates"), bottom: set + faq(style, "Letters and care", "two", x.profile) + badges("line") },
    boutique: { top: offers("pills"), mid: reviews(style, "carousel", "Kind words, illustrated", x.profile) + set, bottom: ugc(x, "sc-ugc-track", "Shelfies from the community") + badges("chips") + faq(style, "Good to know", "", x.profile) },
    architectural: { top: badges("grid"), mid: reviews(style, "blocks", "Field notes", x.profile) + offers("blocks"), bottom: ugc(x, "sc-ugc-track", "On the street") + set + faq(style, "FAQ", "two", x.profile) },
    minimal: { top: "", mid: ugc(x, "sc-ugc-track", "In rooms") + reviews(style, "list", "Words", x.profile), bottom: set + badges("line") + faq(style, "Questions", "", x.profile) + offers("rule") },
    vintage: { top: offers("ticket"), mid: reviews(style, "letters", "Letters to the workshop", x.profile) + set, bottom: ugc(x, "sc-ugc-track", "Plates from the road") + badges("seals") + faq(style, "Catalogue notes", "", x.profile) },
  }[style];
  return out;
}

export function productRich(style, x, product) {
  const others = x.products.filter(p => p.id !== product.id);
  const set = bundle(x, [product, others[0], others[1]].slice(0, style === "minimal" || style === "editorial" || style === "vintage" ? 2 : 3), "Complete the set", style === "architectural" ? "block" : style === "vintage" ? "tag" : "card", "Pairs this piece with other sample products.");
  const aside = `${badges("compact")}`;
  const below = {
    editorial: reviews(style, "pull", "Notes from readers", x.profile) + set + faq(style, "Care and questions", "two", x.profile),
    boutique: set + reviews(style, "carousel", "Kind words, illustrated", x.profile) + faq(style, "Good to know", "", x.profile),
    architectural: reviews(style, "blocks", "Field notes", x.profile) + set + faq(style, "FAQ", "two", x.profile),
    minimal: reviews(style, "list", "Words", x.profile) + set + faq(style, "Questions", "", x.profile),
    vintage: set + reviews(style, "letters", "Letters", x.profile) + faq(style, "Catalogue notes", "", x.profile),
  }[style];
  return { aside, below, offer: offers("compact") };
}

export function collectionRich(style, x) {
  const looks = [x.media.lifestyle, x.media.hero, ...Object.values(x.media.collections || {})].filter(o => o?.url)
    .map((o, i) => `<figure class="sc-ugc" style="--i:${i}">${pic(o)}<figcaption>Illustrative look ${String(i + 1).padStart(2, "0")}</figcaption></figure>`);
  const strip = `<section class="sc-sec sc-ugcs">${carousel("sc-looks-track", "Shop by look", looks, "Sample imagery")}</section>`;
  return {
    top: offers(style === "boutique" ? "pills" : style === "vintage" ? "ticket" : "rule"),
    bottom: strip + badges(style === "architectural" ? "grid" : "line") + reviews(style, style === "boutique" ? "carousel" : "grid", "Sample reviews", x.profile) + faq(style, "Questions", style === "architectural" ? "two" : "", x.profile),
  };
}
