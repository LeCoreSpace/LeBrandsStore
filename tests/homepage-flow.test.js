import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome, renderPricing, renderArchivedHomeWithLegacyHero } from "../src/ui/marketing.js";

test("the current storyboard starts with founder pain, then Ann and the store", () => {
  const html = renderHome();
  const sections = [...html.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.match(sections[0], /\bh-pain\b/);
  assert.match(sections[1], /\bh-presence\b/);
  assert.match(sections[2], /\bh-answer\b/);
  assert.ok(sections.some(section=>/\bh-ann\b/.test(section)));
  assert.ok(sections.some(section=>/\bh-find\b/.test(section)));
  assert.doesNotMatch(html, /class="m-hero"|m-hs-slide-store/);
  assert.match(html, /Sound familiar\?/);
  assert.match(html, /Why is selling online so complicated\?/);
  assert.doesNotMatch(html, /tech headache/i);
  const opening = html.match(/<section class="h-sec h-pain[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(opening, /h-fc-ans|Meet Ann|No developer needed|Keep your sales|Start free/);
  assert.match(html, /Your product is ready\./);
  assert.match(html, /Now let’s give it an online presence\./);
  assert.match(html, /A store that tells your brand story and sells\./);
  assert.match(html, /<h2 id="h-presence-title">A store that tells your brand story and sells\.<\/h2>/);
  assert.match(html, /<h2 class="h-ann-intro">Meet Ann\.<\/h2>/);
  for (const concern of ["I just started my brand", "I am already selling online", "I do not know coding", "calling my developer again", "cut of every sale", "every month just for the basics", "Where do I even start", "payments, delivery and my web address"]) {
    assert.ok(opening.includes(concern), `Opening misses a founder concern: ${concern}`);
  }
  const founderCards = [...opening.matchAll(/<article class="h-fc\b[\s\S]*?<\/article>/g)];
  assert.equal(founderCards.length, 2);
  for (const [card] of founderCards) assert.equal((card.match(/<li>/g) || []).length, 3);
  assert.doesNotMatch(html, /id="product-pages"|A product page that actually converts/);
  // Shared head metadata links crawlers to llms.txt; it makes no claim about Ann.
  const body = html.slice(html.indexOf("<body"));
  assert.match(body, /Not AI\. Just how you want it\./);
  assert.doesNotMatch(body.replace("Not AI. Just how you want it.", ""), /\bAI\b|artificial intelligence/i);
  assert.doesNotMatch(html, />Illustrative founder scenarios<|AI-generated scene with the current Ann interface|Sample data, illustrative/);
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

test("storyboard sections appear in place with opacity-only entrances and reduced-motion support", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  const entrances = css.slice(css.indexOf("/* Storyboard entrances:"));
  assert.match(entrances, /body\.m-storyboard-document \.m-reveal\s*\{[^}]*transform:\s*none !important/);
  assert.match(entrances, /transition:\s*opacity \.52s ease/);
  assert.match(entrances, /@keyframes h-appear\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;/);
  assert.match(entrances, /prefers-reduced-motion:\s*reduce/);
  assert.match(entrances, /transition:\s*none !important/);
  const revealRule = entrances.match(/body\.m-storyboard-document \.m-reveal\s*\{[^}]*\}/)[0];
  assert.doesNotMatch(revealRule, /translate|rotate|scale|perspective/);
});
