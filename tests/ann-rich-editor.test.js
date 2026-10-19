import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { charsFromDoc, runsFromChars, safeLink, cpSlice, richEditorMarkup, replacementFormat, preserveTypedFormatting } from "../src/public/ann-rich-editor.js";
import { validRichTextDocument } from "../src/public/ann-rich-text.js";

test("toolbar controls override surrounding form padding and keep compact, labelled options",()=>{
  const source=readFileSync(new URL("../src/public/ann-rich-editor.js",import.meta.url),"utf8");
  assert.match(source,/\.re \.re-bar select\.re-sel,\.re \.re-bar input\.re-sel\{[^}]*font:400 11px\/normal[^}]*padding:0 4px/);
  assert.match(source,/select\.re-sel option\{font:400 11px/);
  assert.match(source,/\.re \.re-bar input\.re-col\{[^}]*flex:0 0 30px;[^}]*max-width:30px/);
  for(const caption of ["Style","Font","Size (px)","Line height","Letter spacing"])
    assert.ok(source.includes(`labelled("${caption}",`),`${caption} is visibly labelled`);
});

test("explicit false flags survive round trip", () => {
  const doc = { version: 1, runs: [{ text: "ab", bold: false }, { text: "c", bold: true, italic: false }], style: {} };
  const out = runsFromChars(charsFromDoc("abc", doc));
  assert.deepEqual(out, doc.runs);
  assert.ok(validRichTextDocument({ ...doc, runs: out }));
});
test("astral characters stay whole", () => {
  const t = "a\u{1F600}b";
  assert.equal(charsFromDoc(t, null).length, 3);
  assert.equal(cpSlice(t, 2), "a\u{1F600}");
});
test("newlines join the current run", () => {
  const runs = runsFromChars(charsFromDoc("a\nb", { version: 1, runs: [{ text: "a\nb", italic: true }], style: {} }));
  assert.equal(runs.length, 1);
});
test("links are restricted", () => {
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink("//evil.com"), "");
  assert.equal(safeLink("example.com/x"), "https://example.com/x");
  assert.equal(safeLink("mailto:a@b.co"), "mailto:a@b.co");
});
test("markup escapes merchant text", () => {
  const m = richEditorMarkup({ text: '<b onclick="x">', limit: 50, label: "T" });
  assert.ok(!m.includes('<b onclick'));
});
test("typing a replacement headline retains selected colour, highlight and explicit normal weight",()=>{
  const before=charsFromDoc("Original",{runs:[{text:"Original",color:"#802647",highlight:"#fff1cc",bold:false}]});
  assert.deepEqual(replacementFormat(before,0,before.length),{b:0,c:"#802647",h:"#fff1cc"});
  const replaced=preserveTypedFormatting(before,charsFromDoc("New headline",null));
  assert.deepEqual(runsFromChars(replaced),[{text:"New headline",bold:false,color:"#802647",highlight:"#fff1cc"}]);
  const saved={version:1,style:{font:"georgia",size:40},runs:runsFromChars(replaced)};
  assert.ok(validRichTextDocument(saved));
  assert.deepEqual(runsFromChars(charsFromDoc("New headline",saved)),saved.runs,"save/reopen round trip retains typing marks");
});
test("native input keeps marks around edits, honours explicit resets and handles Unicode deletion",()=>{
  const before=charsFromDoc("a\u{1F600}bc",{runs:[{text:"a\u{1F600}",bold:true},{text:"bc",color:"#802647"}]});
  assert.deepEqual(runsFromChars(preserveTypedFormatting(before,charsFromDoc("a\u{1F600}c",null))),
    [{text:"a\u{1F600}",bold:true},{text:"c",color:"#802647"}]);
  const typed=preserveTypedFormatting(before,[{c:"x",f:{b:0}}]);
  assert.equal(typed[0].f.b,0,"explicit normal text is not made bold");
});
