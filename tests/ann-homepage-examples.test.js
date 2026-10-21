import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";
import { MARKETING_MEDIA } from "../src/ui/marketing-media.js";

test("the Ann story uses the supplied current English and Hindi Modern Boutique homepage captures", async () => {
  const section = renderHome().match(/<div class="h-slide h-ann"[\s\S]*?(?=<div class="h-slide h-store")/)[0];
  assert.match(section, /role="tablist"/);
  assert.match(section, /English/);
  assert.match(section, /Hindi|हिन्दी/);
  assert.match(section, /Modern Boutique/);
  assert.doesNotMatch(section, /Bold Architectural/);
  assert.match(section, /role="tab"[^>]+aria-selected="true"/);
  assert.match(section, /role="tabpanel"[^>]+hidden/);
  for (const [language, media] of [["English", MARKETING_MEDIA.annBuilder], ["Hindi", MARKETING_MEDIA.annBuilderHindi]]) {
    assert.ok(section.includes(media.src));
    assert.ok(media.alt.includes(language));
    assert.match(media.alt, /homepage/);
    assert.match(media.src, /home-(en|hi)\.webp$/);
    for (const path of new Set([media.src, ...media.srcset.split(",").map(s => s.trim().split(" ")[0])])) {
      assert.ok((await stat("src/public" + path)).size > 0);
    }
  }
});

test("screenshot tabs switch panels with clicks and keyboard without autoplay", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  const start = source.indexOf("  function initializeAnnTabs() {");
  const end = source.indexOf('\n  if (document.readyState', start);
  assert.ok(start > 0 && end > start);
  const panels = { en: { hidden: false }, hi: { hidden: true } };
  const tabs = ["en", "hi"].map((language, i) => ({
    dataset: { annTab: language }, selected: String(i === 0), tabIndex: i === 0 ? 0 : -1, listeners: {}, focused: false,
    setAttribute(name, value) { assert.equal(name, "aria-selected"); this.selected = value; },
    getAttribute() { return this.selected; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    focus() { this.focused = true; },
  }));
  const tablist = { listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; } };
  const root = {
    querySelectorAll() { return tabs; },
    querySelector(selector) { return selector === "[role=tablist]" ? tablist : panels[selector.includes('"hi"') ? "hi" : "en"]; },
  };
  runInNewContext(source.slice(start, end) + "\ninitializeAnnTabs();", {
    document: { querySelectorAll() { return [root]; } },
  });
  tabs[1].listeners.click();
  assert.equal(panels.hi.hidden, false);
  assert.equal(panels.en.hidden, true);
  assert.equal(tabs[1].selected, "true");
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0].tabIndex, -1);
  const key = key => tablist.listeners.keydown({ key, preventDefault() {} });
  key("ArrowRight");
  assert.equal(panels.en.hidden, false);
  assert.equal(tabs[0].focused, true);
  key("End");
  assert.equal(panels.hi.hidden, false);
  key("Home");
  assert.equal(panels.en.hidden, false);
  key("ArrowLeft");
  assert.equal(panels.hi.hidden, false);
  assert.doesNotMatch(source.slice(start, end), /setInterval|setTimeout/);
  assert.match(source.slice(end), /DOMContentLoaded", initializeAnnTabs/);
});
