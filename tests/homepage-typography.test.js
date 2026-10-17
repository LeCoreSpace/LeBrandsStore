import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHome, renderPricing, renderCompare } from "../src/ui/marketing.js";

test("homepage typography has its own scope without changing pricing or comparison scopes", () => {
  assert.match(renderHome(), /<body class="m-home-document">/);
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
