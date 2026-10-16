/**
 * Ann design canvas: "Use this design", direct edit, save draft, review and publish.
 * Parent-side only. The sandboxed preview iframe stays script-free: it only carries
 * data-design-copy / data-design-image annotations that this module binds from outside.
 * Edits update a validated model (plain text and owned media ids), never raw HTML.
 */
import { DESIGN_COPY_LIMITS, DESIGN_MEDIA_KEYS } from "./ann-design-model.js";
import { designNeutralCopy } from "./aura-showcase.js";
import { AURA_STYLES } from "./aura-styles.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COPY_LABEL = {
  kicker: "Small line above the headline", title: "Headline", description: "Introduction", button: "Button label", statement: "Statement",
  products: "Products heading", collections: "Collections heading", about: "About heading",
  story0: "Story, paragraph 1", story1: "Story, paragraph 2", story2: "Story, paragraph 3", footer: "Footer line",
};
const IMAGE_LABEL = { hero: "Main photo", lifestyle: "Lifestyle photo", collection0: "First collection photo", collection1: "Second collection photo" };
const STYLE_KEYS = ["style_preset", "color_preset", "font_preset", "accent_color", "button_style"];
const styleName = id => AURA_STYLES.find(s => s.id === id)?.name || id;
const MAX_UPLOAD = 8 * 1024 * 1024;

export function attachAnnDesign(o) {
  const { api, root, readOnly, mount, say } = o;
  const el = document.createElement("section");
  el.id = "ann-design"; el.className = "ann-design"; el.setAttribute("aria-label", "Your design");
  mount.parentNode.insertBefore(el, mount);

  let loaded = false, loadError = "", expected = "", images = [], publishUrl = `${root}/setup?step=4`;
  let design = null, model = null, baseline = "", planDirty = false;
  let busy = "", error = "", conflict = false, ack = false, editMode = true, selected = null, uploadAlt = "", uploadNote = "";
  let lastKey = "";
  let catalogueAck = false, cataloguePrompt = false, consentOpen = false;

  const active = () => Boolean(model);
  const mediaIds = m => Object.fromEntries(DESIGN_MEDIA_KEYS.map(k => [k, m?.[k]?.media_id || null]));
  const snapshot = () => model ? JSON.stringify({ c: model.copy, m: mediaIds(model.media),s:model.sections,catalogue:model.catalogue_mode }) : "";
  const dirty = () => active() && (snapshot() !== baseline || planDirty);
  const mode = () => o.getPreviewMode();
  const browsingStyle = () => o.getStyle?.() || o.getAnswers().style_preset || "editorial";
  const sameStyle = () => active() && browsingStyle() === model.style;
  const editing = () => active() && !readOnly && editMode && (mode() === "store"||model.catalogue_mode==="sample") && sameStyle();

  async function call(method, payload) {
    const res = await fetch(`${api}/design`, { method, credentials: "same-origin", headers: payload ? { "content-type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  }
  function ingest(body, { hydrate }) {
    expected = body.expected_draft || expected;
    if (Array.isArray(body.images)) images = body.images;
    if (body.publish_url) publishUrl = body.publish_url;
    if (body.draft) o.onDraft?.(body.draft);
    const d = body.design;
    if (d && d.version === 1) {
      design = d;
      model = { style: d.style, media_pack: d.media_pack,catalogue_mode:d.catalogue_mode||"own",sections:structuredClone(d.sections||{}), plan: d.plan || {}, copy: { ...d.copy }, media: structuredClone(d.media || {}) };
      baseline = snapshot(); planDirty = false;
      if (hydrate) o.applyPlan?.(d.plan || {});
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
    if (readOnly || !active()) return true;
    if (busy) return false;
    if (!dirty() && !error) return true;
    for (const k of Object.keys(model.copy)) if (!String(model.copy[k] ?? "").trim()) model.copy[k] = designNeutralCopy(model.style, o.getBrand?.() || "Your brand")?.[k] ?? model.copy[k];
    busy = "save"; error = ""; paint(); say("Saving your draft design");
    const sent = snapshot(), sentPlan = planPayload(), live = { copy: { ...model.copy }, media: structuredClone(model.media) };
    try {
      const { res, body } = await call("PATCH", { expected_draft: expected, confirm: true, copy: live.copy, media: mediaIds(live.media),sections:model.sections,catalogue_mode:model.catalogue_mode, answers: sentPlan });
      if (res.status === 409) { conflict = true; throw new Error("Another window changed this draft. Your edits are kept here and nothing was overwritten."); }
      if (!res.ok) throw new Error(body.error || "Your design could not be saved. Your edits are kept.");
      const changed = snapshot() !== sent;
      const latestCopy = { ...model.copy }, latestMedia = structuredClone(model.media), latestSections=structuredClone(model.sections),latestCatalogue=model.catalogue_mode;
      const newerPlan = JSON.stringify(planPayload()) !== JSON.stringify(sentPlan);
      ingest(body, { hydrate: false });
      if (changed) { model.copy = latestCopy; model.media = latestMedia;model.sections=latestSections;model.catalogue_mode=latestCatalogue; }
      planDirty = newerPlan;
      say(changed || newerPlan ? "Draft saved. Your newer edits still need saving." : "Draft saved. Your live site is unchanged.");
      return true;
    } catch (e) { error = e.message || "Your design could not be saved. Your edits are kept."; say(error); return false; }
    finally { busy = ""; paint(); o.onChange?.(); }
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
  function select(kind, key) { selected = { kind, key }; uploadNote = ""; paint(true); markSelected(); }
  function setCopy(key, value) {
    if (readOnly || !model) return;
    model.copy[key] = value.slice(0, DESIGN_COPY_LIMITS[key] || 2000);
    error = conflict ? error : ""; paintDynamic(); o.onChange?.();
  }
  function setMedia(key, item) {
    if (readOnly || !model) return;
    if (item) model.media[key] = { url: item.url, alt: item.alt_text ?? item.alt ?? "", width: Number(item.width) || 1024, height: Number(item.height) || 1024, media_id: item.id };
    else { const prev = design?.media?.[key]; if (prev && !prev.media_id) model.media[key] = structuredClone(prev); else delete model.media[key]; }
    paint(true); o.onChange?.();
  }
  async function upload(file) {
    if (readOnly || busy || !file || !selected) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > MAX_UPLOAD) { uploadNote = "Choose a PNG, JPEG or WebP image under 8 MB."; return paint(true); }
    busy = "upload"; uploadNote = "Uploading"; paint(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("type", "image"); fd.append("alt", uploadAlt.trim());
      const res = await fetch(`${api}/media`, { method: "POST", credentials: "same-origin", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.media?.id) throw new Error(out.error || "The image could not be uploaded. Your edits are kept.");
      const md = out.media;
      images = [{ id: md.id, alt_text: md.alt ?? "", url: md.url, width: md.width, height: md.height, object_key: "" }, ...images.filter(i => i.id !== md.id)];
      uploadAlt = ""; uploadNote = "Uploaded. Select it to use it here.";
      setMedia(selected.key, images[0]);
    } catch (e) { uploadNote = e.message; }
    finally { busy = ""; paint(true); }
  }

  /* ---------- preview binding (parent only; the iframe has no scripts) ---------- */
  let boundDoc = null;
  const boundDocs = new WeakSet();
  const nodes = () => boundDoc ? [...boundDoc.querySelectorAll("[data-design-copy],[data-design-image]")] : [];
  function markSelected() {
    for (const n of nodes()) {
      const hit = selected && (selected.kind === "copy" ? n.dataset.designCopy === selected.key : n.dataset.designImage === selected.key);
      if (hit) n.setAttribute("data-design-selected", ""); else n.removeAttribute("data-design-selected");
    }
  }
  function pick(n) {
    if (n.dataset.designCopy) select("copy", n.dataset.designCopy);
    else if (n.dataset.designImage) select("image", n.dataset.designImage);
  }
  function bindPreview(doc) {
    boundDoc = doc;
    if (!editing()) return;
    for (const n of nodes()) { n.tabIndex = 0; n.setAttribute("aria-label", `Edit: ${COPY_LABEL[n.dataset.designCopy] || IMAGE_LABEL[n.dataset.designImage] || "content"}`); }
    if (boundDocs.has(doc)) { markSelected(); return; }
    boundDocs.add(doc);
    doc.addEventListener("click", e => {
      const n = e.target.closest?.("[data-design-copy],[data-design-image]");
      if (!n || !editing()) return;
      e.preventDefault(); e.stopImmediatePropagation(); pick(n);
    }, true);
    doc.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const n = e.target.closest?.("[data-design-copy],[data-design-image]");
      if (!n || !editing()) return;
      e.preventDefault(); pick(n);
    }, true);
    markSelected();
  }

  /* ---------- toolbar ---------- */
  function body() {
    if (!loaded && !loadError) return `<div class="ann-design-card" aria-busy="true"><div class="ann-skel" aria-hidden="true"><i></i><i></i></div></div>`;
    if (loadError) return `<div class="ann-design-card"><p class="ann-callout" role="alert">${esc(loadError)}</p><button type="button" class="ann-btn alt sm" data-design-act="retry">Try again</button></div>`;
    const browsing = (mode() === "showcase"&&model?.catalogue_mode!=="sample") || !sameStyle();
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
      <details class="ann-consent" data-design-consent ${consentOpen || ack || catalogueAck ? "open" : ""}><summary>Confirm before you continue${ack ? " (replacement confirmed)" : ""}</summary>
      <label class="ann-check"><input type="checkbox" data-design-ack ${ack ? "checked" : ""} ${readOnly ? "disabled" : ""}> I understand this replaces my existing draft design. My live site is not changed.</label>
      <label class="ann-check"><input type="checkbox" data-design-catalogue-ack ${catalogueAck ? "checked" : ""} ${readOnly ? "disabled" : ""}> Use my own catalogue products in the saved design. Sample products are for preview only.</label></details>
      <div class="ann-actions"><button type="button" class="ann-btn" data-design-act="use" ${readOnly || !ack || busy ? "disabled" : ""}>${busy === "use" ? "Creating" : "Use this design"}</button>
      ${active() && !sameStyle() ? `<button type="button" class="ann-btn alt" data-design-act="back">Back to my design</button>` : ""}
      ${active() && sameStyle() ? `<button type="button" class="ann-btn alt" data-design-act="mine">View my design</button>` : ""}</div>
      ${readOnly ? `<p class="ann-note">Only an owner or admin can create a design.</p>` : ""}</div>` : "";
    const err = error ? `<div class="ann-callout" role="alert"><p>${esc(error)}</p>${conflict ? `<button type="button" class="ann-btn alt sm" data-design-act="reload">Reload the latest draft</button>` : ""}</div>` : "";
    if (cataloguePrompt) return catalogueChoice + err;
    if (browsing || !active()) return catalogueChoice + use + err;
    return catalogueChoice + `<div class="ann-design-card">
      <div class="ann-design-head"><div><p class="ann-design-title">Your design: ${esc(styleName(model.style))}</p><p class="ann-note" data-design-state></p></div>
      <div class="ann-actions">
        <button type="button" class="ann-btn alt sm" data-design-act="toggle" aria-pressed="${editMode}" ${readOnly ? "disabled" : ""}>Edit on page</button>
        ${o.themeEditor?"":'<button type="button" class="ann-btn alt sm" data-design-act="theme">Open theme editor</button>'}
        <button type="button" class="ann-btn alt sm" data-design-act="save" data-design-save>Save draft</button>
        <button type="button" class="ann-btn sm" data-design-act="publish" data-design-publish>Review and publish</button></div></div>
      ${readOnly ? `<p class="ann-note">You can look around. Only an owner or admin can edit this design.</p>` : editMode ? (selected ? panel() : `<p class="ann-note">Select any text or photo on the page to change it. Changes show instantly and are saved when you choose Save draft.</p>`) : ""}
      <p class="ann-note">${model.catalogue_mode==="sample"?"This draft preview uses sample products and illustrative prices. Add your real products and explicitly choose them before publishing.":"Product names, prices and photos come from your catalogue."} <a href="${root}/products">Edit products</a></p></div>${err}`;
  }
  function panel() {
    if (selected.kind === "copy") {
      const k = selected.key, lim = DESIGN_COPY_LIMITS[k] || 2000, v = model.copy[k] ?? "", long = lim > 300;
      return `<div class="ann-design-edit"><label class="ann-field">${esc(COPY_LABEL[k] || k)}${long ? `<textarea rows="4" maxlength="${lim}" data-design-input="${esc(k)}">${esc(v)}</textarea>` : `<input type="text" maxlength="${lim}" value="${esc(v)}" data-design-input="${esc(k)}">`}</label>
        <div class="ann-actions"><span class="ann-note" data-design-count>${v.length} of ${lim}</span><button type="button" class="ann-btn alt sm" data-design-act="reset-copy">Use suggested text</button><button type="button" class="ann-btn alt sm" data-design-act="done">Done</button></div></div>`;
    }
    const k = selected.key, cur = model.media[k];
    return `<div class="ann-design-edit"><p class="ann-design-title">${esc(IMAGE_LABEL[k] || "Photo")}</p>
      ${images.length ? `<div class="ann-design-grid" role="listbox" aria-label="Your uploaded photos">${images.map(m => `<button type="button" class="ann-design-thumb" role="option" aria-selected="${cur?.media_id === m.id}" data-design-pick="${esc(m.id)}" title="${esc(m.alt_text || "Photo")}"><img src="${esc(m.url)}" alt="${esc(m.alt_text || "")}" loading="lazy"></button>`).join("")}</div>` : `<p class="ann-note">You have no uploaded photos yet. Upload one below.</p>`}
      <label class="ann-field">Description for a new upload<input type="text" maxlength="200" value="${esc(uploadAlt)}" data-design-alt placeholder="What the new photo shows"></label>
      <p class="ann-note">This description is saved with a new upload. Choosing an existing photo keeps its existing description.</p>
      <label class="ann-field">Upload a new photo<input type="file" accept="image/png,image/jpeg,image/webp" data-design-file ${busy ? "disabled" : ""}></label>
      ${uploadNote ? `<p class="ann-note" role="status">${esc(uploadNote)}</p>` : ""}
      <div class="ann-actions"><button type="button" class="ann-btn alt sm" data-design-act="reset-image">Use original photo</button><button type="button" class="ann-btn alt sm" data-design-act="done">Done</button></div></div>`;
  }
  const struct = () => JSON.stringify([loaded, loadError, mode(), active(), model?.style, browsingStyle(), editMode, selected, busy, error, conflict, ack, readOnly, images.length, uploadNote, model && selected?.kind === "image" ? model.media[selected.key]?.media_id : "", design?.style]);
  function paint(force) {
    const key = struct();
    if (!force && key === lastKey) return paintDynamic();
    lastKey = key;
    const focus = document.activeElement?.closest?.("#ann-design") ? document.activeElement.getAttribute("data-design-input") : null;
    const pos = focus ? document.activeElement.selectionStart : 0;
    el.innerHTML = body();
    if (focus) { const f = el.querySelector(`[data-design-input="${focus}"]`); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch {} } }
    paintDynamic();
  }
  function paintDynamic() {
    const save = el.querySelector("[data-design-save]"), st = el.querySelector("[data-design-state]"), pub = el.querySelector("[data-design-publish]");
    const d = dirty();
    if (save) { save.disabled = readOnly || Boolean(busy) || (!d && !error) || (conflict); save.textContent = busy === "save" ? "Saving" : error && !conflict ? "Retry save" : "Save draft"; }
    if (pub) pub.disabled = readOnly || Boolean(busy) || conflict;
    if (st) st.textContent = busy === "save" ? "Saving your draft design" : d ? "Unsaved changes. The page already shows them." : "Saved to your draft. Your live site is unchanged.";
    const input = el.querySelector("[data-design-input]");
    const c = el.querySelector("[data-design-count]");
    if (input && c) c.textContent = `${input.value.length} of ${DESIGN_COPY_LIMITS[input.dataset.designInput] || 2000}`;
  }

  el.addEventListener("click", e => {
    const t = e.target.closest("[data-design-act],[data-design-pick]"); if (!t) return;
    if (t.dataset.designPick) { const m = images.find(i => i.id === t.dataset.designPick); if (m && selected) setMedia(selected.key, m); return; }
    const act = t.dataset.designAct;
    if (act === "catalogue") { if (!catalogueAck) return; cataloguePrompt = false;if(active())model.catalogue_mode="own";o.onCatalogueConfirmed?.();paint(true);o.onChange?.();return; }
    if (act === "samples") { cataloguePrompt = false; catalogueAck = false; paint(true); return; }
    if (act === "retry") return void load();
    if (act === "use") return void use();
    if (act === "save") return void save();
    if (act === "publish") return void publish();
    if (act === "reload") return void reload();
    if (act === "toggle") { editMode = !editMode; selected = null; paint(true); o.onChange?.(); return; }
    if (act === "theme") { editMode = true; selected = null; paint(true); o.openCanvas?.(); el.scrollIntoView({ block: "nearest" }); return; }
    if (act === "done") { selected = null; paint(true); markSelected(); return; }
    if (act === "mine" || act === "back") { o.backToDesign?.(model.plan); paint(true); o.onChange?.(); return; }
    if (act === "reset-copy" && selected) { const seed = designNeutralCopy(model.style, o.getBrand?.() || "Your brand"); model.copy[selected.key] = seed?.[selected.key] ?? ""; paint(true); o.onChange?.(); return; }
    if (act === "reset-image" && selected) setMedia(selected.key, null);
  });
  el.addEventListener("toggle", e => { if (e.target.matches?.("[data-design-consent]")) consentOpen = e.target.open; }, true);
  el.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset?.designInput) setCopy(t.dataset.designInput, t.value);
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
    active, editing, hasUnsavedChanges: () => dirty() || busy === "save" || busy === "use",
    requestCatalogue() { cataloguePrompt = true; catalogueAck = false; paint(true); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
    save, publish, bindPreview, refresh: () => paint(), reload,
    /** Called by Ann when the plan answers change while a design is active. */
    planChanged() { if (active()) { planDirty = true; paintDynamic(); } },
    receive(result) { ingest(result || {}, { hydrate: true }); paint(true); },
    /** The design to preview, or null when the page should show the showcase instead. */
    previewDesign() {
      if (!active() || !sameStyle()) return null;
      return { version: 1, style: model.style, media_pack: model.media_pack,catalogue_mode:model.catalogue_mode,sections:structuredClone(model.sections), plan: planPayload(), copy: { ...model.copy }, media: { ...model.media } };
    },
    setSections(value){if(readOnly||!model)return;model.sections=structuredClone(value);planDirty=true;paintDynamic();o.onChange?.();},
    selectContent(kind,key){if(readOnly||!model)return;if(kind==="copy"&&key in DESIGN_COPY_LIMITS||kind==="image"&&DESIGN_MEDIA_KEYS.includes(key))select(kind,key);},
    isActive: active,
  };
}
