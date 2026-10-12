import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { layout } from "../src/ui/layout.js";

test("platform pages use white instead of beige base and panel colours", async () => {
  const file = (name) => readFile(new URL(`../src/public/${name}.css`, import.meta.url), "utf8");
  const [marketing, wizard, dashboard, editor] = await Promise.all(
    ["marketing", "wizard", "dashboard", "editor"].map(file)
  );
  assert.match(marketing, /--m-ivory: #ffffff/);
  assert.match(marketing, /--m-paper: #ffffff/);
  assert.doesNotMatch(marketing, /#f5f0e8|#eee7dd/);
  assert.match(wizard, /--paper: #ffffff/);
  assert.match(wizard, /--surface: #ffffff/);
  assert.match(dashboard, /--lb-surface: #ffffff/);
  assert.match(editor, /--ed-bg:#ffffff;--ed-panel:#ffffff/);
  const html = layout({ title: "Account", description: "Account", canonical: "https://app.lebrands.store", body: "" });
  assert.match(html, /--paper:#ffffff;--paper-2:#ffffff/);
  assert.match(html, /--white:#ffffff/);
  // Preserve theme swatches and semantic status colours, not blanket colour replacement.
  assert.match(wizard, /\.theme-swatch\.aura\s*\{[^}]*#e9e2d2/);
  assert.match(marketing, /--m-dark-grad:/);
});
