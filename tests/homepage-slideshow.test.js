import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";

function element() {
  const classes = new Set(), attributes = new Map();
  return {
    hidden: false, tabIndex: -1, offsetWidth: 1, listeners: {}, classes, attributes,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    removeAttribute: name => attributes.delete(name),
    querySelectorAll: () => [], closest: () => null,
    focus() { this.focused = true; },
    getBoundingClientRect: () => ({ top: 0 }),
    scrollIntoView() { this.scrolls = (this.scrolls || 0) + 1; },
  };
}

async function fixture(hash = "", readyState = "complete") {
  const source = await readFile("src/public/marketing.js", "utf8");
  const controller = source.slice(source.indexOf("/* Homepage slideshow:"));
  const root = element(), nav = element(), count = element(), stage = element();
  const prev = element(), next = element(), location = { hash }, events = {};
  const slides = ["features", "ann", "storefront", "business"].map(id => {
    const slide = element(), reveal = element();
    slide.id = id; slide.reveal = reveal;
    slide.querySelectorAll = () => [reveal];
    return slide;
  });
  const tabs = slides.map(() => {
    const tab = element();
    tab.closest = selector => selector === "[data-h-show-tab]" ? tab : null;
    return tab;
  });
  root.querySelectorAll = selector => selector === "[data-h-slide]" ? slides : tabs;
  const controls = {
    "[data-h-show-nav]": nav, "[data-h-show-count]": count, "[data-h-show-stage]": stage,
    "[data-h-show-prev]": prev, "[data-h-show-next]": next,
  };
  root.querySelector = selector => controls[selector];
  runInNewContext(controller, {
    document: {
      readyState, querySelector: () => root,
      addEventListener: (name, handler) => { events["document:" + name] = handler; },
    },
    window: { addEventListener: (name, handler) => { events[name] = handler; } },
    location, history: { replaceState: (_, __, value) => { location.hash = value; } },
    requestAnimationFrame: fn => fn(),
  });
  const active = () => slides.findIndex(slide => !slide.hidden);
  return { root, nav, count, stage, prev, next, location, events, slides, tabs, active, controller };
}

test("four existing stories share one slideshow with a readable no-JavaScript fallback", () => {
  const html = renderHome();
  assert.equal((html.match(/\bdata-h-show>/g) || []).length, 1);
  const slides = [...html.matchAll(/<div class="h-slide[^"]*"[^>]+data-h-slide[^>]*>/g)];
  assert.equal(slides.length, 4);
  assert.deepEqual(slides.map(([tag]) => tag.match(/id="([^"]+)"/)[1]), ["features", "ann", "storefront", "business"]);
  for (const [tag] of slides) assert.doesNotMatch(tag, /\bhidden\b/);
  assert.match(html, /data-h-show-nav hidden/);
  assert.match(html, /Not AI\. Just how you want it\./);
});

test("selectors, arrows and keyboard change exactly one slide and preserve nested state", async () => {
  const f = await fixture();
  assert.equal(f.active(), 0); assert.equal(f.nav.hidden, false);
  assert.equal(f.count.textContent, "1 of 4");
  f.tabs[1].listeners.click();
  f.slides[1].savedLanguage = "hi";
  assert.equal(f.active(), 1);
  assert.ok(f.slides[1].reveal.classes.has("is-visible"));
  f.next.listeners.click(); assert.equal(f.active(), 2);
  f.prev.listeners.click(); assert.equal(f.active(), 1);
  assert.equal(f.slides[1].savedLanguage, "hi");
  const key = name => f.nav.listeners.keydown({ key: name, target: f.tabs[f.active()], preventDefault() {} });
  key("End"); assert.equal(f.active(), 3); assert.ok(f.tabs[3].focused);
  key("ArrowRight"); assert.equal(f.active(), 0);
  key("ArrowLeft"); assert.equal(f.active(), 3);
  key("Home"); assert.equal(f.active(), 0);
  assert.equal(f.tabs.filter(tab => tab.tabIndex === 0).length, 1);
  assert.equal(f.slides.filter(slide => !slide.hidden).length, 1);
  assert.doesNotMatch(f.controller, /setInterval|setTimeout/);
});

test("horizontal image swipes work without capturing vertical gestures or nested controls", async () => {
  const f = await fixture();
  const swipe = (dx, dy, target = element()) => {
    f.stage.listeners.touchstart({ touches: [{ clientX: 200, clientY: 100 }], target });
    f.stage.listeners.touchend({ changedTouches: [{ clientX: 200 + dx, clientY: 100 + dy }] });
  };
  swipe(-120, 10); assert.equal(f.active(), 1);
  swipe(-20, 180); assert.equal(f.active(), 1);
  const nestedButton = element(); nestedButton.closest = () => nestedButton;
  swipe(-140, 0, nestedButton); assert.equal(f.active(), 1);
  swipe(120, 0); assert.equal(f.active(), 0);
  f.stage.listeners.touchstart({ touches: [{ clientX: 200, clientY: 100 }], target: element() });
  f.stage.listeners.touchcancel();
  f.stage.listeners.touchend({ changedTouches: [{ clientX: 0, clientY: 100 }] });
  assert.equal(f.active(), 0);
});

test("deep links select their story and scroll the slideshow controls into view", async () => {
  const f = await fixture("#ann");
  assert.equal(f.active(), 1); assert.equal(f.root.scrolls, 1);
  f.location.hash = "#business"; f.events.hashchange();
  assert.equal(f.active(), 3); assert.equal(f.root.scrolls, 2);
  f.location.hash = "#faq"; f.events.hashchange(); assert.equal(f.active(), 3);
  f.location.hash = "#%"; assert.doesNotThrow(() => f.events.hashchange());
  const link = element(); link.setAttribute("href", "#features");
  const target = element(); target.closest = () => link;
  let prevented = false;
  f.events["document:click"]({ target, preventDefault() { prevented = true; } });
  assert.equal(f.active(), 0); assert.ok(prevented);
  assert.equal(f.location.hash, "#features");
});

test("initial deep links realign after browser fragment restoration during page loading", async () => {
  const f = await fixture("#ann", "interactive");
  const initial = f.root.scrolls;
  assert.equal(f.active(), 1);
  f.events.load();
  assert.equal(f.root.scrolls, initial + 1);
  assert.equal(f.active(), 1);
});
