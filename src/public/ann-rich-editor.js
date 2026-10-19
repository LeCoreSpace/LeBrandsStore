/**
 * Shared rich-text editor for Ann design copy. Contenteditable is only an input surface:
 * every change is parsed through the DOM into per-character formats, converted to structured
 * runs, validated by ann-rich-text.js, and the surface is rebuilt with DOM APIs. No merchant
 * HTML, style strings or execCommand output is ever stored or reused.
 */
import { richTextPlain, validRichTextDocument, RICH_FONTS } from "./ann-rich-text.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HEX = /^#[0-9a-f]{6}$/i;
const CLEAN = /[\u0000-\u0008\u000b-\u001f\u007f<>]/g;
const MAX_RUNS = 120;
const PRESETS = [["body", "Body"], ["title", "Heading"], ["subtitle", "Subheading"], ["caption", "Caption"]];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96, 120];
const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
const SPACINGS = [-1, -0.5, 0.5, 1, 2, 4, 6];
const FLAGS = [["bold", "b"], ["italic", "i"], ["underline", "u"], ["strike", "s"]];

const CSS = `.re{border:1px solid #cfc4c8;border-radius:10px;background:#fff;color:#2b2326;font:13px/1.45 system-ui,sans-serif;overflow:hidden}.re:focus-within{border-color:#6b1735;box-shadow:0 0 0 2px rgba(107,23,53,.25)}.re *{box-sizing:border-box}
.re-bar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px;background:#f7f1f3;border-bottom:1px solid #eadfe2}
.re-grp{display:flex;gap:2px;align-items:center;padding-right:6px;margin-right:2px;border-right:1px solid #e2d5d9}.re-grp:last-child{border:0;margin:0;padding:0}
.re-btn{min-width:30px;height:30px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:7px;background:transparent;color:#4b1226;font:600 13px/1 system-ui,sans-serif;cursor:pointer}
.re-btn:hover:not(:disabled){background:#efe1e6}.re-btn[aria-pressed=true]{background:#6b1735;color:#fff}.re-btn:disabled{opacity:.4;cursor:default}.re-btn:focus-visible,.re-sel:focus-visible,.re-col:focus-visible,.re-link input:focus-visible{outline:2px solid #6b1735;outline-offset:1px}
.re-sel{height:30px;max-width:112px;border:1px solid #d9cfd2;border-radius:7px;background:#fff;color:#2b2326;font:12px system-ui,sans-serif;padding:0 4px}
.re-size{width:64px;max-width:64px}.re-col{width:30px;height:30px;padding:2px;border:1px solid #d9cfd2;border-radius:7px;background:#fff;cursor:pointer}
.re-lbl{font-size:11px;color:#6d5a61;margin-right:2px}
.re-link{display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#fbf6f8;border-bottom:1px solid #eadfe2}.re-link[hidden]{display:none}.re-link input{flex:1 1 160px;height:30px;border:1px solid #cfc4c8;border-radius:7px;padding:0 8px;font:13px system-ui,sans-serif}
.re-link .re-btn{border-color:#d9cfd2}.re-link .re-go{background:#6b1735;color:#fff;border-color:#6b1735}
.re-err{margin:0;padding:4px 8px;font-size:12px;color:#8a1c2b;background:#fdf0f1}.re-err:empty{display:none}
.re-edit{min-height:64px;max-height:240px;overflow:auto;padding:9px 10px;outline:0;white-space:pre-wrap;overflow-wrap:anywhere;counter-reset:rl}.re-edit.single{min-height:38px}
.re-edit>div{min-height:1.2em}.re-edit.l-bullet>div::before{content:"\\2022";display:inline-block;width:1.4em;font-weight:700;color:#6b1735}.re-edit.l-number>div{counter-increment:rl}.re-edit.l-number>div::before{content:counter(rl) ".";display:inline-block;width:1.6em;color:#6b1735;font-weight:700}
.re-edit a{color:#6b1735;text-decoration:underline}
.re-hint{margin:0;padding:3px 10px 6px;font-size:11px;color:#6d5a61}
@media(max-width:699px){.re-bar{position:sticky;bottom:0;order:2;border-top:1px solid #eadfe2;border-bottom:0}.re{display:flex;flex-direction:column}.re-btn{min-width:36px;height:36px}.re-sel,.re-col{height:36px}}`;

function ensureCss() {
  if (document.getElementById("ann-rich-css")) return;
  const s = document.createElement("style"); s.id = "ann-rich-css"; s.textContent = CSS; document.head.appendChild(s);
}
function h(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : v); }
  for (const c of [].concat(kids)) n.append(c);
  return n;
}
const NS = "http://www.w3.org/2000/svg";
function icon(d) {
  const s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.appendChild(p); return s;
}
const ICONS = {
  left: "M2 3h12M2 6.5h8M2 10h12M2 13.5h8", center: "M2 3h12M4 6.5h8M2 10h12M4 13.5h8", right: "M2 3h12M6 6.5h8M2 10h12M6 13.5h8", justify: "M2 3h12M2 6.5h12M2 10h12M2 13.5h12",
  bullet: "M6 4h8M6 8h8M6 12h8M2.5 4h.1M2.5 8h.1M2.5 12h.1", number: "M7 4h7M7 8h7M7 12h7M2.5 3v3M2.5 7.5h1.5l-1.5 2h1.5", link: "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1",
  undo: "M5 3L2.5 5.5 5 8M3 5.5h6a4 4 0 010 8H6", redo: "M11 3l2.5 2.5L11 8M13 5.5H7a4 4 0 000 8h3", clear: "M3 3h10M8 3v7M5 13h6M3 13l10-10",
};

/** Safe link: https/http/mailto/tel only. Returns normalised string or "". */
export function safeLink(raw) {
  let v = String(raw ?? "").trim();
  if (!v || /[\u0000-\u0020<>"]/.test(v) || v.startsWith("//")) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) { if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v)) v = "https://" + v; else return ""; }
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d().-]+)$/i.test(v) && v.length <= 500 ? v : "";
}
const okDoc = (doc, limit) => { try { const r = validRichTextDocument(doc, limit); return Boolean(r) && r.ok !== false; } catch { return false; } };
const fkey = f => JSON.stringify([f.b, f.i, f.u, f.s, f.c, f.h, f.l]);
export const cpSlice = (t, n) => [...String(t ?? "")].slice(0, n).join("");
const clampNum = (v, a, b) => Math.min(b, Math.max(a, Number(v)));

export function charsFromDoc(text, doc) {
  const chars = [];
  const runs = doc && Array.isArray(doc.runs) ? doc.runs : null;
  if (runs && runs.map(r => String(r.text ?? "")).join("") === text) {
    for (const r of runs) {
      const f = {};
      for (const [name, k] of FLAGS) if (typeof r[name] === "boolean") f[k] = r[name] ? 1 : 0;
      if (HEX.test(r.color || "")) f.c = r.color.toLowerCase(); if (HEX.test(r.highlight || "")) f.h = r.highlight.toLowerCase();
      if (r.link && safeLink(r.link) === r.link) f.l = r.link;
      for (const c of String(r.text)) chars.push({ c, f });
    }
  } else for (const c of text) chars.push({ c, f: {} });
  return chars;
}
export function runsFromChars(chars) {
  const runs = []; let cur = null, curKey = "";
  for (const { c, f } of chars) {
    const k = fkey(f);
    if (cur && (c === "\n" || k === curKey)) { cur.text += c; continue; }
    cur = { text: c }; curKey = k; runs.push(cur);
    for (const [name, k] of FLAGS) if (f[k] !== undefined) cur[name] = f[k] === 1;
    if (f.c) cur.color = f.c; if (f.h) cur.highlight = f.h; if (f.l) cur.link = f.l;
  }
  return runs;
}
export function replacementFormat(chars,start,end){
  const source=start<end?chars[start]:(chars[start-1]||chars[start]);
  return source&&source.c!=="\n"?{...source.f}:{};
}
/** Native input/autofill can replace styled DOM spans with bare text. Retain
 * the JSON marks of unchanged characters and the insertion/replacement range,
 * never infer persisted formatting from browser-generated HTML or CSS. */
export function preserveTypedFormatting(before,after){
  let prefix=0,suffix=0;
  while(prefix<before.length&&prefix<after.length&&before[prefix].c===after[prefix].c)prefix++;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&
    before[before.length-1-suffix].c===after[after.length-1-suffix].c)suffix++;
  const marks=replacementFormat(before,prefix,before.length-suffix);
  return after.map((x,i)=>{
    const original=i<prefix?before[i]?.f:i>=after.length-suffix?before[before.length-after.length+i]?.f:marks;
    return {c:x.c,f:x.c==="\n"?{}:{...original,...x.f}};
  });
}

export function richEditorMarkup({ text = "", document: doc = null, limit = 2000, label = "Text", allowBlocks = false } = {}) {
  return `<div class="re-host" data-rich-host data-rich-text="${esc(text)}" data-rich-doc="${esc(doc ? JSON.stringify(doc) : "")}" data-rich-limit="${Number(limit) || 2000}" data-rich-label="${esc(label)}" data-rich-blocks="${allowBlocks ? "1" : ""}"><span class="re-lbl">${esc(label)}</span><div data-rich-mount></div></div>`;
}

export function mountRichEditor(host, { text = "", document: doc = null, limit = 2000, label = "Text", allowBlocks = false, baseFlags, onChange } = {}) {
  ensureCss();
  limit = Number(limit) || 2000;
  const base = () => { try { return baseFlags?.() || {}; } catch { return {}; } };
  const emit = { fn: onChange };
  let chars = charsFromDoc(String(text).replace(CLEAN, "").slice(0, limit), doc && typeof doc === "object" ? doc : null);
  let style = {};
  if (doc && typeof doc.style === "object" && doc.style) {
    const s = doc.style;
    if (RICH_FONTS.some(f => f.value === s.font) && s.font !== "theme") style.font = s.font;
    if (Number.isFinite(s.size)) style.size = clampNum(s.size, 8, 120);
    if (["center", "right", "justify"].includes(s.align)) style.align = s.align;
    if (Number.isFinite(s.lineHeight)) style.lineHeight = clampNum(s.lineHeight, 0.8, 3);
    if (Number.isFinite(s.letterSpacing) && s.letterSpacing !== 0) style.letterSpacing = clampNum(s.letterSpacing, -2, 10);
    if (["title", "subtitle", "caption"].includes(s.preset)) style.preset = s.preset;
    if (allowBlocks && ["bullet", "number"].includes(s.list)) style.list = s.list;
  }
  let lastSel = null, composing = false, destroyed = false, lastGood = null, histTime = 0;
  const undoS = [], redoS = [];

  /* ---------- DOM ---------- */
  const edit = h("div", { class: "re-edit" + (allowBlocks ? "" : " single"), contenteditable: "true", role: "textbox", "aria-multiline": String(allowBlocks), "aria-label": label, spellcheck: "true" });
  const err = h("p", { class: "re-err", role: "alert" });
  const bar = h("div", { class: "re-bar", role: "toolbar", "aria-label": `${label} formatting` });
  const linkIn = h("input", { type: "text", "aria-label": "Link address", placeholder: "https://example.com", maxlength: "500" });
  const linkRow = h("div", { class: "re-link", hidden: true });
  const btns = {};
  const mk = (id, name, kid, fn, toggle) => {
    const b = h("button", { type: "button", class: "re-btn", "aria-label": name, title: name, "aria-pressed": toggle ? "false" : false }, kid);
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => { restoreSel(); fn(); });
    btns[id] = b; return b;
  };
  const sel = (id, name, opts, fn) => {
    const s = h("select", { class: "re-sel", "aria-label": name, title: name });
    for (const [v, t] of opts) s.append(h("option", { value: v, text: t }));
    s.addEventListener("change", () => { const value=s.value;restoreSel();fn(value);edit.focus({ preventScroll: true }); });
    btns[id] = s; return s;
  };
  const colour = (id, name, def, fn, clearFn) => {
    const c = h("input", { type: "color", class: "re-col", "aria-label": name, title: name, value: def });
    const apply=()=>{const value=c.value;restoreSel();fn(value);};
    c.addEventListener("input",apply);c.addEventListener("change",apply);
    const x = h("button", { type: "button", class: "re-btn", "aria-label": `Remove ${name.toLowerCase()}`, title: `Remove ${name.toLowerCase()}`, text: "x" });
    x.addEventListener("mousedown", e => e.preventDefault()); x.addEventListener("click", () => { restoreSel(); clearFn(); });
    btns[id] = c; return [c, x];
  };
  const T = t => document.createTextNode(t);
  const lab = (t, id) => { const s = h("b", { text: t, "aria-hidden": "true" }); return s; };

  function sizeInput() {
    const dl = h("datalist", { id: "re-sizes-" + Math.random().toString(36).slice(2) }, SIZES.map(n => h("option", { value: String(n) })));
    const i = h("input", { type: "number", class: "re-sel re-size", min: "8", max: "120", step: "1", list: dl.id, placeholder: "Size", "aria-label": "Size in pixels, 8 to 120", title: "Size (8 to 120)" });
    const go = () => { const raw=i.value.trim();restoreSel();if(!raw)return setStyle("size",undefined);const n=Number(raw);if(Number.isFinite(n))setStyle("size",Math.round(clampNum(n,8,120))); };
    i.addEventListener("change", go); i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    btns.size = i; return h("span", {}, [i, dl]);
  }
  const gType = h("div", { class: "re-grp", role: "group", "aria-label": "Type" }, [
    sel("preset", "Text style", PRESETS, v => setStyle("preset", v === "body" ? undefined : v)),
    sel("font", "Font", RICH_FONTS.map(f => [f.value, f.label]), v => setStyle("font", v === "theme" ? undefined : v)),
    sizeInput(),
  ]);
  const bi = mk("bold", "Bold", h("b", { text: "B" }), () => toggleFlag("b"), true), it = mk("italic", "Italic", h("i", { text: "I" }), () => toggleFlag("i"), true);
  const un = mk("underline", "Underline", h("u", { text: "U" }), () => toggleFlag("u"), true), st = mk("strike", "Strikethrough", h("s", { text: "S" }), () => toggleFlag("s"), true);
  const gMark = h("div", { class: "re-grp", role: "group", "aria-label": "Emphasis" }, [bi, it, un, st]);
  const gCol = h("div", { class: "re-grp", role: "group", "aria-label": "Colour" }, [
    h("span", { class: "re-lbl", text: "Text" }), ...colour("color", "Text colour", "#2b2326", v => setChar("c", v.toLowerCase()), () => setChar("c", undefined)),
    h("span", { class: "re-lbl", text: "Mark" }), ...colour("highlight", "Highlight colour", "#fff2a8", v => setChar("h", v.toLowerCase()), () => setChar("h", undefined)),
  ]);
  const gAlign = h("div", { class: "re-grp", role: "group", "aria-label": "Alignment" }, ["left", "center", "right", "justify"].map(a => mk("a" + a, `Align ${a}`, icon(ICONS[a]), () => setStyle("align", a === "left" ? undefined : a), true)));
  const gSpace = h("div", { class: "re-grp", role: "group", "aria-label": "Spacing" }, [
    sel("lh", "Line height", [["", "Line"], ...LINE_HEIGHTS.map(n => [String(n), String(n)])], v => setStyle("lineHeight", v ? Number(v) : undefined)),
    sel("ls", "Letter spacing", [["", "Track"], ...SPACINGS.map(n => [String(n), String(n)])], v => setStyle("letterSpacing", v ? Number(v) : undefined)),
  ]);
  const gBlock = h("div", { class: "re-grp", role: "group", "aria-label": "Lists and links" }, [
    mk("bullet", "Bulleted list", icon(ICONS.bullet), () => setStyle("list", style.list === "bullet" ? undefined : "bullet"), true),
    mk("number", "Numbered list", icon(ICONS.number), () => setStyle("list", style.list === "number" ? undefined : "number"), true),
    mk("link", "Link", icon(ICONS.link), openLink, true),
  ]);
  const gHist = h("div", { class: "re-grp", role: "group", "aria-label": "History" }, [
    mk("undo", "Undo", icon(ICONS.undo), undo), mk("redo", "Redo", icon(ICONS.redo), redo), mk("clear", "Clear formatting", icon(ICONS.clear), clearAll),
  ]);
  bar.append(gType, gMark, gCol, gAlign, gSpace);
  if (allowBlocks) bar.append(gBlock);
  bar.append(gHist);
  const goBtn = h("button", { type: "button", class: "re-btn re-go", text: "Apply" }), noBtn = h("button", { type: "button", class: "re-btn", text: "Remove link" });
  linkRow.append(linkIn, goBtn, noBtn);
  const hint = h("p", { class: "re-hint", text: "Formats the selection, or all text when nothing is selected." });
  const root = h("div", { class: "re" }, [bar, linkRow, err, edit, hint]);
  const mountPoint = host.querySelector("[data-rich-mount]") || host;
  mountPoint.replaceChildren(root);
  host.dataset.richReady = "1";

  /* ---------- model <-> DOM ---------- */
  function readChars(rootNode) {
    const out = []; let needBreak = false;
    const walk = (n, f) => {
      if (n.nodeType === 3) {
        const t = n.nodeValue.replace(/\r/g, "").replace(CLEAN, "").replace(/\u00a0/g, " ");
        if (t && needBreak) { out.push({ c: "\n", f: {} }); needBreak = false; }
        for (const c of t) out.push({ c: allowBlocks ? c : c === "\n" ? " " : c, f });
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === "BR") { if (n.parentNode !== rootNode && n.parentNode.childNodes.length > 1 || n.parentNode === rootNode) { out.push({ c: allowBlocks ? "\n" : " ", f: {} }); } return; }
      const nf = { ...f };
      for (const [tags, k, ds] of [[["B", "STRONG"], "b", "fb"], [["I", "EM"], "i", "fi"], [["U"], "u", "fu"], [["S", "STRIKE", "DEL"], "s", "fs"]]) {
        if (n.dataset?.[ds] === "0") nf[k] = 0; else if (n.dataset?.[ds] === "1" || tags.includes(tag)) nf[k] = 1;
      }
      if (n.dataset?.fc && HEX.test(n.dataset.fc)) nf.c = n.dataset.fc.toLowerCase();
      if (n.dataset?.fh && HEX.test(n.dataset.fh)) nf.h = n.dataset.fh.toLowerCase();
      if (tag === "A" && allowBlocks) { const l = safeLink(n.dataset?.fl || n.getAttribute("href")); if (l) nf.l = l; else delete nf.l; }
      const block = (tag === "DIV" || tag === "P" || tag === "LI") && n !== rootNode;
      if (block && allowBlocks && out.length && out[out.length - 1].c !== "\n") needBreak = true;
      else if (block && !allowBlocks && out.length && out[out.length - 1].c !== " ") needBreak = true;
      if (block && needBreak && !allowBlocks) { out.push({ c: " ", f: {} }); needBreak = false; }
      for (const k of n.childNodes) walk(k, nf);
      if (block && allowBlocks && n.childNodes.length === 1 && n.firstChild.nodeName === "BR") needBreak = true;
    };
    // An empty paragraph (div with only br) still counts as a line.
    const paras = [...rootNode.childNodes];
    if (paras.every(p => p.nodeType === 1 && p.tagName === "DIV") && allowBlocks) {
      paras.forEach((p, i) => { if (i) out.push({ c: "\n", f: {} }); needBreak = false; for (const k of p.childNodes) if (!(k.nodeName === "BR" && p.childNodes.length === 1)) walk(k, {}); });
    } else for (const k of paras) walk(k, {});
    return out;
  }
  const textOf = cs => cs.map(x => x.c).join("");
  function paragraphs(cs) {
    const out = [[]];
    for (const x of cs) { if (x.c === "\n") out.push([]); else out[out.length - 1].push(x); }
    return out;
  }
  function applyBox() {
    const bs = edit.style;
    const preset = style.preset;
    const base = { title: 48, subtitle: 28, caption: 13, body: 18 }[preset || "body"];
    const fam = RICH_FONTS.find(f => f.value === style.font)?.css;
    bs.fontFamily = fam && /^[\w\s,'"-]+$/.test(fam) ? fam : "";
    bs.fontSize = `${Math.min(32, style.size || base)}px`; // display cap for usability; saved size is untouched
    bs.fontWeight = "";
    bs.textAlign = style.align || "";
    bs.lineHeight = style.lineHeight ? String(style.lineHeight) : "";
    bs.letterSpacing = style.letterSpacing != null ? `${clampNum(style.letterSpacing, -2, 10)}px` : "";
    edit.classList.toggle("l-bullet", style.list === "bullet"); edit.classList.toggle("l-number", style.list === "number");
  }
  function render() {
    applyBox();
    const frag = document.createDocumentFragment();
    for (const p of paragraphs(chars)) {
      const d = document.createElement("div");
      if (!p.length) d.append(document.createElement("br"));
      let i = 0;
      while (i < p.length) {
        let j = i; const k = fkey(p[i].f);
        while (j < p.length && fkey(p[j].f) === k) j++;
        const f = p[i].f, t = p.slice(i, j).map(x => x.c).join("");
        const n = document.createElement(f.l ? "a" : "span");
        if (f.l) { n.setAttribute("href", f.l); n.dataset.fl = f.l; n.setAttribute("rel", "noopener noreferrer"); n.setAttribute("target", "_blank"); }
        if (f.b !== undefined) { n.dataset.fb = String(f.b); n.style.fontWeight = f.b ? "700" : "400"; }
        if (f.i !== undefined) { n.dataset.fi = String(f.i); n.style.fontStyle = f.i ? "italic" : "normal"; }
        if (f.u !== undefined) n.dataset.fu = String(f.u);
        if (f.s !== undefined) n.dataset.fs = String(f.s);
        if (f.u !== undefined || f.s !== undefined) n.style.textDecoration = [f.u && "underline", f.s && "line-through"].filter(Boolean).join(" ") || "none";
        if (f.c) { n.dataset.fc = f.c; n.style.color = f.c; }
        if (f.h) { n.dataset.fh = f.h; n.style.backgroundColor = f.h; }
        n.textContent = t; d.append(n); i = j;
      }
      frag.append(d);
    }
    edit.replaceChildren(frag);
  }
  function offsetOf(node, off) {
    try {
      const r = document.createRange(); r.setStart(edit, 0); r.setEnd(node, off);
      const tmp = document.createElement("div"); tmp.append(r.cloneContents());
      return textOf(readChars(tmp)).length;
    } catch { return 0; }
  }
  function locate(o) {
    const ps = paragraphs(chars), divs = [...edit.children];
    for (let i = 0; i < ps.length; i++) {
      if (o <= ps[i].length || i === ps.length - 1) {
        const d = divs[i]; if (!d) break;
        if (!ps[i].length) return [d, 0];
        let left = Math.min(o, ps[i].length);
        for (const n of d.childNodes) {
          const cps = [...n.textContent], len = cps.length;
          if (left <= len) return [n.firstChild || n, cps.slice(0, left).join("").length];
          left -= len;
        }
        return [d, d.childNodes.length];
      }
      o -= ps[i].length + 1;
    }
    return [edit, edit.childNodes.length];
  }
  function getSel() {
    const s = window.getSelection();
    if (!s || !s.rangeCount || !edit.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    const a = offsetOf(r.startContainer, r.startOffset), b = offsetOf(r.endContainer, r.endOffset);
    return [Math.min(a, b), Math.max(a, b)];
  }
  function setSel(a, b = a) {
    const s = window.getSelection(); if (!s) return;
    const [sn, so] = locate(a), [en, eo] = locate(b), r = document.createRange();
    try { r.setStart(sn, so); r.setEnd(en, eo); s.removeAllRanges(); s.addRange(r); } catch { /* ignore */ }
  }
  function restoreSel() { if (lastSel && document.activeElement !== edit) { edit.focus({ preventScroll: true }); setSel(lastSel[0], lastSel[1]); } }
  const onSelChange = () => { if (destroyed) return; const s = getSel(); if (s) { lastSel = s; syncBar(); } };
  document.addEventListener("selectionchange", onSelChange);

  /* ---------- state ---------- */
  function buildDoc() {
    const t = textOf(chars), runs = runsFromChars(chars);
    const plain = runs.every(r => Object.keys(r).length === 1) && !Object.keys(style).length;
    return { text: t, document: plain || !t ? null : { version: 1, runs, style: { ...style } } };
  }
  function snap() { return { chars: chars.map(x => ({ c: x.c, f: x.f })), style: { ...style } }; }
  function load(s) { chars = s.chars.map(x => ({ c: x.c, f: x.f })); style = { ...s.style }; }
  function commit(selRange, group) {
    chars = chars.slice(0, limit);
    const out = buildDoc();
    if (out.document && (out.document.runs.length > MAX_RUNS || !okDoc(out.document, limit))) {
      if (lastGood) { load(lastGood); render(); if (selRange) setSel(Math.min(selRange[0], chars.length)); }
      err.textContent = out.document.runs.length > MAX_RUNS ? "That is too many separate formats in one field. Clear some formatting first." : "That formatting could not be used.";
      return false;
    }
    err.textContent = "";
    if(lastGood&&JSON.stringify(snap())===JSON.stringify(lastGood)){syncBar();return true;}
    const now = Date.now();
    if (lastGood && !(group === "type" && now - histTime < 700)) { undoS.push(lastGood); if (undoS.length > 60) undoS.shift(); }
    if (lastGood) { histTime = now; redoS.length = 0; }
    lastGood = snap();
    render(); if (selRange) { setSel(Math.min(selRange[0], chars.length), Math.min(selRange[1], chars.length)); lastSel = getSel() || lastSel; }
    emit.fn?.(out); syncBar(); return true;
  }
  lastGood = snap();

  function range() { const s = getSel() || lastSel || [0, chars.length]; return s[0] === s[1] ? [0, chars.length] : s; }
  function visibleIdx(a, b) { const r = []; for (let i = a; i < b && i < chars.length; i++) if (chars[i].c !== "\n") r.push(i); return r; }
  const eff = (f, k) => f[k] === 1 ? true : f[k] === 0 ? false : Boolean(base()[k]);
  function setChar(key, val) {
    const sel0 = getSel() || lastSel, [a, b] = range();
    for (const i of visibleIdx(a, b)) { const f = { ...chars[i].f }; if (val === undefined) delete f[key]; else f[key] = val; chars[i] = { c: chars[i].c, f }; }
    commit(sel0, "fmt");
  }
  function toggleFlag(k) {
    const [a, b] = range(), idx = visibleIdx(a, b), all = idx.length && idx.every(i => eff(chars[i].f, k));
    const dflt = Boolean(base()[k]);
    setChar(k, all ? (dflt ? 0 : undefined) : (dflt ? undefined : 1));
  }
  function setStyle(k, v) {
    const s0 = getSel() || lastSel;
    const next = { ...style }; if (v === undefined) delete next[k]; else next[k] = v;
    if (k === "list" && !allowBlocks) return;
    style = next; commit(s0, "fmt");
  }
  function clearAll() {
    const s0 = getSel() || lastSel;
    const [a, b] = range();
    for (const i of visibleIdx(a, b)) chars[i] = { c: chars[i].c, f: {} };
    if (a === 0 && b >= chars.length) style = {};
    commit(s0, "fmt");
  }
  function undo() { const p = undoS.pop(); if (!p) return; redoS.push(snap()); load(p); lastGood = p; render(); emit.fn?.(buildDoc()); syncBar(); }
  function redo() { const n = redoS.pop(); if (!n) return; undoS.push(snap()); load(n); lastGood = n; render(); emit.fn?.(buildDoc()); syncBar(); }
  function openLink() {
    if (!allowBlocks) return;
    const [a, b] = range(), idx = visibleIdx(a, b);
    linkIn.value = idx.length && idx.every(i => chars[i].f.l && chars[i].f.l === chars[idx[0]].f.l) ? chars[idx[0]].f.l : "";
    linkRow.hidden = !linkRow.hidden; if (!linkRow.hidden) linkIn.focus(); else edit.focus();
  }
  function applyLink() {
    const v = safeLink(linkIn.value);
    if (!v) { err.textContent = "Use a web address starting with https://, or a mailto: or tel: link."; return; }
    err.textContent = ""; linkRow.hidden = true; edit.focus({ preventScroll: true }); setSel((lastSel || [0, 0])[0], (lastSel || [0, 0])[1]); setChar("l", v);
  }
  goBtn.addEventListener("click", applyLink);
  noBtn.addEventListener("click", () => { linkRow.hidden = true; edit.focus({ preventScroll: true }); if (lastSel) setSel(lastSel[0], lastSel[1]); setChar("l", undefined); });
  linkIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") { e.stopPropagation(); linkRow.hidden = true; edit.focus(); } });

  function syncBar() {
    const [a, b] = range(), idx = visibleIdx(a, b);
    for (const [id, k] of [["bold", "b"], ["italic", "i"], ["underline", "u"], ["strike", "s"]]) btns[id].setAttribute("aria-pressed", String(idx.length > 0 && idx.every(i => eff(chars[i].f, k))));
    btns.link?.setAttribute("aria-pressed", String(idx.length > 0 && idx.every(i => chars[i].f.l)));
    btns.preset.value = style.preset || "body"; btns.font.value = style.font || "theme";
    const setOpt = (s, v) => { if (s.tagName === "INPUT") { s.value = v == null ? "" : String(v); return; } const sv = v == null ? "" : String(v); if (sv && ![...s.options].some(o => o.value === sv)) s.append(h("option", { value: sv, text: sv })); s.value = sv; };
    setOpt(btns.size, style.size); setOpt(btns.lh, style.lineHeight); setOpt(btns.ls, style.letterSpacing);
    for (const al of ["left", "center", "right", "justify"]) btns["a" + al].setAttribute("aria-pressed", String((style.align || "left") === al));
    if (allowBlocks) { btns.bullet.setAttribute("aria-pressed", String(style.list === "bullet")); btns.number.setAttribute("aria-pressed", String(style.list === "number")); }
    btns.undo.disabled = !undoS.length; btns.redo.disabled = !redoS.length;
    const f0 = idx.length ? chars[idx[0]].f : {};
    if (f0.c) btns.color.value = f0.c; if (f0.h) btns.highlight.value = f0.h;
  }

  /* ---------- input handling ---------- */
  function replaceRange(a, b, str) {
    const base = replacementFormat(chars,a,b);
    const clean = String(str).replace(/\r\n?/g, "\n").replace(CLEAN, c => c === "\n" ? c : "");
    const add = [...(allowBlocks ? clean : clean.replace(/\n/g, " "))].map(c => ({ c, f: c === "\n" ? {} : base }));
    const room = limit - (chars.length - (b - a));
    const kept = add.slice(0, Math.max(0, room));
    chars.splice(a, b - a, ...kept);
    commit([a + kept.length, a + kept.length], "type");
  }
  edit.addEventListener("beforeinput", e => {
    if (composing) return;
    const t = e.inputType;
    if (t === "historyUndo") { e.preventDefault(); undo(); }
    else if (t === "historyRedo") { e.preventDefault(); redo(); }
    else if ((t === "insertText" || t === "insertReplacementText") && e.data != null) {
      e.preventDefault();const [a,b]=getSel()||[chars.length,chars.length];replaceRange(a,b,e.data);
    }
    else if (t === "insertParagraph" || t === "insertLineBreak") { e.preventDefault(); if (allowBlocks) { const [a, b] = getSel() || [chars.length, chars.length]; replaceRange(a, b, "\n"); } }
    else if (t === "insertFromDrop" || t === "insertFromPaste" || t === "insertFromYank" || t === "insertReplacementText" && !e.data && !e.dataTransfer) { e.preventDefault(); }
    else if (t.startsWith("format")) e.preventDefault();
  });
  edit.addEventListener("paste", e => {
    e.preventDefault();
    const str = e.clipboardData?.getData("text/plain") || "";
    const [a, b] = getSel() || [chars.length, chars.length];
    replaceRange(a, b, str);
  });
  edit.addEventListener("drop", e => e.preventDefault());
  edit.addEventListener("dragover", e => e.preventDefault());
  edit.addEventListener("compositionstart", () => { composing = true; });
  edit.addEventListener("compositionend", () => { composing = false; onInput(); });
  function onInput() {
    if (composing || destroyed) return;
    const s = getSel();
    chars = preserveTypedFormatting(chars,readChars(edit));
    const over = chars.length > limit;
    commit(s ? (over ? [limit, limit] : s) : null, "type");
  }
  edit.addEventListener("input", onInput);
  edit.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (!mod) return;
    if (k === "b") { e.preventDefault(); toggleFlag("b"); }
    else if (k === "i") { e.preventDefault(); toggleFlag("i"); }
    else if (k === "u") { e.preventDefault(); toggleFlag("u"); }
    else if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === "y") { e.preventDefault(); redo(); }
  });
  edit.addEventListener("click", e => { if (e.target.closest?.("a")) e.preventDefault(); });
  edit.addEventListener("blur", () => { const s = getSel(); if (s) lastSel = s; });

  render(); syncBar();
  return {
    focus() { edit.focus({ preventScroll: true }); },
    destroy() { destroyed = true; document.removeEventListener("selectionchange", onSelChange); emit.fn = null; mountPoint.replaceChildren(); },
  };
}

export { richTextPlain };
