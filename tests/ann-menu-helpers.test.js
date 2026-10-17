import test from "node:test";
import assert from "node:assert/strict";
import { applyMenuAction, setMenuField, menuDestinations, menuLinkTotal } from "../src/public/ann-design-workspace.js";
import { MAX_MENU_ITEMS, MAX_MENU_CHILDREN } from "../src/public/ann-menu-model.js";

const base = () => ({ header: [{ label: "Shop", url: "/collections/all", children: [{ label: "New", url: "/a" }, { label: "Sale", url: "/b" }] }, { label: "About", url: "/pages/about" }], footer: [] });

test("applyMenuAction is immutable and reorders", () => {
  const m = base(), snap = JSON.stringify(m);
  const up = applyMenuAction(m, "header", "down", 0);
  assert.equal(JSON.stringify(m), snap);
  assert.deepEqual(up.header.map(x => x.label), ["About", "Shop"]);
  assert.equal(applyMenuAction(m, "header", "up", 0), null);
  assert.equal(applyMenuAction(m, "header", "down", 1), null);
  assert.deepEqual(applyMenuAction(m, "header", "down", 0, "0").header[0].children.map(c => c.label), ["Sale", "New"]);
});
test("applyMenuAction add and remove respect bounds and depth", () => {
  let m = base();
  assert.equal(applyMenuAction(m, "footer", "add").footer.length, 1);
  assert.equal(applyMenuAction(m, "bogus", "add"), null);
  assert.equal(applyMenuAction(m, "header", "addchild", 5), null);
  const r = applyMenuAction(applyMenuAction(m, "header", "remove", 0, "0"), "header", "remove", 0, "0");
  assert.equal("children" in r.header[0], false);
  m = { header: Array.from({ length: MAX_MENU_ITEMS }, (_, i) => ({ label: `L${i}`, url: "/" })), footer: [] };
  assert.equal(applyMenuAction(m, "header", "add"), null);
  m = { header: [{ label: "P", url: "/", children: Array.from({ length: MAX_MENU_CHILDREN }, () => ({ label: "c", url: "/" })) }], footer: [] };
  assert.equal(applyMenuAction(m, "header", "addchild", 0), null);
  const child = base().header[0].children[0];
  assert.equal(child.children, undefined);
});
test("setMenuField edits a row immutably", () => {
  const m = base(), snap = JSON.stringify(m);
  assert.equal(setMenuField(m, "header", 1, "", "label", "Story").header[1].label, "Story");
  assert.equal(setMenuField(m, "header", 0, "1", "url", "/x").header[0].children[1].url, "/x");
  assert.equal(JSON.stringify(setMenuField(m, "header", 0, "", "bad", "z")), snap);
  assert.equal(JSON.stringify(m), snap);
  assert.equal(menuLinkTotal(m), 4);
});
test("menuDestinations lists existing pages, skips archived", () => {
  const g = menuDestinations({ products: [{ id: "p1", name: "Tote" }, { id: "p2", name: "Old", status: "archived" }], collections: [{ slug: "new", name: "New" }], policies: [{ kind: "refund" }] });
  assert.deepEqual(g.map(x => x[0]), ["Pages", "Collections", "Products", "Policies"]);
  assert.deepEqual(g[2][1], [["Tote", "/products/p1"]]);
  assert.equal(g[3][1][0][1], "/policies/refund");
});
