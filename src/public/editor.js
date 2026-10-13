import { renderAura } from "/assets/aura.js";
import { attachAuraSearch } from "/assets/aura-ui.js";
import { SECTION_SCHEMAS, defaultPageLayouts, safeLayoutLink } from "/assets/aura-layout.js";
import { uploadAuraImage } from "/assets/aura-upload.js";
import * as S from "/assets/editor-state.js";
import { starterLayouts, mergeStarter, isLegacyDefault, TEMPLATE_META } from "/assets/aura-skeleton.js";

const $ = (selector, scope = document) => scope.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#editor");
const data = JSON.parse($("#editor-data")?.textContent || "{}");
const storeId = root?.dataset.storeId || data.store?.store_id || "";
const API = `/api/stores/${encodeURIComponent(storeId)}`;
const canEditRole = !data.readOnly && S.canEditRole(data.role);
const canPublish = !data.readOnly && S.canPublishRole(data.role);
const phone = window.matchMedia("(max-width: 767px)");
const readOnly = () => !canEditRole || phone.matches;
const context = S.layoutContext(data);
const defaults = defaultPageLayouts(data);
const pages = {};
const skeleton = data.aura_skeleton_enabled === true;
const EDIT_PAGES = skeleton ? [...S.EDITABLE_PAGES, ...S.SKELETON_PAGES] : S.EDITABLE_PAGES;
// Pages showing an unsaved Aura starter proposal. They are never autosaved; only "Save starter draft" persists them.
const proposed = new Map();
for (const key of EDIT_PAGES) {
  const saved = structuredClone(data.layouts?.[key] || defaults[key]);
  pages[key] = S.createPageState(saved, data.page_versions?.[key]?.version || 0);
  if (skeleton && ["home", "collection", "product", "cart", "checkout"].includes(key) && isLegacyDefault(data.layouts?.[key], key, data)) {
    proposed.set(key, saved);
    pages[key].history = S.createHistory(starterLayouts(data)[key]);
  }
}
const isDirtyKey = key => S.isDirty(pages[key]) && !proposed.has(key);
const previewItem = {};
const inflight = new Set(), conflicts = new Set(), saveErrors = new Map();
let current = "home", selectedId = null, saveTimer = 0, previewTimer = 0, themeTimer = 0, drag = null, lastScroll = 0, inlineActive = false;
let undoTags = [], redoTags = [], themeHist = S.createHistory(S.themeSnapshot(data.settings || {}));
let mediaCursor = null, mediaSearch = "", themeSaving = null, themeBase = S.themeSnapshot(data.published_settings || {});
let mediaCache = null, mediaError = "", view = "desktop", themeDirty = {}, themeError = "";

const cur = () => pages[current];
const layoutNow = () => S.pageLayout(cur());
const selectedSection = () => layoutNow().find(item => item.id === selectedId) || null;
const pageName = key => ({ product: TEMPLATE_META.product.label, collection: TEMPLATE_META.collection.label })[key] || S.PAGE_LABELS[key] || key;
const humanise = name => name.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const labelOf = (field, name) => field.label || humanise(name);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  let result = {};
  try { result = await response.json(); } catch { /* non JSON error body */ }
  if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status}).`), { status: response.status });
  return result;
}
const versionOf = result => Number.isInteger(result?.version) ? result.version : result?.revision?.version;

// ---------- toast and modal ----------
let toastTimer = 0;
function toast(message, action) {
  const node = $("#ed-toast");
  node.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  node.hidden = false;
  if (action) node.querySelector("button").onclick = () => { node.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, action ? 9000 : 4500);
}
function openModal(title, bodyHtml, footerHtml = "") {
  const opener = document.activeElement;
  const shade = document.createElement("div");
  shade.className = "ed-modal-shade";
  shade.innerHTML = `<div class="ed-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="ed-btn ed-small" data-close>Close</button></header><div class="ed-modal-body">${bodyHtml}</div><footer>${footerHtml}</footer></div>`;
  $("#ed-modal-root").append(shade);
  const close = () => { shade.remove(); opener?.focus?.(); };
  shade.addEventListener("click", event => { if (event.target === shade || event.target.closest("[data-close]")) close(); });
  shade.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  (shade.querySelector("input:not([type=file]),select,textarea,button:not([data-close])") || shade.querySelector("button"))?.focus();
  return { shade, close, body: shade.querySelector(".ed-modal-body"), footer: shade.querySelector("footer") };
}

// ---------- status ----------
function validationError(key = current) { return S.validateDraft(key, S.pageLayout(pages[key]), context); }
function setStatus() {
  const node = $("#ed-status");
  let state = "saved", text = "Saved";
  const dirty = EDIT_PAGES.filter(isDirtyKey);
  if (conflicts.size) { state = "conflict"; text = "Conflict. Choose a version"; }
  else if (saveErrors.size) { state = "error"; text = "Could not save"; }
  else if (inflight.size) { state = "saving"; text = "Saving"; }
  else if (dirty.length) {
    const invalid = dirty.find(key => validationError(key));
    if (invalid) { state = "error"; text = `Not saved: ${pageName(invalid)} needs attention`; }
    else { state = "dirty"; text = "Unsaved changes"; }
  }
  node.dataset.state = state;
  node.innerHTML = state === "error" && saveErrors.size ? `${esc(text)} <button type="button" class="ed-btn ed-small" id="ed-retry">Retry</button>` : esc(text);
  $("#ed-undo").disabled = readOnly() || !undoTags.length;
  $("#ed-redo").disabled = readOnly() || !redoTags.length;
  const publish = $("#ed-publish");
  if (publish) publish.disabled = phone.matches;
  const banner = $("#ed-banner");
  if (conflicts.size) {
    banner.hidden = false;
    const key = [...conflicts][0];
    banner.innerHTML = `<span>${esc(pageName(key))} was changed in another tab or by a teammate. Your edits are kept here and are not saved yet.</span><span class="ed-banner-actions"><button type="button" class="ed-btn ed-small" data-conflict="theirs" data-page="${esc(key)}">Load their version</button><button type="button" class="ed-btn ed-small ed-primary" data-conflict="mine" data-page="${esc(key)}">Keep mine and overwrite</button></span>`;
  } else banner.hidden = true;
}

// ---------- saving ----------
function scheduleSave(delay = 3000) { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveAll(); }, delay); }
async function savePage(key, force = false) {
  const decision = S.saveDecision(key, { proposed, inflight, conflicts, dirty: S.isDirty(pages[key]), invalid: validationError(key) }, force);
  if (decision === "blocked") return false;
  if (decision !== "save") return true;
  const sent = structuredClone(S.pageLayout(pages[key]));
  inflight.add(key); saveErrors.delete(key); setStatus();
  try {
    const row = await api(`${API}/pages/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ layout: sent, expected_version: pages[key].version }) });
    const version = versionOf(row);
    if (!Number.isInteger(version)) throw new Error("The server did not confirm the new version.");
    pages[key] = S.markSaved(pages[key], sent, version);
    return true;
  } catch (error) {
    if (error.status === 409) conflicts.add(key); else saveErrors.set(key, error.message);
    return false;
  } finally { inflight.delete(key); setStatus(); renderPageSelect(); if (isDirtyKey(key) && !conflicts.has(key) && !saveErrors.has(key)) scheduleSave(1500); }
}
async function saveAll() {
  clearTimeout(saveTimer);
  const results = await Promise.all(EDIT_PAGES.map(key => savePage(key, false)));
  return results.every(Boolean) && !EDIT_PAGES.some(isDirtyKey);
}
async function fetchPage(key) {
  const result = await api(`${API}/pages/${encodeURIComponent(key)}`);
  const version = versionOf(result);
  if (!Array.isArray(result.layout) || !Number.isInteger(version)) throw new Error("The server returned an unreadable page.");
  return { layout: result.layout, version };
}
async function resolveConflict(key, choice) {
  try {
    const remote = await fetchPage(key);
    if (choice === "theirs") { proposed.delete(key); pages[key] = S.adoptRemote(remote.layout, remote.version); selectedId = null; toast("Loaded the latest version of this page."); }
    else pages[key] = S.overwriteRevision(pages[key], remote.version);
    conflicts.delete(key); saveErrors.delete(key);
    renderAll();
    if (choice === "mine") {
      const wasProposal = proposed.has(key), ok = await savePage(key, wasProposal);
      if (wasProposal && ok && !conflicts.has(key) && !saveErrors.has(key)) { proposed.delete(key); renderAll(); }
    }
  } catch (error) { toast(`Could not check the page: ${error.message}`); }
  setStatus();
}
async function checkRemote() {
  if (document.hidden || inflight.size || conflicts.has(current)) return;
  const key = current;
  try {
    const remote = await fetchPage(key);
    if (key !== current || inflight.has(key)) return;
    const change = S.remoteChange(pages[key], remote.version);
    if (change === "reload") { pages[key] = S.adoptRemote(remote.layout, remote.version); if (!selectedSection()) selectedId = null; renderAll(); toast("This page was updated in another tab. Showing the latest version."); }
    else if (change === "conflict") { conflicts.add(key); setStatus(); }
  } catch { /* offline checks stay quiet; saving reports real errors */ }
}

// ---------- mutations ----------
function mutate(fn, { key = null, rerender = "all" } = {}) {
  if (readOnly()) return;
  const before = layoutNow(), next = fn(before);
  if (next === before) return false;
  const had = cur().history.past.length;
  cur().history = S.commit(cur().history, next, { key, now: Date.now() });
  if (cur().history.past.length !== had) undoTags.push({ t: "page", key: current });
  redoTags = [];
  if (!selectedSection()) selectedId = null;
  afterChange(rerender);
  return true;
}
function afterChange(rerender) {
  if (rerender === "all") { renderSections(); renderProps(); }
  else if (rerender === "list") renderSections();
  renderWarnings(); setStatus(); renderPageSelect(); schedulePreview(); scheduleSave();
  const error = validationError(), node = $("#ed-section-error");
  if (node) node.textContent = error;
}
function undoRedo(direction) {
  if (readOnly()) return;
  const from = direction === "undo" ? undoTags : redoTags, to = direction === "undo" ? redoTags : undoTags;
  const tag = from.pop();
  if (!tag) return;
  to.push(tag);
  if (tag.t === "theme") {
    const prev = themeHist.present;
    themeHist = direction === "undo" ? S.undo(themeHist) : S.redo(themeHist);
    const patch = S.themePatch(prev, themeHist.present);
    Object.assign(data.settings, patch); Object.assign(themeDirty, patch); themeError = "";
    clearTimeout(themeTimer); themeTimer = setTimeout(saveTheme, 400);
    schedulePreview(); renderWarnings(); setStatus();
    toast(direction === "undo" ? "Theme change undone." : "Theme change restored.");
    return;
  }
  if (tag.key !== current) { current = tag.key; selectedId = null; }
  const next = direction === "undo" ? S.undo(cur().history) : S.redo(cur().history);
  cur().history = next;
  if (!selectedSection()) selectedId = null;
  renderAll(); scheduleSave();
}
function selectSection(id, { focusPanel = false } = {}) {
  selectedId = id; renderSections(); renderProps(); markPreviewSelection(true);
  if (focusPanel) $("#ed-props input,#ed-props textarea,#ed-props select")?.focus();
}
function switchPage(key) {
  if (!pages[key]) return;
  saveAll(); current = key; selectedId = null; lastScroll = 0; renderAll(); setStatus();
}

// ---------- rendering: page select, sections list, warnings ----------
function renderPageSelect() {
  const select = $("#ed-page");
  select.innerHTML = EDIT_PAGES.map(key => `<option value="${esc(key)}" ${key === current ? "selected" : ""}>${esc(pageName(key))}${proposed.has(key) ? " (starter preview)" : S.isDirty(pages[key]) ? " (unsaved)" : ""}</option>`).join("");
}
function sectionSummary(section) {
  const text = ["title", "text", "name", "brand_line"].map(key => section.settings[key]).find(value => typeof value === "string" && value.trim());
  return text ? String(text).replace(/<[^>]+>/g, " ").trim().slice(0, 36) : "";
}
function renderSections() {
  const layout = layoutNow(), ro = readOnly(), list = $("#ed-sections");
  $("#ed-add").disabled = ro || layout.length >= S.MAX_SECTIONS;
  list.innerHTML = layout.map((section, i) => {
    const required = S.isRequired(section.type, current), hidden = section.settings.enabled === false;
    const btn = (act, label, text, disabled) => `<button type="button" class="ed-ico" data-act="${act}" data-id="${esc(section.id)}" aria-label="${esc(label)} ${esc(S.sectionName(section))}" ${disabled || ro ? "disabled" : ""}>${text}</button>`;
    return `<li class="ed-sec ${hidden ? "is-hidden" : ""}" data-drag-group="sections" data-drag-index="${i}" ${ro ? "" : 'draggable="true"'} aria-current="${section.id === selectedId}">
      <button type="button" class="ed-grip" data-reorder-handle="${esc(section.id)}" draggable="${!ro}" ${ro ? "disabled" : ""} aria-label="Reorder ${esc(S.sectionName(section))}" title="Drag to reorder, or use Arrow Up and Arrow Down">::</button>
      <button type="button" class="ed-sec-name" data-select="${esc(section.id)}">${hidden ? '<svg class="ed-eye-off" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10 5c5-1 9 3 12 7-1 2-2 3-4 5M6 6c-2 1-4 3-5 6 3 5 7 8 12 7 1 0 2 0 3-1M9 9a4 4 0 0 0 6 6"/></svg>' : ""}${esc(S.sectionName(section))}<small>${hidden ? "Hidden" : esc(sectionSummary(section))}</small></button>
      <div class="ed-sec-actions">${btn("sec-up", "Move up", "Up", !S.canMoveSection(layout, i, -1))}${btn("sec-down", "Move down", "Down", !S.canMoveSection(layout, i, 1))}${required ? '<span class="ed-lock">Required</span>' : `${btn("sec-toggle", hidden ? "Show" : "Hide", hidden ? "Show" : "Hide", false)}${btn("sec-dup", "Duplicate", "Copy", ["announcement", "commerce"].includes(section.type) || layout.length >= S.MAX_SECTIONS)}${btn("sec-del", "Delete", "Delete", false)}`}</div></li>`;
  }).join("") || `<li class="ed-empty">This page has no sections.</li>`;
}
function renderWarnings() {
  const warnings = S.layoutWarnings(layoutNow(), data.settings || {});
  $("#ed-warnings").innerHTML = warnings.length ? `<h2 class="ed-label">Warnings</h2>${warnings.map(item => `<div class="ed-warn" data-kind="${item.kind}"><b>${item.kind}</b>${esc(item.text)}</div>`).join("")}` : "";
}

// ---------- rendering: properties panel ----------
const richSerialize = node => {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    else if (child.nodeType === 1) {
      const name = child.nodeName.toLowerCase(), tag = { b: "strong", strong: "strong", i: "em", em: "em", p: "p", div: "p", ul: "ul", ol: "ol", li: "li" }[name];
      if (name === "br") out += "<br>"; else if (tag) out += `<${tag}>${richSerialize(child)}</${tag}>`; else out += richSerialize(child);
    }
  }
  return out;
};
const cleanRich = html => richSerialize(new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html").body);
const pathAttr = path => `data-path="${esc(JSON.stringify(path))}"`;
let uid = 0;
function fieldHtml(field, name, value, path) {
  const id = `f-${++uid}`, label = labelOf(field, name), help = field.help ? `<span class="ed-help">${esc(field.help)}</span>` : "";
  const wrap = body => `<div class="ed-field">${body}${help}</div>`;
  switch (field.type) {
    case "text":
      return wrap(`<label for="${id}">${esc(label)}${field.required ? " (required)" : ""}</label>${field.maxLength > 120
        ? `<textarea class="ed-textarea" id="${id}" maxlength="${field.maxLength}" data-f="text" ${pathAttr(path)}>${esc(value ?? "")}</textarea>`
        : `<input class="ed-input" id="${id}" maxlength="${field.maxLength}" data-f="text" ${pathAttr(path)} value="${esc(value ?? "")}">`}`);
    case "richtext":
      return wrap(`<span class="ed-fl" id="${id}-l">${esc(label)}</span><div class="ed-rich-bar" role="toolbar" aria-label="Formatting"><button type="button" class="ed-btn ed-small" data-cmd="bold">Bold</button><button type="button" class="ed-btn ed-small" data-cmd="italic">Italic</button><button type="button" class="ed-btn ed-small" data-cmd="insertUnorderedList">List</button></div><div class="ed-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-l" data-f="rich" ${pathAttr(path)}>${cleanRich(value)}</div>`);
    case "toggle":
      return wrap(`<label class="ed-check"><input type="checkbox" data-f="toggle" ${pathAttr(path)} ${value ? "checked" : ""}>${esc(label)}</label>`);
    case "select":
      return wrap(`<label for="${id}">${esc(label)}</label><select class="ed-select" id="${id}" data-f="select" ${pathAttr(path)}>${field.values.map(option => `<option value="${esc(option)}" ${String(option) === String(value) ? "selected" : ""}>${esc(humanise(String(option)))}</option>`).join("")}</select>`);
    case "colour": {
      const valid = /^#[0-9a-f]{6}$/i.test(value || "");
      return wrap(`<label for="${id}">${esc(label)}</label><div class="ed-colour"><input type="color" aria-label="${esc(label)} picker" data-f="colour-pick" ${pathAttr(path)} value="${valid ? esc(value) : "#000000"}"><input class="ed-input" id="${id}" data-f="colour" maxlength="7" ${pathAttr(path)} value="${esc(value ?? "")}" placeholder="#aabbcc"></div><span class="ed-error" data-err></span>`);
    }
    case "link":
      return wrap(`<label for="${id}">${esc(label)}${field.required ? " (required)" : ""}</label><input class="ed-input" id="${id}" list="ed-links" data-f="link" ${pathAttr(path)} value="${esc(value ?? "")}" placeholder="/collections/all or https://"><span class="ed-error" data-err>${value && !safeLayoutLink(value) ? "This link is not allowed." : ""}</span>`);
    case "product":
    case "collection": {
      const items = field.type === "product" ? data.products : data.collections;
      return wrap(`<label for="${id}">${esc(label)}${field.required ? " (required)" : ""}</label><select class="ed-select" id="${id}" data-f="pick" ${pathAttr(path)} ${items.length ? "" : "disabled"}><option value="">${items.length ? "None selected" : `No ${field.type}s yet`}</option>${items.map(item => `<option value="${esc(item.id)}" ${item.id === value ? "selected" : ""}>${esc(item.title || item.name || item.id)}</option>`).join("")}</select>`);
    }
    case "image":
    case "video":
      return wrap(mediaHtml(field, label, value, path));
    case "list":
      return wrap(listHtml(field, label, value || [], path));
    default: return "";
  }
}
function mediaHtml(field, label, media, path) {
  const kind = field.type, p = pathAttr(path), pa = `data-kind="${kind}"`;
  if (!media?.url) return `<span class="ed-fl">${esc(label)}${field.required ? " (required)" : ""}</span><div class="ed-media"><span class="ed-help">No ${kind} chosen.</span><div class="ed-media-row"><button type="button" class="ed-btn ed-small" data-act="pick" ${p} ${pa}>Choose from library</button></div></div>`;
  const fx = media.focalX ?? 0.5, fy = media.focalY ?? 0.5;
  return `<span class="ed-fl">${esc(label)}${field.required ? " (required)" : ""}</span><div class="ed-media">
    ${kind === "image" ? `<div class="ed-focal" data-focal ${p} role="img" aria-label="Focal point picker. Click the image to set the point that stays in view when it is cropped."><img src="${esc(media.url)}" alt="${esc(media.alt || "")}"><i style="left:${fx * 100}%;top:${fy * 100}%"></i></div>
    <div class="ed-range"><label for="fx-${uid}">Left to right</label><input id="fx-${uid}" type="range" min="0" max="100" value="${Math.round(fx * 100)}" data-f="focal-x" ${p}></div>
    <div class="ed-range"><label for="fy-${uid}">Top to bottom</label><input id="fy-${uid}" type="range" min="0" max="100" value="${Math.round(fy * 100)}" data-f="focal-y" ${p}></div>` : `<span class="ed-help">Video file: ${esc(media.url.split("/").pop())}</span>`}
    <label class="ed-fl" for="alt-${uid}">Alt text (required)</label><input class="ed-input" id="alt-${uid}" maxlength="500" data-f="alt" ${p} value="${esc(media.alt || "")}" placeholder="Describe what this shows" ${media.alt?.trim() ? "" : 'aria-invalid="true"'}>
    ${media.alt?.trim() ? "" : '<span class="ed-error">Alt text is required before this page can be saved.</span>'}
    <div class="ed-media-row"><button type="button" class="ed-btn ed-small" data-act="pick" ${p} ${pa}>Replace</button><button type="button" class="ed-btn ed-small ed-danger" data-act="media-remove" ${p}>Remove</button></div></div>`;
}
function itemTitle(item, fields) {
  const key = Object.keys(fields).find(name => ["text"].includes(fields[name].type) && String(item?.[name] || "").trim());
  return key ? String(item[key]).slice(0, 40) : "";
}
function listHtml(field, label, items, path, isBlocks = false) {
  const ro = readOnly(), fields = isBlocks ? field.blockFields : field.itemFields, max = isBlocks ? field.maxItems : field.maxItems, min = isBlocks ? field.minItems : field.minItems;
  const groupKey = JSON.stringify(path), p = pathAttr(path);
  const thumbs = isBlocks && fields.image ? `<div class="ed-gallery-grid">${items.map(item => item.settings.image?.url ? `<img src="${esc(item.settings.image.url)}" alt="">` : "<span></span>").join("")}</div>` : "";
  return `<span class="ed-fl">${esc(label)} <small class="ed-help">${items.length} of ${max}${min ? `, at least ${min} needed to show` : ""}</small></span>${thumbs}<div class="ed-list">${items.map((item, i) => {
    const values = isBlocks ? item.settings : item, base = isBlocks ? [...path, i, "settings"] : [...path, i];
    const op = (act, text, aria, disabled) => `<button type="button" class="ed-ico" data-act="${act}" ${p} data-i="${i}" aria-label="${aria} ${esc(label)} item ${i + 1}" ${disabled || ro ? "disabled" : ""}>${text}</button>`;
    return `<div class="ed-item" data-drag-group="${esc(groupKey)}" data-drag-index="${i}" ${ro ? "" : 'draggable="true"'}><div class="ed-item-head"><span class="ed-grip" aria-hidden="true">::</span><strong>${esc(itemTitle(values, fields) || `Item ${i + 1}`)}</strong>${op("list-up", "Up", "Move up", i === 0)}${op("list-down", "Down", "Move down", i === items.length - 1)}${op("list-dup", "Copy", "Duplicate", items.length >= max)}${op("list-del", "Delete", "Delete", false)}</div>${Object.entries(fields).map(([name, f]) => fieldHtml(f, name, values?.[name], [...base, name])).join("")}</div>`;
  }).join("")}</div><button type="button" class="ed-btn ed-small" data-act="list-add" ${p} ${ro || items.length >= max ? "disabled" : ""}>Add item</button>`;
}
function renderProps() {
  const panel = $("#ed-props"), section = selectedSection();
  if (!section) {
    const warnings = S.layoutWarnings(layoutNow(), data.settings || {}).length;
    panel.innerHTML = `<h2>${esc(pageName(current))}</h2><p class="ed-sub">Select a section in the list or click it in the preview to change its settings.</p><div class="ed-empty">Nothing selected.${warnings ? ` ${warnings} warning${warnings === 1 ? "" : "s"} to review in the left panel.` : ""}</div>${current === "checkout" ? "" : '<p class="ed-help">Cart, checkout, tracking and confirmation pages are fixed so customers can always pay safely. Only content sections are editable.</p>'}`;
    return;
  }
  const schema = SECTION_SCHEMAS[section.type], required = S.isRequired(section.type, current), ro = readOnly();
  const fieldNames = Object.entries(schema.fields).filter(([name]) => name !== "enabled");
  const blocks = schema.blockFields ? listHtml({ ...schema }, schema.blockLabel || "Items", section.blocks, ["blocks"], true) : "";
  const warnings = S.sectionWarnings(S.layoutWarnings(layoutNow(), data.settings || {}), section.id);
  panel.innerHTML = `<h2>${esc(schema.name)}</h2><p class="ed-sub">${required ? "Required on this page. It can be edited but not removed or hidden." : "Changes appear in the preview straight away."}</p>
    <p class="ed-error" id="ed-section-error" role="alert">${esc(validationError())}</p>
    ${warnings.map(item => `<div class="ed-warn" data-kind="${item.kind}">${esc(item.text)}</div>`).join("")}
    <fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0;min-width:0">
    ${required ? "" : `<div class="ed-field"><label class="ed-check"><input type="checkbox" data-f="toggle" ${pathAttr(["settings", "enabled"])} ${section.settings.enabled === false ? "" : "checked"}>Show on page</label></div>`}
    ${fieldNames.map(([name, field]) => fieldHtml(field, name, section.settings[name], ["settings", name])).join("")}${blocks}</fieldset>${ro ? '<p class="ed-help">You can look but not change settings on this device or role.</p>' : ""}`;
}

// ---------- panel events ----------
function valueFor(el) {
  switch (el.dataset.f) {
    case "toggle": return el.checked;
    case "rich": return richSerialize(el);
    case "pick": return el.value || null;
    default: return el.value;
  }
}
function fieldDef(path) {
  const section = selectedSection(), schema = SECTION_SCHEMAS[section.type];
  let fields = path[0] === "blocks" ? schema.blockFields : schema.fields, field = null;
  for (let i = path[0] === "blocks" ? 3 : 1; i < path.length; i++) {
    if (typeof path[i] === "number") continue;
    field = fields?.[path[i]]; fields = field?.itemFields;
  }
  return field;
}
const ptr = (el, extra = []) => ({ path: JSON.parse(el.dataset.path), extra });
const mediaAt = path => { const section = selectedSection(); return section ? S.getPath(section, path) : null; };
const setValue = (path, value, key, rerender) => mutate(layout => S.setSectionValue(layout, selectedId, path, value), { key: key ? `${selectedId}:${path.join(".")}` : null, rerender });

$("#ed-props").addEventListener("input", event => {
  const el = event.target.closest("[data-f]");
  if (!el || readOnly()) return;
  const path = JSON.parse(el.dataset.path || "[]"), kind = el.dataset.f;
  if (["text", "rich", "link", "colour"].includes(kind)) {
    const value = valueFor(el);
    if (kind === "link") { const err = el.parentElement.querySelector("[data-err]"); if (err) err.textContent = value && !safeLayoutLink(value) ? "This link is not allowed." : ""; }
    if (kind === "colour") {
      const ok = /^#[0-9a-f]{6}$/i.test(value), err = el.parentElement.parentElement.querySelector("[data-err]");
      if (err) err.textContent = ok || !value ? "" : "Use a six digit hex colour such as #3a5f4b.";
      if (ok) el.parentElement.querySelector("[type=color]").value = value;
    }
    setValue(path, value, true, "list");
  } else if (kind === "colour-pick") {
    el.parentElement.querySelector("[data-f=colour]").value = el.value;
    setValue(path, el.value, true, "list");
  } else if (kind === "alt") {
    const media = mediaAt(path); if (media) { setValue(path, { ...media, alt: el.value }, true, "list"); const err = el.parentElement.querySelector(".ed-error"); if (err) err.hidden = Boolean(el.value.trim()); el.setAttribute("aria-invalid", String(!el.value.trim())); }
  } else if (kind === "focal-x" || kind === "focal-y") {
    const media = mediaAt(path); if (!media) return;
    const next = S.setFocal(media, kind === "focal-x" ? el.value / 100 : media.focalX ?? 0.5, kind === "focal-y" ? el.value / 100 : media.focalY ?? 0.5);
    setValue(path, next, true, "list");
    const dot = el.closest(".ed-media").querySelector(".ed-focal i"); if (dot) { dot.style.left = `${next.focalX * 100}%`; dot.style.top = `${next.focalY * 100}%`; }
  }
});
$("#ed-props").addEventListener("change", event => {
  const el = event.target.closest("[data-f]");
  if (!el || readOnly() || !["toggle", "select", "pick"].includes(el.dataset.f)) return;
  const path = JSON.parse(el.dataset.path);
  let value = valueFor(el);
  if (el.dataset.f === "select") { const def = fieldDef(path); value = def.values.find(option => String(option) === el.value) ?? el.value; }
  if (el.dataset.f === "toggle" && path.join(".") === "settings.enabled" && S.isRequired(selectedSection().type, current)) return;
  setValue(path, value, false, path.join(".") === "settings.enabled" ? "all" : "list");
});
$("#ed-props").addEventListener("mousedown", event => { if (event.target.closest("[data-cmd]")) event.preventDefault(); });
$("#ed-props").addEventListener("click", event => {
  const cmd = event.target.closest("[data-cmd]");
  if (cmd) { const rich = cmd.closest(".ed-field").querySelector("[data-f=rich]"); rich.focus(); document.execCommand(cmd.dataset.cmd); rich.dispatchEvent(new Event("input", { bubbles: true })); return; }
  const focal = event.target.closest("[data-focal]");
  if (focal && !readOnly()) {
    const rect = focal.querySelector("img").getBoundingClientRect(), path = JSON.parse(focal.dataset.path), media = mediaAt(path);
    if (media && rect.width && rect.height) { setValue(path, S.setFocal(media, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height), true, "all"); }
    return;
  }
  const button = event.target.closest("[data-act]");
  if (!button || readOnly()) return;
  const act = button.dataset.act, path = button.dataset.path ? JSON.parse(button.dataset.path) : [], i = Number(button.dataset.i);
  if (act === "pick") return openMediaPicker(button.dataset.kind, path);
  if (act === "media-remove") return setValue(path, null, false, "all");
  const section = selectedSection(), isBlocks = path.length === 1 && path[0] === "blocks";
  if (act === "list-add") {
    if (isBlocks) mutate(layout => S.addBlock(layout, selectedId).layout);
    else { const def = fieldDef(path); mutate(layout => S.listOp(layout, selectedId, path, "add", 0, 0, def.itemFields)); }
  } else if (act === "list-del") mutate(layout => isBlocks ? S.removeBlock(layout, selectedId, i) : S.listOp(layout, selectedId, path, "remove", i));
  else if (act === "list-up" || act === "list-down") { const to = act === "list-up" ? i - 1 : i + 1; mutate(layout => isBlocks ? S.moveBlock(layout, selectedId, i, to) : S.listOp(layout, selectedId, path, "move", i, to)); }
  else if (act === "list-dup") mutate(layout => isBlocks ? S.duplicateBlock(layout, selectedId, i) : S.listOp(layout, selectedId, path, "duplicate", i));
  void section;
});

// ---------- section list events ----------
$("#ed-sections").addEventListener("click", event => {
  const select = event.target.closest("[data-select]");
  if (select) return selectSection(select.dataset.select);
  const button = event.target.closest("[data-act]");
  if (!button || readOnly()) return;
  const id = button.dataset.id, layout = layoutNow(), index = layout.findIndex(item => item.id === id), act = button.dataset.act;
  if (act === "sec-up") mutate(l => S.moveSection(l, index, index - 1));
  else if (act === "sec-down") mutate(l => S.moveSection(l, index, index + 1));
  else if (act === "sec-toggle") mutate(l => S.toggleSection(l, id, current));
  else if (act === "sec-dup") {
    let newId = null;
    mutate(l => { const r = S.duplicateSection(l, id, current); newId = r.id; return r.layout; });
    if (newId) { selectedId = newId; renderAll(); }
  } else if (act === "sec-del") {
    let removed = null, at = -1;
    mutate(l => { const r = S.deleteSection(l, id, current); removed = r.removed; at = r.index; return r.layout; });
    if (removed) toast(`Deleted ${S.sectionName(removed)}.`, { label: "Undo", run: () => { mutate(l => S.restoreSection(l, removed, at)); selectedId = removed.id; renderAll(); } });
  }
});
function wireDrag(container) {
  container.addEventListener("dragstart", event => {
    const el = event.target.closest?.("[data-drag-group]");
    if (!el || readOnly()) return;
    drag = { group: el.dataset.dragGroup, index: Number(el.dataset.dragIndex) };
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(drag.index));
    el.classList.add("is-dragging");
  });
  container.addEventListener("dragover", event => {
    const el = event.target.closest?.("[data-drag-group]");
    if (drag && el && el.dataset.dragGroup === drag.group) { event.preventDefault(); el.classList.add("is-over"); }
  });
  container.addEventListener("dragleave", event => event.target.closest?.("[data-drag-group]")?.classList.remove("is-over"));
  container.addEventListener("dragend", () => { drag = null; container.querySelectorAll(".is-over,.is-dragging").forEach(el => el.classList.remove("is-over", "is-dragging")); });
  container.addEventListener("drop", event => {
    const el = event.target.closest?.("[data-drag-group]");
    if (!drag || !el || el.dataset.dragGroup !== drag.group) return;
    event.preventDefault();
    const from = drag.index, to = Number(el.dataset.dragIndex), group = drag.group; drag = null;
    if (group === "sections") { if (!mutate(l => S.moveSection(l, from, to))) toast("That section cannot go there. Header and footer frame the page."); return; }
    const path = JSON.parse(group);
    mutate(l => path.length === 1 && path[0] === "blocks" ? S.moveBlock(l, selectedId, from, to) : S.listOp(l, selectedId, path, "move", from, to));
  });
}
wireDrag($("#ed-sections")); wireDrag($("#ed-props"));
$("#ed-sections").addEventListener("keydown", event => {
  const handle = event.target.closest("[data-reorder-handle]");
  if (!handle || readOnly() || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const id = handle.dataset.reorderHandle, from = layoutNow().findIndex(section => section.id === id);
  const to = from + (event.key === "ArrowUp" ? -1 : 1);
  if (!mutate(layout => S.moveSection(layout, from, to))) toast("That section cannot go there. Header and footer frame the page.");
  else toast(`Moved ${S.sectionName(layoutNow()[to])} to position ${to + 1}.`);
  $("#ed-sections").querySelector(`[data-reorder-handle="${CSS.escape(id)}"]`)?.focus();
});

// ---------- Aura starter layout and preview item ----------
function renderStarter() {
  const banner = $("#ed-starter-banner"), pickBox = $("#ed-preview-pick"), pick = $("#ed-preview-item");
  const btn = $("#ed-starter"); if (btn) btn.disabled = readOnly() || !["home", "collection", "product", "cart", "checkout"].includes(current);
  if (banner) {
    banner.hidden = !proposed.has(current);
    banner.innerHTML = proposed.has(current) ? `<p><strong>Aura starter layout preview.</strong> Nothing is saved yet. Your saved page is unchanged until you save.</p><div class="ed-banner-actions"><button type="button" class="ed-btn ed-small ed-primary" data-starter="save" ${readOnly() ? "disabled" : ""}>Save starter draft</button><button type="button" class="ed-btn ed-small" data-starter="discard">Discard preview</button></div>` : "";
  }
  if (!pickBox) return;
  const withCollections = (data.products || []).some(item => Array.isArray(item.collection_ids));
  const items = current === "product" ? (data.products || []).map(item => [item.id, item.title]) : current === "collection" && withCollections ? (data.collections || []).map(item => [item.id, item.title || item.name]) : [];
  pickBox.hidden = !items.length;
  if (items.length) {
    pickBox.querySelector("label").textContent = current === "product" ? "Preview product" : "Preview collection";
    pick.innerHTML = `<option value="">${current === "product" ? "First product" : "All products"}</option>${items.map(([id, name]) => `<option value="${esc(id)}" ${previewItem[current] === id ? "selected" : ""}>${esc(name || id)}</option>`).join("")}`;
  }
}
$("#ed-preview-item")?.addEventListener("change", event => { previewItem[current] = event.target.value; schedulePreview(); });
function applyStarter(key) {
  const merged = mergeStarter(S.pageLayout(pages[key]), key, data);
  proposed.set(key, proposed.get(key) || structuredClone(S.pageLayout(pages[key])));
  cur().history = S.commit(cur().history, merged, { now: Date.now() });
  undoTags.push({ t: "page", key }); redoTags = [];
  selectedId = null; renderAll();
}
$("#ed-starter")?.addEventListener("click", () => {
  if (readOnly()) return;
  const modal = openModal("Use Aura starter layout", `<p>This arranges the ${esc(pageName(current))} page in the Aura starter order. Your existing text, images, links and custom sections are kept. Sections without content are added hidden.</p><p class="ed-help">It opens as a preview. Nothing is saved or published until you choose Save starter draft.</p>`, `<button type="button" class="ed-btn" data-close>Cancel</button><button type="button" class="ed-btn ed-primary" id="ed-starter-go">Preview starter layout</button>`);
  modal.footer.querySelector("#ed-starter-go").addEventListener("click", () => { modal.close(); applyStarter(current); });
});
$("#ed-starter-banner")?.addEventListener("click", async event => {
  const b = event.target.closest("[data-starter]"); if (!b) return;
  const key = current;
  if (b.dataset.starter === "save") {
    const problem = validationError(key);
    if (problem) { toast(`Fix this before saving: ${problem}`); return; }
    const ok = await savePage(key, true);
    if (conflicts.has(key)) { toast("This page changed elsewhere. Choose a version in the banner above. The starter is still a preview."); return; }
    if (ok && !saveErrors.has(key)) { proposed.delete(key); renderAll(); toast("Starter draft saved."); if (isDirtyKey(key)) scheduleSave(); }
    else toast("Could not save the starter draft. It is still a preview and nothing was changed.");
  }
  else { cur().history = S.commit(cur().history, proposed.get(key), { now: Date.now() }); proposed.delete(key); selectedId = null; renderAll(); }
});

// ---------- add section ----------
const THUMB_KIND = { hero: "hero", gallery: "grid", craft: "grid", lookbook: "grid", "product-grid": "grid", "featured-collection": "grid", spotlight: "hero", press: "logos", trust: "logos", reviews: "quote" };
function thumb(type) {
  const kind = THUMB_KIND[type] || "text";
  if (kind === "hero") return `<div class="ed-card-art"><i style="height:36px;width:100%;background:#a79d8c"></i><i></i><i style="width:40%"></i></div>`;
  if (kind === "grid") return `<div class="ed-card-art" style="grid-template-columns:repeat(3,1fr)">${"<i style=\"height:26px\"></i>".repeat(6)}</div>`;
  if (kind === "logos") return `<div class="ed-card-art" style="grid-template-columns:repeat(4,1fr)">${"<i style=\"height:14px\"></i>".repeat(4)}</div>`;
  if (kind === "quote") return `<div class="ed-card-art"><i style="width:30%"></i><i></i><i></i><i style="width:55%"></i></div>`;
  return `<div class="ed-card-art"><i></i><i></i><i style="width:70%"></i><i style="width:45%"></i></div>`;
}
const TYPE_HELP = { faq: "Questions and answers you write", "material-care": "Materials and care notes", "how-to-use": "Numbered usage steps", "product-specs": "Facts such as dimensions", "size-guide": "A size and measurement table", "shipping-info": "Delivery and returns notes", "related-products": "Other products from your store", "featured-products": "Products you pick by hand", "collection-heading": "A short introduction", "collection-nav": "Switch between your collections", "collection-description": "Longer collection text", hero: "A large headline with image or video", statement: "One strong sentence", "featured-collection": "Show products from a collection", spotlight: "Feature a single product", lookbook: "Editorial product images", founder: "Your story with a portrait", craft: "Show materials and making", reviews: "Customer reviews", press: "Where you have been featured", gallery: "A grid of photos", trust: "Delivery and returns assurances", announcement: "A thin message above the header", about: "Tell your story", contact: "How to reach you" };
function openAddSection() {
  if (readOnly()) return;
  const types = S.addableTypes(current, layoutNow(), skeleton);
  const modal = openModal("Add a section", types.length ? `<p class="ed-help">Sections available on the ${esc(pageName(current))} page.</p><div class="ed-cards">${types.map(schema => `<button type="button" class="ed-card" data-type="${esc(schema.id)}">${thumb(schema.id)}<strong>${esc(schema.name)}</strong><small>${esc(TYPE_HELP[schema.id] || "Content section")}</small></button>`).join("")}</div>` : `<div class="ed-empty">No other sections can be added to this page.</div>`);
  modal.body.addEventListener("click", event => {
    const card = event.target.closest("[data-type]");
    if (!card) return;
    const result = S.addSection(layoutNow(), card.dataset.type, current, context, undefined, skeleton);
    if (!result.id) { toast("That section could not be added."); return; }
    mutate(() => result.layout);
    selectedId = result.id; modal.close(); renderAll();
    if (result.hidden) toast("Added as hidden. Fill in the required settings, then turn on Show on page.");
  });
}

// ---------- media ----------
const kindOfUrl = url => /\.(mp4|webm)$/i.test(url || "") ? "video" : "image";
async function loadMedia(force = false) {
  if (mediaCache && !force) return mediaCache;
  try { const result = await api(`${API}/media`); mediaCache = Array.isArray(result.media) ? result.media : []; mediaCursor = S.nextOffset(result.nextCursor); mediaError = ""; }
  catch (error) { mediaError = error.message; mediaCache = null; mediaCursor = null; }
  return mediaCache;
}
async function loadMoreMedia() {
  if (mediaCursor == null) return false;
  const result = await api(`${API}/media?offset=${mediaCursor}`);
  const before = mediaCache.length;
  mediaCache = S.mergeMedia(mediaCache, Array.isArray(result.media) ? result.media : []);
  const next = S.nextOffset(result.nextCursor);
  mediaCursor = next !== null && next !== mediaCursor && (mediaCache.length > before || next > mediaCursor) ? next : null;
  return true;
}
async function openMediaPicker(kind, path) {
  const modal = openModal(kind === "video" ? "Choose a video" : "Choose an image", `<div class="ed-skeleton"></div><div class="ed-skeleton"></div>`, `<button type="button" class="ed-btn" data-close>Cancel</button><button type="button" class="ed-btn ed-primary" id="ed-use" disabled>Use this ${kind}</button>`);
  let selected = null, pickAlt = "", items = [];
  const paint = list => {
    items = (list || []).filter(item => kindOfUrl(item.url) === kind);
    modal.body.innerHTML = `${mediaError ? `<div class="ed-error" role="alert">${esc(mediaError)} <button type="button" class="ed-btn ed-small" id="ed-media-retry">Try again</button></div>` : ""}
      <form class="ed-field" id="ed-upload" style="border:1px solid var(--ed-line);border-radius:8px;padding:10px;background:#fff"><span class="ed-fl">Upload a new ${kind}</span>
        <input type="file" id="ed-file" accept="${kind === "video" ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp,image/avif"}" required>
        <label for="ed-upload-alt" class="ed-fl">Alt text (required)</label><input class="ed-input" id="ed-upload-alt" maxlength="500" required placeholder="Describe what this shows">
        <span class="ed-help">${kind === "video" ? "MP4 or WebM, up to 10 MB. Add a poster image too." : "JPG, PNG or WebP up to 10 MB. Large photos are resized in your browser first."}</span>
        <span class="ed-error" id="ed-upload-error" role="alert"></span><div><button class="ed-btn ed-small ed-primary" type="submit">Upload and use</button></div></form>
      <h3 style="margin:4px 0;font-size:14px">Your library</h3>
      <div id="ed-lib"></div>`;
    const paintLib = () => {
      const q = mediaSearch.trim().toLowerCase(), lib = $("#ed-lib", modal.body);
      const shown = items.filter(item => !q || `${item.alt || ""} ${(item.url || "").split("/").pop()}`.toLowerCase().includes(q));
      lib.innerHTML = `<input class="ed-input" id="ed-media-search" type="search" placeholder="Search by description or file name" aria-label="Search library" value="${esc(mediaSearch)}">
      ${shown.length ? `<div class="ed-media-grid">${shown.map(item => `<button type="button" class="ed-media-card" data-media="${esc(item.url)}" aria-pressed="${selected?.url === item.url}">${kind === "image" ? `<img src="${esc(item.url)}" alt="${esc(item.alt || "")}" loading="lazy">` : '<span class="ed-empty" style="display:block;padding:24px 0">Video</span>'}<small>${esc(item.alt || "No alt text")}</small></button>`).join("")}</div>` : `<div class="ed-empty">${!mediaCache ? "Your library could not be loaded." : q ? "No loaded items match your search." : `Nothing uploaded yet. Upload a ${kind} above.`}</div>`}
      ${mediaCursor != null ? `<div><button type="button" class="ed-btn ed-small" id="ed-media-more">Load more</button> <span class="ed-error" id="ed-more-error" role="alert"></span></div>` : ""}
      <div id="ed-pick-alt" ${selected ? "" : "hidden"} class="ed-field"><label for="ed-pick-alt-input" class="ed-fl">Alt text for this use (required)</label><input class="ed-input" id="ed-pick-alt-input" maxlength="500" value="${esc(pickAlt)}"></div>`;
      $("#ed-use", modal.shade).disabled = !selected;
      $("#ed-media-search", lib).addEventListener("input", event => { mediaSearch = event.target.value; paintLib(); const el = $("#ed-media-search", lib); el.focus(); el.setSelectionRange(mediaSearch.length, mediaSearch.length); });
      $("#ed-pick-alt-input", lib).addEventListener("input", event => { pickAlt = event.target.value; });
      lib.querySelectorAll("[data-media]").forEach(button => button.addEventListener("click", () => {
        selected = items.find(item => item.url === button.dataset.media); pickAlt = selected.alt || "";
        lib.querySelectorAll("[data-media]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
        const box = $("#ed-pick-alt", lib); box.hidden = false; $("#ed-pick-alt-input", lib).value = pickAlt; $("#ed-use", modal.shade).disabled = false;
      }));
      $("#ed-media-more", lib)?.addEventListener("click", async event => {
        event.target.disabled = true;
        try { await loadMoreMedia(); items = mediaCache.filter(item => kindOfUrl(item.url) === kind); paintLib(); }
        catch (error) { event.target.disabled = false; $("#ed-more-error", lib).textContent = error.message; }
      });
    };
    paintLib();
    $("#ed-media-retry", modal.body)?.addEventListener("click", async () => { paint(await loadMedia(true)); });
    $("#ed-upload", modal.body).addEventListener("submit", async event => {
      event.preventDefault();
      const file = $("#ed-file", modal.body).files[0], alt = $("#ed-upload-alt", modal.body).value.trim(), errorNode = $("#ed-upload-error", modal.body);
      errorNode.textContent = "";
      if (!file) { errorNode.textContent = "Choose a file."; return; }
      if (!alt) { errorNode.textContent = "Alt text is required."; return; }
      const submit = event.submitter; if (submit) submit.disabled = true;
      try {
        if (kind === "image") {
          const { media, warning } = await uploadAuraImage(file, { api, base: API, alt });
          mediaCache = [{ ...media }, ...(mediaCache || [])];
          if (warning) toast(warning);
          applyMedia(path, media); modal.close(); return;
        }
        const upload = file;
        if (!["video/mp4", "video/webm"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose an MP4 or WebM video under 10 MB.");
        const form = new FormData(); form.append("file", upload); form.append("type", kind); form.append("alt", alt);
        const result = await api(`${API}/media`, { method: "POST", body: form });
        if (!result.media?.url) throw new Error("The upload did not return media details.");
        mediaCache = [result.media, ...(mediaCache || [])];
        applyMedia(path, S.mediaFromRecord(result.media, result.media.alt || alt)); modal.close();
      } catch (error) { errorNode.textContent = error.message; if (submit) submit.disabled = false; }
    });
  };
  paint(await loadMedia());
  $("#ed-use", modal.shade).addEventListener("click", () => {
    if (!selected) return;
    const alt = ($("#ed-pick-alt-input", modal.body)?.value || "").trim();
    if (!alt) { $("#ed-pick-alt-input", modal.body).setAttribute("aria-invalid", "true"); toast("Alt text is required."); return; }
    applyMedia(path, S.mediaFromRecord(selected, alt)); modal.close();
  });
}
function applyMedia(path, media) {
  const existing = mediaAt(path);
  setValue(path, existing?.url === media.url && existing.focalX != null ? { ...media, focalX: existing.focalX, focalY: existing.focalY } : media, false, "all");
}

// ---------- theme ----------
const PRESETS = [["ivory", "Ivory and ink"], ["stone", "Stone"], ["midnight", "Midnight"], ["white", "Pure white"]];
function openTheme() {
  const s = data.settings || (data.settings = {}), ro = readOnly();
  const preset = ({ porcelain: "ivory", sand: "ivory", ink: "midnight" })[s.color_preset] || s.color_preset || "white";
  const accent = /^#[0-9a-f]{6}$/i.test(s.accent_color || "") ? s.accent_color : "#3d4a43";
  const check = S.accentCheck(accent, preset);
  const modal = openModal("Theme", `<fieldset ${ro ? "disabled" : ""} style="border:0;padding:0;margin:0;display:grid;gap:14px">
    <div class="ed-field"><span class="ed-fl">Colour preset</span><div class="ed-swatches">${PRESETS.map(([key, name]) => `<button type="button" class="ed-swatch" data-preset="${key}" aria-pressed="${key === preset}"><span style="background:${S.PRESET_PAPER[key]}"></span>${esc(name)}</button>`).join("")}</div></div>
    <div class="ed-field"><label for="th-accent" class="ed-fl">Accent colour</label><div class="ed-colour"><input type="color" id="th-accent-pick" aria-label="Accent colour picker" value="${esc(accent)}"><input class="ed-input" id="th-accent" maxlength="7" value="${esc(accent)}"></div><span id="th-contrast" role="status" class="${check.passes ? "ed-help" : "ed-error"}"></span></div>
    <div class="ed-field"><label for="th-font" class="ed-fl">Type preset</label><select class="ed-select" id="th-font">${[["serif", "Studio serif"], ["modern", "Contemporary sans"], ["classic", "Classic book"]].map(([v, l]) => `<option value="${v}" ${(s.font_preset || "modern") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="ed-field"><label for="th-button" class="ed-fl">Button style</label><select class="ed-select" id="th-button">${[["rounded", "Soft corners"], ["square", "Square"], ["pill", "Pill"]].map(([v, l]) => `<option value="${v}" ${(s.button_style || "rounded") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <p class="ed-help" id="th-state" role="status">${ro ? "You cannot change the theme on this device or role." : "Theme changes save to your draft automatically and show in the preview."}</p></fieldset>`, `<button type="button" class="ed-btn ed-primary" data-close>Done</button>`);
  const contrast = () => {
    const c = S.accentCheck($("#th-accent", modal.body).value, (data.settings.color_preset || "white")), node = $("#th-contrast", modal.body);
    node.className = c.passes ? "ed-help" : "ed-error";
    node.textContent = c.ratio == null ? "Enter a six digit hex colour." : `Contrast with the page background: ${c.ratio.toFixed(1)}:1. ${c.passes ? "Good for text." : c.large ? "Fine for large text only. Pick a darker or lighter shade for body text." : "Too low. Buttons and links may be hard to read."}`;
  };
  contrast();
  const apply = patch => { const before = themeHist.present, next = { ...before, ...patch }, had = themeHist.past.length;
    themeHist = S.commit(themeHist, next, { key: `theme:${Object.keys(patch)[0]}`, now: Date.now() });
    if (themeHist.past.length !== had) undoTags.push({ t: "theme" });
    redoTags = []; setStatus();
    Object.assign(data.settings, patch); Object.assign(themeDirty, patch); themeError = ""; schedulePreview(); renderWarnings(); clearTimeout(themeTimer); $("#th-state", modal.body).textContent = "Saving"; themeTimer = setTimeout(saveTheme, 700); };
  modal.body.addEventListener("click", event => {
    const swatch = event.target.closest("[data-preset]"); if (!swatch) return;
    modal.body.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", String(b === swatch)));
    apply({ color_preset: swatch.dataset.preset }); contrast();
  });
  modal.body.addEventListener("input", event => {
    if (event.target.id === "th-accent-pick") { $("#th-accent", modal.body).value = event.target.value; apply({ accent_color: event.target.value }); contrast(); }
    if (event.target.id === "th-accent") { const v = event.target.value; contrast(); if (/^#[0-9a-f]{6}$/i.test(v)) { $("#th-accent-pick", modal.body).value = v; apply({ accent_color: v }); } }
  });
  modal.body.addEventListener("change", event => {
    if (event.target.id === "th-font") apply({ font_preset: event.target.value });
    if (event.target.id === "th-button") apply({ button_style: event.target.value });
  });
}
async function saveTheme() {
  if (themeSaving) { await themeSaving; }
  const patch = { ...themeDirty }; themeDirty = {};
  if (!Object.keys(patch).length) return true;
  themeSaving = (async () => {
    try { await api(`${API}/setup`, { method: "PATCH", body: JSON.stringify({ settings: patch }) }); const node = $("#th-state"); if (node) node.textContent = "Theme saved to your draft."; return true; }
    catch (error) { themeError = error.message; themeDirty = { ...patch, ...themeDirty }; const node = $("#th-state"); if (node) { node.className = "ed-error"; node.textContent = `Theme not saved: ${error.message}`; } toast(`Theme not saved: ${error.message}`, { label: "Retry", run: saveTheme }); return false; }
  })();
  const ok = await themeSaving; themeSaving = null; return ok;
}
async function flushTheme() {
  clearTimeout(themeTimer);
  if (themeSaving) await themeSaving;
  const ok = await saveTheme();
  return ok && !Object.keys(themeDirty).length;
}

// ---------- history and publish ----------
const dateText = value => { try { return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
async function openHistory() {
  const key = current, modal = openModal(`Version history: ${pageName(key)}`, `<div class="ed-skeleton"></div><div class="ed-skeleton"></div>`);
  let rows;
  try { rows = await api(`${API}/pages/${encodeURIComponent(key)}/history`); if (!Array.isArray(rows)) throw new Error("History could not be read."); }
  catch (error) { modal.body.innerHTML = `<div class="ed-error" role="alert">${esc(error.message)}</div>`; return; }
  if (!rows.length) { modal.body.innerHTML = `<div class="ed-empty">No published versions yet. Versions appear here after you publish.</div>`; return; }
  modal.body.innerHTML = `<p class="ed-help">The last ${rows.length} published versions. Restoring puts that version in your draft. It goes live only when you publish.</p>${cur().history.past.length || S.isDirty(cur()) ? `<p class="ed-warn" data-kind="performance">Your unsaved edits on this page will be replaced. You can still undo after restoring.</p>` : ""}<div class="ed-versions">${rows.map((row, i) => `<div class="ed-version"><div><strong>Version ${row.version}${i === 0 ? " (live now)" : ""}</strong><br><small class="ed-help">${esc(dateText(row.created_at))}</small><br><small class="ed-help">${esc(S.diffLayouts(row.layout, S.pageLayout(pages[key])).map(c => c.text).join("; ") || "Same as your draft")}</small></div><button type="button" class="ed-btn ed-small" data-restore="${row.version}" ${readOnly() ? "disabled" : ""}>Restore</button></div>`).join("")}</div>`;
  modal.body.addEventListener("click", async event => {
    const button = event.target.closest("[data-restore]"); if (!button) return;
    button.disabled = true;
    try {
      const before = S.pageLayout(pages[key]);
      await api(`${API}/pages/${encodeURIComponent(key)}/restore`, { method: "POST", body: JSON.stringify({ version: Number(button.dataset.restore), expected_version: pages[key].version }) });
      const remote = await fetchPage(key);
      const keepHistory = pages[key].history;
      pages[key] = S.adoptRemote(remote.layout, remote.version);
      pages[key].history = S.commit({ ...keepHistory, present: before, past: keepHistory.past.slice(-99), future: [] }, remote.layout, { now: Date.now() });
      pages[key].savedJson = JSON.stringify(remote.layout);
      conflicts.delete(key); selectedId = null; modal.close(); renderAll(); toast(`Restored version ${button.dataset.restore} to your draft.`);
    } catch (error) {
      if (error.status === 409) { conflicts.add(key); modal.close(); setStatus(); } else { button.disabled = false; toast(`Could not restore: ${error.message}`); }
    }
  });
}
async function openPublish() {
  if (!canPublish) return;
  const modal = openModal("Review and publish", `<div class="ed-skeleton"></div><div class="ed-skeleton"></div><p class="ed-help">Saving your latest edits</p>`, `<button type="button" class="ed-btn" data-close>Cancel</button><button type="button" class="ed-btn ed-primary" id="ed-go" disabled>Publish changes</button>`);
  const themeOk = await flushTheme();
  const saved = await saveAll();
  const blockers = EDIT_PAGES.filter(key => proposed.has(key) || conflicts.has(key) || saveErrors.has(key) || validationError(key) || isDirtyKey(key));
  if (!themeOk || !saved || blockers.length) {
    modal.body.innerHTML = `<div class="ed-error" role="alert">Fix these before publishing:</div><ul class="ed-change">${themeOk ? "" : `<li>Theme: ${esc(themeError || "not saved yet")}</li>`}${blockers.map(key => `<li>${esc(pageName(key))}: ${esc(proposed.has(key) ? "starter layout preview is not saved. Save the starter draft or discard it" : conflicts.has(key) ? "changed in another tab" : saveErrors.get(key) || validationError(key) || "not saved yet")}</li>`).join("")}</ul>`;
    return;
  }
  const results = await Promise.all(EDIT_PAGES.map(async key => {
    try { const rows = await api(`${API}/pages/${encodeURIComponent(key)}/history`); return { key, published: Array.isArray(rows) && rows[0] ? rows[0].layout : null }; }
    catch (error) { return { key, error: error.message }; }
  }));
  const failed = results.filter(item => item.error);
  if (failed.length) { modal.body.innerHTML = `<div class="ed-error" role="alert">Could not compare with the live store: ${esc(failed[0].error)}</div>`; return; }
  const changes = results.map(({ key, published }) => {
    const draft = S.pageLayout(pages[key]);
    if (!published && JSON.stringify(draft) === JSON.stringify(defaults[key])) return null;
    const list = S.diffLayouts(published, draft);
    return list.length || !published ? { key, list: published ? list : [{ text: "First publish of this page" }] } : null;
  }).filter(Boolean);
  const themeLines = S.themeChanges(data.published_settings ? { ...data.published_settings } : null, data.settings || {});
  const warnings = EDIT_PAGES.flatMap(key => S.layoutWarnings(S.pageLayout(pages[key]), data.settings || {}).map(w => ({ ...w, key })));
  modal.body.innerHTML = `${themeLines.length ? `<div class="ed-page-change"><h3>Theme</h3><ul class="ed-change">${themeLines.map(line => `<li>${esc(line)}</li>`).join("")}</ul></div>` : ""}${changes.length ? changes.map(item => `<div class="ed-page-change"><h3>${esc(pageName(item.key))}</h3><ul class="ed-change">${item.list.map(c => `<li>${esc(c.text)}</li>`).join("")}</ul></div>`).join("") : `<div class="ed-empty">${themeLines.length ? "No page changes since the last publish." : "No page or theme changes since the last publish. Publishing will still refresh catalogue changes."}</div>`}
    ${warnings.length ? `<div><h3 style="font-size:14px;margin:4px 0">Warnings (you can still publish)</h3>${[...new Map(warnings.map(w => [w.key + w.text, w])).values()].map(w => `<div class="ed-warn" data-kind="${w.kind}"><b>${esc(pageName(w.key))}</b>${esc(w.text)}</div>`).join("")}</div>` : ""}<div class="ed-error" id="ed-publish-error" role="alert"></div>`;
  const go = $("#ed-go", modal.shade); go.disabled = false;
  go.addEventListener("click", async () => {
    go.disabled = true; go.textContent = "Publishing";
    try {
      const result = await api(`${API}/publish`, { method: "POST", body: JSON.stringify({}) });
      await Promise.all(EDIT_PAGES.map(async key => { try { const remote = await fetchPage(key); if (!S.isDirty(pages[key])) pages[key] = { ...pages[key], version: remote.version }; } catch { /* next autosave check will surface it */ } }));
      data.published_settings = { ...(data.published_settings || {}), ...S.themeSnapshot(data.settings || {}) }; themeBase = S.themeSnapshot(data.published_settings);
      const status = result?.store?.status || result?.data?.store?.status;
      modal.body.innerHTML = `<div class="ed-empty" role="status"><strong>${status === "awaiting_approval" ? "Submitted for approval." : "Published."}</strong><br>${status === "awaiting_approval" ? "Your storefront stays offline until a reviewer approves it." : "Your changes are live."}</div>`;
      modal.footer.innerHTML = `<button type="button" class="ed-btn ed-primary" data-close>Close</button>`; setStatus();
    } catch (error) { go.disabled = false; go.textContent = "Try again"; $("#ed-publish-error", modal.body).textContent = error.message; }
  });
}

// ---------- preview ----------
const PREVIEW_STYLE = `<style>[data-lb-section]{cursor:pointer}[data-lb-section]:hover{outline:2px dashed rgba(45,37,39,.6);outline-offset:-2px}[data-lb-section].lb-selected{outline:3px solid #2d2527;outline-offset:-3px;box-shadow:inset 0 0 0 6px rgba(255,255,255,.85)}[data-lb-section]:focus-visible{outline:3px solid #1d4f91;outline-offset:-3px}[contenteditable]{outline:2px solid #1d4f91!important;outline-offset:2px;cursor:text}a{cursor:pointer}</style>`;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 160); }
function renderPreview() {
  const frame = $("#ed-preview");
  try { lastScroll = frame.contentDocument?.scrollingElement?.scrollTop || lastScroll; } catch { /* first render */ }
  const layouts = Object.fromEntries(EDIT_PAGES.map(key => [key, S.pageLayout(pages[key])]));
  const settings = { ...(data.settings || {}) }; settings.brand_name = settings.brand_name || data.store?.name; settings.subdomain = settings.subdomain || data.store?.subdomain;
  let html;
  const pick = previewItem[current];
  const shown = current === "collection" && pick ? (data.products || []).filter(item => (item.collection_ids || []).includes(pick)) : data.products;
  try { html = renderAura({ ...data, products: shown, settings, layouts }, { ...S.previewOptions(current), productId: (current === "product" && pick) || data.products?.[0]?.id, preview: true, embeddedPreview: true, editorAnnotate: true, editorSkeleton: skeleton, readOnly: true }); }
  catch (error) { html = `<!doctype html><body style="font-family:sans-serif;padding:24px">Preview could not be drawn: ${esc(error.message)}</body>`; }
  frame.srcdoc = html.replace("</head>", `${PREVIEW_STYLE}</head>`);
}
function markPreviewSelection(scroll) {
  const doc = $("#ed-preview").contentDocument; if (!doc) return;
  doc.querySelectorAll(".lb-selected").forEach(el => el.classList.remove("lb-selected"));
  if (!selectedId) return;
  const el = doc.querySelector(`[data-lb-section="${CSS.escape(selectedId)}"]`);
  if (el) { el.classList.add("lb-selected"); if (scroll) el.scrollIntoView({ block: "nearest" }); }
}
function startInline(el, info, section) {
  if (inlineActive || readOnly()) return;
  inlineActive = true;
  const original = el.textContent;
  el.contentEditable = "plaintext-only"; if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  el.focus();
  const doc = el.ownerDocument, range = doc.createRange(); range.selectNodeContents(el); const sel = doc.defaultView.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const finish = commit => {
    el.removeEventListener("blur", onBlur); el.removeEventListener("keydown", onKey);
    el.removeAttribute("contenteditable"); inlineActive = false;
    const value = el.textContent.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, info.maxLength);
    if (commit && value !== String(S.getPath(section, info.path) ?? "").trim()) {
      mutate(layout => S.setSectionValue(layout, section.id, info.path, value), { key: `${section.id}:${info.path.join(".")}` });
    } else if (!commit) el.textContent = original;
  };
  const onBlur = () => finish(true);
  const onKey = event => { if (event.key === "Enter") { event.preventDefault(); el.blur(); } else if (event.key === "Escape") { event.preventDefault(); el.removeEventListener("blur", onBlur); finish(false); } };
  const onPaste = event => { event.preventDefault(); doc.execCommand("insertText", false, (event.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " ")); };
  el.addEventListener("blur", onBlur); el.addEventListener("keydown", onKey); el.addEventListener("paste", onPaste, { once: false });
}
function wirePreview() {
  const frame = $("#ed-preview"), doc = frame.contentDocument; if (!doc) return;
  attachAuraSearch(doc,{products:data.products||[]});
  if (lastScroll) doc.scrollingElement.scrollTop = lastScroll;
  doc.querySelectorAll("[data-lb-section]").forEach(el => {
    const section = layoutNow().find(item => item.id === el.dataset.lbSection);
    el.tabIndex = 0; el.setAttribute("aria-label", `Select ${S.sectionName(section)} section`);
  });
  markPreviewSelection(false);
  doc.addEventListener("click", event => {
    if (event.target.closest("[data-search-open], .au-search-dialog")) return;
    const anchor = event.target.closest("a,button,form"); if (anchor) event.preventDefault();
    if (inlineActive && event.target.isContentEditable) return;
    const host = event.target.closest("[data-lb-section]"); if (!host || phone.matches) return;
    const section = layoutNow().find(item => item.id === host.dataset.lbSection); if (!section) return;
    if (selectedId !== section.id) { selectedId = section.id; renderSections(); renderProps(); markPreviewSelection(false); }
    const text = event.target.closest("h1,h2,h3,h4,p,span,a,button,li,small,blockquote,figcaption,strong,em,div");
    const info = text && !text.children.length ? S.findTextField(section, text.textContent) : null;
    if (info) startInline(text, info, section);
  });
  doc.addEventListener("keydown", event => {
    if (event.target.matches?.("[data-lb-section]") && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectSection(event.target.dataset.lbSection, { focusPanel: true }); }
    else if (!event.target.isContentEditable) handleKeys(event);
  });
}
$("#ed-preview").addEventListener("load", wirePreview);

// ---------- keyboard and global events ----------
function handleKeys(event) {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === "s") { event.preventDefault(); saveAll(); return; }
  if (!["z", "y"].includes(key)) return;
  const target = event.target;
  if (target?.isContentEditable || ["INPUT", "TEXTAREA"].includes(target?.tagName) && !["checkbox", "range", "color"].includes(target.type)) return;
  event.preventDefault();
  undoRedo(key === "y" || event.shiftKey ? "redo" : "undo");
}
document.addEventListener("keydown", handleKeys);
$("#ed-undo").addEventListener("click", () => undoRedo("undo"));
$("#ed-redo").addEventListener("click", () => undoRedo("redo"));
$("#ed-add").addEventListener("click", openAddSection);
$("#ed-theme").addEventListener("click", openTheme);
$("#ed-history").addEventListener("click", openHistory);
$("#ed-publish")?.addEventListener("click", openPublish);
$("#ed-page").addEventListener("change", event => switchPage(event.target.value));
$("#ed-status").addEventListener("click", event => { if (event.target.closest("#ed-retry")) { saveErrors.clear(); saveAll(); } });
$("#ed-banner").addEventListener("click", event => { const b = event.target.closest("[data-conflict]"); if (b) resolveConflict(b.dataset.page, b.dataset.conflict); });
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  view = button.dataset.view; $("#ed-frame").dataset.view = view;
  document.querySelectorAll(".ed-seg [data-view]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
}));
window.addEventListener("beforeunload", event => {
  if (EDIT_PAGES.some(isDirtyKey) || inflight.size || Object.keys(themeDirty).length) { event.preventDefault(); event.returnValue = ""; }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) saveAll(); else checkRemote(); });
window.addEventListener("focus", checkRemote);
setInterval(checkRemote, 30000);
phone.addEventListener("change", () => renderAll());

// datalist of link suggestions
const datalist = document.createElement("datalist"); datalist.id = "ed-links";
datalist.innerHTML = S.linkSuggestions(data).map(value => `<option value="${esc(value)}"></option>`).join("");
root.append(datalist);

function renderAll() { renderStarter(); renderPageSelect(); renderSections(); renderProps(); renderWarnings(); setStatus(); schedulePreview(); }
if (!$("#ed-page")) throw new Error("Editor shell is missing.");
renderAll();
