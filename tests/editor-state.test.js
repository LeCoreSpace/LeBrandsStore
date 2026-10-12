import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/public/editor-state.js";
import { defaultPageLayouts, validateLayout } from "../src/public/aura-layout.js";

const STORE = "11111111-1111-4111-8111-111111111111";
const ctx = { storeId: STORE, productIds: new Set(), collectionIds: new Set() };
const home = () => structuredClone(defaultPageLayouts({ settings: { brand_name: "Moru" }, store: { name: "Moru" } }).home);
const ids = layout => layout.map(item => item.id);
let n = 0; const factory = prefix => `${prefix}-t${++n}`;

test("moving sections respects header and footer framing", () => {
  const layout = home();
  assert.equal(S.moveSection(layout, layout.length - 1, 0), layout, "footer cannot move to the top");
  assert.equal(S.moveSection(layout, 1, 5), layout, "header cannot leave the top");
  const moved = S.moveSection(layout, 3, 5);
  assert.notEqual(moved, layout);
  assert.equal(moved[5].id, layout[3].id);
  assert.equal(layout[3].id, home()[3].id, "input is not mutated");
  assert.equal(S.canMoveSection(layout, layout.length - 1, 1), false);
});
test("required sections cannot be hidden, duplicated or deleted", () => {
  const layout = home();
  for (const id of ["default-header", "default-footer"]) {
    assert.equal(S.toggleSection(layout, id, "home"), layout);
    assert.equal(S.duplicateSection(layout, id, "home").id, null);
    assert.equal(S.deleteSection(layout, id, "home").removed, null);
  }
  const product = defaultPageLayouts({}).product;
  assert.equal(S.deleteSection(product, "default-product-details", "product").removed, null);
  assert.equal(S.isRequired("product-details", "product"), true);
});
test("hide, show, duplicate and delete with restore", () => {
  let layout = home();
  const hidden = S.toggleSection(layout, "default-hero", "home");
  assert.equal(hidden.find(s => s.id === "default-hero").settings.enabled, false);
  assert.equal(S.toggleSection(hidden, "default-hero", "home").find(s => s.id === "default-hero").settings.enabled, true);
  const dup = S.duplicateSection(layout, "default-craft", "home", factory);
  assert.equal(dup.layout.length, layout.length + 1);
  assert.notEqual(dup.id, "default-craft");
  assert.equal(dup.layout[dup.layout.findIndex(s => s.id === "default-craft") + 1].id, dup.id);
  const del = S.deleteSection(layout, "default-reviews", "home");
  assert.equal(del.layout.length, layout.length - 1);
  assert.deepEqual(ids(S.restoreSection(del.layout, del.removed, del.index)), ids(layout));
});
test("add section lists only allowed types and inserts before footer", () => {
  const layout = home();
  const types = S.addableTypes("home", layout).map(item => item.id);
  assert.ok(types.includes("spotlight"));
  assert.ok(!types.includes("header") && !types.includes("footer") && !types.includes("commerce") && !types.includes("product-details"));
  const added = S.addSection(layout, "spotlight", "home", ctx, factory);
  assert.ok(added.id);
  assert.equal(added.layout.at(-1).type, "footer");
  assert.equal(added.layout.at(-2).id, added.id);
  assert.equal(added.hidden, true, "required product field is empty so it starts hidden");
  assert.doesNotThrow(() => validateLayout("home", added.layout, ctx));
  assert.equal(S.addSection(layout, "policy", "home", ctx).id, null, "type not allowed on this page");
  assert.deepEqual(S.addableTypes("checkout", layout), []);
});
test("announcement is added first and only once", () => {
  const layout = home().filter(item => item.type !== "announcement");
  const result = S.addSection(layout, "announcement", "home", ctx, factory);
  assert.equal(result.layout[0].id, result.id);
  assert.ok(!S.addableTypes("home", result.layout).some(item => item.id === "announcement"));
});
test("block add, reorder, duplicate, remove respect limits", () => {
  const layout = home();
  const media = (i) => ({ url: `https://media.lebrands.store/stores/${STORE}/22222222-2222-4222-8222-22222222222${i}.webp`, alt: `Craft ${i}` });
  let l = S.setSectionValue(layout, "default-craft", ["blocks"], [0, 1, 2].map(i => ({ id: `item-${i}`, type: "item", settings: { image: media(i), caption: "" } })));
  l = S.moveBlock(l, "default-craft", 0, 2);
  assert.deepEqual(S.findSection(l, "default-craft").blocks.map(b => b.id), ["item-1", "item-2", "item-0"]);
  l = S.duplicateBlock(l, "default-craft", 0, factory);
  assert.equal(S.findSection(l, "default-craft").blocks.length, 4);
  l = S.removeBlock(l, "default-craft", 0);
  assert.equal(S.findSection(l, "default-craft").blocks.length, 3);
  for (let i = 0; i < 10; i++) l = S.addBlock(l, "default-craft", factory).layout;
  assert.equal(S.findSection(l, "default-craft").blocks.length, 8, "craft allows 8 blocks");
});
test("list operations on header links", () => {
  const def = { label: { default: "" }, url: { default: "" } };
  let l = home();
  l = S.listOp(l, "default-header", ["settings", "links"], "add", 0, 0, def);
  l = S.listOp(l, "default-header", ["settings", "links"], "add", 0, 0, def);
  l = S.setSectionValue(l, "default-header", ["settings", "links", 0, "label"], "Shop");
  l = S.listOp(l, "default-header", ["settings", "links"], "move", 0, 1);
  assert.equal(S.getPath(S.findSection(l, "default-header"), ["settings", "links", 1, "label"]), "Shop");
  l = S.listOp(l, "default-header", ["settings", "links"], "remove", 1);
  assert.equal(S.getPath(S.findSection(l, "default-header"), ["settings", "links"]).length, 1);
});
test("undo and redo, with coalescing and limits", () => {
  const a = home();
  let h = S.createHistory(a);
  const b = S.toggleSection(a, "default-hero", "home");
  h = S.commit(h, b, { now: 0 });
  assert.equal(S.canUndo(h), true);
  const t1 = S.setSectionValue(b, "default-hero", ["settings", "title"], "A");
  const t2 = S.setSectionValue(b, "default-hero", ["settings", "title"], "AB");
  h = S.commit(h, t1, { key: "hero.title", now: 1000 });
  h = S.commit(h, t2, { key: "hero.title", now: 1500 });
  assert.equal(h.past.length, 2, "typing is one undo step");
  assert.equal(S.undo(h).present, b);
  h = S.undo(h); h = S.undo(h);
  assert.equal(h.present, a);
  assert.equal(S.canUndo(h), false);
  h = S.redo(h);
  assert.equal(h.present, b);
  assert.equal(S.canRedo(h), true);
  h = S.commit(h, t1, { now: 9000 });
  assert.equal(S.canRedo(h), false, "new edit clears redo");
  assert.equal(S.commit(h, structuredClone(h.present)), h, "no op edits are ignored");
  let big = S.createHistory(0);
  for (let i = 1; i <= 150; i++) big = S.commit(big, i, { now: i * 5000 });
  assert.equal(big.past.length, S.HISTORY_LIMIT);
});
test("save, dirty tracking, conflict and remote changes", () => {
  let page = S.createPageState(home(), 3);
  assert.equal(S.isDirty(page), false);
  const edited = S.toggleSection(home(), "default-hero", "home");
  page = { ...page, history: S.commit(page.history, edited, { now: 1 }) };
  assert.equal(S.isDirty(page), true);
  assert.equal(S.remoteChange(page, 3), "none");
  assert.equal(S.remoteChange(page, 4), "conflict");
  const sent = S.pageLayout(page);
  page = S.markSaved(page, sent, 4);
  assert.equal(page.version, 4);
  assert.equal(S.isDirty(page), false);
  assert.equal(S.remoteChange(page, 5), "reload");
  const later = { ...page, history: S.commit(page.history, S.toggleSection(sent, "default-hero", "home"), { now: 2 }) };
  const midFlight = S.markSaved(later, sent, 5);
  assert.equal(S.isDirty(midFlight), true, "edits made during a save stay dirty");
  assert.equal(S.overwriteRevision(later, 9).version, 9);
  assert.equal(S.adoptRemote(sent, 9).history.past.length, 0);
});
test("draft validation uses the real schemas", () => {
  const layout = home();
  assert.equal(S.validateDraft("home", layout, ctx), "");
  const broken = S.setSectionValue(layout, "default-hero", ["settings", "title"], "");
  assert.match(S.validateDraft("home", broken, ctx), /title/);
  const noAlt = S.setSectionValue(layout, "default-hero", ["settings", "image"], { url: `https://media.lebrands.store/stores/${STORE}/22222222-2222-4222-8222-222222222222.webp`, alt: " " });
  assert.match(S.validateDraft("home", noAlt, ctx), /alt/i);
  const foreign = S.setSectionValue(layout, "default-hero", ["settings", "image"], { url: "https://media.lebrands.store/stores/99999999-9999-4999-8999-999999999999/22222222-2222-4222-8222-222222222222.webp", alt: "x" });
  assert.match(S.validateDraft("home", foreign, ctx), /belong/);
});
test("publish review diff and restore preview", () => {
  const published = home();
  let draft = S.toggleSection(published, "default-hero", "home");
  draft = S.setSectionValue(draft, "default-statement", ["settings", "text"], "Made slowly.");
  draft = S.moveSection(draft, 4, 6);
  const dup = S.duplicateSection(draft, "default-craft", "home", factory);
  draft = S.deleteSection(dup.layout, "default-reviews", "home").layout;
  const text = S.diffLayouts(published, draft).map(item => item.text);
  assert.ok(text.includes("Hid Hero"));
  assert.ok(text.some(line => /^Edited Brand statement/.test(line)));
  assert.ok(text.includes("Added Craft and materials"));
  assert.ok(text.includes("Removed Customer reviews"));
  assert.ok(text.includes("Changed the order of sections"));
  assert.deepEqual(S.diffLayouts(published, published), []);
  assert.ok(S.diffLayouts(null, published).every(item => item.kind === "added"));
});
test("warnings: performance, accessibility and accent contrast", () => {
  let layout = home();
  const big = { url: `https://media.lebrands.store/stores/${STORE}/22222222-2222-4222-8222-222222222222.webp`, alt: "", width: 5000, height: 3000 };
  layout = S.setSectionValue(layout, "default-hero", ["settings", "image"], big);
  layout = S.setSectionValue(layout, "default-hero", ["settings", "video"], { url: big.url.replace("webp", "mp4"), alt: "Film" });
  const warnings = S.layoutWarnings(layout, { accent_color: "#f0f0e0", color_preset: "ivory" });
  const text = warnings.map(item => item.text).join("|");
  assert.match(text, /larger than 3000/);
  assert.match(text, /no alt text/);
  assert.match(text, /poster/);
  assert.match(text, /contrast/);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...home()[2], id: `h-${i}` }));
  assert.match(S.layoutWarnings(many, {}).map(item => item.text).join(), /20 visible sections/);
  assert.ok(S.contrastRatio("#000000", "#ffffff") > 20);
  assert.equal(S.accentCheck("#2f3a34", "ivory").passes, true);
});
test("roles, locked pages and focal points", () => {
  assert.equal(S.canPublishRole("owner"), true); assert.equal(S.canPublishRole("admin"), true);
  assert.equal(S.canPublishRole("staff"), false); assert.equal(S.canEditRole("staff"), true);
  for (const page of ["checkout", "cart", "track", "confirmation"]) assert.equal(S.isEditablePage(page), false);
  assert.ok(S.isEditablePage("policy-privacy"));
  assert.deepEqual(S.setFocal({ url: "u", alt: "a" }, 2, -1), { url: "u", alt: "a", focalX: 1, focalY: 0 });
  assert.equal(S.setFocal({}, 0.12345, 0.5).focalX, 0.123);
  assert.deepEqual(S.previewOptions("policy-terms"), { page: "policy", policyKind: "terms" });
});
test("text lookup for inline editing", () => {
  const hero = S.findSection(home(), "default-hero");
  const withTitle = S.setSectionValue([hero], "default-hero", ["settings", "title"], "Quiet things");
  assert.deepEqual(S.findTextField(withTitle[0], " Quiet  things ").path, ["settings", "title"]);
  assert.equal(S.findTextField(withTitle[0], "Unknown"), null);
});

test("theme changes join undo history and produce a PATCH body", () => {
  let h = S.createHistory(S.themeSnapshot({ color_preset: "porcelain" }));
  assert.equal(h.present.color_preset, "ivory");
  h = S.commit(h, { ...h.present, accent_color: "#112233" }, { now: 1 });
  h = S.commit(h, { ...h.present, button_style: "pill" }, { now: 5000 });
  const undone = S.undo(h);
  assert.deepEqual(S.themePatch(h.present, undone.present), { button_style: "rounded" });
  assert.deepEqual(S.themePatch(undone.present, S.redo(undone).present), { button_style: "pill" });
  assert.deepEqual(S.themePatch(h.present, h.present), {});
});
test("media metadata keeps valid sources and drops oversize ones", async () => {
  const record = { url: "https://m/x.webp", width: 1600, height: 900, sources: [{ url: "https://m/x-640.webp", width: 640, height: 360 }, { url: "https://m/big.webp", width: 2000, height: 1000 }, { url: "", width: 1, height: 1 }] };
  const media = S.mediaFromRecord(record, "Alt");
  assert.deepEqual(media.sources, [{ url: "https://m/x-640.webp", width: 640, height: 360 }]);
  assert.equal(S.mediaFromRecord({ url: "u", width: 10, height: 10 }, "a").sources, undefined);
  const up = await import("../src/public/aura-upload.js");
  assert.deepEqual(up.renditionWidths(1024), [640]);
  assert.deepEqual(up.renditionWidths(500), []);
  assert.deepEqual(up.scaledSize(1600, 900, 640), { width: 640, height: 360 });
  const dto = up.mediaWithSources({ url: "p", width: 1600, height: 900 }, [{ url: "b", width: 1024, height: 576 }, { url: "a", width: 640, height: 360 }, { url: "huge", width: 3000, height: 1 }], "Alt");
  assert.deepEqual(dto.sources.map(item => item.url), ["a", "b"]);
  const set = S.setSectionValue(home(), "default-hero", ["settings", "image"], dto);
  assert.equal(S.getPath(S.findSection(set, "default-hero"), ["settings", "image", "sources"]).length, 2);
});

test("publish review reports theme changes against the published baseline", () => {
  assert.deepEqual(S.themeChanges({ color_preset: "ivory", accent_color: "#3d4a43" }, { color_preset: "ivory", accent_color: "#3d4a43" }), []);
  assert.deepEqual(S.themeChanges(null, { button_style: "pill" }), ["Button style: rounded to pill"]);
  assert.deepEqual(S.themeChanges({ color_preset: "porcelain" }, { color_preset: "midnight", accent_color: "#112233" }), ["Colour preset: ivory to midnight", "Accent colour: #3d4a43 to #112233"]);
});
test("media pagination merges without duplicates and validates cursors", () => {
  const a = [{ url: "u1" }, { url: "u2" }];
  assert.deepEqual(S.mergeMedia(a, [{ url: "u2" }, { url: "u3" }, null, {}]).map(item => item.url), ["u1", "u2", "u3"]);
  assert.equal(S.nextOffset(40), 40);
  for (const bad of [null, undefined, 0, -1, "40", 1.5]) assert.equal(S.nextOffset(bad), null);
});
test("editor client flushes theme before publish and sends offset for load more", () => {
  const src = readFileSync("src/public/editor.js", "utf8");
  assert.match(src, /const themeOk = await flushTheme\(\);\s*const saved = await saveAll\(\);/);
  assert.match(src, /media\?offset=\$\{mediaCursor\}/);
});
