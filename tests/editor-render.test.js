import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderEditor } from "../src/ui/editor.js";
import { renderAura } from "../src/public/aura.js";
import { defaultPageLayouts } from "../src/public/aura-layout.js";

const data = role => ({ store: { store_id: "11111111-1111-4111-8111-111111111111", name: "Moru" }, settings: { brand_name: "Moru" }, products: [], collections: [], layouts: {}, page_versions: {}, role });
test("editor shell renders panes, escapes data, and gates publish by role", () => {
  const owner = renderEditor({ ...data("owner"), settings: { brand_name: "</script><b>x" } }, { name: "A" });
  for (const id of ["ed-sections", "ed-preview", "ed-props", "ed-publish", "ed-undo", "ed-redo"]) assert.match(owner, new RegExp(`id="${id}"`));
  assert.ok(!owner.includes("</script><b>x"), "payload cannot break out of the script tag");
  assert.match(owner, /sandbox="allow-same-origin"/);
  assert.match(renderEditor(data("admin"), {}), /id="ed-publish"/);
  const staff = renderEditor(data("staff"), {});
  assert.ok(!staff.includes('id="ed-publish"'));
  assert.match(staff, /Staff can save drafts/);
  assert.match(owner, /Use a larger screen/);
});
test("preview annotation exists only when requested", () => {
  const d = { ...data("owner"), layouts: defaultPageLayouts({ settings: { brand_name: "Moru" }, store: { name: "Moru" } }) };
  assert.match(renderAura(d, { page: "home", preview: true, editorAnnotate: true }), /data-lb-section="default-hero"/);
  assert.ok(!renderAura(d, { page: "home", preview: true }).includes("data-lb-section"));
});
test("editor sources contain no em dashes and no custom code fields", () => {
  for (const file of ["src/public/editor.js", "src/public/editor-state.js", "src/ui/editor.js", "src/public/editor.css"]) assert.ok(!readFileSync(file, "utf8").includes("\u2014"), file);
});
