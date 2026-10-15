import test from "node:test";
import assert from "node:assert/strict";
import { ANN_FIXTURE_MEDIA_PREFIX } from "../src/ann-preview-fixture.js";
import { safeImage } from "../src/public/aura-sections.js";
import { stylePreviewData, renderStylePreview } from "../src/public/style-preview.js";
import { DEFAULT_SETTINGS } from "../src/store/repository.js";

test("Ann fixture photos pass the unchanged Aura image allowlist and render on home and product", () => {
  const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const photo = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const url = `${ANN_FIXTURE_MEDIA_PREFIX}${photo}.webp`;
  assert.equal(safeImage(url), url);
  assert.equal(safeImage(`/__ann-builder-preview/media/${photo}.webp`), "");
  assert.equal(safeImage("https://untrusted.example/photo.webp"), "");
  const productionUrl = `https://media.lebrands.store/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${photo}.webp`;
  assert.equal(safeImage(productionUrl), productionUrl);
  const data = stylePreviewData({
    store: { name: "Fictional fixture", subdomain: "ann-test-store" },
    settings: { ...DEFAULT_SETTINGS },
    products: [{
      id, title: "Fictional saved shirt", status: "active",
      price_paise: 129909, stock: 7, images: [{ id: photo, url, alt: "Sample shirt" }],
    }],
    collections: [], layouts: {}, policies: [], reviews: [],
  });
  for (const page of ["home", "product"]) {
    const html = renderStylePreview(data, data.settings, { page, productId: id });
    assert.ok(html.includes(`src="${url}"`), `${page} must display the attached fixture photo`);
  }
});
