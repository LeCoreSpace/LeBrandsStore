import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome, renderPricing } from "../src/ui/marketing.js";

test("storefront is the first hero scene and discovery directly follows hero", () => {
  const html = renderHome();
  const sections = [...html.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.equal(sections[0], "m-hero");
  assert.match(sections[1], /^m-discovery\b/);
  assert.match(sections[2], /^m-principles\b/);
  assert.equal((html.match(/m-hs-slide-store is-active/g) || []).length, 1);
  assert.doesNotMatch(html, /id="showcase"|Example Studio, imagined\./);
  assert.doesNotMatch(html, /class="m-showcase-cta m-reveal"/);
});

test("one decorative homepage flow crosses every section instead of restarting", async () => {
  const html = renderHome(), css = await readFile("src/public/marketing.css", "utf8");
  assert.equal((html.match(/class="m-flow"/g) || []).length, 1);
  assert.match(html, /<main id="top">\s*<div class="m-flow" aria-hidden="true">/);
  assert.match(html, /viewBox="0 0 1000 6000" preserveAspectRatio="none" focusable="false"/);
  const paths = [...html.matchAll(/class="m-flow-[ab]" d="([^"]+)"/g)];
  assert.equal(paths.length, 17);
  for (const [, path] of paths) {
    assert.match(path, /^M-?\d+ 0 /);
    assert.match(path, /L-?\d+ 6000$/);
  }
  assert.match(css, /\.m-flow \{[^}]*position: absolute; inset: 0;[^}]*overflow: hidden; pointer-events: none/);
  assert.match(css, /\.m-flow svg \{[^}]*width: 100%; height: 100%/);
  assert.match(css, /#top > section > \.m-wrap, #top > section > \.m-hero-inner \{[^}]*z-index: 2/);
  assert.match(css, /vector-effect: non-scaling-stroke/);
  assert.doesNotMatch(renderPricing(), /class="m-flow"/);
});
