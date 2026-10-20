import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECTION_LAYOUT_CSS } from "../src/public/section-layout-css.js";

test("css has all eight scoped adaptations and reduced motion", () => {
  for (const id of ["editorial","boutique","architectural","minimal","vintage","social-pop","creator-feed","proof-detail"])
    assert.ok(SECTION_LAYOUT_CSS.includes(`.lb-section[data-section-layout="${id}"]`), id);
  assert.match(SECTION_LAYOUT_CSS, /prefers-reduced-motion/);
  assert.doesNotMatch(SECTION_LAYOUT_CSS, /(^|\n)\s*\.lb-(grid|split)\b/);
});
test("library uses sandboxed srcdoc preview and workspace wires layout API", () => {
  const ui = readFileSync("src/public/section-library-ui.js", "utf8");
  assert.match(ui, /sandbox=""/);
  assert.match(ui, /srcdoc/);
  assert.match(ui, /editInstance/);
  const ws = readFileSync("src/public/ann-design-workspace.js", "utf8");
  assert.match(ws, /setSectionLayout\(pg, id, layout\)/);
  assert.match(ws, /addSection\(pg, family, binding, instances\.afterId, order, layout\)/);
  assert.match(ws, /context: \(\) => layoutContext\(pg\)/);
});
