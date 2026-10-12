import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { renderHome } from "../src/ui/marketing.js";

test("free discovery remains an aspiration highlight after the storefront showcase, without unsupported claims", async () => {
  const html = renderHome();
  const section = html.match(/<section class="m-discovery\b[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /Free discovery for your store\./);
  assert.match(section, /Help shoppers find your brand through the LeBrands\.Space virtual mall, at no extra cost\./);
  assert.match(section, /Illustrative directory\. Example stores\./);
  assert.doesNotMatch(section, /\bmanual(?:ly)?\b|\bautomat(?:ic|ically|ed)\b|300[,\s]?000|guaranteed|Rolling out|coming soon|\bapproval\b/i);
  assert.equal((html.match(/id="discovery"/g) || []).length, 1);
  assert.ok(html.indexOf('id="showcase"') < html.indexOf('id="discovery"'));
  assert.ok(html.indexOf('id="discovery"') < html.indexOf('id="promises"'));
  assert.match(section, /m-ds-copy m-reveal/);
  assert.match(section, /m-ds-panel m-reveal m-reveal-delay/);
  assert.match(section, /aria-labelledby="discovery-title"/);
  for (const match of section.matchAll(/<img src="([^"]+)"/g)) {
    assert.ok((await stat(`src/public${match[1]}`)).size > 0);
  }
});

test("discovery motion uses shared gradient, visibility gating and existing pause accessibility", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /\.m-ds-map \{[^}]*background-image: var\(--m-dark-grad\)/);
  assert.match(css, /\.m-motion \.m-section-active\.m-ds \.m-ds-dot \{ animation: m-ds-travel/);
  assert.match(css, /\.m-page-hidden \.m-section-active \*[\s\S]*?animation-play-state: paused !important/);
  assert.match(css, /:root\.m-fx-paused \.m-ds \*[^}]*animation: none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.m-ds \*[^}]*animation: none !important/);
  assert.match(css, /@media \(max-width: 800px\) \{ \.m-ds-wrap \{ grid-template-columns: minmax\(0, 1fr\)/);
});
