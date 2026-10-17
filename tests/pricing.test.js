import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPricing } from "../src/ui/marketing.js";

test("pricing records the complete-store Free proposal without claiming enforcement is live", () => {
  const html=renderPricing();
  for(const term of ["100 published products","1,000 published SKUs in total","3 buying-option types","200 variants per product","first successful publication","not implemented yet","at least the Free plan's 1,000 SKUs","existing orders and fulfilment accessible","separate allowances to be finalised"]){
    assert.ok(html.includes(term),`Missing agreed offer detail: ${term}`);
  }
  assert.doesNotMatch(html, /50 SKUs|10 published products/);
});

test("pricing leads with a 30-day Free offer, four paid cards and a separate comparison", () => {
  const html = renderPricing();
  assert.equal((html.match(/<article class="m-pr-card\b/g) || []).length, 5);
  const free = html.match(/<article class="m-pr-card m-pr-free"[\s\S]*?<\/article>/)?.[0];
  assert.ok(free);
  assert.match(free, /id="plan-Free"/);
  assert.match(free, /₹0/);
  assert.match(free, /for 30 days/);
  assert.match(free, /yourbrand\.lebrands\.store/);
  assert.match(free, /Custom domain integration is available on paid plans only/);
  assert.match(free, /href="https:\/\/app\.lebrands\.store\/signup"/);
  assert.match(free, /Choose a paid plan to continue after 30 days/);
  assert.ok(html.indexOf('id="plan-Free"') < html.indexOf('id="plan-Launch"'));
  assert.doesNotMatch(html, /14 days|Free trial|Free forever|30 orders/i);
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
  assert.match(html, /Proposed paid plan comparison/);
  assert.match(html, /feature availability and assisted integration scope/);
});

test("pricing shows the supplied billing terms without enabling billing", async () => {
  const html = renderPricing();
  for (const term of ["30 days free", "Custom domain integration is not included in the 30-day Free plan", "Discount to be decided.", "One GST invoice from LeBrandsSpace Digital Pvt Ltd", "Grow plan (includes LeBrands.Space Premium)", "plans move together", "7-day grace period", "dashboard read-only", "store paused", "90 days", "returns to free registration", "after 2 months over the band", "Checkout is never blocked."]) {
    assert.ok(html.includes(term), term);
  }
  assert.match(html, /Automated billing is not enabled yet/);
  const css = await readFile(new URL("../src/public/marketing.css", import.meta.url), "utf8");
  assert.match(css, /body\.m-pricing-document\s*\{[^}]*--m-ivory: #ffffff/);
  assert.match(css, /--m-sans: Arial, Helvetica, sans-serif/);
  assert.match(css, /:root body\.m-pricing-document \.m-pricing-page\s*\{\s*background: #ffffff/);
  assert.match(css, /:root body\.m-pricing-document \.m-logo-dark\s*\{\s*display: none/);
  assert.doesNotMatch(css, /:root\[data-theme="dark"\] \.m-pricing-page\s*\{/);
});

test("pricing uses provider-neutral integrations and accessible comparison tables", () => {
  const html = renderPricing();
  assert.doesNotMatch(html, /Razorpay|Shiprocket|Zoho|ZeptoMail|Brevo|Interakt|AiSensy|Gupshup|TeleCMI/i);
  assert.doesNotMatch(html, /\bAura\b|\bBazaar\b/i);
  assert.match(html, /Build with Ann, theme editor and version history/);
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
