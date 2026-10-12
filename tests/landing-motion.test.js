import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";

function motionHarness(source, { reduced = false, search = "", observerAvailable = true } = {}) {
  const rootClasses = new Set(), itemClasses = new Set(), observers = [];
  const classList = classes => ({
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
  });
  const item = { matches() { return false; }, classList: classList(itemClasses) };
  const preference = { matches: reduced, addEventListener(_event, callback) { this.change = callback; } };
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  }
  const window = {
    location: { search }, matchMedia() { return preference; },
    addEventListener() {}, requestAnimationFrame(callback) { callback(); },
  };
  if (observerAvailable) window.IntersectionObserver = Observer;
  runInNewContext(source, {
    URLSearchParams, IntersectionObserver: Observer, window,
    document: {
      hidden: false, addEventListener() {}, querySelector() { return null; },
      querySelectorAll(selector) { return selector === ".m-reveal" ? [item] : []; },
      documentElement: { classList: classList(rootClasses) },
    },
  });
  return { rootClasses, itemClasses, observers, item, preference };
}

test("landing reveals enter, exit in either scroll direction and replay on return", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  const state = motionHarness(source);
  assert.ok(state.rootClasses.has("m-motion"));
  assert.equal(state.observers.length, 2);
  const notify = (isIntersecting, top) => state.observers[0].callback([
    { target: state.item, isIntersecting, boundingClientRect: { top } },
  ]);
  notify(false, 1000);
  assert.ok(!state.itemClasses.has("is-visible"));
  assert.ok(!state.itemClasses.has("is-past"));
  notify(true, 250);
  assert.ok(state.itemClasses.has("is-visible"));
  notify(false, -150);
  assert.ok(!state.itemClasses.has("is-visible"));
  assert.ok(state.itemClasses.has("is-past"));
  notify(true, 50);
  assert.ok(state.itemClasses.has("is-visible"));
  assert.ok(!state.itemClasses.has("is-past"));
  notify(false, 1000);
  assert.ok(!state.itemClasses.has("is-past"));
});

test("reduced motion, URL opt-out and missing observers leave page content visible", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  for (const options of [{ reduced: true }, { search: "?motion=off" }, { observerAvailable: false }]) {
    const state = motionHarness(source, options);
    assert.ok(state.itemClasses.has("is-visible"));
    if (options.observerAvailable !== false) assert.ok(!state.rootClasses.has("m-motion"));
  }
  const state = motionHarness(source);
  state.observers[0].callback([{ target: state.item, isIntersecting: false, boundingClientRect: { top: -50 } }]);
  state.preference.matches = true;
  state.preference.change();
  assert.ok(!state.rootClasses.has("m-motion"));
  assert.ok(state.itemClasses.has("is-visible"));
});

test("scroll motion has distinct 3D transitions, readable rest and an explicit pause override", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /\.m-motion \.m-reveal\.is-past \{ transform: var\(--fo\)/);
  assert.match(css, /\.m-motion \.m-reveal\.is-visible \{ opacity: 1; transform: perspective\(900px\) translate3d\(0px,0px,0\) rotateX\(0deg\) rotateY\(0deg\) rotateZ\(0deg\) scale\(1\)/);
  for (const region of ["m-statement", "m-wizard-media", "m-step", "m-showcase-frame", "m-faq-item", "m-footer-top"]) {
    assert.match(css, new RegExp(`\\.m-motion \\.${region}[^\\n]+--fx:[^\\n]+--fo:`));
  }
  assert.match(css, /:root\.m-fx-paused \.m-reveal \{ opacity: 1 !important; transform: none !important; transition: none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^\n]+transform: none !important/);
  assert.match(css, /\.m-wordmark \{ width: clamp\(260px, 22vw, 310px\)/);
  const html = renderHome();
  assert.ok(!/<html[^>]*class="[^"]*m-motion/.test(html), "server-rendered content stays visible without JS");
  assert.match(html, /class="m-footer-top m-reveal"/);
  assert.match(html, /class="m-reveal m-craft-reveal">\s*<div class="m-craft-carousel"/);
  assert.doesNotMatch(html, /class="m-showcase-cta m-reveal"/);
  assert.match(html, /class="m-clarification m-reveal">First publication requires platform approval/);
  assert.doesNotMatch(html, /class="m-integration-note/, "the removed integrations section must not return");
});
