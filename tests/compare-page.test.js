import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/index.js";
import preview from "../src/preview.js";
import { PRICING_PLANS } from "../src/public/pricing-plans.js";
import { PLATFORMS } from "../src/public/compare-data.js";
import { estimateCosts, recommend } from "../src/public/compare-engine.js";
import { DEFAULTS, parseInputs, resultsHtml, quizHtml } from "../src/public/compare.js";
import { COMPARE_FAQ, compareMain } from "../src/ui/compare.js";
import { renderCompare, renderHome, renderPricing } from "../src/ui/marketing.js";

const cost = (inputs = {}) => Object.fromEntries(estimateCosts({ ...DEFAULTS, ...inputs }).map(r => [r.id, r]));
const answers = { marketing: "self", international: false, zoho: false, variants: false, guided: false, budget: "fixed" };

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
  assert.match(html, /Not priced, so not ranked/);
  assert.match(html, /tailored quote/);
});

test("capabilities filter before preferences, including unavailable variant checkout", () => {
  const rec = recommend({ ...answers, variants: true, guided: true }, DEFAULTS);
  assert.notEqual(rec.primary, "lebrands");
  assert.ok(!rec.alternatives.includes("lebrands"));
  assert.match(rec.excluded.find(x => x.id === "lebrands").reason, /not live/);
  assert.equal(recommend({ ...answers, marketing: "managed" }, DEFAULTS).primary, "shopdeck");
  assert.equal(recommend({ ...answers, zoho: true }, DEFAULTS).primary, "zoho");
  assert.equal(recommend({ ...answers, international: true }, DEFAULTS).primary, "shopify");
  assert.equal(recommend({ ...answers, marketing: "managed", international: true }, DEFAULTS).primary, null);
});

test("guided language preference can favour Ann but is not a fake price advantage", () => {
  assert.equal(recommend({ ...answers, guided: true }, DEFAULTS).primary, "lebrands");
  assert.equal(recommend(answers, DEFAULTS).primary, "zoho");
  const rec = recommend({ ...answers, guided: true, sales: 900000 }, { ...DEFAULTS, sales: 900000 });
  assert.equal(rec.primary, "lebrands");
  assert.equal(rec.plan, "Grow");
});

test("international Zoho recommendation quotes an eligible tier, not Standard", () => {
  const rec = recommend({ ...answers, international: true, zoho: true }, DEFAULTS);
  assert.equal(rec.primary, "zoho");
  assert.equal(rec.plan, "Professional");
  assert.equal(rec.estimate.subscription, 1799);
  assert.match(quizHtml(rec, estimateCosts(DEFAULTS)), /Professional/);
});

test("invalid and incomplete quiz states fail explicitly; displayed copy is escaped", () => {
  assert.throws(() => recommend({}, DEFAULTS), RangeError);
  assert.throws(() => recommend({ ...answers, guided: "invented" }, DEFAULTS), RangeError);
  const html = quizHtml({ primary: "lebrands", reasons: { lebrands: ["<img src=x onerror=alert(1)>"] } }, []);
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("server-rendered page contains five sources, usable default estimates and dated methodology", () => {
  const html = compareMain();
  for (const p of PLATFORMS) {
    assert.ok(html.includes(p.name));
    assert.ok(html.includes(p.sourceUrl.replaceAll("&", "&amp;")));
    assert.equal(p.checkedOn, "2026-10-17");
  }
  assert.match(html, /data-results><h3/);
  assert.match(html, /Annual upfront/);
  assert.match(html, /not an independent review/);
  assert.match(html, /not live/);
  assert.doesNotMatch(html, /300,000|Free LeBrands.Space|keep 100%|—/);
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
  for (const file of ["compare.js", "compare.css", "compare-data.js", "compare-engine.js", "pricing-plans.js"]) {
    const res = await worker.fetch(new Request(`https://lebrands.store/assets/${file}`), { ASSETS: { fetch: async req => {
      assert.equal(new URL(req.url).pathname, "/" + file);
      return new Response(await readFile("src/public/" + file, "utf8"), { headers: { "content-type": file.endsWith(".css") ? "text/css" : "text/javascript" } });
    } } });
    assert.equal(res.status, 200);
  }
  const client = await readFile("src/public/compare.js", "utf8");
  assert.match(client, /document\.querySelector\("\[data-quiz-out\]"\)/);
  assert.doesNotMatch(client, /q\.querySelector\("\[data-quiz-out\]"\)/);
  assert.match(client, /if \(lastQuiz\) show\(lastQuiz, false\)/);
});
