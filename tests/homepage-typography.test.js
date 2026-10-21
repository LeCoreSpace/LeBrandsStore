import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome, renderPricing, renderCompare } from "../src/ui/marketing.js";

test("homepage typography has its own scope without changing pricing or comparison scopes", () => {
  assert.match(renderHome(), /<body class="m-home-document m-storyboard-document">/);
  assert.match(renderPricing(), /<body class="m-pricing-document">/);
  assert.match(renderCompare(), /<body class="m-pricing-document m-compare-document">/);
});

test("homepage font follows the Pricing stack, with scoped headline refinement", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /body\.m-home-document\s*\{[^}]*--m-sans:\s*Arial,\s*Helvetica,\s*sans-serif/);
  assert.match(css, /body\.m-home-document[^{]*\.m-hero h1[^{]*\{[^}]*letter-spacing:\s*(?:normal|0|-?\.0(?:1|15|2)em)/);
  assert.match(css, /body\.m-home-document[^{]*\.m-section-title/);
  assert.match(css, /body\.m-home-document[^{]*\.m-statement p/);
});

test("storyboard headings consistently use the self-hosted semibold face, including the primary H1", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  const headings = css.slice(css.lastIndexOf("/* ===== Homepage heading typography"));
  assert.match(headings, /--h-head-font:\s*"Instrument Sans"/);
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*"Instrument Sans"[^}]*font-weight:\s*400 600/);
  for (const selector of [".h-sec h1", ".h-sec h2", ".h-sec h3", ".m-faq-item summary", ".hf-cols h2"]) {
    assert.ok(headings.includes(selector), `Missing homepage heading: ${selector}`);
  }
  assert.match(headings, /font-weight:\s*600/);
  assert.match(headings, /@media \(max-width: 600px\)[\s\S]*\.h-sec h1/);
  assert.doesNotMatch(headings, /\.m-pricing-document|\.m-hero|https?:\/\//);
});
