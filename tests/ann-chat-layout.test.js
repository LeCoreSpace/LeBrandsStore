import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/public/ann-builder.js", import.meta.url), "utf8");
const composerCode = source.slice(source.indexOf("function composerKeyFor("), source.indexOf("/* ---------- panel drawing"));
const timelineCode = source.slice(source.indexOf("function timeline()"), source.indexOf("const collectionsDetail"));
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function harness(kind = "choice", readOnly = false) {
  const box = { innerHTML: "", contains: () => false, querySelector: () => null };
  const prompt = { id: "category", step: "category" };
  const definition = { kind, label: "Category", q: "What do you sell?", cur: "1",
    opts: [{ v: 1, t: "Fashion & Apparel" }, { v: 2, t: "Beauty" }],
    reply: "", max: 120, items: [], list: "col" };
  const context = vm.createContext({
    $: () => box, document: { activeElement: null }, esc: escape,
    readOnly, dis: readOnly ? " disabled" : "", editing: null, detail: false,
    composerKey: "", composerDrafts: new Map(), composerOriginals: new Map(), focusComposer: false,
    DETAIL_STEPS: ["collections", "products", "story"], ANN_EXTRA_SECTIONS: { home: ["reviews", "faq"] },
    label: value => value, shown: () => ["faq"], answers: {}, item: () => null,
    prompts: () => [prompt], cur: () => prompt, def: () => definition,
    ref: {}, step: "category", curIdx: () => 0, reachedIdx: () => 0,
    UI_STEPS: [["category", "Category"]], notice: "", feeds: {},
    annBubble: (text, cls, attrs = "") => `<div class="${cls}"${attrs}><p>${escape(text)}</p></div>`,
    meBubble: html => html, listHtml: () => "<ul>Items</ul>", feedHtml: () => "",
    editQ: () => "New name?", reviewStep: () => "<p>Review plan</p>",
  });
  vm.runInContext(composerCode + timelineCode, context);
  return { box, prompt, definition, context,
    timeline: () => vm.runInContext("timeline()", context),
    composer: force => { context.force = !!force; vm.runInContext("drawComposer(force)", context); return box.innerHTML; } };
}

test("Ann choices follow their question in the scrolling transcript, never in the footer composer", () => {
  const h = harness();
  const html = h.timeline();
  assert.ok(html.indexOf("What do you sell?") < html.indexOf('data-pick="1"'));
  assert.match(html, /Fashion &amp; Apparel/);
  assert.match(html, /data-pick="2"/);
  assert.doesNotMatch(html, /data-composer-input/);
  const composer = h.composer();
  assert.match(composer, /data-composer-input/);
  assert.match(composer, /aria-label="Send"/);
  assert.doesNotMatch(composer, /data-pick|ann-chips|data-continue/);
});

test("Ann section toggles and completion stay inline and do not accept accidental typed products", () => {
  const h = harness("sections");
  assert.match(h.timeline(), /data-toggle-section="home:reviews"/);
  assert.match(h.timeline(), /data-continue/);
  assert.match(h.composer(), /placeholder="Use the options above" disabled/);
  assert.doesNotMatch(h.composer(), /data-toggle-section/);
});

test("Ann preserves unsent replies across prompts and rerenders, but does not restore a sent reply", () => {
  const h = harness();
  h.composer();
  const key = h.context.composerKey;
  h.context.composerDrafts.set(key, "Fashion");
  assert.match(h.composer(), />Fashion<\/textarea>/);
  h.prompt.id = "subcategory";
  h.composer();
  h.prompt.id = "category";
  assert.match(h.composer(), />Fashion<\/textarea>/);
  h.context.composerDrafts.delete(key); // Successful submission owns clearing.
  h.box.contains = () => true;
  h.context.document.activeElement = { tagName: "TEXTAREA", value: "Fashion", selectionStart: 7, selectionEnd: 7 };
  h.prompt.id = "subcategory";
  h.composer();
  h.prompt.id = "category";
  assert.doesNotMatch(h.composer(true), />Fashion<\/textarea>/);
});

test("Ann retains inline list navigation, edit cancellation and read-only controls", () => {
  const list = harness("list");
  assert.match(list.timeline(), /Skip for now/);
  assert.doesNotMatch(list.composer(), /data-continue/);
  list.context.editing = { kind: "col", i: 0, field: "description", follow: true };
  assert.match(list.timeline(), /data-cancel-edit/);
  assert.match(list.timeline(), /Skip note/);
  const readonly = harness("choice", true);
  assert.match(readonly.timeline(), /data-pick="1"[^>]*disabled/);
  assert.match(readonly.composer(), /placeholder="Viewing only" disabled/);
});

test("Ann keeps Enter-send, multiline and IME protections", () => {
  assert.match(source, /e\.key === "Enter" && !e\.shiftKey && !e\.isComposing/);
  assert.match(source, /t\.form\?\.requestSubmit\(\)/);
});
