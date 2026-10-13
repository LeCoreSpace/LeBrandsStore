import assert from "node:assert/strict";
import test from "node:test";
import { renderAura } from "../src/public/aura.js";
import { themeSnapshot } from "../src/public/editor-state.js";
import { DEFAULT_SETTINGS } from "../src/store/repository.js";

const base = { store: { name: "Test", subdomain: "test" }, products: [] };
test("unspecified theme settings render white with Instrument Sans", () => {
  const html = renderAura({ ...base, settings: {} });
  assert.match(html, /data-preset="white"/);
  assert.match(html, /data-font="modern"/);
  assert.match(html, /--display:"Instrument Sans"/);
  assert.match(html, /name="theme-color" content="#ffffff"/);
});
test("editor and repository defaults are white and modern", () => {
  const snap = themeSnapshot({});
  assert.equal(snap.color_preset, "white");
  assert.equal(snap.font_preset, "modern");
  assert.equal(DEFAULT_SETTINGS.color_preset, "white");
  assert.equal(DEFAULT_SETTINGS.font_preset, "modern");
});
test("explicit ivory and serif stay unchanged", () => {
  const html = renderAura({ ...base, settings: { color_preset: "ivory", font_preset: "serif" } });
  assert.match(html, /data-preset="ivory"/);
  assert.match(html, /data-font="serif"/);
  assert.match(html, /--display:"Aura Editorial"/);
  const snap = themeSnapshot({ color_preset: "ivory", font_preset: "serif" });
  assert.equal(snap.color_preset, "ivory");
  assert.equal(snap.font_preset, "serif");
});
