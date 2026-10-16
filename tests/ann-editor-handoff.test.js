import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { loadEditorDraft } from "../src/store/editor-draft.js";
import { loadDraft } from "../src/store/repository.js";
import { renderEditor } from "../src/ui/editor.js";
import { renderStylePreview, designPreviewData } from "../src/public/style-preview.js";
import { annPreviewConfiguration } from "../src/public/ann-config.js";

const store = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Example owner" };
const token = "a".repeat(64);

test("editor restores a saved Ann plan without writes, then preserves the adopted design exactly", async () => {
  const pg = await setupAnnFixtureDatabase({ sampleCatalogue: true });
  const db = annFixtureAdapter(pg);
  const read = fn => db.withMemberStore(store, token, tx => fn(tx, store));
  const call = async (action, method, body) => {
    const response = await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${store}/ann/${action}`, {
      method, headers: { origin: "https://app.lebrands.store", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), {}, db, user, token);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  try {
    const original = await read(loadEditorDraft);
    assert.match(renderEditor({ ...original, role: "owner" }, user), /id="ed-preview"/);
    const answers = { style_preset: "boutique", category_id: 2, subcategory_id: 21,
      color_preset: "stone", font_preset: "serif", store_name: "Example Studio",
      tagline: "A daily ritual", description: "Thoughtfully chosen everyday skincare.",
      section_options: { home: ["lookbook"], product: ["size-guide"] } };
    await call("session", "PATCH", { expected_revision: 0, current_step: "style", answers });
    const before = await read(loadDraft);
    const pending = await read(loadEditorDraft);
    assert.equal(pending.ann_design_pending, true);
    assert.equal(pending.settings.ann_design.style, "boutique");
    assert.equal(pending.settings.ann_design.catalogue_mode, "sample");
    const shell = renderEditor({ ...pending, role: "owner" }, user);
    assert.match(shell, /\/assets\/ann-theme-editor\.js/);
    assert.match(shell, /Your saved Ann plan is previewed here/);
    assert.match(shell, /id="ae-save" disabled>Save draft/);
    assert.match(shell, /id="ae-publish" disabled>Review and publish/);
    assert.doesNotMatch(shell, /\/assets\/editor\.js|Use Aura starter layout/);
    assert.deepEqual(await read(loadDraft), before, "Opening the editor cannot overwrite the draft");
    const state = await call("design", "GET");
    const saved = await call("design", "POST", { expected_draft: state.expected_draft, confirm: true,
      catalogue_mode: "sample", answers });
    assert.deepEqual(pending.settings.ann_design, saved.design, "Preview and explicit adoption share one projection");
    const restored = await read(loadEditorDraft);
    assert.equal(restored.ann_design_pending, undefined);
    assert.deepEqual(restored.settings.ann_design, saved.design);
    assert.deepEqual(restored.settings.ann_design.plan.section_options, answers.section_options);
    for (const page of ["home", "collection", "product", "cart", "checkout"]) {
      const html = draft => renderStylePreview(designPreviewData(draft, draft.settings.ann_design),
        annPreviewConfiguration(answers, draft.settings).theme, { page });
      const actual=html(pending),expected=html(restored);
      const index=[...actual].findIndex((c,i)=>c!==expected[i]);
      assert.equal(index,-1,`${page} must match: ${JSON.stringify(actual.slice(Math.max(0,index-80),index+180))} vs ${JSON.stringify(expected.slice(Math.max(0,index-80),index+180))}`);
    }
    assert.deepEqual(restored.products, before.products, "Sample design adoption never imports inventory");
    const readOnly = renderEditor({ ...restored, role: "owner" }, user, { readOnly: true });
    assert.match(readOnly, /"role":"viewer"/);
    assert.deepEqual((await read(loadEditorDraft)).settings.ann_design, saved.design, "Repeated entry never reseeds edits");
  } finally { await pg.close(); }
});
