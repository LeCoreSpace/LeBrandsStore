import test from "node:test";
import assert from "node:assert/strict";
import { renderHome } from "../src/ui/marketing.js";
import { MARKETING_MEDIA } from "../src/ui/marketing-media.js";
import { PLATFORM_FAQ } from "../src/ui/platform-seo.js";
import { readFile } from "node:fs/promises";

const section = id => renderHome().match(new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?<\\/section>`))?.[0];
const text = html => html.replace(/<svg\b[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("help and trust retains all four approved benefits and its working pricing link", () => {
  const html = section("built-in");
  assert.ok(html);
  const copy = text(html);
  for (const phrase of [
    "Help and trust, built in.",
    "Help before and after launch",
    "Support tickets: Created, Pending or Closed. Emails when a request opens and closes.",
    "Team roles", "Owner, admin or editor.",
    "Private documents", "Seen only by you and our review team.",
    "Plan in Ann", "Choose a plan as you build.", "See pricing",
  ]) assert.ok(copy.includes(phrase), `Missing approved copy: ${phrase}`);
  assert.equal((html.match(/<li\b/g) || []).length, 4);
  assert.match(html, /href="\/pricing"/);
});

test("discovery keeps the real screenshot, link destinations and three ownership promises", () => {
  const html = section("discovery");
  assert.ok(html);
  const copy = text(html);
  for (const phrase of [
    "Your store. Part of something bigger.",
    "Free discovery on LeBrands.Space for all approved stores.",
    "0%", "Sales commission", "Yours.",
    "Your domain, payments and customer data", "Always.",
    "We never market to your customers.",
  ]) assert.ok(copy.includes(phrase), `Missing approved copy: ${phrase}`);
  for (const href of ["/pricing", "/compare", "/blog", "/support"]) assert.ok(html.includes(`href="${href}"`));
  assert.match(html, /href="https:\/\/lebrands\.space\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.ok(html.includes(MARKETING_MEDIA.discovery.src));
});

test("closing-section graphics are labelled or hidden from assistive technology", () => {
  const html = section("built-in") + section("discovery");
  const hiddenIcon = /<i\b[^>]*class="h-ico"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/i>/g;
  assert.equal([...html.matchAll(hiddenIcon)].length, 7);
  const accessible = html.replace(hiddenIcon, "");
  for (const [svg] of accessible.matchAll(/<svg\b[^>]*>/g)) {
    assert.match(svg, /aria-hidden="true"|aria-label="[^"]+"/);
    assert.doesNotMatch(svg, /tabindex="0"/);
  }
});

test("homepage FAQ preserves every approved question and answer as independent native disclosures", () => {
  const html = section("faq");
  assert.ok(html);
  const items = [...html.matchAll(/(<details\b[^>]*>)([\s\S]*?)<\/details>/g)];
  assert.equal(items.length, PLATFORM_FAQ.length);
  assert.match(html, /<h2[^>]*id="h-faq-title"[^>]*>Good to know\.<\/h2>/);
  for (const [index, [, opening, content]] of items.entries()) {
    const [question, answer] = PLATFORM_FAQ[index];
    assert.doesNotMatch(opening, /\bopen\b|\bname=/);
    assert.equal(text(content.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1]), text(question));
    assert.equal(text(content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1]), text(answer));
  }
});

test("homepage FAQ has scoped open and keyboard-focus presentation", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /body\.m-storyboard-document \.h-faq \.m-faq-item summary:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /body\.m-storyboard-document \.h-faq \.m-faq-item\[open\] summary::after\s*\{[^}]*background:/);
});

test("brand-story transition preserves the headline and adds the requested smaller supporting message", () => {
  const html = renderHome().match(/<section\b[^>]*aria-labelledby="h-presence-title"[\s\S]*?<\/section>/)?.[0];
  assert.ok(html);
  const heading = html.match(/<h2\b[^>]*id="h-presence-title"[^>]*>([\s\S]*?)<\/h2>/);
  assert.equal(text(heading[1]), "A store that tells your brand story and sells.");
  assert.ok(text(html).includes("Your product is ready."));
  assert.ok(text(html).includes("Now let’s give it an online presence."));
  assert.ok(text(html.slice(html.indexOf("</h2>") + 5)).includes(
    "Not charging on every sale. Not holding your customer data and payments."
  ));
  assert.doesNotMatch(html, /<button\b|data-theme-toggle/);
});
