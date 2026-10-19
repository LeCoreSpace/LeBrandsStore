import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";
import preview from "../src/preview.js";
import { PRICING_PLANS } from "../src/public/pricing-plans.js";
import { PLATFORMS, COMPARISON_ROWS } from "../src/public/compare-data.js";
import { estimateCosts } from "../src/public/compare-engine.js";
import { DEFAULTS, parseInputs, resultsHtml, esc } from "../src/public/compare.js";
import { COMPARE_FAQ, compareMain } from "../src/ui/compare.js";
import { renderCompare, renderHome, renderPricing } from "../src/ui/marketing.js";
import { ANN_LANGUAGES } from "../src/public/ann-language.js";

const cost = (inputs = {}) => Object.fromEntries(estimateCosts({ ...DEFAULTS, ...inputs }).map(r => [r.id, r]));

test("all five estimates use independently checked public recurring rates", () => {
  const c = cost({ sales: 500000 });
  assert.equal(c.lebrands.total, 8915.83);
  assert.equal(c.shopify.total, 13499);
  assert.equal(c.zoho.total, 6599);
  assert.equal(c.shopdeck.total, 21000);
  assert.equal(c.dukaan.total, 15116.67);
  assert.equal(c.dukaan.plan, "Infinity");
  assert.equal(c.dukaan.annualUpfront, 50000);
});

test("annual subscriptions and upfront commitments share the Pricing source", () => {
  const c = cost();
  assert.equal(c.lebrands.plan, "Launch");
  assert.equal(c.lebrands.annualUpfront, PRICING_PLANS[0].annualFee);
  assert.equal(c.lebrands.subscription, 1249.17);
  assert.equal(PLATFORMS[0].plans[1].monthly, PRICING_PLANS[1].monthlyFee);
  const monthly = cost({ billing: "monthly" });
  assert.equal(monthly.lebrands.subscription, 1499);
  assert.equal(monthly.shopify.subscription, 1994);
  assert.equal(monthly.zoho.subscription, 999);
  assert.equal(monthly.dukaan.plan, "Free");
  assert.match(monthly.dukaan.note, /paid monthly quotes are unverified/);
});

test("gateway and Shopify third-party fees use only prepaid value", () => {
  const c = cost({ sales: 500000, prepaid: 0 });
  assert.equal(c.shopify.platformFee, 0);
  for (const r of Object.values(c)) assert.equal(r.gatewayFee, 0);
});

test("ShopDeck success fees use delivered sales and Dukaan caps each average order", () => {
  const c = cost({ sales: 500000, delivered: 70, aov: 50000 });
  assert.equal(c.shopdeck.platformFee, 10500);
  assert.equal(c.dukaan.platformFee, 2000);
  assert.equal(c.dukaan.plan, "Free");
});

test("zero sales are valid, invalid or missing numbers are not zero substitutes", () => {
  for (const r of Object.values(cost({ sales: 0 }))) assert.ok(Number.isFinite(r.total));
  for (const bad of [{ aov: 0 }, { sales: -1 }, { prepaid: 101 }, { gateway: NaN }, { delivered: null }, { billing: "invented" }]) {
    assert.throws(() => cost(bad), RangeError);
  }
  assert.equal(parseInputs({ ...DEFAULTS, sales: "" }).ok, false);
  assert.equal(parseInputs({ ...DEFAULTS, aov: "0.001" }).ok, false);
  assert.equal(parseInputs({ ...DEFAULTS, aov: "0.01" }).ok, true);
});

test("custom quotes are optional, explicit, validated assumptions", () => {
  const c = cost({ quotes: { shopify: { monthly: 100, rate: 1 } } });
  assert.equal(c.shopify.subscription, 100);
  assert.equal(c.shopify.platformFee, 1200);
  assert.equal(c.shopify.annualUpfront, null);
  assert.match(c.shopify.note, /custom monthly quote/);
  assert.equal(parseInputs({ ...DEFAULTS, shopifyMonthly: "100" }).ok, false);
  assert.equal(parseInputs({ ...DEFAULTS, zohoMonthly: "1e20", zohoRate: "0" }).ok, false);
});

test("Flagship starting prices stay quote-only and are never ranked as complete prices", () => {
  const c = cost({ sales: 7000000, aov: 800 });
  assert.equal(c.lebrands.status, "quote");
  assert.equal(c.lebrands.total, null);
  assert.equal(c.lebrands.plan, "Flagship");
  const html = resultsHtml(Object.values(c), DEFAULTS);
  assert.match(html, /Quote only/);
  assert.match(html, /tailored quote/);
});

test("differentiators are complete, grouped, concise rows with five platform columns", () => {
  const html = compareMain();
  const groups = [...new Set(COMPARISON_ROWS.map(r => r.section))];
  assert.deepEqual(COMPARISON_ROWS.map(r => r.label), [
    "How easy to build", "Who builds it", "Guided conversation languages", "Hiring needed", "Theme options",
    "How much you can customise", "Catalogue and variants", "Product and collection SEO",
    "Free offer and domains", "Commission on sales", "Paid extras",
    "COD and RTO tools", "You own customer data", "Payment and courier accounts",
    "Built-in discovery", "Who runs marketing", "Built for India", "GST documents",
  ]);
  assert.equal(groups.length, 6);
  assert.equal((html.match(/scope="rowgroup"/g) || []).length, 6);
  for (const r of COMPARISON_ROWS) {
    assert.ok(html.includes(esc(r.label)));
    assert.ok(r.section);
    assert.deepEqual(Object.keys(r.cells), PLATFORMS.map(p => p.id));
    for (const text of Object.values(r.cells)) {
      assert.equal(typeof text, "string");
      assert.ok(text.length > 0 && !text.includes("undefined"));
      assert.ok(html.includes(esc(text)));
    }
  }
  assert.match(html, /GST-verified onboarding/);
  assert.match(html, /live preview/);
  assert.match(html, /RTO tracking and analysis not enabled/);
  assert.match(html, /LeBrands.Space mall placement depends on plan and approval/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g,""),/\b(upcoming|planned)\b/i);
  assert.doesNotMatch(html, /2 themes at launch|Monthly cost at|Monthly subscription<\/th>/);
});

test("calculator results remain tabular and escaped, without a monthly-cost comparison row", () => {
  const results = estimateCosts(DEFAULTS);
  const html = resultsHtml(results, DEFAULTS);
  assert.match(html, /<table class="c-table c-cost">/);
  assert.match(html, /Annual subscription upfront/);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 7);
  assert.doesNotMatch(compareMain(), /data-reference-cost|data-reference-scenario|Estimated monthly cost<\/th>|Monthly cost at/);
  const escaped = resultsHtml([{ ...results[0], name: "<img src=x onerror=alert(1)>" }], DEFAULTS);
  assert.doesNotMatch(escaped, /<img/);
  assert.match(escaped, /&lt;img/);
});

test("quiz, recommendation storage and all comparison cards are removed", async () => {
  const html = renderCompare();
  assert.doesNotMatch(html, /quiz|c-plat|c-res-card|c-quiz|c-ledger/i);
  const client = await readFile("src/public/compare.js", "utf8");
  assert.doesNotMatch(client, /localStorage|recommend|QUIZ_|quizHtml/);
});

test("server-rendered page contains five sources and dated methodology without the calculator", () => {
  const html = compareMain();
  for (const p of PLATFORMS) {
    assert.ok(html.includes(p.name));
    assert.ok(html.includes(p.sourceUrl.replaceAll("&", "&amp;")));
    assert.equal(p.checkedOn, "2026-10-17");
  }
  assert.doesNotMatch(html, /calculator|data-calc|data-results|Recalculate|Monthly total|Annual subscription upfront|<form/i);
  assert.doesNotMatch(renderCompare(), /src="\/assets\/compare\.js"|transparent cost estimates/);
  assert.doesNotMatch(renderPricing(), /using your own sales numbers/);
  assert.match(html, /not an independent review/);
  assert.match(html, /not enabled/);
  assert.doesNotMatch(html, /300,000|Free LeBrands.Space|keep 100%|—/);
});

test("visible differentiators include all five Ann languages and the missing catalogue features", () => {
  const html = compareMain();
  const names = { en: "English", hi: "Hindi", ta: "Tamil", mr: "Marathi", te: "Telugu" };
  const row = COMPARISON_ROWS.find(r => r.label === "Guided conversation languages");
  for (const language of ANN_LANGUAGES) assert.ok(row.cells.lebrands.includes(names[language]));
  assert.match(row.cells.lebrands, /not storefront translation/);
  for (const feature of ["auto SKUs", "collections, tags, vendor", "SEO title, description and editable URL", "GST invoices and credit notes", "100 products and 1,000 SKUs", "sections, menus, undo and saved versions"]) {
    assert.ok(html.includes(feature), feature);
  }
  assert.match(html, /variant checkout not live/);
  assert.match(html, /Timer and quotas not enabled/);
  assert.match(html, /not confirmed, not that it is unavailable/);
});

test("Compare reuses Pricing typography and headings instead of independent heading rules", async () => {
  const html = renderCompare();
  assert.match(html, /class="m-pricing-document m-compare-document"/);
  assert.match(html, /<main class="m-pr-main"/);
  assert.match(html, /class="m-pr-hero"/);
  assert.match(html, /class="m-pr-lede"/);
  assert.match(html, /class="m-pr-head"><h2/);
  assert.match(html, /class="m-pr-close"/);
  const css = await readFile("src/public/compare.css", "utf8");
  assert.doesNotMatch(css, /\.c-hero\s+h1|\.c-h2|\.c-close\s+h2|font-family\s*:/);
});
test("Compare sits next to Pricing and FAQ schema uses the visible answers", () => {
  for (const html of [renderHome(), renderPricing(), renderCompare()]) assert.match(html, /href="\/pricing">Pricing<\/a>\s*<a href="\/compare">Compare/);
  const html = renderCompare();
  assert.match(html, /rel="canonical" href="https:\/\/lebrands.store\/compare"/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b["@type"] === "FAQPage");
  assert.ok(faq);
  assert.equal(faq.mainEntity.length, COMPARE_FAQ.length);
  for (const f of COMPARE_FAQ) assert.ok(html.includes(f.q));
});

test("production and preview expose GET/HEAD with marketing CSP and reject writes", async () => {
  const res = await worker.fetch(new Request("https://lebrands.store/compare"), {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /font-src 'self'/);
  assert.equal((res.headers.get("content-security-policy").match(/media-src/g) || []).length, 1);
  const head = await worker.fetch(new Request("https://lebrands.store/compare", { method: "HEAD" }), {});
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  assert.equal((await worker.fetch(new Request("https://lebrands.store/compare", { method: "POST" }), {})).status, 405);
  const dev = await preview.fetch(new Request("https://example.replit.dev/compare"), {});
  assert.equal(dev.status, 200);
  assert.match(await dev.text(), /id="compare-title"/);
});

test("every public comparison asset is allowlisted and dependencies are served as JS/CSS", async () => {
  for (const file of ["compare.js", "compare.css", "compare-data.js", "compare-engine.js", "pricing-plans.js", "aura-styles.js"]) {
    const res = await worker.fetch(new Request(`https://lebrands.store/assets/${file}`), { ASSETS: { fetch: async req => {
      assert.equal(new URL(req.url).pathname, "/" + file);
      return new Response(await readFile("src/public/" + file, "utf8"), { headers: { "content-type": file.endsWith(".css") ? "text/css" : "text/javascript" } });
    } } });
    assert.equal(res.status, 200);
  }
  assert.doesNotMatch(renderCompare(), /<script[^>]+src="\/assets\/compare\.js"/);
});
