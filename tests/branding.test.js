import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";
import { FAVICON_LINKS, FAVICON_SVG } from "../src/ui/favicon.js";
import { LE_BRANDS_LOGO, LE_BRANDS_MARK } from "../src/ui/brand.js";
import { layout, brandMark } from "../src/ui/layout.js";
import { renderHome, renderPricing } from "../src/ui/marketing.js";

test("platform page families share the hanging-sign lockup and refreshed browser icons", async () => {
  for (const html of [
    renderHome(), renderPricing(),
    layout({ title: "Account", body: brandMark(), canonical: "https://app.lebrands.store/login" }),
  ]) {
    assert.ok(html.includes(FAVICON_LINKS));
    assert.match(html, /REPLACE-lebrands-light-transparent\.webp/);
    assert.doesNotMatch(html, /REPLACE-lebrands-(?:light|dark)-logo\.webp/);
  }
  assert.match(LE_BRANDS_LOGO, /alt="LeBrands.Store"/);
  assert.match(LE_BRANDS_MARK, /REPLACE-lebrands-mark\.png/);
  for (const file of ["src/ui/dashboard.js", "src/ui/wizard.js"]) {
    const source = await readFile(file, "utf8");
    assert.ok(source.includes("${LE_BRANDS_LOGO}"), `${file} uses the full shared lockup`);
    assert.ok(source.includes("${LE_BRANDS_MARK}"), `${file} retains the compact shared mark`);
  }
  for (const name of ["light-transparent", "hero-transparent", "mark"]) {
    const bytes = await readFile(`src/public/img/REPLACE-lebrands-${name}.png`);
    assert.equal(bytes[25], 6, `${name} retains the RGBA transparency channel`);
  }
});

test("SVG favicon embeds the exact supplied-artwork PNG with no external dependencies", async () => {
  const icon = await readFile("src/public/img/REPLACE-lebrands-favicon.png");
  const data = FAVICON_SVG.match(/data:image\/png;base64,([^"]+)/)?.[1];
  assert.ok(data);
  assert.deepEqual(Buffer.from(data, "base64"), icon);
  for (const host of ["lebrands.store", "app.lebrands.store"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(new Request(`https://${host}/favicon.svg?v=hanging-sign`, { method }), {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/svg+xml");
      assert.equal(await response.text(), method === "HEAD" ? "" : FAVICON_SVG);
    }
  }
});

test("browser ICO fallback serves real multi-size artwork and supports HEAD", async () => {
  const icon = await readFile("src/public/img/REPLACE-lebrands-favicon.ico");
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 3);
  for (const host of ["lebrands.store", "app.lebrands.store"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(new Request(`https://${host}/favicon.ico?v=hanging-sign`, { method }), {
        ASSETS: { fetch: async request => {
          assert.equal(new URL(request.url).pathname, "/img/REPLACE-lebrands-favicon.ico");
          assert.equal(request.method, method);
          return new Response(method === "HEAD" ? null : icon);
        } },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/x-icon");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === "HEAD" ? Buffer.alloc(0) : icon);
    }
  }
});

test("account host serves shared logo artwork before account/auth routing", async () => {
  for (const filename of ["light-transparent.webp", "light-transparent.png", "dark-transparent.webp", "hero-transparent.png", "mark.png", "apple-touch-icon.png"]) {
    const path = `/img/REPLACE-lebrands-${filename}`;
    const bytes = await readFile(`src/public${path}`);
    for (const method of ["GET", "HEAD"]) {
      let fetches = 0;
      const response = await worker.fetch(new Request(`https://app.lebrands.store${path}`, { method }), {
        ASSETS: { fetch: async request => {
          fetches++;
          assert.equal(new URL(request.url).pathname, path);
          assert.equal(request.method, method);
          return new Response(method === "HEAD" ? null : bytes, { headers: { "content-type": filename.endsWith(".webp") ? "image/webp" : "image/png" } });
        } },
      });
      assert.equal(fetches, 1);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^image\//);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === "HEAD" ? Buffer.alloc(0) : bytes);
    }
  }
});

test("account logo route rejects writes and preserves explicit asset errors", async () => {
  const url = "https://app.lebrands.store/img/REPLACE-lebrands-light-transparent.webp";
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await worker.fetch(new Request(url, { method }), {});
    assert.equal(response.status, 405);
  }
  assert.equal((await worker.fetch(new Request(url), {})).status, 503);
  const missing = await worker.fetch(new Request(url), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
});
