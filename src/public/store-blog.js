import { registerLeaveGuard, confirmCatalogueAction } from "./catalogue-confirm.js";
import { MEDIA_LIMITS, formatBytes, validateFile, validateDimensions, layoutImage, encodeWebp } from "./product-media-processing.js";

const boot = (() => { try { return JSON.parse(document.getElementById("blog-data")?.textContent || "null"); } catch { return null; } })();
const root = document.querySelector("[data-blog-root]");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TYPES = { text: "Text", image: "Image", image_text: "Image and text", quote: "Quote", product: "Product", faq: "FAQ", cta: "Call to action" };
const LIM = { title: 160, slug: 160, summary: 400, author: 100, category: 80, hero_alt: 300, heading: 200, body: 12000, alt: 300, href: 2000 };
const FIELDS = { text: ["heading", "body"], image: ["heading", "media", "alt", "body"], image_text: ["heading", "body", "media", "alt"], quote: ["body", "heading"], product: ["product", "heading", "body"], faq: ["heading", "body"], cta: ["heading", "body", "href"] };
const LABELS = { quote: { heading: "Attribution" }, image: { heading: "Heading (optional)", body: "Caption (optional)" }, cta: { heading: "Button label", body: "Supporting text" }, faq: { heading: "Heading", body: "Questions and answers" } };
const HINTS = { faq: "Put each question on its own line, the answer on the next line, and a blank line between pairs.", cta: "Button links must be a path on your store such as /products or a full https address." };

if (boot && root) init();

function init() {
  const ed = root.querySelector("[data-blog-editor]"), listEl = root.querySelector("[data-blog-list]");
  const path = location.pathname.replace(/\/+$/, "");
  const isNew = path.endsWith("/blog/new");
  if (!boot.article && !isNew) return;
  listEl.hidden = true; ed.hidden = false;
  const media = new Map(boot.media.map(m => [String(m.id), m]));
  const blank = () => ({ id: "", title: "", slug: "", summary: "", author: "", category: "", hero_media_id: null, hero_alt: "", sections: [], revision: 0 });
  const norm = a => ({ ...blank(), ...a, hero_media_id: a.hero_media_id || null, sections: (a.sections || []).map(s => ({ id: s.id || crypto.randomUUID(), type: s.type || "text", heading: s.heading || "", body: s.body || "", media_id: s.media_id || null, alt: s.alt || "", product_id: s.product_id || null, href: s.href || "" })) });
  let art = norm(boot.article || blank());
  const snap = () => JSON.stringify([art.title, art.slug, art.summary, art.author, art.category, art.hero_media_id, art.hero_alt, art.sections]);
  let saved = snap(), busy = false, status = { kind: "", msg: "" }, errors = {}, slugTouched = !!art.slug;
  const persisted = () => !!art.id;
  const dirty = () => snap() !== saved;
  const can = boot.canEdit;
  registerLeaveGuard(() => dirty());
  addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  async function req(url, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const r = await fetch(url, { credentials: "same-origin", ...opts, headers: { Accept: "application/json", ...(isForm || !opts.body ? {} : { "Content-Type": "application/json" }) } });
    let j = {}; try { j = await r.json(); } catch { /* empty */ }
    if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status}).`), { status: r.status, code:j.code });
    return j;
  }
  const slugify = t => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIM.slug);

  const mediaThumb = (id, alt) => { const m = media.get(String(id)); return m ? `<img src="${esc(m.url)}" alt="${esc(alt || m.alt || "")}">` : `<span class="lbb-nothumb">Image unavailable</span>`; };
  function mediaField(key, id, alt, altKey, idx) {
    const d = can ? "" : "disabled";
    return `<div class="lbb-media" data-media-field="${key}" data-idx="${idx ?? ""}">
      <div class="lbb-media-prev">${id ? mediaThumb(id, alt) : `<span class="lbb-nothumb">No image chosen</span>`}</div>
      <div class="lbb-media-ctl"><button type="button" class="lb-button lb-button-small lb-button-outline" data-pick ${d}>${id ? "Change image" : "Choose image"}</button>${id ? `<button type="button" class="lb-text-button" data-clear ${d}>Remove image</button>` : ""}
      <label class="lb-field"><span>Alt text</span><input data-f="${altKey}" maxlength="${LIM.alt}" value="${esc(alt)}" ${d}><small>Describe the image for people who cannot see it.</small></label></div></div>`;
  }
  function field(label, name, val, o = {}) {
    const d = can ? "" : "disabled", err = errors[o.errKey || name];
    const ctl = o.area ? `<textarea data-f="${name}" rows="${o.rows || 5}" maxlength="${o.max}" ${d}>${esc(val)}</textarea>` : `<input data-f="${name}" maxlength="${o.max}" value="${esc(val)}" ${d}>`;
    return `<label class="lb-field"><span>${label}</span>${ctl}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}${err ? `<small class="lbb-err" role="alert">${esc(err)}</small>` : ""}</label>`;
  }
  function sectionCard(s, i, n) {
    const f = FIELDS[s.type] || FIELDS.text, L = LABELS[s.type] || {}, d = can ? "" : "disabled";
    const parts = f.map(k => {
      if (k === "media") return mediaField("section", s.media_id, s.alt, "alt", i);
      if (k === "product") return `<label class="lb-field"><span>Product</span><select data-f="product_id" ${d}><option value="">Choose a published product</option>${boot.products.map(p => `<option value="${esc(p.id)}" ${p.id === s.product_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>${errors["s" + i + "product_id"] ? `<small class="lbb-err" role="alert">${esc(errors["s" + i + "product_id"])}</small>` : ""}</label>`;
      if (k === "alt") return "";
      return field(L[k] || (k === "href" ? "Link" : k === "body" ? "Text" : "Heading"), k, s[k], { max: LIM[k], area: k === "body", rows: s.type === "faq" ? 8 : 5, hint: k === "body" && HINTS[s.type] || k === "href" && HINTS.cta || "", errKey: "s" + i + k });
    }).join("");
    return `<li class="lbb-sec" data-sid="${esc(s.id)}" data-idx="${i}"><div class="lbb-sec-head"><span class="lbb-num">${i + 1}</span>
      <label class="lbb-type"><span class="lb-sr-only">Section type</span><select data-f="type" aria-label="Section ${i + 1} type" ${d}>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === s.type ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="lbb-sec-act" role="group" aria-label="Section ${i + 1} of ${n} actions"><button type="button" data-move="-1" ${i === 0 || !can ? "disabled" : ""} aria-label="Move section ${i + 1} earlier">Move up</button><button type="button" data-move="1" ${i === n - 1 || !can ? "disabled" : ""} aria-label="Move section ${i + 1} later">Move down</button><button type="button" data-remove class="lbb-danger" ${d} aria-label="Remove section ${i + 1}">Remove</button></div></div>
      <div class="lbb-sec-body">${parts}</div></li>`;
  }

  function paint(focusSel) {
    const url = persisted() ? `${boot.base}/${encodeURIComponent(art.id)}` : "";
    ed.innerHTML = `<div class="lb-page-heading"><div><h1>${persisted() ? esc(art.title || "Untitled draft") : "New draft"}</h1><p>${can ? "Edits stay on this page until you save." : "You have view-only access to drafts."} Not public.</p></div>
      <div class="lb-heading-actions"><a class="lb-button lb-button-outline" href="${boot.base}" data-back>All drafts</a>${persisted() ? `<a class="lb-button lb-button-outline" href="${url}/preview" target="_blank" rel="noopener" data-preview ${dirty() ? 'aria-disabled="true" title="Save your changes to preview them"' : ""}>Preview</a>` : ""}</div></div>
      <div class="lbb-status" data-status role="${status.kind === "error" ? "alert" : "status"}" data-kind="${status.kind || (dirty() ? "dirty" : "")}">${esc(status.msg || (dirty() ? "Unsaved changes" : persisted() ? "All changes saved" : "Not saved yet"))}${status.kind === "conflict" ? ` <button type="button" class="lb-text-button" data-reload>Reload latest version</button>` : ""}</div>
      ${!persisted() ? "" : `<p class="lbb-muted">Revision ${art.revision}. Preview shows the last saved version.${dirty() ? " Save first to see recent edits." : ""}</p>`}
      <div class="lbb-grid"><div class="lbb-main">
      <section class="lb-card lbb-card"><div class="lb-card-heading"><h2>Article details</h2></div>
        ${field("Title", "title", art.title, { max: LIM.title })}
        ${field("Summary", "summary", art.summary, { max: LIM.summary, area: true, rows: 3, hint: "A short introduction shown in lists." })}
        <div class="lbb-row2">${field("Author", "author", art.author, { max: LIM.author })}${field("Category", "category", art.category, { max: LIM.category })}</div>
        ${field("Slug", "slug", art.slug, { max: LIM.slug, hint: "Lower case letters, numbers and hyphens. Used in the article address once published." })}</section>
      <section class="lb-card lbb-card"><div class="lb-card-heading"><h2>Hero image</h2></div>${mediaField("hero", art.hero_media_id, art.hero_alt, "hero_alt")}${errors.hero_media_id ? `<small class="lbb-err" role="alert">${esc(errors.hero_media_id)}</small>` : ""}</section>
      <section class="lb-card lbb-card"><div class="lb-card-heading"><h2>Sections</h2><small>${art.sections.length} of 40</small></div>
        ${art.sections.length ? `<ol class="lbb-secs">${art.sections.map((s, i) => sectionCard(s, i, art.sections.length)).join("")}</ol>` : `<p class="lbb-muted lbb-none">No sections yet. Add text, images, a quote, a product, FAQs or a call to action.</p>`}
        ${can ? `<div class="lbb-add"><label class="lb-field"><span>Add a section</span><select data-add-type>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label><button type="button" class="lb-button lb-button-outline" data-add ${art.sections.length >= 40 ? "disabled" : ""}>Add section</button></div>` : ""}</section></div>
      <aside class="lbb-side"><section class="lb-card lbb-card"><div class="lb-card-heading"><h2>Draft</h2></div><p class="lbb-muted">Drafts are private to your team. Publishing is not available yet.</p>
        ${can ? `<button type="button" class="lb-button lbb-wide" data-save ${busy ? "disabled" : ""}>${busy ? "Saving" : persisted() ? "Save changes" : "Create draft"}</button>` : ""}
        ${can && persisted() ? `<button type="button" class="lb-button lb-button-outline lbb-wide lbb-danger-btn" data-delete ${busy ? "disabled" : ""}>Delete draft</button>` : ""}</section></aside></div>`;
    if (busy) ed.querySelectorAll("input,textarea,select,button").forEach(control=>{control.disabled=true;});
    if (focusSel) ed.querySelector(focusSel)?.focus();
  }

  const markStatus = () => {
    const el = ed.querySelector("[data-status]"); if (!el) return;
    if (!status.kind) { el.dataset.kind = dirty() ? "dirty" : ""; el.firstChild.textContent = dirty() ? "Unsaved changes" : persisted() ? "All changes saved" : "Not saved yet"; }
    const pv = ed.querySelector("[data-preview]"); if (pv) { if (dirty()) { pv.setAttribute("aria-disabled", "true"); pv.title = "Save your changes to preview them"; } else { pv.removeAttribute("aria-disabled"); pv.removeAttribute("title"); } }
  };

  ed.addEventListener("input", e => {
    const t = e.target, k = t.dataset.f; if (!k || !can || busy) return;
    const li = t.closest("[data-sid]");
    if (li) { const s = art.sections.find(x => x.id === li.dataset.sid); if (!s) return; s[k] = t.value || (k === "product_id" ? null : ""); }
    else if (t.closest("[data-media-field=hero]") && k === "hero_alt") art.hero_alt = t.value;
    else { art[k] = t.value; if (k === "slug") slugTouched = true; if (k === "title" && !slugTouched && !persisted()) { art.slug = slugify(t.value); const sl = ed.querySelector('[data-f="slug"]'); if (sl) sl.value = art.slug; } }
    if (status.kind !== "error" && status.kind !== "conflict") status = { kind: "", msg: "" };
    markStatus();
  });
  ed.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.f === "type" && t.closest("[data-sid]")) { const s = art.sections.find(x => x.id === t.closest("[data-sid]").dataset.sid); s.type = t.value; paint(`[data-sid="${s.id}"] [data-f=type]`); markStatus(); }
  });
  ed.addEventListener("click", async e => {
    const b = e.target.closest("button, a"); if (!b) return;
    if (busy && b.matches("button")) return;
    if (b.matches("[data-preview]") && b.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("Save your changes first. Preview shows the saved draft."); return; }
    if (b.matches("[data-back]") && dirty()) { /* leave guard handles navigation */ return; }
    const li = b.closest("[data-sid]"), idx = li ? Number(li.dataset.idx) : -1;
    if (b.matches("[data-add]")) { if (art.sections.length >= 40) return; const s = { id: crypto.randomUUID(), type: ed.querySelector("[data-add-type]").value, heading: "", body: "", media_id: null, alt: "", product_id: null, href: "" }; art.sections.push(s); paint(`[data-sid="${s.id}"] [data-f]`); markStatus(); ed.querySelector(`[data-sid="${s.id}"]`)?.scrollIntoView({ block: "center" }); }
    else if (b.matches("[data-move]")) { const to = idx + Number(b.dataset.move); if (to < 0 || to >= art.sections.length) return; const [s] = art.sections.splice(idx, 1); art.sections.splice(to, 0, s); paint(`[data-sid="${s.id}"] [data-move="${b.dataset.move}"]:not(:disabled), [data-sid="${s.id}"] [data-move]:not(:disabled)`); markStatus(); live(`Section moved to position ${to + 1} of ${art.sections.length}.`); }
    else if (b.matches("[data-remove]")) { const ok = await confirmCatalogueAction("This section is removed from the draft when you save.", { title: "Remove this section?", confirmLabel: "Remove", cancelLabel: "Keep it" }); if (!ok) return; art.sections.splice(idx, 1); paint(art.sections.length ? "[data-add-type]" : "[data-add-type]"); markStatus(); live("Section removed."); }
    else if (b.matches("[data-pick]")) {
      const mf = b.closest("[data-media-field]"), id = await pickMedia(); if (!id) return;
      if (mf.dataset.mediaField === "hero") art.hero_media_id = id; else art.sections[idx].media_id = id;
      const m = media.get(String(id)); const target = mf.dataset.mediaField === "hero" ? art : art.sections[idx];
      const ak = mf.dataset.mediaField === "hero" ? "hero_alt" : "alt"; if (!target[ak] && m?.alt) target[ak] = m.alt;
      paint(mf.dataset.mediaField === "hero" ? '[data-media-field=hero] [data-pick]' : `[data-sid="${art.sections[idx].id}"] [data-pick]`); markStatus();
    }
    else if (b.matches("[data-clear]")) { const mf = b.closest("[data-media-field]"); if (mf.dataset.mediaField === "hero") { art.hero_media_id = null; art.hero_alt = ""; } else { art.sections[idx].media_id = null; art.sections[idx].alt = ""; } paint(); markStatus(); }
    else if (b.matches("[data-save]")) save();
    else if (b.matches("[data-delete]")) del();
    else if (b.matches("[data-reload]")) { if (dirty() && !(await confirmCatalogueAction("Your unsaved edits will be replaced with the latest saved version.", { title: "Discard your edits?", confirmLabel: "Reload latest", cancelLabel: "Keep editing" }))) return; await reload(); }
  });

  function payload() {
    const sections = art.sections.map(s => {
      const o = { id: s.id, type: s.type, heading: s.heading.trim(), body: s.body };
      const f = FIELDS[s.type] || [];
      if (f.includes("media")) { o.media_id = s.media_id || null; o.alt = s.alt.trim(); }
      if (f.includes("product")) o.product_id = s.product_id || null;
      if (f.includes("href")) o.href = s.href.trim();
      return o;
    });
    return { title: art.title.trim(), slug: art.slug.trim(), summary: art.summary.trim(), author: art.author.trim(), category: art.category.trim(), hero_media_id: art.hero_media_id || null, hero_alt: art.hero_alt.trim(), sections };
  }
  function validate() {
    const er = {}; const p = payload();
    if (!p.title) er.title = "Enter a title.";
    if (p.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) er.slug = "Use lower case letters, numbers and single hyphens.";
    for (const k of ["title", "slug", "summary", "author", "category", "hero_alt"]) if (p[k].length > LIM[k]) er[k] = `Use at most ${LIM[k]} characters.`;
    p.sections.forEach((s, i) => {
      if (s.heading.length > LIM.heading) er["s" + i + "heading"] = `Use at most ${LIM.heading} characters.`;
      if (s.body.length > LIM.body) er["s" + i + "body"] = `Use at most ${LIM.body} characters.`;
      if (s.type === "product" && !s.product_id) er["s" + i + "product_id"] = "Choose a product.";
      if (s.type === "cta") { const h = s.href; if (!h || !((h.startsWith("/") && !h.startsWith("//") && !h.includes("\\")) || /^https:\/\/[^\s]+$/i.test(h))) er["s" + i + "href"] = "Use a path starting with / or an https address."; else if (h.length > LIM.href) er["s" + i + "href"] = "Link is too long."; }
    });
    return er;
  }
  async function save() {
    if (busy || !can) return;
    errors = validate();
    if (Object.keys(errors).length) { status = { kind: "error", msg: "Fix the highlighted fields, then save again." }; paint(); ed.querySelector(".lbb-err")?.closest(".lb-field")?.querySelector("input,textarea,select")?.focus(); return; }
    busy = true; status = { kind: "progress", msg: "Saving" }; paint();
    try {
      const body = payload(); let res;
      if (persisted()) res = await req(`/api/stores/${encodeURIComponent(boot.storeId)}/blog/${encodeURIComponent(art.id)}`, { method: "PUT", body: JSON.stringify({ ...body, expected_revision: art.revision }) });
      else res = await req(`/api/stores/${encodeURIComponent(boot.storeId)}/blog`, { method: "POST", body: JSON.stringify(body) });
      const wasNew = !persisted();
      const server = res.article || {};
      art = { ...art, id: server.id || art.id, revision: server.revision ?? art.revision, slug: server.slug ?? art.slug };
      saved = snap(); status = { kind: "ok", msg: "Draft saved." }; busy = false;
      if (wasNew && art.id) history.replaceState(null, "", `${boot.base}/${encodeURIComponent(art.id)}`);
      paint("[data-save]"); toast("Draft saved.");
    } catch (x) {
      busy = false;
      status = x.status === 409 && x.code !== "BLOG_SLUG_TAKEN" ? { kind: "conflict", msg: "This draft was changed elsewhere since you opened it. Your edits are still here but were not saved." } : { kind: "error", msg: x.message || "The draft could not be saved." };
      paint("[data-status]");
    }
  }
  async function reload() {
    try {
      const res = await req(`/api/stores/${encodeURIComponent(boot.storeId)}/blog/${encodeURIComponent(art.id)}`);
      for (const m of res.media || []) media.set(String(m.id), m);
      art = norm(res.article); saved = snap(); errors = {}; status = { kind: "ok", msg: "Loaded the latest saved version." }; paint("[data-status]");
    } catch (x) { status = { kind: "error", msg: x.message }; paint(); }
  }
  async function del() {
    const ok = await confirmCatalogueAction(`"${art.title || "Untitled draft"}" will be deleted permanently. This cannot be undone.`, { title: "Delete this draft?", confirmLabel: "Delete draft", cancelLabel: "Keep draft" });
    if (!ok) return;
    busy = true; paint();
    try {
      await req(`/api/stores/${encodeURIComponent(boot.storeId)}/blog/${encodeURIComponent(art.id)}`, { method: "DELETE", body: JSON.stringify({ expected_revision: art.revision }) });
      saved = snap(); location.assign(boot.base);
    } catch (x) {
      busy = false; status = x.status === 409 ? { kind: "conflict", msg: "This draft changed since you opened it, so it was not deleted. Reload to review the latest version." } : { kind: "error", msg: x.message || "The draft could not be deleted." }; paint("[data-status]");
    }
  }

  // ---------- media picker ----------
  function pickMedia() {
    return new Promise(resolve => {
      const dlg = document.createElement("dialog"); dlg.className = "lbb-dialog"; dlg.setAttribute("aria-label", "Choose an image");
      dlg.innerHTML = `<div class="lbb-dlg"><div class="lbb-dlg-head"><h2>Choose an image</h2><button type="button" class="lb-text-button" data-x>Close</button></div>
        <p class="lbb-muted">Images come from your store media library.</p><p class="lbb-err" role="alert" data-err hidden></p>
        <div class="lbb-pick" data-grid></div><div class="lbb-dlg-more"><button type="button" class="lb-button lb-button-small lb-button-outline" data-more hidden>Load more</button></div>
        <div class="lbb-upload"><h3>Upload a new image</h3><label class="lb-field"><span>Alt text</span><input data-alt maxlength="200" placeholder="Describe the image"></label>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-file hidden><button type="button" class="lb-button lb-button-small" data-upload>Choose file and upload</button><small class="lbb-muted" data-up-note>JPEG, PNG or WebP up to 10 MB. Crop in your browser before uploading.</small></div></div>`;
      document.body.append(dlg); dlg.showModal();
      const q = s => dlg.querySelector(s); let cursor = null, loading = false, n = 0;
      const err = t => { q("[data-err]").textContent = t; q("[data-err]").hidden = !t; };
      const fin = v => { dlg.close(); dlg.remove(); resolve(v); };
      const cell = m => `<button type="button" class="lbb-pick-item" data-id="${esc(m.id)}"><img src="${esc(m.url)}" alt="${esc(m.alt || "")}" loading="lazy"><span>${esc(m.alt || "No alt text")}</span></button>`;
      const imgs = () => [...media.values()].filter(m => !m.type || m.type === "image");
      const draw = () => { const all = imgs(); q("[data-grid]").innerHTML = all.length ? all.map(cell).join("") : `<p class="lbb-muted">No images yet. Upload one below.</p>`; };
      draw();
      q("[data-grid]").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) fin(b.dataset.id); });
      q("[data-x]").addEventListener("click", () => fin(null));
      dlg.addEventListener("cancel", e => { e.preventDefault(); fin(null); });
      async function more() {
        if (loading) return; loading = true; err("");
        try {
          const r = await req(`/api/stores/${encodeURIComponent(boot.storeId)}/media?offset=${cursor ?? 0}`);
          const items = r.media || r.items || []; items.forEach(m => media.set(String(m.id), m)); n += items.length;
          cursor = r.next_cursor ?? r.nextCursor ?? r.cursor ?? null; if (cursor === "" || items.length === 0) cursor = null;
          draw();
        } catch (x) { err(x.message || "Media could not be loaded."); }
        loading = false; q("[data-more]").hidden = cursor == null;
      }
      q("[data-more]").addEventListener("click", more);
      more();
      q("[data-upload]").addEventListener("click", () => q("[data-file]").click());
      q("[data-file]").addEventListener("change", async e => {
        const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
        const btn = q("[data-upload]"); btn.disabled = true; err(""); q("[data-up-note]").textContent = "Preparing and uploading";
        try {
          const check = validateFile(f);
          if (!check.ok || check.type !== "image") throw new Error(check.ok ? "Choose an image file." : check.error);
          const staged = await cropDialog(f);
          if (!staged) { btn.disabled = false; q("[data-up-note]").textContent = "Nothing was added."; return; }
          const fd = new FormData();
          fd.append("type", "image"); fd.append("file", staged.blob, staged.name); fd.append("alt", staged.alt || q("[data-alt]").value.trim());
          const r = await req(`/api/stores/${encodeURIComponent(boot.storeId)}/media`, { method: "POST", body: fd });
          if (!r.media?.id) throw new Error("The upload did not return usable media.");
          media.set(String(r.media.id), { type: "image", ...r.media }); fin(String(r.media.id));
        } catch (x) { err(x.message || "Upload failed. Your plan storage may be full."); btn.disabled = false; q("[data-up-note]").textContent = "Nothing was added."; }
      });
      void n; q("[data-x]").focus();
    });
  }


  // ---------- crop step ----------
  const ASPECTS = [["original", "Original", 0], ["wide", "Wide 16:9", 16 / 9], ["square", "Square 1:1", 1], ["portrait", "Portrait 4:5", 4 / 5]];
  async function cropDialog(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { throw new Error(`${file.name} could not be read as an image.`); }
      const iw = img.naturalWidth, ih = img.naturalHeight, bad = validateDimensions(iw, ih);
      if (bad) throw new Error(`${file.name}: ${bad}`);
      const base = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "image";
      return await new Promise(resolve => {
        const dlg = document.createElement("dialog"); dlg.className = "lbb-dialog"; dlg.setAttribute("aria-label", "Crop image");
        dlg.innerHTML = `<form class="lbb-dlg"><h2>Crop image</h2><p class="lbb-muted">${esc(file.name)}, ${iw} by ${ih} px, ${formatBytes(file.size)}. Your original file stays on your device. Output is WebP up to 1600 px wide and is never enlarged.</p>
          <fieldset class="lbb-aspects"><legend>Shape</legend>${ASPECTS.map(([k, l], i) => `<label><input type="radio" name="aspect" value="${k}" ${i === 0 ? "checked" : ""}> ${l}</label>`).join("")}</fieldset>
          <div class="lbb-frame" tabindex="0" role="group" aria-label="Crop preview. Arrow keys pan, plus and minus zoom."><canvas></canvas></div>
          <label class="lb-field"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" data-zoom></label>
          <label class="lb-field"><span>Alt text</span><input data-calt maxlength="200" value=""></label>
          <p class="lbb-err" role="alert" data-cerr hidden></p>
          <div class="lbb-foot"><button type="button" class="lb-button lb-button-outline lb-button-small" data-cancel>Cancel</button>${file.size <= MEDIA_LIMITS.maxBytes ? '<button type="button" class="lb-button lb-button-outline lb-button-small" data-orig>Upload original file</button>' : ""}<button type="submit" class="lb-button lb-button-small" data-go>Crop and upload</button></div></form>`;
        document.body.append(dlg); dlg.showModal();
        const q = s => dlg.querySelector(s), cv = q("canvas"), ctx = cv.getContext("2d"), frame = q(".lbb-frame"), zoom = q("[data-zoom]");
        const st = { fit: false, zoom: 1, ox: 0, oy: 0 }; let ratio = iw / ih, VW = 360, VH = 360;
        const setAspect = k => { const a = ASPECTS.find(x => x[0] === k); ratio = a[2] || iw / ih; if (ratio >= 1) { VW = 360; VH = Math.round(360 / ratio); } else { VH = 360; VW = Math.round(360 * ratio); } cv.width = VW; cv.height = VH; st.zoom = 1; st.ox = 0; st.oy = 0; zoom.value = 1; draw(); };
        const draw = () => { const l = layoutImage(iw, ih, VW, VH, st); st.ox = l.ox; st.oy = l.oy; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, VW, VH); ctx.drawImage(img, l.x, l.y, l.dw, l.dh); };
        let drag = null; const kx = () => frame.clientWidth ? VW / cv.clientWidth : 1;
        frame.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; frame.setPointerCapture(e.pointerId); });
        frame.addEventListener("pointermove", e => { if (!drag) return; const k = VW / (cv.clientWidth || VW); st.ox = drag.ox + (e.clientX - drag.x) * k; st.oy = drag.oy + (e.clientY - drag.y) * k; draw(); });
        const end = () => { drag = null; }; frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end); void kx;
        frame.addEventListener("keydown", e => {
          const s = e.shiftKey ? 30 : 10, k = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
          if (k) { e.preventDefault(); st.ox += k[0]; st.oy += k[1]; draw(); }
          else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom.value = Math.min(4, +zoom.value + .1); zoom.dispatchEvent(new Event("input")); }
          else if (e.key === "-") { e.preventDefault(); zoom.value = Math.max(1, +zoom.value - .1); zoom.dispatchEvent(new Event("input")); }
        });
        zoom.addEventListener("input", () => { st.zoom = +zoom.value; draw(); });
        dlg.querySelectorAll("[name=aspect]").forEach(r => r.addEventListener("change", () => setAspect(r.value)));
        const fin = v => { dlg.close(); dlg.remove(); resolve(v); };
        const alt = () => q("[data-calt]").value.trim();
        q("[data-cancel]").addEventListener("click", () => fin(null));
        q("[data-orig]")?.addEventListener("click", () => fin({ blob: file, name: file.name, alt: alt() }));
        dlg.addEventListener("cancel", e => { e.preventDefault(); fin(null); });
        q("form").addEventListener("submit", async e => {
          e.preventDefault(); const btn = q("[data-go]"), er = q("[data-cerr]"); btn.disabled = true; er.hidden = true;
          try {
            const l = layoutImage(iw, ih, VW, VH, st), outW = Math.max(1, Math.min(1600, Math.floor(VW / l.scale))), outH = Math.max(1, Math.round(outW / ratio));
            const c = document.createElement("canvas"); c.width = outW; c.height = outH; const k = outW / VW, cx = c.getContext("2d");
            cx.fillStyle = "#fff"; cx.fillRect(0, 0, outW, outH); cx.imageSmoothingQuality = "high"; cx.drawImage(img, l.x * k, l.y * k, l.dw * k, l.dh * k);
            const out = await encodeWebp(c);
            fin({ blob: out.blob, name: `${base}.${out.webp ? "webp" : "png"}`, alt: alt() });
          } catch (x) { er.textContent = x.message || "The image could not be prepared."; er.hidden = false; btn.disabled = false; }
        });
        setAspect("original"); frame.focus();
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function live(t) { let l = document.getElementById("lbb-live"); if (!l) { l = document.createElement("p"); l.id = "lbb-live"; l.className = "lb-sr-only"; l.setAttribute("role", "status"); document.body.append(l); } l.textContent = t; }
  function toast(t) { const el = document.querySelector("[data-toast]"); if (!el) return live(t); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3500); }
  paint();
}
