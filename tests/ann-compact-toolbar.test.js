import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderAnnBuilder } from "../src/ui/ann-builder.js";

const id = "11111111-1111-4111-8111-111111111111";
const data = { store: { store_id: id, name: "Example" }, role: "owner", settings: {}, products: [], collections: [], layouts: {}, policies: [], reviews: [],
  business_access: { available: true, allowed: true, plan_access: { available: true, enforced: true, name_confirmed: false } } };

test("one compact toolbar replaces banners and holds every control once", () => {
  const html = renderAnnBuilder(data);
  assert.equal(html.split('class="ann-toolbar"').length - 1, 1);
  assert.doesNotMatch(html, /ann-style-picker|class="ann-bar"|Choose Free after confirming/);
  const tb = html.slice(html.indexOf('id="ann-toolbar"'), html.indexOf('class="ann-grid"'));
  for (const s of ['id="ann-steps"', 'id="ann-language"', 'id="ann-style-tabs"', 'data-preview-mode="showcase"', 'data-preview-mode="store"', 'data-device="desktop"', 'data-device="mobile"', 'id="ann-open-browser"', 'data-ws-toggle', 'id="ann-edit-toggle"', 'data-edit-prompt="logo"', 'data-ann-plan-open'])
    assert.equal(tb.split(s).length - 1, 1, s);
  assert.match(tb, /id="ann-store-plan"[^>]*><button[^>]*data-ann-plan-open disabled/);
  assert.doesNotMatch(html.slice(html.indexOf('class="ann-grid"')), /id="ann-steps"|id="ann-language"/);
  assert.match(html, /id="ann-business-access"/);
});
test("plan action hidden when unavailable; client keeps wiring", async () => {
  assert.doesNotMatch(renderAnnBuilder({ ...data, business_access: { allowed: true } }), /id="ann-store-plan"/);
  const c = await readFile("src/public/ann-builder.js", "utf8");
  assert.match(c, /#ann-store-plan \[data-ann-plan-open\]/);
  assert.match(c, /toggleMount: \$\("#ann-edit-toggle"\)/);
  assert.match(c, /e\.key !== "Escape"/);
});
