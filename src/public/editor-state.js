// Pure editor state. No DOM, no network. Every function returns new values and never mutates its inputs.
import { SECTION_SCHEMAS, PAGE_KEYS, validateLayout } from "./aura-layout.js";
import { AURA_SKELETON_TYPES } from "./sections/index.js";

export const EDITABLE_PAGES = ["home", "collection", "product", "about", "contact", "policy-privacy", "policy-terms", "policy-shipping", "policy-cancellation-refund", "policy-contact", "policy-pricing", "404"].filter(key => PAGE_KEYS.includes(key));
export const PAGE_LABELS = { home: "Home", collection: "Collection", product: "Product", about: "About", contact: "Contact", "policy-privacy": "Privacy policy", "policy-terms": "Terms", "policy-shipping": "Shipping policy", "policy-cancellation-refund": "Cancellation and refunds", "policy-contact": "Contact policy", "policy-pricing": "Pricing policy", "404": "Page not found", cart: "Cart", checkout: "Checkout" };
export const LOCKED_PAGES = ["cart", "checkout", "track", "confirmation"];
export const MAX_SECTIONS = 30;
export const PERF_SECTION_LIMIT = 16;
export const clone = value => structuredClone(value);
export const canEditRole = role => ["owner", "admin", "staff", "editor"].includes(role);
export const canPublishRole = role => role === "owner" || role === "admin";
export const isEditablePage = key => EDITABLE_PAGES.includes(key);

let counter = 0;
export function newId(prefix = "s", random = Math.random) {
  counter += 1;
  return `${prefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || "s"}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(random() * 1e6).toString(36)}`.slice(0, 64);
}
export const schemaOf = type => Object.hasOwn(SECTION_SCHEMAS, type) ? SECTION_SCHEMAS[type] : null;
export const isRequired = (type, page) => Boolean(schemaOf(type)?.requiredOn.includes(page));
export const sectionName = section => schemaOf(section?.type)?.name || "Section";

// ---------- structure rules (mirror validateLayout framing rules) ----------
export function frameOk(layout) {
  if (!layout.length || layout.at(-1).type !== "footer") return false;
  if (!["header", "announcement"].includes(layout[0].type)) return false;
  const header = layout.findIndex(item => item.type === "header");
  return header >= 0 && header <= 1 && (header === 1 ? layout[0].type === "announcement" : true);
}
export function moveIndex(list, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
/** Reorder a section. Returns the same array reference when the move is not allowed. */
export function moveSection(layout, from, to) {
  const next = moveIndex(layout, from, to);
  return next === layout || !frameOk(next) ? layout : next;
}
export function canMoveSection(layout, index, delta) { return moveSection(layout, index, index + delta) !== layout; }
export function findSection(layout, id) { return layout.find(item => item.id === id) || null; }
const replaceSection = (layout, id, fn) => layout.map(item => item.id === id ? fn(item) : item);

export const SKELETON_PAGES = ["cart", "checkout"];
/** skeleton=true only when the server confirmed the additive section catalog (data.aura_skeleton_enabled). */
export function addableTypes(page, layout, skeleton = false) {
  if (!isEditablePage(page) && !(skeleton && SKELETON_PAGES.includes(page))) return [];
  const present = new Set(layout.map(item => item.type));
  return Object.values(SECTION_SCHEMAS).filter(schema => (skeleton || !AURA_SKELETON_TYPES.includes(schema.id)) && schema.allowedPages.includes(page) &&
    !schema.requiredOn.includes(page) && schema.id !== "commerce" && schema.id !== "header" && schema.id !== "footer" &&
    !(schema.id === "announcement" && present.has("announcement")));
}
export function sectionDefaults(type) {
  const schema = schemaOf(type);
  const settings = clone(schema.defaults);
  const blocks = [];
  return { settings, blocks };
}
/** Adds a section before the footer (announcement goes first). Returns {layout, id, hidden}. */
export function addSection(layout, type, page, context = {}, idFactory = newId, skeleton = false) {
  const schema = schemaOf(type);
  if (!schema || layout.length >= MAX_SECTIONS || !addableTypes(page, layout, skeleton).some(item => item.id === type)) return { layout, id: null, hidden: false };
  const { settings, blocks } = sectionDefaults(type);
  const section = { id: idFactory(type), type, settings, blocks };
  let hidden = false;
  try { validateLayout(page, insertAt(layout, section, type), context); } catch { hidden = true; settings.enabled = false; }
  if (type === "announcement") settings.enabled = settings.enabled !== false && !hidden ? true : false;
  return { layout: insertAt(layout, section, type), id: section.id, hidden: settings.enabled === false };
}
function insertAt(layout, section, type) {
  if (type === "announcement") return [section, ...layout];
  return [...layout.slice(0, -1), section, layout.at(-1)];
}
export function toggleSection(layout, id, page) {
  const section = findSection(layout, id);
  if (!section || isRequired(section.type, page)) return layout;
  return replaceSection(layout, id, item => ({ ...item, settings: { ...item.settings, enabled: item.settings.enabled === false } }));
}
export function duplicateSection(layout, id, page, idFactory = newId) {
  const index = layout.findIndex(item => item.id === id), section = layout[index];
  if (!section || isRequired(section.type, page) || ["announcement", "commerce"].includes(section.type) || layout.length >= MAX_SECTIONS) return { layout, id: null };
  const copy = clone(section);
  copy.id = idFactory(section.type);
  copy.blocks = copy.blocks.map(block => ({ ...block, id: idFactory("item") }));
  return { layout: [...layout.slice(0, index + 1), copy, ...layout.slice(index + 1)], id: copy.id };
}
/** Delete returns the removed section and its position so the UI can offer undo. */
export function deleteSection(layout, id, page) {
  const index = layout.findIndex(item => item.id === id), section = layout[index];
  if (!section || isRequired(section.type, page)) return { layout, removed: null, index: -1 };
  const next = layout.filter(item => item.id !== id);
  if (!frameOk(next)) return { layout, removed: null, index: -1 };
  return { layout: next, removed: clone(section), index };
}
export function restoreSection(layout, section, index) {
  if (!section || layout.some(item => item.id === section.id)) return layout;
  const next = [...layout]; next.splice(Math.min(index, layout.length - 1), 0, section);
  return frameOk(next) ? next : layout;
}

// ---------- settings and blocks ----------
function setPath(root, path, value) {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const copy = Array.isArray(root) ? [...root] : { ...root };
  copy[head] = setPath(root?.[head], rest, value);
  return copy;
}
export function getPath(root, path) { return path.reduce((value, key) => value == null ? undefined : value[key], root); }
/** path is relative to the section, e.g. ["settings","title"] or ["blocks",0,"settings","image"]. */
export function setSectionValue(layout, id, path, value) {
  if (!findSection(layout, id) || !["settings", "blocks"].includes(path[0])) return layout;
  return replaceSection(layout, id, item => setPath(item, path, value));
}
export function addBlock(layout, id, idFactory = newId) {
  const section = findSection(layout, id), schema = schemaOf(section?.type);
  if (!schema?.blockFields || section.blocks.length >= schema.maxItems) return { layout, blockId: null };
  const settings = Object.fromEntries(Object.entries(schema.blockFields).map(([key, field]) => [key, field.type === "list" ? [] : clone(field.default ?? null)]));
  const block = { id: idFactory("item"), type: "item", settings };
  return { layout: replaceSection(layout, id, item => ({ ...item, blocks: [...item.blocks, block] })), blockId: block.id };
}
export function removeBlock(layout, id, index) {
  return replaceSection(layout, id, item => ({ ...item, blocks: item.blocks.filter((_, i) => i !== index) }));
}
export function moveBlock(layout, id, from, to) {
  return replaceSection(layout, id, item => ({ ...item, blocks: moveIndex(item.blocks, from, to) }));
}
export function duplicateBlock(layout, id, index, idFactory = newId) {
  const section = findSection(layout, id), schema = schemaOf(section?.type);
  if (!section?.blocks[index] || section.blocks.length >= schema.maxItems) return layout;
  const copy = { ...clone(section.blocks[index]), id: idFactory("item") };
  return replaceSection(layout, id, item => ({ ...item, blocks: [...item.blocks.slice(0, index + 1), copy, ...item.blocks.slice(index + 1)] }));
}
/** Generic list items (for example header links) at a path inside the section. */
export function listOp(layout, id, path, op, a, b, itemFields) {
  const list = getPath(findSection(layout, id) || {}, path) || [];
  let next = list;
  if (op === "add") next = [...list, Object.fromEntries(Object.entries(itemFields).map(([key, field]) => [key, clone(field.default ?? "")]))];
  else if (op === "remove") next = list.filter((_, i) => i !== a);
  else if (op === "move") next = moveIndex(list, a, b);
  else if (op === "duplicate") next = [...list.slice(0, a + 1), clone(list[a]), ...list.slice(a + 1)];
  return next === list ? layout : setSectionValue(layout, id, path, next);
}
export function setFocal(media, x, y) {
  const clamp = value => Math.min(1, Math.max(0, Math.round(Number(value) * 1000) / 1000));
  return { ...media, focalX: clamp(x), focalY: clamp(y) };
}
export function mediaFromRecord(record, alt) {
  const out = { url: record.url, alt: String(alt ?? record.alt ?? "").trim() };
  for (const key of ["width", "height"]) if (Number.isInteger(record[key]) && record[key] > 0) out[key] = record[key];
  if (Array.isArray(record.sources)) {
    const sources = record.sources.filter(item => item?.url && Number.isInteger(item.width) && item.width > 0 && Number.isInteger(item.height) && item.height > 0 && (!out.width || item.width <= out.width)).map(item => ({ url: item.url, width: item.width, height: item.height }));
    if (sources.length) out.sources = sources;
  }
  return out;
}

// ---------- theme (joins undo history) ----------
export const THEME_KEYS = ["color_preset", "accent_color", "font_preset", "button_style"];
export const THEME_DEFAULTS = { color_preset: "ivory", accent_color: "#3d4a43", font_preset: "serif", button_style: "rounded" };
export function themeSnapshot(settings = {}) {
  const alias = { porcelain: "ivory", sand: "ivory", ink: "midnight" };
  const out = {};
  for (const key of THEME_KEYS) out[key] = settings[key] || THEME_DEFAULTS[key];
  out.color_preset = alias[out.color_preset] || out.color_preset;
  return out;
}
export const THEME_LABELS = { color_preset: "Colour preset", accent_color: "Accent colour", font_preset: "Type preset", button_style: "Button style" };
/** Human lines for the publish review: published baseline (settings or null) against current settings. */
export function themeChanges(publishedSettings, settings) {
  const from = themeSnapshot(publishedSettings || {}), to = themeSnapshot(settings || {});
  return THEME_KEYS.filter(key => from[key] !== to[key]).map(key => `${THEME_LABELS[key]}: ${from[key]} to ${to[key]}`);
}
/** Merge a page of media records into the list, no duplicate urls, order kept. */
export function mergeMedia(list, more) {
  const seen = new Set((list || []).map(item => item.url));
  return [...(list || []), ...(more || []).filter(item => item?.url && !seen.has(item.url))];
}
export const nextOffset = value => Number.isInteger(value) && value > 0 ? value : null;
/** Keys whose value differs, ready for PATCH /setup {settings}. */
export function themePatch(from, to) {
  const patch = {};
  for (const key of THEME_KEYS) if (from[key] !== to[key]) patch[key] = to[key];
  return patch;
}

// ---------- undo / redo ----------
export const HISTORY_LIMIT = 100;
export const createHistory = initial => ({ past: [], present: initial, future: [], key: null, at: 0 });
/** options.key coalesces rapid edits to the same field into one undo step. */
export function commit(history, next, { key = null, now = 0, window = 1200 } = {}) {
  if (next === history.present || JSON.stringify(next) === JSON.stringify(history.present)) return history;
  if (key && history.key === key && now - history.at < window) return { ...history, present: next, future: [], at: now };
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [], key, at: now };
}
export const canUndo = history => history.past.length > 0;
export const canRedo = history => history.future.length > 0;
export function undo(history) {
  if (!canUndo(history)) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future], key: null, at: 0 };
}
export function redo(history) {
  if (!canRedo(history)) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1), key: null, at: 0 };
}

// ---------- per page save state ----------
export const createPageState = (layout, version = 0) => ({ history: createHistory(layout), version, savedJson: JSON.stringify(layout), status: "saved", error: "" });
export const pageLayout = state => state.history.present;
export const isDirty = state => JSON.stringify(state.history.present) !== state.savedJson;
export function markSaved(state, sentLayout, version) {
  return { ...state, version, savedJson: JSON.stringify(sentLayout), status: JSON.stringify(state.history.present) === JSON.stringify(sentLayout) ? "saved" : "dirty", error: "" };
}
/** Replace local state with the server copy. Only used after the user explicitly chose it. */
export const adoptRemote = (layout, version) => createPageState(layout, version);
/** Keep local edits but take the server revision so the next save is an intentional overwrite. */
export const overwriteRevision = (state, version) => ({ ...state, version, status: "dirty", error: "" });
export function remoteChange(state, remoteVersion) {
  if (!Number.isInteger(remoteVersion) || remoteVersion === state.version) return "none";
  return isDirty(state) ? "conflict" : "reload";
}

export function validateDraft(page, layout, context) {
  try { validateLayout(page, layout, context); return ""; } catch (error) { return error.message || "This page has invalid content."; }
}

// ---------- review of changes ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function changedFields(before, after, schema) {
  const names = [];
  for (const [key, field] of Object.entries(schema.fields)) if (!same(before.settings?.[key], after.settings?.[key])) names.push(field.label || key.replace(/_/g, " "));
  if (!same(before.blocks, after.blocks)) names.push("items");
  return names;
}
export function diffLayouts(before, after) {
  const changes = [];
  const prior = new Map((before || []).map((item, i) => [item.id, { item, i }]));
  const now = new Map(after.map((item, i) => [item.id, { item, i }]));
  for (const item of after) {
    const old = prior.get(item.id);
    if (!old) { changes.push({ kind: "added", id: item.id, text: `Added ${sectionName(item)}` }); continue; }
    const schema = schemaOf(item.type);
    if ((old.item.settings?.enabled !== false) !== (item.settings.enabled !== false)) changes.push({ kind: "visibility", id: item.id, text: `${item.settings.enabled === false ? "Hid" : "Showed"} ${sectionName(item)}` });
    const fields = schema ? changedFields(old.item, item, schema).filter(name => name !== "enabled" && name !== "Enabled") : [];
    if (fields.length) changes.push({ kind: "edited", id: item.id, text: `Edited ${sectionName(item)}: ${fields.join(", ")}` });
  }
  for (const [id, { item }] of prior) if (!now.has(id)) changes.push({ kind: "removed", id, text: `Removed ${sectionName(item)}` });
  const common = (before || []).filter(item => now.has(item.id)).map(item => item.id), afterCommon = after.filter(item => prior.has(item.id)).map(item => item.id);
  if (!same(common, afterCommon)) changes.push({ kind: "moved", id: null, text: "Changed the order of sections" });
  return changes;
}

// ---------- warnings ----------
function channel(value) { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function luminance(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  if (x == null || y == null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const PRESET_PAPER = { ivory: "#f6f0e6", stone: "#e9e8e4", midnight: "#12151d", white: "#ffffff" };
const ALIAS = { porcelain: "ivory", sand: "ivory", ink: "midnight" };
export function accentCheck(accent, preset = "ivory") {
  const paper = PRESET_PAPER[ALIAS[preset] || preset] || PRESET_PAPER.ivory;
  const ratio = contrastRatio(accent, paper);
  return { ratio, paper, passes: ratio != null && ratio >= 4.5, large: ratio != null && ratio >= 3 };
}
/** Walk every media object in a layout. */
export function collectMedia(layout) {
  const found = [];
  const walk = (values, fields, sectionId, type, trail) => {
    for (const [key, field] of Object.entries(fields || {})) {
      const value = values?.[key];
      if (["image", "video"].includes(field.type) && value) found.push({ sectionId, type, kind: field.type, field: key, media: value, trail: [...trail, key] });
      if (field.type === "list" && Array.isArray(value)) value.forEach((item, i) => walk(item, field.itemFields, sectionId, type, [...trail, key, i]));
    }
  };
  for (const section of layout) {
    const schema = schemaOf(section.type);
    if (!schema) continue;
    walk(section.settings, schema.fields, section.id, section.type, []);
    section.blocks.forEach((block, i) => walk(block.settings, schema.blockFields, section.id, section.type, ["block", i]));
  }
  return found;
}
export function layoutWarnings(layout, settings = {}) {
  const warnings = [];
  const visible = layout.filter(item => item.settings.enabled !== false);
  if (visible.length > PERF_SECTION_LIMIT) warnings.push({ kind: "performance", text: `This page has ${visible.length} visible sections. Pages with more than ${PERF_SECTION_LIMIT} can load slowly on phones.` });
  for (const entry of collectMedia(layout)) {
    const name = sectionName({ type: entry.type });
    if (entry.kind === "image" && (entry.media.width > 3000 || entry.media.height > 3000)) warnings.push({ kind: "performance", sectionId: entry.sectionId, text: `${name}: an image is larger than 3000 pixels. Upload a smaller copy so the page loads faster.` });
    if (!String(entry.media.alt || "").trim()) warnings.push({ kind: "accessibility", sectionId: entry.sectionId, text: `${name}: an image or video has no alt text.` });
  }
  for (const section of layout) {
    if (section.settings.enabled === false) continue;
    if (section.type === "hero" && (section.settings.video || section.settings.variant === "video") && !section.settings.poster) warnings.push({ kind: "performance", sectionId: section.id, text: "Hero: a video needs a poster image." });
  }
  const check = accentCheck(settings.accent_color, settings.color_preset);
  if (settings.accent_color && !check.passes) warnings.push({ kind: "accessibility", text: `The accent colour has a contrast of ${check.ratio ? check.ratio.toFixed(1) : "unknown"}:1 against the page background. Aim for 4.5:1 or more.` });
  return warnings;
}
export function sectionWarnings(warnings, id) { return warnings.filter(item => item.sectionId === id); }

// ---------- links and page keys ----------
export function previewOptions(pageKey) {
  return pageKey.startsWith("policy-") ? { page: "policy", policyKind: pageKey.slice(7) } : { page: pageKey };
}
export function linkSuggestions(data = {}) {
  return ["/", "/collections/all", "/pages/about", "/pages/contact", "/policies/privacy", "/policies/terms", "/policies/shipping", "/policies/cancellation-refund", ...(data.products || []).map(item => `/products/${item.id}`)];
}
export function layoutContext(data) {
  return { storeId: data.store?.store_id, productIds: new Set((data.products || []).map(item => item.id)), collectionIds: new Set((data.collections || []).map(item => item.id)) };
}
/** Fallback: find which short text field of a section matches the clicked preview text. */
export function findTextField(section, text) {
  const schema = schemaOf(section?.type), wanted = String(text || "").replace(/\s+/g, " ").trim();
  if (!schema || !wanted) return null;
  const short = field => field.type === "text" && field.maxLength <= 240;
  for (const [key, field] of Object.entries(schema.fields)) if (short(field) && String(section.settings[key] || "").replace(/\s+/g, " ").trim() === wanted) return { path: ["settings", key], maxLength: field.maxLength };
  if (schema.blockFields) for (const [i, block] of section.blocks.entries()) for (const [key, field] of Object.entries(schema.blockFields)) if (short(field) && String(block.settings[key] || "").trim() === wanted) return { path: ["blocks", i, "settings", key], maxLength: field.maxLength };
  return null;
}

/**
 * Pure save decision. Returns "save", "clean" (nothing to write), "skip" (not allowed automatically)
 * or "blocked" (an explicit save cannot proceed: conflict, request in flight or invalid draft).
 * Starter proposals only reach "save" when force is true.
 */
export function saveDecision(key, { proposed, inflight, conflicts, dirty, invalid }, force = false) {
  if (inflight.has(key) || conflicts.has(key) || (dirty && invalid)) return force ? "blocked" : "skip";
  if (!dirty) return "clean";
  return force || !proposed.has(key) ? "save" : "skip";
}
export const mayAutosave = (key, state, force = false) => saveDecision(key, state, force) === "save";
/** Pages a background save (page switch, timer, tab hide) would write. Never includes starter proposals. */
export const saveTargets = (keys, stateFor) => keys.filter(key => saveDecision(key, stateFor(key), false) === "save");
