import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STYLE_IDS, styleSettings } from "../src/public/aura-styles.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { projectAnnPreview, annAnsweredStages } from "../src/public/ann-projection.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";
import { isAnnDesign } from "../src/public/ann-design-model.js";
import { seedDesignMedia } from "../src/store/ann-design.js";
import { renderAura } from "../src/public/aura.js";

const styles = ["social-pop", "creator-feed", "proof-detail"];
const source = () => ({ store: { name: "Example Studio" }, settings: {},
  products: [], collections: [], layouts: {}, policies: [], reviews: [] });

test("new styles provide distinct whole-store voices while preserving shared skincare product facts", () => {
  const base = stylePreviewData(source(), { showcase: true });
  const headlines = new Set(), productPages = new Set();
  let facts;
  for (const style of styles) {
    assert.ok(STYLE_IDS.includes(style));
    assert.ok(annAnsweredStages({ style_preset: style }).has("style"));
    const config = annPreviewConfiguration({ category_id: 2, subcategory_id: 21, style_preset: style });
    const { data } = projectAnnPreview(base, config);
    if (!facts) facts = structuredClone(data.products);
    else assert.deepEqual(data.products, facts);
    const hero = data.layouts.home.find(s => s.type === "hero").settings;
    headlines.add(hero.title);
    assert.match(hero.description, /skincare|cleansers|ingredients/);
    assert.doesNotMatch(hero.description, /slay|no cap|rizz|anti-aging miracle/i);
    for (const page of ["home", "collection", "product", "cart", "checkout", "about", "contact"]) {
      const html = renderStylePreview(data, config.theme, { page, productId: data.products[0].id });
      assert.ok(html.includes(`data-style="${style}"`), `${style}/${page}`);
      assert.doesNotMatch(html, /<script\b|undefined|NaN/);
      assert.match(html, /noindex, nofollow/);
      if (page === "product") {
        assert.ok(html.includes(data.products[0].title));
        assert.match(html, /au-buy/);
        assert.match(html, /data-gallery-image/);
        productPages.add(html.replaceAll(style, "same-style"));
      }
    }
  }
  assert.equal(headlines.size, 3);
  assert.equal(productPages.size, 3);
});

test("all new saved-design styles keep catalogue authority and real purchasing hooks", () => {
  for (const style of styles) {
    const data = source(), settings = styleSettings(style);
    const media = seedDesignMedia("boutique");
    const design = { version: 1, style, media_pack: "boutique", media,
      copy: { title: "Our actual brand heading", description: "A real brand introduction." } };
    assert.ok(isAnnDesign(design));
    data.settings = { ...settings, brand_name: "Example Studio", ann_design: design };
    data.products = [{ id: "actual-item", status: "active", stock: 0, title: "Merchant product",
      description: "Merchant specifications", price_paise: 123400, images: [media.hero],
      content: { features: [{ label: "Size", value: "100 ml" }] } }];
    const original = structuredClone(data);
    const html = renderAura(data, { page: "product", productId: "actual-item", commerce: true });
    assert.ok(html.includes("Merchant product"));
    assert.ok(html.includes("Merchant specifications"));
    assert.match(html, /Sold out/);
    assert.doesNotMatch(html, /Sample reviewer|SAMPLE10|clinically proven|subscribe.*save|verified buyer/i);
    assert.deepEqual(data, original);
    const noPhoto = structuredClone(data);
    noPhoto.products[0].images = [];
    assert.match(renderAura(noPhoto, { page: "product", productId: "actual-item", commerce: true }), /Product image unavailable/);
    data.products[0].stock = 5;
    const available = renderAura(data, { page: "product", productId: "actual-item", commerce: true });
    assert.match(available, /data-add-product="actual-item"/);
    assert.match(available, /data-commerce-feedback/);
    for (const page of ["cart", "checkout"]) {
      const native = renderAura(data, { page, commerce: true });
      assert.ok(native.includes(`data-style="${style}"`));
      assert.match(native, /commerce\.js/);
    }
  }
});

test("Ann comparisons start on the product page without replacing the saved-design confirmation flow", async () => {
  const controller = await readFile(new URL("../src/public/ann-builder.js", import.meta.url), "utf8");
  assert.match(controller, /page = "product"/);
  const editor = await readFile(new URL("../src/public/ann-design-ui.js", import.meta.url), "utf8");
  assert.match(editor, /expected_draft: expected, confirm: true/);
  assert.match(editor, /media_pack: model\.media_pack/);
});
