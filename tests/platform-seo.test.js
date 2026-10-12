import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import worker from "../src/index.js";
import preview from "../src/preview.js";
import { renderHome, renderPricing } from "../src/ui/marketing.js";
import { renderLegal } from "../src/ui/home.js";
import { layout } from "../src/ui/layout.js";
import { PLATFORM_FAQ, PUBLIC_PLATFORM_PATHS, PLATFORM_ORIGIN, platformSeoHead } from "../src/ui/platform-seo.js";

const files = {
  "/sitemap.xml": await readFile("src/public/sitemap.xml", "utf8"),
  "/llms.txt": await readFile("src/public/llms.txt", "utf8"),
  "/robots.txt": await readFile("src/public/robots.txt", "utf8"),
};
const env = {
  ASSETS: { fetch: async request => new Response(files[new URL(request.url).pathname] ?? "Not found", {
    status: Object.hasOwn(files, new URL(request.url).pathname) ? 200 : 404,
  }) },
};
const graph = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];

test("sitemap contains exactly the real public platform pages, without fabricated freshness", async () => {
  assert.match(files["/sitemap.xml"], /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  const locations = [...files["/sitemap.xml"].matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locations, PUBLIC_PLATFORM_PATHS.map(path => PLATFORM_ORIGIN + (path === "/" ? "" : path)));
  assert.doesNotMatch(files["/sitemap.xml"], /lastmod|changefreq|priority|app\.lebrands|replit|__|refund-policy|Example Studio/);
  for (const location of locations) assert.equal((await worker.fetch(new Request(location), {})).status, 200);
});

test("crawler files work as root Worker GET and HEAD endpoints with correct types and methods", async () => {
  for (const [path, content] of Object.entries(files)) {
    const response = await worker.fetch(new Request(PLATFORM_ORIGIN + path), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), content);
    assert.match(response.headers.get("content-type"), path.endsWith(".xml") ? /application\/xml/ : /text\/plain/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control"), /max-age=3600/);
    const head = await worker.fetch(new Request(PLATFORM_ORIGIN + path, { method: "HEAD" }), env);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await worker.fetch(new Request(PLATFORM_ORIGIN + path, { method: "POST" }), env)).status, 405);
    assert.equal((await worker.fetch(new Request(PLATFORM_ORIGIN + path), {})).status, 503);
    const redirect = await worker.fetch(new Request("https://www.lebrands.store" + path), {});
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), PLATFORM_ORIGIN + path);
  }
});

test("account and preview robots block indexing while preview keeps production source URLs intact", async () => {
  const account = await worker.fetch(new Request("https://app.lebrands.store/robots.txt"), {});
  assert.equal(await account.text(), "User-agent: *\nDisallow: /\n");
  const localRobots = await preview.fetch(new Request("https://preview.test/robots.txt"), {});
  assert.equal(await localRobots.text(), "User-agent: *\nDisallow: /\n");
  for (const path of ["/sitemap.xml", "/llms.txt"]) {
    const local = await preview.fetch(new Request("https://preview.test" + path), env);
    assert.match(local.headers.get("x-robots-tag"), /noindex/);
    assert.equal(await local.text(), files[path]);
  }
  assert.match(files["/robots.txt"], /Sitemap: https:\/\/lebrands.store\/sitemap.xml/);
  assert.match(renderLegal("refund-policy"), /name="robots" content="noindex,nofollow"/);
});

test("public metadata has accurate linked schema and complete social tags, but private pages do not", async () => {
  const pages = [renderHome(), renderPricing(), ...["terms", "privacy", "contact", "support"].map(renderLegal)];
  for (const html of pages) {
    const nodes = graph(html);
    const org = nodes.find(n => n["@type"] === "Organization");
    assert.equal(org.legalName, "LeBrandsSpace Digital Private Limited");
    assert.equal(org.email, "support@lebrands.store");
    assert.deepEqual(org.address, { "@type": "PostalAddress", addressLocality: "Chennai", addressCountry: "IN" });
    assert.ok(nodes.find(n => n["@type"] === "WebSite"));
    assert.match(html, /name="twitter:title"/);
    assert.match(html, /name="twitter:description"/);
    assert.match(html, /name="twitter:image"/);
    assert.match(html, /property="og:image:alt"/);
    assert.match(html, /href="https:\/\/lebrands.store\/llms.txt"/);
    assert.doesNotMatch(html, /[\u2013\u2014]/);
    assert.doesNotMatch(JSON.stringify(nodes), /aggregateRating|ratingValue|priceCurrency|300,000|sameAs/);
    for (const field of ["logo"]) assert.ok((await stat("src/public" + new URL(org[field]).pathname)).size);
  }
  assert.equal(graph(renderLegal("contact")).find(n => n["@type"] === "ContactPage").url, PLATFORM_ORIGIN + "/contact");
  assert.equal(platformSeoHead({ canonical: "invalid" }), "");
  assert.doesNotMatch(layout({ title: "Private", description: "Private", canonical: "https://app.lebrands.store/account", body: "", noindex: true }), /application\/ld\+json|llms.txt/);
});

test("FAQ schema is identical to each visible answer and contains no hidden questions", () => {
  const html = renderHome();
  const questions = graph(html).find(n => n["@type"] === "FAQPage").mainEntity;
  const visible = [...html.matchAll(/<details class="m-faq-item m-reveal"><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)];
  assert.equal(visible.length, PLATFORM_FAQ.length);
  assert.equal(questions.length, visible.length);
  visible.forEach((item, index) => {
    assert.equal(questions[index].name, item[1]);
    assert.equal(questions[index].acceptedAnswer.text, item[2]);
  });
  assert.equal(graph(renderHome()).find(n => n["@type"] === "SoftwareApplication").applicationCategory, "BusinessApplication");
  assert.ok(!graph(renderPricing()).some(n => n["@type"] === "FAQPage"));
});

test("llms guide states boundaries and never fabricates commercial or private data", () => {
  assert.match(files["/llms.txt"], /# LeBrands.Store/);
  assert.match(files["/llms.txt"], /pricing is being finalised/);
  assert.match(files["/llms.txt"], /first go-live requires platform approval/);
  assert.match(files["/llms.txt"], /separate service/);
  assert.doesNotMatch(files["/llms.txt"], /300[,\s]?000|₹|Rs\.|SESSION_SECRET|SUPABASE_DB_URL|GSTIN_KEY|[\u2013\u2014]/);
});
