import test from "node:test";
import assert from "node:assert/strict";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { SUBCATEGORY_SECTION_PROFILES, showcaseProfile } from "../src/public/aura-showcase-profiles.js";
import { attachShowcaseInteractions, previewBundleIds } from "../src/public/aura-showcase-interactions.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { projectAnnPreview } from "../src/public/ann-projection.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { styleSettings } from "../src/public/aura-styles.js";
import { SHOWCASE_MEDIA } from "../src/public/aura-showcase-assets.js";
import { readFile } from "node:fs/promises";

const source = () => ({ store: { name: "Example" }, settings: {}, products: [], collections: [], layouts: {}, policies: [] });
const profile = (category, slug) => showcaseProfile({ showcase_niche: { category_id: category, slug } }, "editorial");

test("all authoritative subcategories have scoped, differentiated section profiles", () => {
  assert.equal(Object.keys(SUBCATEGORY_SECTION_PROFILES).length, TAXONOMY.subcategories.length);
  for (const sub of TAXONOMY.subcategories) {
    const p = profile(sub.category_id, sub.slug);
    assert.equal(p.id, `${sub.category_id}:${sub.slug}`);
    assert.equal(p.topic, sub.name);
    assert.equal(p.guides.length, 3);
    assert.ok(p.guides.every(title => typeof title === "string" && title.length > 5));
    if (sub.category_id === 8) assert.equal(p.comparison, false, "health products must not inherit cosmetic efficacy previews");
  }
  assert.equal(profile(2, "skincare").comparison, true);
  assert.equal(profile(2, "haircare").family, "haircare");
  assert.equal(profile(2, "fragrances").comparison, false);
  assert.equal(profile(4, "storage-and-organization").comparison, true);
  assert.equal(profile(4, "furniture").family, "furniture");
  assert.equal(profile(12, "car-care").comparison, true);
  assert.notDeepEqual(profile(4, "lighting-and-lamps").guides, profile(4, "bedding-and-linen").guides);
});

test("every style includes rich, honest showcase sections, native carousels and valid exact-price bundle references", () => {
  const base = stylePreviewData(source(), { showcase: true });
  for (const style of Object.keys(SHOWCASE_MEDIA)) {
    for (const page of ["home", "collection", "product"]) {
      const html = renderStylePreview(base, styleSettings(style), { page });
      for (const token of ["Illustrative demo", "sc-offers", "sc-reviews", "sc-badges", "sc-faq"])
        assert.ok(html.includes(token), `${style}/${page} includes ${token}`);
      assert.ok(!html.includes("<script"));
      if (page === "home") {
        assert.ok(html.includes("data-showcase-carousel"));
        assert.ok(html.includes("data-showcase-prev="));
        assert.ok(html.includes("data-showcase-bundle"));
        assert.ok(html.includes("no discount applied"));
      }
      const trackIds = [...html.matchAll(/id="([^"]+)" data-showcase-carousel/g)].map(m => m[1]);
      assert.equal(new Set(trackIds).size, trackIds.length);
    }
  }
});

test("selecting skincare changes the guides and FAQ for every style without fabricating result photos", () => {
  const skin = TAXONOMY.subcategories.find(s => s.category_id === 2 && s.slug === "skincare");
  const base = stylePreviewData(source(), { showcase: true });
  for (const style of Object.keys(SHOWCASE_MEDIA)) {
    const cfg = annPreviewConfiguration({ style_preset: style, category_id: 2, subcategory_id: skin.id });
    const projected = projectAnnPreview(base, cfg).data;
    const html = renderStylePreview(projected, cfg.theme);
    assert.ok(html.includes(`data-niche-profile="2:skincare"`));
    assert.ok(html.includes("skin-type guidance"));
    assert.ok(html.includes("data-before-after-range"));
    assert.ok(html.includes("No product results are shown or claimed"));
    assert.ok(html.includes("Your approved image belongs here"));
    assert.ok(!html.includes("How should I care for silk and linen?"));
    assert.ok(!html.includes("How do I look after leather?"));
  }
  const cfg = annPreviewConfiguration({ style_preset: "boutique", category_id: 8,
    subcategory_id: TAXONOMY.subcategories.find(s => s.category_id === 8).id });
  const html = renderStylePreview(projectAnnPreview(base, cfg).data, cfg.theme);
  assert.ok(!html.includes("data-before-after-range"));
});

function node(dataset = {}) {
  return {
    dataset, disabled: false, attrs: {}, handlers: {}, style: { setProperty(key, value) { this[key] = value; } },
    classList: { names: new Set(), add(value) { this.names.add(value); }, remove(value) { this.names.delete(value); } },
    addEventListener(event, fn) { this.handlers[event] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
  };
}

test("trusted controls operate carousels, exact-ID bundles and comparison sliders, including reduced motion", () => {
  const products = [{ id: "a", status: "active" }, { id: "b", status: "active" }];
  assert.deepEqual(previewBundleIds("a a b", products), ["a", "b"]);
  assert.deepEqual(previewBundleIds("a unknown", products), []);
  const track = { ...node(), id: "track", scrollWidth: 900, clientWidth: 300, scrollLeft: 0,
    scrollBy(options) { this.lastScroll = options; this.scrollLeft += options.left; } };
  const prev = node({ showcasePrev: "track" }), next = node({ showcaseNext: "track" });
  const bundle = node({ productIds: "a b", showcaseBundle: "" });
  const frame = node(), slider = { ...node(), value: "50", closest: () => frame };
  const doc = {
    body: { dataset: { showcase: "boutique" } },
    defaultView: { matchMedia: () => ({ matches: true }), addEventListener() {} },
    querySelectorAll(selector) {
      return ({ "[data-showcase-reveal]": [], "[data-showcase-carousel]": [track],
        "[data-showcase-prev],[data-showcase-next]": [prev, next],
        "[data-showcase-bundle]": [bundle], "[data-before-after-range]": [slider] })[selector] || [];
    },
  };
  let navigated = "";
  const bag = new Map([["a", 99]]);
  attachShowcaseInteractions(doc, { products }, bag, page => { navigated = page; });
  assert.equal(prev.disabled, true);
  next.handlers.click();
  assert.equal(track.lastScroll.behavior, "auto");
  assert.equal(prev.disabled, false);
  bundle.handlers.click();
  assert.equal(bag.get("a"), 99);
  assert.equal(bag.get("b"), 1);
  assert.equal(navigated, "cart");
  slider.value = "70"; slider.handlers.input();
  assert.equal(frame.style["--compare"], "70%");
  assert.equal(slider.attrs["aria-valuetext"], "70% before panel, 30% after panel");
});

test("reveal enhancement is progressive, idempotent and disconnects cleanly", () => {
  let reveal, disposed = false, cleanup;
  const target = node({ revealKind: "clip" }), body = node();
  target.animate = () => { throw new Error("Do not stack a second animation over CSS reveals"); };
  body.dataset = { showcase: "editorial" };
  const doc = { body, querySelectorAll: selector => selector === "[data-showcase-reveal]" ? [target] : [],
    defaultView: {
      matchMedia: () => ({ matches: false }),
      IntersectionObserver: class {
        constructor(fn) { reveal = fn; }
        observe() {}
        unobserve() {}
        disconnect() { disposed = true; }
      },
      addEventListener(name, fn) { if (name === "pagehide") cleanup = fn; },
    },
  };
  attachShowcaseInteractions(doc, { products: [] }, new Map(), () => {});
  assert.ok(body.classList.names.has("sc-motion-ready"));
  reveal([{ isIntersecting: true, target }]);
  assert.ok(target.classList.names.has("is-visible"));
  reveal([{ isIntersecting: false, target }]);
  assert.ok(!target.classList.names.has("is-visible"));
  reveal([{ isIntersecting: true, target }]);
  assert.ok(target.classList.names.has("is-visible"), "scrolling back reveals the section again");
  cleanup();
  assert.equal(disposed, true);
});

test("Ann rounds conversation choices and preview selectors, without rounding all storefronts", async () => {
  const css = await readFile(new URL("../src/public/ann-builder.css", import.meta.url), "utf8");
  assert.match(css, /\.ann-chip,\.ann-choice\{border-radius:999px/);
  assert.match(css, /\.ann-tab\{[^}]*border-radius:999px/);
  const rich = await readFile(new URL("../src/public/aura-showcase-rich-css.js", import.meta.url), "utf8");
  assert.ok(rich.includes("[data-reveal-kind=clip]{clip-path:none}"), "waiting targets must retain geometry for IntersectionObserver");
});
