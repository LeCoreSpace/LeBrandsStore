/**
 * Ann design canvas: "Use this design", direct edit, save draft, review and publish.
 * Parent-side only. The sandboxed preview iframe stays script-free: it only carries
 * data-design-copy / data-design-image annotations that this module binds from outside.
 * Edits update a validated model (plain text and owned media ids), never raw HTML.
 */
import { DESIGN_MEDIA_KEYS, isDesignCopyKey, isDesignMediaKey, getDesignCopyLimit } from "./ann-design-model.js";
import {validateDesignMenus,defaultDesignMenus} from "./ann-menu-model.js";
import { designNeutralCopy } from "./aura-showcase.js";
import { AURA_STYLES } from "./aura-styles.js";
import { mountRichEditor, richEditorMarkup } from "./ann-rich-editor.js";
import {createSectionInstance,insertSectionInstance,removeSectionInstance,copyInstanceFields,clearInstanceFields} from "./section-instance-model.js";
import {validDesignSections} from "./ann-section-layout.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function designToolsMarkup(content) {
  return content.trim() ? `<div class="ann-design-card ann-design-compact">${content}</div>` : "";
}
const COPY_LABEL = {
  kicker: "Small line above the headline", title: "Headline", description: "Introduction", button: "Button label", statement: "Statement",
  products: "Products heading", collections: "Collections heading", about: "About heading",
  story0: "Story, paragraph 1", story1: "Story, paragraph 2", story2: "Story, paragraph 3", footer: "Footer line",
};
const IMAGE_LABEL = { hero: "Main photo", lifestyle: "Lifestyle photo", collection0: "First collection photo", collection1: "Second collection photo" };
const humanize = k => { const t = String(k).replace(/[-_.:]+/g, " ").replace(/([a-z])(\d+)$/i, "$1 $2").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const labelOf = (kind, k) => {
  const fixed = kind === "copy" ? COPY_LABEL[k] : kind === "image" ? IMAGE_LABEL[k] : "";
  if (fixed) return fixed;
  const m = /^(text|image|video)(\d+)$/.exec(String(k).split(".").pop());
  if (m) return `${{ text: "Text", image: "Photo", video: "Video" }[m[1]]} ${Number(m[2]) + 1}`;
  return kind === "video" ? "Video" : humanize(k);
};
const MAX_VIDEO = 10 * 1024 * 1024;
const imageKeyOf = k => String(k).replace(/\.video(\d+)$/, ".image$1");
const CTX_CSS = ".ann-ctx{position:fixed;z-index:50;box-sizing:border-box;max-height:calc(100dvh - 16px);overflow:auto;background:#fffdfb;color:#2b2326;border:1px solid #d9cfd2;border-radius:14px;box-shadow:0 1px 2px rgba(43,35,38,.08),0 14px 34px rgba(43,35,38,.18);padding:0;display:grid;gap:0;font:13px/1.45 system-ui,sans-serif}.ann-ctx>*:not(.ann-ctx-head){margin:0;padding:12px 14px}.ann-ctx *{box-sizing:border-box;min-width:0}.ann-ctx input,.ann-ctx textarea,.ann-ctx video{max-width:100%;width:100%}.ann-ctx input[type=text],.ann-ctx textarea{border:1px solid #cfc4c8;border-radius:8px;padding:8px 10px;background:#fff;font:inherit}.ann-ctx input[type=text]:focus,.ann-ctx textarea:focus{outline:2px solid #6b1735;outline-offset:1px;border-color:#6b1735}.ann-ctx .ann-actions{flex-wrap:wrap;gap:6px}.ann-ctx .ann-design-edit{border-top:0;padding-top:12px}.ann-ctx.sheet{left:8px;right:8px;bottom:8px;top:auto;width:auto}.ann-ctx-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 10px 10px 14px;border-bottom:1px solid #eadfe2;background:#f7f1f3;border-radius:14px 14px 0 0}.ann-ctx-head strong{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#5c4a50}.ann-ctx-list{display:flex;flex-wrap:wrap;gap:6px}.ann-ctx .ann-btn.sm{min-height:32px;font-size:12px}";
const STYLE_KEYS = ["style_preset", "color_preset", "font_preset", "accent_color", "button_style"];
const styleName = id => AURA_STYLES.find(s => s.id === id)?.name || id;
const MAX_UPLOAD = 8 * 1024 * 1024;

export function attachAnnDesign(o) {
  const { api, root, mount, say } = o;
  const memberReadOnly=o.readOnly;
  let readOnly=memberReadOnly||o.businessAllowed===false;
  const el = document.createElement("section");
  el.id = "ann-design"; el.className = "ann-design"; el.setAttribute("aria-label", "Your design");
  mount.parentNode.insertBefore(el, mount);

  const top = o.themeEditor ? null : document.getElementById("ann-top-actions");
  let loaded = false, loadError = "", expected = "", images = [], videos = [], publishUrl = `${root}/setup?step=4`;
  let design = null, model = null, baseline = "", planDirty = false,menuSource={};
  let busy = "", error = "", conflict = false, ack = false, editMode = true, selected = null, uploadAlt = "", uploadNote = "",menuDraftError="";
  let lastKey = "";
  let catalogueAck = false, cataloguePrompt = false, consentOpen = false;
  let richEditor=null;
  let undoStack=[],historyState=null,historyGroup="",historyTime=0,savedPlan="",menuRevision=0;

  const active = () => Boolean(model);
  const mediaIds = m => Object.fromEntries([...new Set([...DESIGN_MEDIA_KEYS, ...Object.keys(m || {}), ...Object.keys(design?.media || {})])].filter(k => isDesignMediaKey(k)).map(k => [k, m?.[k]?.media_id || null]));
  const snapshot = () => model ? JSON.stringify({ c: model.copy, f: model.formatting, m: mediaIds(model.media),s:model.sections,catalogue:model.catalogue_mode,menus:model.menus }) : "";
  const dirty = () => active() && (snapshot() !== baseline || planDirty || Boolean(menuDraftError));
  const mode = () => o.getPreviewMode();
  const browsingStyle = () => o.getStyle?.() || o.getAnswers().style_preset || "editorial";
  const sameStyle = () => active() && browsingStyle() === model.style;
  const editing = () => active() && !readOnly && editMode && mode() === "store" && sameStyle();
  const captureHistory=()=>model?structuredClone({copy:model.copy,formatting:model.formatting,media:model.media,sections:model.sections,catalogue_mode:model.catalogue_mode,menus:model.menus,plan:planPayload()}):null;
  function remember(group=""){
    if(readOnly||!model)return;
    const next=captureHistory();
    if(JSON.stringify(next)===JSON.stringify(historyState))return;
    const now=Date.now(),typing=group.startsWith("copy:");
    if(historyState&&!(typing&&group===historyGroup&&now-historyTime<1000)){
      undoStack.push(historyState);if(undoStack.length>50)undoStack.shift();
    }
    historyState=next;historyGroup=group;historyTime=now;
  }
  function canEditSections(){return Boolean(!readOnly&&model&&active()&&!busy&&!conflict&&!menuDraftError);}
  function requireSectionEdit(){if(!canEditSections())throw new Error("Editing is unavailable right now. Your existing draft is unchanged.");}
  function commitSectionModel(next){
    if(!validDesignSections(next.sections))throw new Error("Choose a valid section arrangement.");
    model=next;planDirty=true;selected=null;remember();paint(true);o.onChange?.();
  }
  const canUndo=()=>Boolean(canEditSections()&&undoStack.length);
  function undo(){
    if(!canUndo())return;
    const previous=undoStack.pop();
    model.copy=structuredClone(previous.copy);model.formatting=structuredClone(previous.formatting||{});model.media=structuredClone(previous.media);
    model.sections=structuredClone(previous.sections);model.catalogue_mode=previous.catalogue_mode;
    model.menus=structuredClone(previous.menus??null);
    model.plan=structuredClone(previous.plan);o.applyPlan?.(structuredClone(previous.plan));
    planDirty=JSON.stringify(planPayload())!==savedPlan;
    historyState=captureHistory();historyGroup="";selected=null;error="";menuDraftError="";menuRevision++;
    paint(true);markSelected();say("Last edit undone. Save draft to keep this version.");o.onChange?.();
    return true;
  }

  async function call(method, payload) {
    const res = await fetch(`${api}/design`, { method, credentials: "same-origin", headers: payload ? { "content-type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  }
  function ingest(body, { hydrate,preserveMenuDraft=false }) {
    if(!preserveMenuDraft){menuDraftError="";menuRevision++;}
    expected = body.expected_draft || expected;
    if (Array.isArray(body.images)) images = body.images;
    if (Array.isArray(body.videos)) videos = body.videos;
    if (body.publish_url) publishUrl = body.publish_url;
    if (body.draft) {menuSource=body.draft;o.onDraft?.(body.draft);}
    const d = body.design;
    if (d && d.version === 1) {
      design = d;
      model = { style: d.style, media_pack: d.media_pack,catalogue_mode:d.catalogue_mode||"own",sections:structuredClone(d.sections||{}),menus:d.menus==null?null:validateDesignMenus(d.menus), plan: d.plan || {}, copy: { ...d.copy }, formatting: structuredClone(d.formatting || {}), media: structuredClone(d.media || {}) };
      baseline = snapshot(); planDirty = false;
      if (hydrate) o.applyPlan?.(d.plan || {});
      savedPlan=JSON.stringify({...d.plan,style_preset:d.style});
      if(hydrate){undoStack=[];historyState=captureHistory();historyGroup="";}
    }
  }
  async function load() {
    loadError = ""; paint();
    try {
      const { res, body } = await call("GET");
      if (!res.ok) throw new Error(body.error || "Your design could not be loaded.");
      ingest(body, { hydrate: true });
      loaded = true;
      if (active()) o.onActivated?.({ restored: true,useOwnProducts:design?.catalogue_mode==="own" });
    } catch (e) { loadError = e.message || "Your design could not be loaded."; }
    paint(); o.onChange?.();
  }

  /** Create the selected showcase as the draft design. Explicit acknowledgement required. */
  async function use() {
    if (readOnly || busy || !ack || !loaded) return;
    busy = "use"; error = ""; conflict = false; paint(); say("Creating your design in the draft");
    try {
      const own=catalogueAck;
      const { res, body } = await call("POST", { expected_draft: expected, confirm: true,catalogue_mode:own?"own":"sample", answers: structuredClone(o.getAnswers()) });
      if (res.status === 409) { conflict = true; throw new Error("Your draft changed in another window. Reload the latest draft, then choose the design again."); }
      if (!res.ok) throw new Error(body.error || "The design could not be created. Nothing was changed.");
      ingest(body, { hydrate: true }); ack = false; selected = null;
      say("Design created in your draft. Your live site is unchanged.");
      o.onActivated?.({ restored: false, useOwnProducts: own });
    } catch (e) { error = e.message; say(error); }
    finally { busy = ""; paint(); o.onChange?.(); }
  }

  function planPayload() {
    const a = structuredClone(o.getAnswers());
    if (!sameStyle()) {
      for (const k of STYLE_KEYS) { if (model.plan[k] === undefined) delete a[k]; else a[k] = model.plan[k]; }
    }
    a.style_preset = model.style;
    return a;
  }
  /** Persist copy, media and plan edits. True only after the API returns OK. */
  async function save() {
    if(menuDraftError){say(menuDraftError);return false;}
    if (readOnly || !active()) return true;
    if (busy) return false;
    if (!dirty() && !error) return true;
    for (const k of Object.keys(model.copy)) if (!String(model.copy[k] ?? "").trim()) { model.copy[k] = designNeutralCopy(model.style, o.getBrand?.() || "Your brand")?.[k] ?? model.copy[k]; delete model.formatting[k]; }
    busy = "save"; error = ""; paint(); say("Saving your draft design");
    const sent = snapshot(), sentPlan = planPayload(), live = { copy: { ...model.copy }, formatting: { ...model.formatting }, media: structuredClone(model.media) };
    // Null resets an individual section field to its base content. This also
    // lets Undo remove a new override that was saved during this session.
    for(const key of Object.keys(design?.copy||{}))
      if(key.startsWith("section.")&&!Object.hasOwn(live.copy,key))live.copy[key]=null;
    for(const key of Object.keys(design?.formatting||{}))
      if(!Object.hasOwn(live.formatting,key))live.formatting[key]=null;
    for(const key of Object.keys(design?.media||{}))
      if(key.startsWith("section.")&&!Object.hasOwn(live.media,key))live.media[key]=null;
    try {
      const { res, body } = await call("PATCH", { expected_draft: expected, confirm: true, copy: live.copy, formatting: { ...live.formatting }, media: mediaIds(live.media),sections:model.sections,menus:structuredClone(model.menus),catalogue_mode:model.catalogue_mode, answers: sentPlan });
      if (res.status === 409) { conflict = true; throw new Error("Another window changed this draft. Your edits are kept here and nothing was overwritten."); }
      if (!res.ok) throw new Error(body.error || "Your design could not be saved. Your edits are kept.");
      const changed = snapshot() !== sent;
      const latestCopy = { ...model.copy }, latestFormatting = structuredClone(model.formatting), latestMedia = structuredClone(model.media), latestSections=structuredClone(model.sections),latestCatalogue=model.catalogue_mode,latestMenus=structuredClone(model.menus);
      const newerPlan = JSON.stringify(planPayload()) !== JSON.stringify(sentPlan);
      ingest(body, { hydrate: false,preserveMenuDraft:true });
      if (changed) { model.copy = latestCopy; model.formatting = latestFormatting; model.media = latestMedia;model.sections=latestSections;model.catalogue_mode=latestCatalogue;model.menus=latestMenus; }
      planDirty = newerPlan;
      say(changed || newerPlan ? "Draft saved. Your newer edits still need saving." : "Draft saved. Your live site is unchanged.");
      return true;
    } catch (e) { error = e.message || "Your design could not be saved. Your edits are kept."; say(error); return false; }
    finally { busy = "";historyState=captureHistory();historyGroup=""; paint(); o.onChange?.(); }
  }
  async function publish() {
    if (readOnly || busy || conflict) return;
    if (dirty() || error) { const ok = await save(); if (!ok) return; }
    if (dirty()) {
      error = "Your newer edits are still unsaved. Save them before opening publication review.";
      paint(); say(error); return;
    }
    location.assign(publishUrl);
  }
  async function reload() {
    if (dirty() && !confirm("Discard your unsaved design edits and load the latest saved draft?")) return;
    conflict = false; error = ""; selected = null;
    const had = active();
    try {
      const { res, body } = await call("GET");
      if (!res.ok) throw new Error(body.error || "The latest draft could not be loaded.");
      ingest(body, { hydrate: true });
      say("Latest draft loaded.");
    } catch (e) { error = e.message; }
    if (!had && active()) o.onActivated?.({ restored: true });
    paint(); o.onChange?.();
  }

  /* ---------- editing ---------- */
  function select(kind, key) {
    historyGroup="";
    const wasEditing=editMode;editMode=true;
    selected = { kind, key }; uploadNote = ""; paint(true); markSelected();
    const panel=o.contextual?el.querySelector(".ann-ctx"):el.querySelector(".ann-design-edit");
    if(o.contextual)anchorNode()?.scrollIntoView?.({block:"nearest"});else panel?.scrollIntoView({block:"nearest",behavior:"smooth"});
    if(o.contextual)placePop();
    (panel?.querySelector("[data-rich-host] [contenteditable]")||panel?.querySelector("[data-design-input]")||panel?.querySelector("button"))?.focus({preventScroll:true});
    if(!wasEditing)o.onChange?.();
  }
  function setCopy(key, value) {
    if (readOnly || !model) return;
    model.copy[key] = [...value].slice(0, getDesignCopyLimit(key)).join("");
    delete model.formatting[key];
    remember(`copy:${key}`);
    error = conflict ? error : ""; paintDynamic(); o.onChange?.();
  }
  const restrictedTag = new Map();
  const RESTRICT = "h1,h2,h3,h4,h5,h6,a,button,summary";
  function restricted(key) {
    const a = anchorNode();
    if (a && selected?.key === key && a.closest) restrictedTag.set(key, Boolean(a.closest(RESTRICT)));
    return restrictedTag.get(key) || false;
  }
  function baseFlags() {
    const a = anchorNode(), w = a?.ownerDocument?.defaultView; if (!a || !w) return {};
    const cs = w.getComputedStyle(a), dec = cs.textDecorationLine || cs.textDecoration || "";
    return { b: Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold", i: cs.fontStyle === "italic", u: dec.includes("underline"), s: dec.includes("line-through") };
  }
  function setRich(key, out) {
    if (readOnly || !model || !isDesignCopyKey(key)) return;
    model.copy[key] = [...String(out.text ?? "")].slice(0, getDesignCopyLimit(key)).join("");
    if (out.document) model.formatting[key] = structuredClone(out.document); else delete model.formatting[key];
    remember(`copy:${key}`);
    error = conflict ? error : ""; paintDynamic(); o.onChange?.();
  }
  function setMedia(key, item) {
    if (readOnly || !model) return;
    if(/\.image\d+$/.test(key))delete model.media[key.replace(/\.image(\d+)$/,".video$1")];
    if (item) model.media[key] = { url: item.url, alt: item.alt_text ?? item.alt ?? "", width: Number(item.width) || 1024, height: Number(item.height) || 1024, media_id: item.id };
    else { const prev = design?.media?.[key]; if (prev && !prev.media_id) model.media[key] = structuredClone(prev); else delete model.media[key]; }
    remember();
    paint(true); o.onChange?.();
  }
  async function upload(file) {
    if (readOnly || busy || !file || !selected) return;
    const target={...selected},isVideo = target.kind === "video";
    if (isVideo ? !/^video\/(mp4|webm)$/.test(file.type) || file.size > MAX_VIDEO : !/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > MAX_UPLOAD) { uploadNote = isVideo ? "Choose an MP4 or WebM video under 10 MB." : "Choose a PNG, JPEG or WebP image under 8 MB."; return paint(true); }
    busy = "upload"; uploadNote = "Uploading"; paint(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("type", isVideo ? "video" : "image"); fd.append("alt", uploadAlt.trim());
      const res = await fetch(`${api}/media`, { method: "POST", credentials: "same-origin", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.media?.id) throw new Error(out.error || "The file could not be uploaded. Your edits are kept.");
      const md = out.media;
      const item = { id: md.id, alt_text: md.alt ?? "", url: md.url, width: md.width, height: md.height, object_key: "", ...(isVideo ? { kind: "video" } : {}) };
      if (isVideo) videos = [item, ...videos.filter(i => i.id !== md.id)]; else images = [item, ...images.filter(i => i.id !== md.id)];
      uploadAlt = ""; uploadNote = "Uploaded and selected.";
      setMedia(target.key, item);
    } catch (e) { uploadNote = e.message; }
    finally { busy = ""; paint(true); }
  }

  /* ---------- preview binding (parent only; the iframe has no scripts) ---------- */
  let boundDoc = null;
  const boundDocs = new WeakSet();
  const nodes = () => boundDoc ? [...boundDoc.querySelectorAll("[data-design-copy],[data-design-image],[data-design-video]")] : [];
  function markSelected() {
    for (const n of nodes()) {
      const hit = selected && (selected.kind === "copy" ? n.dataset.designCopy === selected.key : selected.kind === "video" ? (n.dataset.designVideo === selected.key || n.dataset.designVideoSlot === selected.key) : n.dataset.designImage === selected.key);
      if (hit) n.setAttribute("data-design-selected", ""); else n.removeAttribute("data-design-selected");
    }
    if (o.contextual && boundDoc) for (const n of boundDoc.querySelectorAll("[data-design-section]")) {
      if (selected?.kind === "section" && n.dataset.designSection === selected.key) n.setAttribute("data-design-section-selected", ""); else n.removeAttribute("data-design-section-selected");
    }
  }
  const secNode = id => boundDoc?.querySelector(`[data-design-section="${CSS.escape(id)}"]`) || null;
  function anchorNode() {
    if (!selected || !boundDoc) return null;
    if (selected.kind === "section") return secNode(selected.key);
    const q = CSS.escape(selected.key);
    if (selected.kind === "video") return boundDoc.querySelector(`[data-design-video="${q}"]`) || boundDoc.querySelector(`[data-design-video-slot="${q}"]`);
    return boundDoc.querySelector(selected.kind === "copy" ? `[data-design-copy="${q}"]` : `[data-design-image="${q}"],[data-design-image-slot="${q}"]`);
  }
  const sectionOfSelected = () => selected?.kind === "section" ? selected.key : anchorNode()?.closest?.("[data-design-section]")?.dataset.designSection || null;
  function placePop() {
    const pop = el.querySelector(".ann-ctx"); if (!pop) return;
    const f = o.getPreview?.(), a = anchorNode(), vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 700 || !a || !f) { pop.classList.add("sheet"); pop.style.cssText = ""; return; }
    pop.classList.remove("sheet");
    const fr = f.getBoundingClientRect(), sc = fr.width / (f.offsetWidth || fr.width) || 1, r = a.getBoundingClientRect();
    const w = Math.min(340, vw - 16); pop.style.width = `${w}px`;
    const h = pop.offsetHeight, top = fr.top + r.top * sc, bottom = fr.top + r.bottom * sc;
    let y = bottom + 8; if (y + h > vh - 8) y = top - h - 8;
    y = Math.max(8, Math.min(y, vh - h - 8));
    pop.style.left = `${Math.max(8, Math.min(fr.left + r.left * sc, vw - w - 8))}px`; pop.style.top = `${y}px`;
  }
  function closeCtx() {
    const a = anchorNode(); selected = null; paint(true); markSelected();
    if (o.contextual) a?.focus?.({ preventScroll: true });
  }
  if(o.contextual){
    globalThis.window?.addEventListener("resize", () => placePop());
    globalThis.window?.addEventListener("scroll", () => placePop(), true);
  }
  function pick(n) {
    if (n.dataset.designCopy) select("copy", n.dataset.designCopy);
    else if (n.dataset.designVideo) select("video", n.dataset.designVideo);
    else if (n.dataset.designImage) select("image", n.dataset.designImage);
  }
  function bindPreview(doc) {
    boundDoc = doc;
    if (!editing()) return;
    for (const n of nodes()) { n.tabIndex = 0; n.setAttribute("aria-label", `Edit: ${n.dataset.designCopy ? labelOf("copy", n.dataset.designCopy) : n.dataset.designVideo ? labelOf("video", n.dataset.designVideo) : n.dataset.designImage ? labelOf("image", n.dataset.designImage) : "content"}`); }
    if (o.contextual) {
      for (const n of boundDoc.querySelectorAll("[data-design-section]")) { n.tabIndex = 0; n.setAttribute("aria-label", `Edit section: ${o.sectionState?.(n.dataset.designSection)?.label || humanize(n.dataset.designSection)}`); }
      if (!doc.getElementById("ann-ctx-style") && doc.head) { const st = doc.createElement("style"); st.id = "ann-ctx-style"; st.textContent = "[data-design-section-selected]{outline:2px solid #1a5fd0;outline-offset:-2px}[data-design-selected]{outline:2px solid #1a5fd0;outline-offset:2px}[data-design-section]:hover{outline:1px dashed #1a5fd0;outline-offset:-1px}"; doc.head.appendChild(st); }
    }
    if (boundDocs.has(doc)) { markSelected(); return; }
    boundDocs.add(doc);
    doc.addEventListener("click", e => {
      if (!editing()) return;
      const n = e.target.closest?.("[data-design-copy],[data-design-image],[data-design-video]");
      const sec = !n && o.contextual ? e.target.closest?.("[data-design-section]") : null;
      if (!n && !sec) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (n) pick(n); else select("section", sec.dataset.designSection);
    }, true);
    doc.addEventListener("keydown", e => {
      if (e.key === "Escape" && selected && o.contextual && editing()) { e.preventDefault(); closeCtx(); return; }
      if (e.key !== "Enter" && e.key !== " ") return;
      if (o.contextual && editing() && e.target.matches?.("[data-design-section]")) { e.preventDefault(); select("section", e.target.dataset.designSection); return; }
      const n = e.target.closest?.("[data-design-copy],[data-design-image],[data-design-video]");
      if (!n || !editing()) return;
      e.preventDefault(); pick(n);
    }, true);
    markSelected();
  }

  /* ---------- toolbar ---------- */
  function body() {
    if (!loaded && !loadError) return "";
    if (loadError) return `<div class="ann-design-card"><p class="ann-callout" role="alert">${esc(loadError)}</p><button type="button" class="ann-btn alt sm" data-design-act="retry">Try again</button></div>`;
    const browsing = mode() === "showcase" || !sameStyle();
    const a = o.getAnswers();
    const catalogueChoice = cataloguePrompt ? `<div class="ann-design-card" role="group" aria-label="Choose products for your preview">
      <p class="ann-design-title">Ready to see your own products?</p>
      <p class="ann-note">Samples help you explore the look first. Your own products use the names, photos and prices already in your catalogue. Switching this preview does not change them or publish anything.</p>
      <label class="ann-check"><input type="checkbox" data-design-catalogue-ack ${catalogueAck ? "checked" : ""}> Use my own products in this design preview.</label>
      <div class="ann-actions"><button type="button" class="ann-btn" data-design-act="catalogue" ${!catalogueAck ? "disabled" : ""}>Preview my products</button><button type="button" class="ann-btn alt" data-design-act="samples">Keep exploring with samples</button></div></div>` : "";
    const use = active() && sameStyle() ? `<div class="ann-design-card">
      <p class="ann-design-title">Your saved ${esc(styleName(model.style))} design</p>
      <p class="ann-note">Explore with sample products here. Your saved words, photos and real products are safe. Ready to personalise it?</p>
      <div class="ann-actions"><button type="button" class="ann-btn alt" data-design-act="mine">Edit my saved design</button></div></div>` : browsing || !active() ? `<div class="ann-design-card">
      <p class="ann-design-title">${active() ? `Switch to the ${esc(styleName(browsingStyle()))} design` : `Use the ${esc(styleName(browsingStyle()))} design`}</p>
      <p class="ann-note">${active() ? "This builds the selected style as your draft design and keeps the words and photos only if you choose them again." : "Start your store with this exact look. You can then change its words and photos right on the page."}</p>
      ${o.themeEditor ? '<p class="ann-note">Confirm below, then choose Use this design to unlock editing.</p><div class="ann-consent" role="group" aria-label="Confirm your draft design">' : `<details class="ann-consent" data-design-consent ${consentOpen || ack || catalogueAck ? "open" : ""}><summary>Confirm before you continue${ack ? " (replacement confirmed)" : ""}</summary>`}
      <label class="ann-check"><input type="checkbox" data-design-ack ${ack ? "checked" : ""} ${readOnly ? "disabled" : ""}> I understand this replaces my existing draft design. My live site is not changed.</label>
      <label class="ann-check"><input type="checkbox" data-design-catalogue-ack ${catalogueAck ? "checked" : ""} ${readOnly ? "disabled" : ""}> Use my own catalogue products in the saved design. Sample products are for preview only.</label>${o.themeEditor ? "</div>" : "</details>"}
      <div class="ann-actions"><button type="button" class="ann-btn" data-design-act="use" ${readOnly || !ack || busy ? "disabled" : ""}>${busy === "use" ? "Creating" : "Use this design"}</button>
      ${active() && !sameStyle() ? `<button type="button" class="ann-btn alt" data-design-act="back">Back to my design</button>` : ""}
      ${active() && sameStyle() ? `<button type="button" class="ann-btn alt" data-design-act="mine">View my design</button>` : ""}</div>
      ${readOnly ? `<p class="ann-note">${memberReadOnly?"Only an owner or admin can create a design.":"Complete your business verification in Ann before creating a design."}</p>` : ""}</div>` : "";
    const err = error ? `<div class="ann-callout" role="alert"><p>${esc(error)}</p>${conflict ? `<button type="button" class="ann-btn alt sm" data-design-act="reload">Reload the latest draft</button>` : ""}</div>` : "";
    if (cataloguePrompt) return catalogueChoice + err;
    if (browsing || !active()) return catalogueChoice + use + err;
    const toggle = o.toggleMount ? "" : `<div class="ann-actions ann-design-bar"><button type="button" class="ann-btn alt sm" data-design-act="toggle" aria-pressed="${editMode}" ${readOnly ? "disabled" : ""}>${editMode?"Editing on":"Editing off"}</button></div>`;
    const tools = `
      ${o.themeEditor ? `<p class="ann-note" data-design-state></p>` : ""}${toggle}
      ${readOnly ? `<p class="ann-note">${memberReadOnly?"You can look around. Only an owner or admin can edit this design.":"Your saved design is unchanged. Complete business verification in Ann to resume editing."}</p>` : editMode && selected ? (o.contextual ? ctxPanel() : panel()) : ""}
      ${model.catalogue_mode==="sample"?`<p class="ann-note">${o.themeEditor?"Sample products shown. Choose your own before publishing.":"Sample products and illustrative prices. Choose your own products before publishing."} <a href="${root}/products">Edit products</a></p>`:""}`;
    return catalogueChoice + designToolsMarkup(tools) + err;
  }
  function ctxPanel() {
    const s = selected, sid = sectionOfSelected(), st = sid ? o.sectionState?.(sid) : null;
    const secName = st?.label || (sid ? humanize(sid) : "");
    const title = s.kind === "section" ? secName || "Section" : labelOf(s.kind, s.key);
    let inner;
    if (s.kind === "section") {
      const seen = new Set(), kids = [];
      for (const n of secNode(s.key)?.querySelectorAll("[data-design-copy],[data-design-image],[data-design-video]") || []) {
        const kind = n.dataset.designCopy ? "copy" : n.dataset.designVideo ? "video" : "image", key = n.dataset.designCopy || n.dataset.designVideo || n.dataset.designImage, id = `${kind}:${key}`;
        if (!seen.has(id)) { seen.add(id); kids.push({ kind, key, id }); }
      }
      const dis = readOnly || !st || st.required ? "disabled" : "";
      inner = `<p class="ann-note">Choose what to edit in this section.</p>${kids.length ? `<div class="ann-ctx-list">${kids.map(k => `<button type="button" class="ann-btn alt sm" data-design-child="${esc(k.id)}">${esc(labelOf(k.kind, k.key))}</button>`).join("")}</div>` : `<p class="ann-note">This section has no editable text or photos. You can still move or remove it.</p>`}
        <div class="ann-ctx-list" role="group" aria-label="Section controls"><button type="button" class="ann-btn alt sm" data-design-act="sec-up" ${dis || st.index <= 0 ? "disabled" : ""}>Move up</button><button type="button" class="ann-btn alt sm" data-design-act="sec-down" ${dis || st.index >= st.count - 1 ? "disabled" : ""}>Move down</button><button type="button" class="ann-btn alt sm" data-design-act="sec-toggle" ${dis}>${st?.hidden ? "Restore section" : "Remove section"}</button></div>${st?.required ? `<p class="ann-note">This protected section cannot be moved or removed.</p>` : ""}`;
    } else inner = panel() + (sid ? `<button type="button" class="ann-btn alt sm" data-design-act="select-section" data-design-section-id="${esc(sid)}">Back to ${esc(secName || "section")}</button>` : "");
    return `<div class="ann-ctx" role="dialog" aria-labelledby="ann-ctx-title"><style>${CTX_CSS}</style><div class="ann-ctx-head"><strong id="ann-ctx-title">${esc(title)}</strong><button type="button" class="ann-btn alt sm" data-design-act="done" aria-label="Close editor">Close</button></div>${inner}</div>`;
  }
  function panel() {
    if (selected.kind === "copy") {
      const k = selected.key, lim = getDesignCopyLimit(k), v = k in model.copy ? String(model.copy[k] ?? "") : (anchorNode()?.textContent || "").trim().slice(0, lim), long = lim > 300 && !restricted(k);
      const fmt = k in model.copy ? model.formatting[k] || null : null;
      return `<div class="ann-design-edit"><div class="ann-field" data-design-input="${esc(k)}" data-rich="1">${richEditorMarkup({ text: v, document: fmt, limit: lim, label: labelOf("copy", k), allowBlocks: long })}</div>
        <div class="ann-actions"><span class="ann-note" data-design-count>${v.length} of ${lim}</span><button type="button" class="ann-btn alt sm" data-design-act="reset-copy">Use suggested text</button><button type="button" class="ann-btn alt sm" data-design-act="done">Done</button></div></div>`;
    }
    const k = selected.key, cur = model.media[k];
    if (selected.kind === "video") {
      const back = o.contextual && boundDoc?.querySelector(`[data-design-image="${CSS.escape(imageKeyOf(k))}"]`) ? imageKeyOf(k) : "";
      return `<div class="ann-design-edit"><p class="ann-design-title">${esc(labelOf("video", k))}</p>
      ${videos.length ? `<div class="ann-design-grid" role="listbox" aria-label="Your uploaded videos">${videos.map(m => `<figure class="ann-design-vid" style="margin:0"><video controls preload="metadata" src="${esc(m.url)}" aria-label="${esc(m.alt_text || "Video")}" style="width:100%;max-height:120px"></video><button type="button" class="ann-btn alt sm" role="option" aria-selected="${cur?.media_id === m.id}" data-design-pick="${esc(m.id)}">${cur?.media_id === m.id ? "In use" : "Use this video"}</button></figure>`).join("")}</div>` : `<p class="ann-note">You have no uploaded videos yet. Upload one below.</p>`}
      <label class="ann-field">Upload a new video<input type="file" accept="video/mp4,video/webm" data-design-file ${busy ? "disabled" : ""}></label>
      <p class="ann-note">MP4 or WebM, up to 10 MB.</p>
      ${uploadNote ? `<p class="ann-note" role="status">${esc(uploadNote)}</p>` : ""}
      <div class="ann-actions"><button type="button" class="ann-btn alt sm" data-design-act="reset-video">${back ? "Use original photo" : "Remove video"}</button>${back ? `<button type="button" class="ann-btn alt sm" data-design-act="goto-image" data-design-key="${esc(back)}">Photo options</button>` : ""}<button type="button" class="ann-btn alt sm" data-design-act="done">Done</button></div></div>`;
    }
    const slot = o.contextual ? anchorNode()?.dataset.designVideoSlot : "";
    return `<div class="ann-design-edit"><p class="ann-design-title">${esc(labelOf("image", k))}</p>${slot && isDesignMediaKey(slot) ? `<button type="button" class="ann-btn alt sm" data-design-act="use-video" data-design-key="${esc(slot)}">Use a video in this slot</button>` : ""}
      ${images.length ? `<div class="ann-design-grid" role="listbox" aria-label="Your uploaded photos">${images.map(m => `<button type="button" class="ann-design-thumb" role="option" aria-selected="${cur?.media_id === m.id}" data-design-pick="${esc(m.id)}" title="${esc(m.alt_text || "Photo")}"><img src="${esc(m.url)}" alt="${esc(m.alt_text || "")}" loading="lazy"></button>`).join("")}</div>` : `<p class="ann-note">You have no uploaded photos yet. Upload one below.</p>`}
      <label class="ann-field">Description for a new upload<input type="text" maxlength="200" value="${esc(uploadAlt)}" data-design-alt placeholder="What the new photo shows"></label>
      <p class="ann-note">This description is saved with a new upload. Choosing an existing photo keeps its existing description.</p>
      <label class="ann-field">Upload a new photo<input type="file" accept="image/png,image/jpeg,image/webp" data-design-file ${busy ? "disabled" : ""}></label>
      ${uploadNote ? `<p class="ann-note" role="status">${esc(uploadNote)}</p>` : ""}
      <div class="ann-actions"><button type="button" class="ann-btn alt sm" data-design-act="reset-image">Use original photo</button><button type="button" class="ann-btn alt sm" data-design-act="done">Done</button></div></div>`;
  }
  const struct = () => JSON.stringify([loaded, loadError, mode(), active(), model?.style, browsingStyle(), editMode, selected, busy, error, conflict, ack, readOnly, images.length, uploadNote, model && (selected?.kind === "image" || selected?.kind === "video") ? model.media[selected.key]?.media_id : "", design?.style, selected && o.contextual ? JSON.stringify(o.sectionState?.(sectionOfSelected() || "") || null) : ""]);
  function paint(force) {
    const key = struct();
    if (!force && key === lastKey) return paintDynamic();
    lastKey = key;
    const focus = document.activeElement?.closest?.("#ann-design") ? document.activeElement.getAttribute("data-design-input") : null;
    const pos = focus ? document.activeElement.selectionStart : 0;
    const fa = !focus && document.activeElement?.closest?.("#ann-design") ? document.activeElement.getAttribute("data-design-act") : null;
    richEditor?.destroy(); richEditor = null;
    el.innerHTML = body();
    el.hidden = !el.innerHTML.trim();
    mountRich();
    if (fa) el.querySelector(`[data-design-act="${fa}"]`)?.focus({ preventScroll: true });
    if (focus) { const f = el.querySelector(`[data-design-input="${focus}"]`); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch {} } }
    paintDynamic(); placePop();
  }
  function mountRich() {
    const host = el.querySelector("[data-rich-host]"); if (!host || !selected || selected.kind !== "copy") return;
    const key = selected.key; let doc = null;
    try { doc = host.dataset.richDoc ? JSON.parse(host.dataset.richDoc) : null; } catch { doc = null; }
    richEditor = mountRichEditor(host, { text: host.dataset.richText || "", document: doc, limit: Number(host.dataset.richLimit) || 2000, label: host.dataset.richLabel || "Text", allowBlocks: Boolean(host.dataset.richBlocks), baseFlags, onChange: out => setRich(key, out) });
  }
  let toggleMarkup = null;
  function paintToggle() {
    const tm = o.toggleMount; if (!tm) return;
    const show = loaded && active() && sameStyle() && mode() === "store" && !cataloguePrompt;
    const html = show ? `<button type="button" class="ann-btn alt sm" data-design-act="toggle" aria-pressed="${editMode}" ${readOnly ? "disabled" : ""}>${editMode ? "Editing on" : "Editing off"}</button>` : "";
    if (html !== toggleMarkup) { toggleMarkup = html; tm.innerHTML = html; }
    tm.hidden = !show;
  }
  function paintTop() {
    paintToggle();
    if (!top) return;
    const show = loaded && active() && sameStyle() && mode() === "store" && !cataloguePrompt;
    if (!top.firstChild) top.innerHTML = `<span class="ann-save-state" data-design-state role="status"></span><button type="button" class="ann-btn alt sm" data-design-act="save" data-design-save>Save draft</button><button type="button" class="ann-btn sm" data-design-act="publish" data-design-publish>Publish store</button>`;
    top.hidden = !show;
  }
  function paintDynamic() {
    paintTop();
    const root_ = top || el, save = root_.querySelector("[data-design-save]"), st = root_.querySelector("[data-design-state]") || el.querySelector("[data-design-state]"), pub = root_.querySelector("[data-design-publish]");
    const d = dirty();
    if (save) { save.disabled = readOnly || Boolean(busy) || Boolean(menuDraftError) || (!d && !error) || (conflict); save.textContent = busy === "save" ? "Saving" : error && !conflict ? "Retry save" : "Save draft"; }
    if (pub) pub.disabled = readOnly || Boolean(busy) || conflict || Boolean(menuDraftError);
    if (st) { st.textContent = busy === "save" ? "Saving" : error && !conflict ? "Not saved" : conflict ? "Draft conflict" : d ? "Unsaved" : "Saved"; st.dataset.state = busy === "save" ? "saving" : d || error ? "unsaved" : "saved"; }
    const input = el.querySelector("[data-design-input]");
    const c = el.querySelector("[data-design-count]");
    if (input && c) c.textContent = `${(input.value ?? String(model.copy[input.dataset.designInput] ?? "")).length} of ${getDesignCopyLimit(input.dataset.designInput)}`;
  }

  const onClick = e => {
    const t = e.target.closest("[data-design-act],[data-design-pick],[data-design-child]"); if (!t) return;
    if (t.dataset.designChild) { const [kind, ...rest] = t.dataset.designChild.split(":"); select(kind, rest.join(":")); return; }
    if (t.dataset.designPick) { const m = (selected?.kind === "video" ? videos : images).find(i => i.id === t.dataset.designPick); if (m && selected) setMedia(selected.key, m); return; }
    const act = t.dataset.designAct;
    if (act === "catalogue") { if (!catalogueAck) return; cataloguePrompt = false;if(active())model.catalogue_mode="own";o.onCatalogueConfirmed?.();remember();paint(true);o.onChange?.();return; }
    if (act === "samples") { cataloguePrompt = false; catalogueAck = false; paint(true); return; }
    if (act === "retry") return void load();
    if (act === "use") return void use();
    if (act === "save") return void save();
    if (act === "publish") return void publish();
    if (act === "reload") return void reload();
    if (act === "toggle") { editMode = !editMode; selected = null; paint(true); o.onChange?.(); return; }
    if (act === "theme") { editMode = true; selected = null; paint(true); o.openCanvas?.(); el.scrollIntoView({ block: "nearest" }); return; }
    if (act === "done") { closeCtx(); return; }
    if (act === "select-section") { select("section", t.dataset.designSectionId); return; }
    if (act === "sec-up" || act === "sec-down" || act === "sec-toggle") { if (selected) o.onSectionAction?.(sectionOfSelected(), act.slice(4)); return; }
    if (act === "mine" || act === "back") { o.backToDesign?.(model.plan); paint(true); o.onChange?.(); return; }
    if (act === "reset-copy" && selected) {
      const seed = designNeutralCopy(model.style, o.getBrand?.() || "Your brand");
      if(selected.key.startsWith("section."))delete model.copy[selected.key];
      else model.copy[selected.key] = seed?.[selected.key] ?? "";
      delete model.formatting[selected.key];
      remember();
      paint(true); o.onChange?.(); return;
    }
    if ((act === "use-video" || act === "goto-image") && t.dataset.designKey) { select(act === "use-video" ? "video" : "image", t.dataset.designKey); return; }
    if ((act === "reset-image" || act === "reset-video") && selected) setMedia(selected.key, null);
  };
  el.addEventListener("click", onClick);
  top?.addEventListener("click", onClick);
  o.toggleMount?.addEventListener("click", onClick);
  el.addEventListener("keydown",e=>{
    if(o.contextual&&selected&&e.key==="Escape"){e.preventDefault();e.stopPropagation();closeCtx();}
  });
  el.addEventListener("toggle", e => { if (e.target.matches?.("[data-design-consent]")) consentOpen = e.target.open; }, true);
  el.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset?.designInput && typeof t.value === "string" && !t.dataset.rich) setCopy(t.dataset.designInput, t.value);
    else if (t.dataset?.designAlt !== undefined) uploadAlt = t.value;
  });
  el.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset?.designAck !== undefined) { ack = t.checked; paint(true); }
    else if (t.dataset?.designCatalogueAck !== undefined) { catalogueAck = t.checked; paint(true); }
    else if (t.dataset?.designFile !== undefined) { const f = t.files?.[0]; t.value = ""; if (f) upload(f); }
  });

  paint(true);
  load();

  return {
    setBusinessAccess(allowed){readOnly=memberReadOnly||!allowed;if(readOnly){editMode=false;selected=null;}paint(true);},
    active, editing, hasUnsavedChanges: () => dirty() || busy === "save" || busy === "use",
    canSave:()=>!readOnly&&active()&&!busy&&!conflict&&!menuDraftError&&(dirty()||Boolean(error)),
    canPublish:()=>!readOnly&&active()&&!busy&&!conflict&&!menuDraftError,
    canUndo,undo,
    isSavedStyle: style => active() && model.style === style,
    resumeEditing() {
      if (!active()) return false;
      const plan = sameStyle() ? planPayload() : model.plan;
      editMode = true; selected = null;
      o.backToDesign?.(structuredClone(plan)); paint(true);
      return true;
    },
    requestCatalogue() { cataloguePrompt = true; catalogueAck = false; paint(true); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
    save, publish, bindPreview, refresh: () => {paint();placePop();}, reload,
    /** Called by Ann when the plan answers change while a design is active. */
    planChanged() { if (active()) { planDirty = true;remember(); paintDynamic(); } },
    receive(result) { ingest(result || {}, { hydrate: true }); paint(true); },
    async refreshCatalogue(){
      const {res,body}=await call("GET");
      if(!res.ok)throw new Error(body.error||"The current catalogue could not be loaded.");
      // Rebase only against the identical saved design. Do not hydrate, change
      // local copy/sections, reset Undo or accept another window's design edits.
      const stable=value=>JSON.stringify(value??null,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
      if(stable(body.design)!==stable(design)){
        conflict=true;error="The catalogue was saved, but another window changed the design. Your unsaved edits are kept. Reload the saved design before saving again.";
      }else expected=body.expected_draft||expected;
      if(Array.isArray(body.images))images=body.images;
      if(Array.isArray(body.videos))videos=body.videos;
      if(body.draft){menuSource=body.draft;o.onDraft?.(body.draft);}
      paint();o.onChange?.();
      return body.draft;
    },
    /** The design to preview, or null when the page should show the showcase instead. */
    previewDesign() {
      if (!active() || !sameStyle()) return null;
      return { version: 1, style: model.style, media_pack: model.media_pack,catalogue_mode:model.catalogue_mode,sections:structuredClone(model.sections),...(model.menus===null?{}:{menus:structuredClone(model.menus)}), plan: planPayload(), copy: { ...model.copy }, formatting: { ...model.formatting }, media: { ...model.media } };
    },
    canEditSections:()=>canEditSections(),
    setSections(value){
      if(!canEditSections()||!validDesignSections(value))return false;
      model.sections=structuredClone(value);planDirty=true;remember();paintDynamic();o.onChange?.();return true;
    },
    addSection(page,family,binding,afterId,order){
      requireSectionEdit();
      const instance=createSectionInstance(family,binding);
      const next=insertSectionInstance(model.sections,page,instance,order,afterId);
      commitSectionModel({...model,sections:next});
      return instance.id;
    },
    duplicateSection(page,id,order){
      requireSectionEdit();
      const source=model.sections?.[page]?.instances?.find(i=>i.id===id);
      if(!source)throw new Error("Choose an added section to duplicate.");
      const instance=createSectionInstance(source.family,source.binding);
      const next=copyInstanceFields(model,page,id,instance.id);
      next.sections=insertSectionInstance(model.sections,page,instance,order,id);
      commitSectionModel(next);
      return instance.id;
    },
    removeSection(page,id){
      requireSectionEdit();
      const sections=removeSectionInstance(model.sections,page,id);
      if(!sections)return false;
      const next=clearInstanceFields(model,page,id);next.sections=sections;
      commitSectionModel(next);
      return true;
    },
    getMenus(){return structuredClone(model?.menus??defaultDesignMenus(menuSource));},
    getMenuRevision:()=>menuRevision,
    setMenus(value,{typing=false}={}){if(readOnly||!model||conflict)return;const next=value===null?null:validateDesignMenus(value);menuDraftError="";if(JSON.stringify(next)===JSON.stringify(model.menus)){o.onChange?.();return;}model.menus=next;remember(typing?"copy:menus":"menus");paintDynamic();o.onChange?.();},
    setMenuDraftError(message){if(readOnly||!model)return;const next=String(message||"").slice(0,500);if(next===menuDraftError)return;menuDraftError=next;paintDynamic();o.onChange?.();},
    selectContent(kind,key){if(readOnly||!model)return;if(kind==="copy"&&isDesignCopyKey(key)||(kind==="image"||kind==="video")&&isDesignMediaKey(key)||kind==="section"&&o.contextual&&typeof key==="string"&&key)select(kind,key);},
    isActive: active,
  };
}
