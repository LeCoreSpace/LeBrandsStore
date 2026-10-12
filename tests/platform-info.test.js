import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";
import { renderLegal } from "../src/ui/home.js";
import { footer } from "../src/ui/layout.js";

test("Terms Privacy Contact and Support contain verified facts rather than placeholders", async () => {
  for (const kind of ["terms", "privacy", "contact", "support"]) {
    const html = renderLegal(kind);
    assert.match(html, /class="wrap legal-page platform-info"/);
    assert.match(html, /LeBrandsSpace Digital Private Limited/);
    assert.match(html, /support@lebrands\.store/);
    assert.match(html, /href="mailto:support@lebrands\.store"/);
    assert.match(html, /href="\/assets\/legal.css"/);
    assert.match(html, new RegExp(`href="/${kind}" aria-current="page"`));
    assert.ok((html.match(/class="info-section"/g) || []).length >= 4);
    assert.doesNotMatch(html, /Draft:|This page is a draft|before publication|TODO|Lorem ipsum/);
    const response = await worker.fetch(new Request(`https://lebrands.store/${kind}`), {});
    assert.equal(response.status, 200);
    assert.match(await response.text(), /class="info-content"/);
    const head = await worker.fetch(new Request(`https://lebrands.store/${kind}`, { method: "HEAD" }), {});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  }
  assert.match(renderLegal("contact"), /Chennai, India/);
  assert.match(renderLegal("privacy"), /Cloudflare.*Supabase/);
  assert.match(renderLegal("terms"), /brand is the seller/i);
  assert.match(footer(), /href="https:\/\/lebrands.store\/support">Support/);
});

test("information pages have small sans-serif headings scoped away from account pages", async () => {
  const css = await readFile("src/public/legal.css", "utf8");
  assert.match(css, /\.platform-info/);
  assert.match(css, /sans-serif/);
  assert.match(css, /\.legal-page\.platform-info h1\s*\{[^}]*font:\s*600 clamp\(26px, 3\.4vw, 34px\)/);
  const response = await worker.fetch(new Request("https://lebrands.store/assets/legal.css"), {
    ASSETS: { fetch: async request => {
      assert.equal(new URL(request.url).pathname, "/legal.css");
      return new Response(css, { headers: { "content-type": "text/css" } });
    } },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/css/);
  assert.equal(await response.text(), css);
});
