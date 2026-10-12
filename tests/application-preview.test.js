import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import preview from "../src/preview.js";
import { PREVIEW_SCREENS } from "../src/local-app-preview.js";
const env = new Proxy({}, {get(){throw new Error("Application preview must not access account/database bindings");}});
const request = (path, method = "GET") => preview.fetch(new Request(`https://local.invalid${path}`, {method}), env, {});

test("application shell has all screen links, safe selection and a responsive local iframe", async () => {
  const response = await request("/__app-preview?screen=orders");
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const [screen] of PREVIEW_SCREENS) assert.ok(html.includes(`screen=${screen}`));
  assert.match(html, /src="\/__app-preview\/page\/orders"/);
  assert.match(html, /No live account, database writes/);
  const escaped = await (await request("/__app-preview?screen=%22%3E%3Cscript%3E")).text();
  assert.doesNotMatch(escaped, /<script>/);
  assert.match(escaped, /src="\/__app-preview\/page\/overview"/);
});

test("all account and operational screens render without authentication or DB access", async () => {
  for (const view of ["login","signup","forgot-password","account","stores","new-store","overview","orders","order","products","product","product-new","customers","customer","settings","invoices","invoice","store-home","store-collection","store-product","store-about","store-contact","store-policy","store-cart","store-checkout","store-track"]) {
    const response = await request(`/__app-preview/page/${view}`);
    assert.equal(response.status, 200, view);
    const html = await response.text();
    assert.match(html, /Read-only application preview/);
    assert.doesNotMatch(html, /href="\/stores\/00000000/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await request("/__app-preview/page/unknown")).status, 404);
});

test("storefront sample links stay inside the local preview and keep brand-owned colours", async () => {
  const html = await (await request("/__app-preview/page/store-home")).text();
  assert.match(html, /href="\/__app-preview\/page\/store-product\?product=/);
  assert.match(html, /href="\/__app-preview\/page\/store-policy\?policy=privacy"/);
  assert.doesNotMatch(html, /href="\/products\/|href="\/collections\//);
  assert.match(html, /--accent:\s*#214a3d/);
});

test("sample account and app pages reject all writes, including password and settings submissions", async () => {
  for (const method of ["POST","PATCH","PUT","DELETE"]) {
    for (const path of ["/__app-preview", "/__app-preview/page/account", "/__app-preview/page/settings", "/__app-preview/page/signup"]) {
      assert.equal((await request(path, method)).status, 403);
    }
  }
});

test("production entry has no application preview dependency", async () => {
  const source = await readFile("src/index.js", "utf8");
  assert.doesNotMatch(source, /local-app-preview|__app-preview/);
});
