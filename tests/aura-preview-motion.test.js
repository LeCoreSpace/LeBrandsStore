import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachAuraMotion } from "../src/public/aura-motion.js";
import { attachShowcaseInteractions } from "../src/public/aura-showcase-interactions.js";

test("storefront motion is idempotent, repeatable, focus-safe and cleaned up", () => {
  let callback, options, observers = 0, animations = 0, cancelled = 0, disconnected = 0;
  const listeners = {}, windowListeners = {};
  const field = {};
  const target = {
    contains: value => value === field,
    animate(frames, timing) {
      animations++;
      assert.equal(timing.duration, 850);
      assert.equal(timing.easing, "cubic-bezier(.22,1,.36,1)");
      assert.equal(frames[1].opacity, 1);
      return { cancel() { cancelled++; } };
    },
  };
  const doc = {
    body: { dataset: { style: "editorial" } },
    querySelectorAll: () => [target],
    addEventListener: (name, fn) => { listeners[name] = fn; },
    defaultView: {
      matchMedia: () => ({ matches: false }),
      addEventListener: (name, fn) => { windowListeners[name] = fn; },
      IntersectionObserver: class {
        constructor(fn, config) { observers++; callback = fn; options = config; }
        observe() {}
        disconnect() { disconnected++; }
      },
    },
  };
  attachAuraMotion(doc);
  attachAuraMotion(doc);
  assert.equal(observers, 1, "Ann's two binding paths must not animate the same document twice");
  assert.equal(options.threshold, 0, "very tall sections must not wait for a percentage threshold");
  callback([{ target, isIntersecting: true }]);
  callback([{ target, isIntersecting: false }]);
  callback([{ target, isIntersecting: true }]);
  assert.equal(animations, 2);
  listeners.focusin({ target: field });
  assert.equal(cancelled, 2);
  doc.activeElement = field;
  callback([{ target, isIntersecting: true }]);
  assert.equal(animations, 2, "active inline fields must stay stationary");
  windowListeners.pagehide();
  assert.equal(disconnected, 1);
});

test("showcase motion leaves content visible for reduced motion or missing observer support", () => {
  for (const reduced of [true, false]) {
    const classes = new Set();
    const doc = {
      body: { dataset: { showcase: "minimal" }, classList: { add: name => classes.add(name) } },
      querySelectorAll: selector => selector === "[data-showcase-reveal]" ? [{}] : [],
      defaultView: { matchMedia: () => ({ matches: reduced }) },
    };
    attachShowcaseInteractions(doc, { products: [] }, new Map(), () => {});
    assert.ok(!classes.has("sc-motion-ready"));
  }
});

test("all preview themes use continuous bounded motion without stepped or clipping reveals", async () => {
  const css = await readFile("src/public/aura-showcase-rich-css.js", "utf8");
  assert.doesNotMatch(css, /steps\(6,end\)/);
  assert.match(css, /cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css, /165ms/);
  assert.match(css, /:focus-within\{transition:none\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  for (const file of ["ann-builder.js", "ann-theme-editor.js"]) {
    const source = await readFile(`src/public/${file}`, "utf8");
    assert.match(source, /attachStyleInteractions/);
  }
});
