import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome, renderPricing, renderArchivedHomeWithLegacyHero } from "../src/ui/marketing.js";

test("the current storyboard starts with founder pain, then Ann and the store", () => {
  const html = renderHome();
  const sections = [...html.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.match(sections[0], /\bh-pain\b/);
  assert.match(sections[1], /\bh-answer\b/);
  assert.ok(sections.some(section=>/\bh-ann\b/.test(section)));
  assert.ok(sections.some(section=>/\bh-find\b/.test(section)));
  assert.doesNotMatch(html, /class="m-hero"|m-hs-slide-store/);
  assert.match(html, /Illustrative founder scenarios/);
  assert.doesNotMatch(html, /id="showcase"|Example Studio, imagined\./);
  assert.doesNotMatch(html, /class="m-showcase-cta m-reveal"/);
});

test("the old hero and decorative flow remain reusable but are not served on the homepage", async () => {
  const html = renderArchivedHomeWithLegacyHero(), css = await readFile("src/public/marketing.css", "utf8");
  assert.match(html, /<section class="m-hero"/);
  assert.doesNotMatch(html, /class="h-sec h-pain/);
  assert.doesNotMatch(renderHome(), /class="m-flow"/);
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
