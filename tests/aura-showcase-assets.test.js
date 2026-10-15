import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import worker from "../src/index.js";
import { SHOWCASE_MEDIA, SHOWCASE_MEDIA_PREFIX, isShowcaseImage } from "../src/public/aura-showcase-assets.js";

test("all five curated showcase packs have nine deployable, valid WebP assets", async () => {
  const urls = new Set();
  assert.deepEqual(Object.keys(SHOWCASE_MEDIA), ["editorial", "boutique", "architectural", "minimal", "vintage"]);
  for (const [style, pack] of Object.entries(SHOWCASE_MEDIA)) {
    assert.equal(Object.keys(pack.products).length, 5);
    assert.equal(Object.keys(pack.collections).length, 2);
    for (const image of [pack.hero, ...Object.values(pack.products), ...Object.values(pack.collections), pack.lifestyle]) {
      assert.ok(image.url.startsWith(`${SHOWCASE_MEDIA_PREFIX}${style}/`));
      assert.equal(isShowcaseImage(image.url), true);
      assert.equal(urls.has(image.url), false);
      urls.add(image.url);
      assert.equal(image.width, 1024);
      assert.equal(image.height, 1024);
      assert.ok(image.alt.includes("llustrative"));
      const file = new URL(`../src/public/${image.url.slice("/assets/".length)}`, import.meta.url);
      assert.ok((await stat(file)).size > 0);
      const bytes = await readFile(file);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    }
  }
  assert.equal(urls.size, 45);
});

test("Worker serves exact curated showcase paths without allowing other generated or private files", async () => {
  const seen = [];
  const env = { ASSETS: { fetch: async request => {
    seen.push(new URL(request.url).pathname);
    return new Response("curated", { headers: { "Content-Type": "image/webp" } });
  } } };
  for (const pack of Object.values(SHOWCASE_MEDIA)) {
    const response = await worker.fetch(new Request(`https://app.lebrands.store${pack.hero.url}`), env, {});
    assert.equal(response.status, 200);
    assert.ok(seen.at(-1).endsWith(pack.hero.url.slice("/assets".length)));
  }
  const count = seen.length;
  for (const path of [
    `${SHOWCASE_MEDIA_PREFIX}editorial/not-in-the-library.webp`,
    `${SHOWCASE_MEDIA_PREFIX}../private.webp`,
    "/assets/generated-artifacts/aura-style-complete/v01/manifest.csv",
  ]) {
    assert.equal(isShowcaseImage(path), false);
    assert.equal((await worker.fetch(new Request(`https://app.lebrands.store${path}`), env, {})).status, 404);
  }
  assert.equal(seen.length, count);
  assert.equal((await worker.fetch(new Request(`https://app.lebrands.store${SHOWCASE_MEDIA.boutique.hero.url}`, { method: "POST" }), env, {})).status, 405);
  for (const name of ["aura-showcase-interactions.js", "aura-showcase-profiles.js", "aura-showcase-sections.js", "aura-showcase-rich-css.js"]) {
    assert.equal((await worker.fetch(new Request(`https://app.lebrands.store/assets/${name}`), env, {})).status, 200);
    assert.ok((await stat(new URL(`../src/public/${name}`, import.meta.url))).size > 0);
  }
});
