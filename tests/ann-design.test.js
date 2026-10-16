import test from "node:test";
import assert from "node:assert/strict";
import { setupAnnFixtureDatabase, annFixtureAdapter } from "../src/ann-preview-fixture.js";
import { handleAnnRoutes } from "../src/store/ann-routes.js";
import { publish } from "../src/store/repository.js";
import { validateDesignRequest } from "../src/store/ann-design.js";
import { isAnnDesign } from "../src/public/ann-design-model.js";
import { SHOWCASE_STYLES } from "../src/public/aura-showcase.js";
import { renderAura } from "../src/public/aura.js";
import { isShowcaseImage, SHOWCASE_MEDIA } from "../src/public/aura-showcase-assets.js";
import { gstinChecksum } from "../src/public/commerce-rules.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const photo = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", token = "a".repeat(64);
const answers = style => ({ category_id: 1, subcategory_id: 1, style_preset: style,
  store_name: "Example Studio", tagline: "Considered essentials", description: "Thoughtfully chosen everyday products for a considered collection." });

test("design editor rejects unbounded text, scripts, unknown fields and arbitrary media URLs", () => {
  const valid = { expected_draft: "a".repeat(64), confirm: true, copy: { title: "Our new chapter" } };
  assert.equal(validateDesignRequest(valid), valid);
  for (const extra of [{ copy: { title: "<script>bad()</script>" } }, { copy: { title: "x".repeat(241) } },
    { copy: { legal_name: "New legal identity" } }, { media: { hero: "https://other.invalid/a.webp" } },
    { media: { product0: photo } }, { confirm: false }, { html: "<h1>raw</h1>" }])
    assert.throws(() => validateDesignRequest({ ...valid, ...extra }), e => e.status === 400);
});

test("real restricted-role design save/reload/edit protects tenants, drafts, media and publication", async () => {
  const pg = await setupAnnFixtureDatabase({ sampleCatalogue: true, samplePolicies: true });
  const db = annFixtureAdapter(pg);
  const call = async (method, body, options = {}) => {
    const r = await handleAnnRoutes(new Request(`https://app.lebrands.store/api/stores/${id}/ann/design`, {
      method, headers: { origin: options.origin || "https://app.lebrands.store", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), options.env || {}, db, { id: options.editor ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc" : owner },
    options.editor ? "b".repeat(64) : token);
    return { status: r.status, body: await r.json() };
  };
  try {
    let state = (await call("GET")).body;
    assert.equal(state.design, null);
    const originalProducts = structuredClone(state.draft.products);
    const initial = answers("editorial"); delete initial.style_preset;
    const first = await call("POST", { expected_draft: state.expected_draft, confirm: true,catalogue_mode:"own", answers: initial });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.design.plan.style_preset, "editorial", "the default style must remain active without clicking its tab");
    state = first.body;
    for (const style of SHOWCASE_STYLES) {
      const saved = await call("POST", { expected_draft: state.expected_draft, confirm: true,catalogue_mode:"own", answers: { ...answers(style), category_id: 2, subcategory_id: 21 } });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      state = saved.body;
      assert.ok(isAnnDesign(state.design));
      assert.equal(state.design.style, style);
      assert.equal(state.design.media_pack, "boutique");
      assert.equal(state.design.media.hero.url, SHOWCASE_MEDIA.boutique.hero.url);
      assert.ok(isShowcaseImage(state.design.media.hero.url));
      assert.deepEqual(state.draft.products, originalProducts, "never import sample inventory, prices or product photos");
      const reloaded = await call("GET");
      assert.deepEqual(reloaded.body.design, state.design);
      for (const page of ["home", "collection", "product", "about", "contact"]) {
        const html = renderAura(state.draft, { page, preview: true, commerce: true });
        assert.ok(html.includes(`sc-${style}`), `${style}/${page} retains the selected composition`);
        assert.ok(!html.includes("Sample reviewer"));
        assert.ok(!html.includes("SAMPLE10"));
        assert.ok(!html.includes("data-before-after-range"));
      }
    }
    await pg.query("UPDATE policy_pages SET reviewed_at=now() WHERE store_id=$1", [id]);
    const stale = state.expected_draft;
    let edited = await call("PATCH", { expected_draft: stale, confirm: true,
      copy: { title: "The saved chapter", description: "My real brand introduction" }, media: { hero: photo } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    state = edited.body;
    assert.equal(state.design.copy.title, "The saved chapter");
    assert.ok(state.draft.policies.every(p => p.reviewed), "copy and image edits do not invalidate reviewed policies");
    assert.equal(state.design.media.hero.media_id, photo);
    let html = renderAura(state.draft, { page: "home", preview: true, commerce: true });
    assert.ok(html.includes("The saved chapter"));
    assert.ok(html.includes(state.design.media.hero.url));
    assert.equal((await call("PATCH", { expected_draft: stale, confirm: true, copy: { title: "Lost update" } })).status, 409);
    const reset = await call("PATCH", { expected_draft: state.expected_draft, confirm: true, media: { hero: null } });
    assert.equal(reset.status, 200, "the returned revision supports resetting an image without a reload");
    assert.ok(isShowcaseImage(reset.body.design.media.hero.url));
    const pickedAgain = await call("PATCH", { expected_draft: reset.body.expected_draft, confirm: true, media: { hero: photo } });
    assert.equal(pickedAgain.status, 200, "successive image edits do not cause a self-conflict");
    state = pickedAgain.body;
    const attempt = { expected_draft: state.expected_draft, confirm: true, copy: { title: "Not allowed" } };
    assert.equal((await call("PATCH", attempt, { editor: true })).status, 403);
    assert.equal((await call("PATCH", attempt, { origin: "https://attacker.invalid" })).status, 403);
    assert.equal((await call("PATCH", attempt, { env: { ANN_BUILDER_ENABLED: "false" } })).status, 503);
    assert.equal((await call("PATCH", { ...attempt, media: { hero: owner } })).status, 403);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM store_publications")).rows[0].n, 0, "saving never publishes");
    // The established publication path still refuses incomplete businesses.
    await assert.rejects(db.withMemberStore(id, token, tx => publish(tx, id, true)), e => e.status === 400);
    const gstin = "27ABCDE1234F1Z" + gstinChecksum("27ABCDE1234F1Z");
    await pg.query(`UPDATE store_setup SET settings=settings || $2::jsonb,logo_media_id=$3 WHERE store_id=$1`, [id, JSON.stringify({
      brand_name: "Example Studio", subdomain: "ann-test-store", description: "Thoughtfully chosen everyday products for a considered collection.",
      legal_name: "Example Studio Limited", address: "Example building, Mumbai, Maharashtra 400001",
      support_email: "support@example.invalid", support_phone: "+919999999999",
      gstin, business_state: "27", category: "fashion", subcategory: "mens-clothing",
    }), photo]);
    await pg.query("UPDATE policy_pages SET reviewed_at=now() WHERE store_id=$1", [id]);
    await pg.query("INSERT INTO media(id,store_id,object_key,kind,upload_type,content_type,size_bytes,width,height,alt_text) VALUES($1,$2,$3,'image','logo','image/webp',200,200,200,'Example logo')",
      [owner, id, `stores/${id}/logo/example.webp`]);
    await pg.query("UPDATE store_setup SET logo_media_id=$2 WHERE store_id=$1", [id, owner]);
    await pg.query("UPDATE products SET title='Cotton everyday shirt',description='An everyday cotton shirt with a comfortable fit and easy care.',price_paise=150000,gst_rate=5,hsn_code='6109' WHERE store_id=$1", [id]);
    await db.withMemberStore(id, token, tx => tx`INSERT INTO product_media(store_id,product_id,media_id,sort_order)
      SELECT store_id,id,${photo},0 FROM public.products WHERE store_id=${id}`);
    const published = await db.withMemberStore(id, token, tx => publish(tx, id, true));
    const snapshot = (await pg.query("SELECT snapshot FROM store_publications WHERE store_id=$1", [id])).rows[0].snapshot;
    assert.equal(snapshot.settings.ann_design.copy.title, "The saved chapter");
    assert.ok(renderAura(snapshot, { page: "home", commerce: true }).includes("The saved chapter"));
    state = (await call("GET")).body;
    edited = await call("PATCH", { expected_draft: state.expected_draft, confirm: true, copy: { title: "Unpublished next chapter" } });
    assert.equal(edited.status, 200);
    assert.equal((await pg.query("SELECT snapshot->'settings'->'ann_design'->'copy'->>'title' AS title FROM store_publications WHERE store_id=$1", [id])).rows[0].title, "The saved chapter");
    assert.equal(published.store.status, "live");
  } finally { await pg.close(); }
});
