import test from "node:test";
import assert from "node:assert/strict";
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
