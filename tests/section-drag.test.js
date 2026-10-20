import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slotFromY, moveToSlot, validMove, stepSlot } from "../src/public/section-drag.js";
import { bindingKinds, usableKinds, selectableRecords, instanceCount, bindingFor } from "../src/public/section-insert-rules.js";

const O = ["a", "b", "c", "d"], core = id => id === "a";
test("slotFromY counts midpoints above pointer", () => { assert.equal(slotFromY([10, 30, 50], 35), 2); assert.equal(slotFromY([10], 0), 0); });
test("moveToSlot adjusts for removal and ignores no-ops", () => {
  assert.deepEqual(moveToSlot(O, "b", 4), ["a", "c", "d", "b"]);
  assert.deepEqual(moveToSlot(O, "d", 1), ["a", "d", "b", "c"]);
  assert.equal(moveToSlot(O, "b", 1), null); assert.equal(moveToSlot(O, "b", 2), null); assert.equal(moveToSlot(O, "x", 1), null);
});
test("protected core never moves or shifts", () => {
  assert.equal(validMove(O, "a", 3, core), null);
  assert.equal(validMove(O, "c", 0, core), null);
  assert.deepEqual(validMove(O, "c", 1, core), ["a", "c", "b", "d"]);
});
test("keyboard stepping skips invalid slots", () => {
  assert.equal(stepSlot(O, "c", 2, -1, core), 1);
  assert.equal(stepSlot(O, "c", 1, -1, core), null);
  assert.equal(stepSlot(O, "b", 1, 1, core), 3);
  assert.equal(stepSlot(O, "d", 3, 1, core), null);
});
test("binding rules follow the contract", () => {
  assert.deepEqual(bindingKinds("faq", "home"), ["none"]);
  assert.deepEqual(bindingKinds("featured-product", "product"), ["current-product", "product"]);
  assert.deepEqual(bindingKinds("featured-product", "home"), ["product"]);
  assert.deepEqual(bindingKinds("collection-header", "home"), ["collection"]);
  assert.deepEqual(bindingKinds("collection-header", "collection"), ["current-collection", "collection"]);
  assert.deepEqual(bindingKinds("product-grid", "collection"), ["all", "collection", "current-collection"]);
  assert.deepEqual(bindingKinds("product-set", "home"), ["all", "collection"]);
  assert.deepEqual(bindingKinds("collection-cards", "about"), ["all", "collection"]);
  assert.deepEqual(bindingKinds("header", "home"), []);
  assert.deepEqual(bindingKinds("faq", "cart"), []);
});
test("records exclude demo, archived and malformed ids", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const r = selectableRecords({ products: [{ id, name: "Tee" }, { id: "sc-1" }, { id: id.replace("1", "2"), status: "archived" }], collections: [] });
  assert.deepEqual(r.products, [{ id, name: "Tee" }]);
  const u = usableKinds("collection-header", "home", r); assert.equal(u.kinds.length, 0); assert.match(u.reason, /collection/);
  assert.deepEqual(usableKinds("collection-header", "collection", r).kinds, ["current-collection"]);
  assert.deepEqual(bindingFor("product", id), { kind: "product", id }); assert.deepEqual(bindingFor("all"), { kind: "all" });
  assert.equal(instanceCount(["x", "slot-library-ab-0", "slot-library-0123456789abcdef-0"]), 1);
});
test("source contracts: pointer capture, handle-only touch action, cleanup, aria-live", () => {
  const d = readFileSync("src/public/section-drag.js", "utf8"), w = readFileSync("src/public/ann-design-workspace.js", "utf8"), css = readFileSync("src/public/ann-workspace.css", "utf8");
  for (const s of ["setPointerCapture", "lostpointercapture", "pointercancel", "requestAnimationFrame", "Escape", "prefers-reduced-motion"]) assert.match(d, new RegExp(s));
  assert.doesNotMatch(d, /draggable/);
  assert.match(css, /\.aw-grip\{[^}]*touch-action:none/); assert.doesNotMatch(css, /\.aw-sec\{[^}]*touch-action/);
  assert.match(w, /aria-live="polite"/); assert.match(w, /addSection\(pg, family, binding, instances\.afterId, order, layout\)/);
  assert.match(w, /duplicateSection/); assert.match(w, /removeSection/);
  assert.doesNotMatch(d + w, /\u2014/);
});
test("workspace gates on canEditSections and wires undo and false-safe delete", () => {
  const w = readFileSync("src/public/ann-design-workspace.js", "utf8");
  assert.match(w, /canEditSections/); assert.match(w, /data-ws-undo/); assert.match(w, /canUndo/);
  assert.match(w, /removeSection\(o\.getPage\(\), d\.wsDel\) === true/);
});
