import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPricing } from "../src/ui/marketing.js";

test("pricing leads with four plan cards and a separate comparison below", () => {
  const html = renderPricing();
  assert.equal((html.match(/<article class="m-pr-card\b/g) || []).length, 4);
  for (const plan of ["Launch", "Grow", "Scale", "Flagship"]) {
    assert.match(html, new RegExp(`id="plan-${plan}"`));
    assert.match(html, new RegExp(`Discuss ${plan}`));
  }
  for (const price of ["₹1,499", "₹3,499", "₹7,999", "₹19,999", "₹14,990", "₹34,990", "₹79,990"]) {
    assert.ok(html.includes(price), price);
  }
  assert.ok(html.indexOf('class="m-pr-plans"') < html.indexOf('class="m-pr-compare"'));
  assert.match(html, /Annual billing: custom quote/);
  assert.doesNotMatch(html, /custom, two months free/);
  assert.match(html, /never blocks checkout/);
  assert.match(html, /Proposed plan comparison/);
  assert.match(html, /feature availability and assisted integration scope/);
});

test("pricing shows the supplied billing terms without enabling billing", async () => {
  const html = renderPricing();
  for (const term of ["14 days.", "Discount to be decided.", "One GST invoice from LeBrandsSpace Digital Pvt Ltd", "Grow plan (includes LeBrands.Space Premium)", "plans move together", "7-day grace period", "dashboard read-only", "store paused", "90 days", "returns to free registration", "after 2 months over the band", "Checkout is never blocked."]) {
    assert.ok(html.includes(term), term);
  }
  assert.match(html, /Automated billing is not enabled yet/);
  const css = await readFile(new URL("../src/public/marketing.css", import.meta.url), "utf8");
  assert.match(css, /body\.m-pricing-document\s*\{[^}]*--m-ivory: #ffffff/);
  assert.match(css, /--m-sans: Arial, Helvetica, sans-serif/);
});

test("pricing uses provider-neutral integrations and accessible comparison tables", () => {
  const html = renderPricing();
  assert.doesNotMatch(html, /Razorpay|Shiprocket|Zoho|ZeptoMail|Brevo|Interakt|AiSensy|Gupshup|TeleCMI/i);
  for (const category of ["Payment gateway", "logistics partner", "Email provider", "Messaging provider", "Calling provider"]) {
    assert.ok(html.includes(category), category);
  }
  assert.match(html, /<th scope="col">Feature/);
  assert.match(html, /<th scope="row">/);
  assert.match(html, /role="region" tabindex="0"/);
  assert.match(html, /<span class="m-pr-sr">Included<\/span>/);
  assert.match(html, /mailto:support@lebrands\.store\?subject=Discuss%20the%20Launch%20plan/);
  assert.doesNotMatch(html, /[\u2013\u2014]/u);
});
