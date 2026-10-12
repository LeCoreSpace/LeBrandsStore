import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";

test("three promises remain unique slides after the storefront and discovery highlights, with static fallback and shared dark gradients", async () => {
  const html = renderHome(), css = await readFile("src/public/marketing.css", "utf8");
  const sections = [...html.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.equal(sections[0], "m-hero");
  assert.match(sections[1], /^m-showcase\b/);
  assert.match(sections[2], /^m-discovery\b/);
  assert.match(sections[3], /^m-principles\b/);
  assert.equal((html.match(/data-promise-carousel\b/g) || []).length, 1);
  assert.equal((html.match(/data-promise-slide\b/g) || []).length, 3);
  assert.deepEqual([...html.matchAll(/<p class="m-principle">([^<]*)<\/p>/g)].map(match => match[1]), [
    "Zero commission on your sales.", "Your domain, your payments, your customer data.",
    "We never market to your customers.",
  ]);
  assert.match(html, /id="promises"/);
  assert.match(html, /Your own domain is coming soon\. Cash on Delivery is available today\./);
  assert.match(css, /\.m-promise:not\(\.is-enhanced\) \.m-promise-stage \{ display: block/);
  assert.match(css, /\.m-promise:not\(\.is-enhanced\) \.m-promise-controls \{ display: none/);
  assert.match(css, /section\.m-hero \{[^}]*background-image: var\(--m-dark-grad\)/);
  assert.match(css, /\.m-footer, \.m-pricing-page \.m-footer \{[^}]*background-image: var\(--m-dark-grad\)/);
  assert.match(css, /:root\[data-theme="dark"\] #top > section\.m-band-light \{[^}]*#f5f0e8/);
});

async function setup({ reduced = false, disabled = false } = {}) {
  const source = await readFile("src/public/marketing.js", "utf8");
  const functionSource = source.slice(source.indexOf("  function initializePromises()"), source.indexOf("  function setNavTone()"));
  function node() {
    const classes = new Set();
    return { attrs: {}, events: {}, textContent: "", classList: {
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
    }, setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, callback) { this.events[name] = callback; } };
  }
  const slides = Array.from({ length: 3 }, node), dots = Array.from({ length: 3 }, node);
  slides.forEach((slide, i) => { slide.textContent = `0${i + 1} / 03 Promise ${i + 1}`; });
  const car = node(), section = node(), root = node(), toggle = node(), live = node(), prev = node(), next = node();
  section.classList.add("m-section-active");
  car.closest = () => section;
  car.querySelectorAll = selector => selector === "[data-promise-slide]" ? slides : dots;
  car.querySelector = selector => ({
    "[data-promise-toggle]": toggle, "[data-promise-live]": live,
    "[data-promise-prev]": prev, "[data-promise-next]": next,
  })[selector];
  const document = { hidden: false, querySelector: () => car };
  const motionPreference = { matches: reduced }, observers = [];
  const context = {
    document, root, motionPreference, motionDisabled: disabled, promiseSync: null,
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
  };
  runInNewContext(`${functionSource}\ninitializePromises();`, context);
  return {
    ...context, car, section, slides, dots, toggle, live, prev, next, observers,
    active: () => slides.findIndex(slide => slide.classList.contains("is-active")),
    advance: () => car.events.animationend({ animationName: "m-pr-progress", target: dots[0] }),
  };
}

test("promise carousel advances, wraps, selects, supports keyboard and pauses autoplay", async () => {
  const state = await setup();
  assert.equal(state.active(), 0);
  state.advance(); assert.equal(state.active(), 1);
  assert.equal(state.slides[0].attrs["aria-hidden"], "true");
  assert.equal(state.dots[1].attrs["aria-current"], "true");
  assert.ok(state.slides[0].classList.contains("is-out"));
  state.car.events.animationend({ animationName: "m-pr-out", target: state.slides[0] });
  assert.ok(!state.slides[0].classList.contains("is-out"));
  state.prev.events.click(); assert.equal(state.active(), 0);
  state.prev.events.click(); assert.equal(state.active(), 2);
  state.dots[1].events.click(); assert.equal(state.active(), 1);
  assert.match(state.live.textContent, /Promise 2 of 3/);
  state.car.events.keydown({ key: "Home", preventDefault() {} }); assert.equal(state.active(), 0);
  state.car.events.keydown({ key: "End", preventDefault() {} }); assert.equal(state.active(), 2);
  state.toggle.events.click(); assert.equal(state.toggle.textContent, "Play");
  state.advance(); assert.equal(state.active(), 2);
  state.toggle.events.click(); state.advance(); assert.equal(state.active(), 0);
});

test("promise autoplay stops offscreen, when hidden, paused globally or with motion disabled", async () => {
  for (const options of [{ reduced: true }, { disabled: true }]) {
    const state = await setup(options);
    assert.equal(state.toggle.textContent, "Autoplay off");
    assert.equal(state.toggle.disabled, true);
    state.advance(); assert.equal(state.active(), 0);
    state.next.events.click(); assert.equal(state.active(), 1);
    assert.ok(!state.car.classList.contains("is-flying"));
  }
  const state = await setup();
  state.section.classList.remove("m-section-active"); state.advance(); assert.equal(state.active(), 0);
  state.section.classList.add("m-section-active");
  state.document.hidden = true; state.advance(); assert.equal(state.active(), 0);
  state.document.hidden = false; state.advance(); assert.equal(state.active(), 1);
  state.root.classList.add("m-fx-paused");
  state.observers[0]();
  assert.ok(!state.car.classList.contains("is-flying"));
  assert.ok(state.slides.every(slide => !slide.classList.contains("is-out")));
  state.advance(); assert.equal(state.active(), 1);
  state.root.classList.remove("m-fx-paused"); state.advance(); assert.equal(state.active(), 2);
  state.motionPreference.matches = true; state.promiseSync();
  assert.ok(!state.car.classList.contains("is-flying"));
  assert.equal(state.toggle.disabled, true);
});
