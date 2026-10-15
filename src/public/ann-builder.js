import { ANN_STEPS, ANN_PALETTES, ANN_FONTS, ANN_EXTRA_SECTIONS, annPreviewConfiguration } from "./ann-config.js";
import { AURA_STYLES, styleSettings } from "./aura-styles.js";
import { stylePreviewData, renderStylePreview } from "./style-preview.js";
import { attachStyleInteractions } from "./style-preview-interactions.js";
import { attachAuraSearch, attachAuraCatalog } from "./aura-ui.js";
import { attachAuraMotion } from "./aura-motion.js";
import { attachAnnApplication } from "./ann-application-ui.js";
import { attachAnnReadiness } from "./ann-readiness-ui.js";
import { prefilledSection } from "./aura-starters.js";
import { initialAnswers, diffAnswers, changeCategory, changeSubcategory, nextKey, planProblems, projectAnnPreview, currentExtras } from "./ann-projection.js";

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const boot = JSON.parse($("#ann-data").textContent);
const ref = boot.reference && Array.isArray(boot.reference.categories) ? boot.reference : null;
const readOnly = !boot.canWrite;
const storeId = encodeURIComponent(boot.store.store_id);
const api = boot.apiRoot || `/api/stores/${storeId}/ann`;
const root = `/stores/${storeId}`;

const UI_STEPS = [
  ["category", "Category", "What do you sell?"], ["style", "Style", "Pick a look"], ["palette", "Colour", "Set the colours"],
  ["fonts", "Type", "Choose your type"], ["collections", "Collections", "Group your range"], ["products", "Products", "Sketch product ideas"],
  ["story", "Story", "Tell your story"], ["review", "Review", "Review the plan"],
].filter(([k]) => ANN_STEPS.includes(k));
const PAGES = ["home", "collection", "product", "cart", "checkout", "about", "contact"];
const STEP_PAGE = { collections: "collection", products: "product", story: "home", style: "home", palette: "home", fonts: "home", category: "home" };
const PALETTE_NAMES = { white: "White", ivory: "Ivory", stone: "Stone", midnight: "Midnight" };
const FONT_NAMES = { modern: "Modern sans", serif: "Serif", classic: "Classic" };
const label = s => s.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());

let session = boot.sessionResponse?.session || null;
let revision = session?.revision ?? 0;
let saved = structuredClone(session?.answers || {});
let answers = structuredClone(saved);
if (!session) answers = { ...initialAnswers(boot.settings, boot.store, ref || {}), ...answers };
let step = UI_STEPS.some(s => s[0] === session?.current_step) ? session.current_step : session ? "review" : "category";
let touched = false, saving = false, conflict = false, notice = "", page = "home", productId, collectionId, policyKind;
let queue = Promise.resolve(), lastSavedAt = session ? "Saved plan restored." : "";
const notes = [];
const attrState = new Map(); let attrToken = 0;
const clearedNote = boot.sessionResponse?.cleared_fields || [];

let base = stylePreviewData({ store: boot.store, settings: boot.settings, products: boot.products, collections: boot.collections, layouts: boot.layouts, policies: boot.policies, reviews: boot.reviews, aura_skeleton_enabled: boot.aura_skeleton_enabled, aura_starter_enabled: boot.aura_starter_enabled });
const applicationUI = attachAnnApplication({ api, root, readOnly,
  context: () => ({ answers, revision, dirty: isDirty() }),
  beforePrepare: () => save("review"),
  onApplied: result => { base = stylePreviewData(result.draft); productId = undefined; collectionId = undefined; renderPreview(false); readinessUI.onStoreChanged(); },
});
const readinessUI = attachAnnReadiness({api,root,readOnly,
  onSaved:result=>{if(result.draft){base=stylePreviewData(result.draft);renderPreview(false);}},
});
const extrasNow = currentExtras(base.layouts);
const bag = new Map((base.products || []).slice(0, 2).map(p => [p.id, 1]));
const frame = $("#ann-preview"), canvas = $("#ann-canvas"), log = $("#ann-log"), foot = $("#ann-foot"), statusEl = $("#ann-status");
const app = $("#ann-app");
const say = t => { statusEl.textContent = t; };

const dirtyPatch = () => diffAnswers(saved, answers);
const isDirty = () => touched && Object.keys(dirtyPatch()).length > 0;
const config = () => annPreviewConfiguration(answers, { ...boot.settings, ...(boot.sessionResponse?.preview?.theme || {}) });
const subsFor = c => (ref?.subcategories || []).filter(s => Number(s.category_id) === Number(c));
const catName = id => (ref?.categories || []).find(c => Number(c.category_id) === Number(id))?.name;
const subName = id => (ref?.subcategories || []).find(s => Number(s.subcategory_id) === Number(id))?.name;
const styleName = id => AURA_STYLES.find(s => s.id === id)?.name || "Saved style";
const sections = () => answers.section_options || {};
const shown = p => sections()[p] ?? extrasNow[p] ?? [];

/* ---------- preview ---------- */
let current = null, displayedKey = "", timer = 0;
const scrolls = new Map();
const posKey = () => JSON.stringify([config().theme.style_preset, page, productId || "", collectionId || "", canvas.dataset.device]);
function rememberScroll() {
  const d = frame.contentDocument;
  if (displayedKey && d) scrolls.set(displayedKey, d.scrollingElement?.scrollTop ?? 0);
}
function renderPreview(remember = true) {
  if (remember) rememberScroll();
  const cfg = config();
  const projected = projectAnnPreview(base, cfg, { prefilled: prefilledSection, attributes: attrState.get(answers.subcategory_id)?.attrs || [] });
  current = projected.data;
  if (!productId || !current.products.some(p => p.id === productId)) productId = current.products[0]?.id;
  displayedKey = posKey();
  frame.title = `${styleName(cfg.theme.style_preset)}, ${canvas.dataset.device} store preview`;
  frame.srcdoc = renderStylePreview(current, cfg.theme, { page, productId, collectionId, policyKind });
  $("#ann-preview-note").textContent = (base.style_demo ? "Sample menswear imagery and illustrative prices fill the preview until you add real products. " : "Your actual catalogue is shown alongside remaining planned ideas. ") +
    "Preview controls never create products, orders or publications. Use the confirmed actions in Review to save real draft changes." +
    (projected.unavailable.length ? ` Some optional sections cannot be previewed here: ${projected.unavailable.map(u => label(u.split(":")[1])).join(", ")}.` : "");
  paintStage();
}
const schedule = (ms = 70) => { clearTimeout(timer); timer = setTimeout(() => renderPreview(), ms); };
function paintStage() {
  const cfg = config();
  $("#ann-style-tabs").innerHTML = AURA_STYLES.map(s => `<button type="button" class="ann-tab" data-pick-style="${s.id}" aria-pressed="${cfg.theme.style_preset === s.id}">${esc(s.name)}</button>`).join("");
  $("#ann-pages").innerHTML = PAGES.map(p => `<button type="button" class="ann-tab" data-page="${p}" aria-pressed="${p === page}">${p}</button>`).join("");
}
function fit() {
  const width = canvas.dataset.device === "mobile" ? 390 : 1280;
  const availW = Math.max(240, (canvas.clientWidth || 800) - 24), availH = Math.max(320, (canvas.clientHeight || 700) - 24);
  const scale = Math.min(1, availW / width);
  Object.assign(frame.style, { width: `${width}px`, minWidth: `${width}px`, height: `${availH / scale}px`, transform: `scale(${scale})`, transformOrigin: "top left", left: `${Math.max(0, ((canvas.clientWidth || 800) - width * scale) / 2)}px` });
}
frame.addEventListener("load", () => {
  const doc = frame.contentDocument; if (!doc) return;
  doc.addEventListener("submit", e => e.preventDefault(), true);
  doc.addEventListener("click", e => {
    const link = e.target.closest("a"); if (!link) return;
    e.preventDefault();
    const path = new URL(link.getAttribute("href") || "/", location.origin).pathname;
    if (path.startsWith("/products/")) { page = "product"; productId = decodeURIComponent(path.split("/")[2]); }
    else if (path.startsWith("/collections/")) { page = "collection"; const slug = decodeURIComponent(path.split("/")[2]); collectionId = current.collections?.find(c => c.slug === slug || c.id === slug)?.id; }
    else if (path.startsWith("/policies/")) { page = "policy"; policyKind = path.split("/")[2]; }
    else if (path === "/pages/about") page = "about"; else if (path === "/pages/contact") page = "contact";
    else if (path === "/cart") page = "cart"; else if (path === "/checkout") page = "checkout"; else if (path === "/") page = "home"; else return;
    renderPreview();
  });
  attachAuraSearch(doc, current);
  attachAuraCatalog(doc, current, { page, collectionId });
  attachAuraMotion(doc);
  attachStyleInteractions(doc, current, bag, page, productId, next => { page = next; renderPreview(); });
  const key = displayedKey;
  doc.defaultView?.scrollTo({ top: scrolls.get(key) || 0, behavior: "instant" });
  doc.defaultView?.addEventListener("scroll", () => scrolls.set(key, doc.scrollingElement?.scrollTop ?? 0), { passive: true });
});
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(canvas);
window.addEventListener("resize", fit);

/* ---------- attributes ---------- */
async function loadAttrs(subId) {
  if (!subId) return;
  const cached = attrState.get(subId);
  if (cached?.status === "ready" || cached?.status === "loading") return;
  const token = ++attrToken;
  attrState.set(subId, { status: "loading", token });
  if (step === "products") draw();
  try {
    const res = await fetch(`${api}/reference?subcategory_id=${encodeURIComponent(subId)}`, { credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Product questions could not be loaded.");
    if (attrState.get(subId)?.token !== token) return;
    attrState.set(subId, { status: "ready", token, attrs: Array.isArray(body.attributes) ? body.attributes : [] });
  } catch (e) {
    if (attrState.get(subId)?.token !== token) return;
    attrState.set(subId, { status: "error", token, error: e.message });
  }
  if (Number(answers.subcategory_id) === Number(subId) && step === "products") drawKeep();
}
const attrName = a => a.name || a.label || a.question || `Question ${a.id}`;
const valName = v => v.label || v.name || v.value || `Option ${v.id}`;

/* ---------- conversation ---------- */
const bubble = (html, cls = "") => `<div class="ann-msg ${cls}"><span class="ann-av" aria-hidden="true">A</span><div class="ann-bubble">${html}</div></div>`;
const dis = readOnly ? " disabled" : "";
const choice = (attrs, pressed, title, sub = "", style = "") => `<button type="button" class="ann-choice" ${attrs} aria-pressed="${pressed}"${dis}${style ? ` style="${style}"` : ""}><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ""}</button>`;

function stepBody() {
  const a = answers;
  if (!ref && step !== "review") return bubble(`<p>I cannot load the category reference right now, so I cannot offer choices. Reload this page to try again.</p>`) ;
  if (step === "category") {
    const subs = a.category_id ? subsFor(a.category_id) : [];
    return bubble(`<p>Hello${a.store_name ? `, ${esc(a.store_name)}` : ""}. I am Ann. Tell me what you sell and the store on the right will start to take shape. Nothing is published.</p>`) +
      bubble(`<h2>Product category</h2><div class="ann-choices">${ref.categories.map(c => choice(`data-category="${esc(c.category_id)}"`, Number(a.category_id) === Number(c.category_id), c.name)).join("")}</div>
      ${a.category_id ? `<h2>Subcategory</h2>${subs.length ? `<div class="ann-choices">${subs.map(s => choice(`data-subcategory="${esc(s.subcategory_id)}"`, Number(a.subcategory_id) === Number(s.subcategory_id), s.name)).join("")}</div>` : `<p class="ann-note">No subcategories are listed for this category.</p>`}` : ""}`, "ann-card");
  }
  if (step === "style") return bubble(`<p>Here are five looks. Every one uses the same images, with copy written for that style. Tap one and compare.</p>`) +
    bubble(`<div class="ann-choices ann-stack">${AURA_STYLES.map(s => choice(`data-pick-style="${s.id}"`, config().theme.style_preset === s.id, s.name, s.description, `--c:${s.settings.accent_color}`)).join("")}</div>`, "ann-card");
  if (step === "palette") {
    const t = config().theme;
    return bubble(`<p>Pick a background, an accent and a button shape. The preview changes as you choose.</p>`) +
      bubble(`<h2>Background</h2><div class="ann-choices">${ANN_PALETTES.map(p => choice(`data-palette="${p}"`, t.color_preset === p, PALETTE_NAMES[p] || label(p))).join("")}</div>
      <h2>Accent colour</h2><label class="ann-field"><input type="color" data-ans="accent_color" value="${esc(t.accent_color)}"${dis}></label>
      <h2>Buttons</h2><div class="ann-choices">${["square", "rounded", "pill"].map(b => choice(`data-button="${b}"`, t.button_style === b, label(b))).join("")}</div>`, "ann-card");
  }
  if (step === "fonts") {
    const t = config().theme;
    return bubble(`<p>Which type feels like your brand?</p>`) +
      bubble(`<div class="ann-choices ann-stack">${ANN_FONTS.map(f => choice(`data-font="${f}"`, t.font_preset === f, FONT_NAMES[f] || label(f))).join("")}</div>`, "ann-card");
  }
  if (step === "collections") {
    const cols = a.collections || [];
    return bubble(`<p>Group your range into up to ten collections. Names and descriptions appear in the preview straight away.</p>`) +
      bubble(`${cols.length ? cols.map((c, i) => `<fieldset class="ann-item"><legend>Collection ${i + 1}</legend>
        <label class="ann-field">Name<input data-col="${i}" data-f="name" maxlength="100" value="${esc(c.name)}"${dis}></label>
        <label class="ann-field">Description<textarea data-col="${i}" data-f="description" maxlength="800" rows="2"${dis}>${esc(c.description || "")}</textarea></label>
        <button type="button" class="ann-link" data-del-col="${i}"${dis}>Remove collection</button></fieldset>`).join("") : `<p class="ann-empty">No collections yet. Add the first one, for example by occasion or by product type.</p>`}
        <button type="button" class="ann-btn alt" data-add-col${cols.length >= 10 || readOnly ? " disabled" : ""}>Add a collection</button>${cols.length >= 10 ? `<p class="ann-note">You have reached ten collections.</p>` : ""}`, "ann-card");
  }
  if (step === "products") return productsStep();
  if (step === "story") return bubble(`<p>Say who you are in your own words. Then choose any extra sections you want on each page.</p>`) +
    bubble(`<label class="ann-field">Store name<input data-ans="store_name" maxlength="120" value="${esc(a.store_name || "")}"${dis}></label>
      <label class="ann-field">Tagline<input data-ans="tagline" maxlength="160" value="${esc(a.tagline || "")}"${dis}></label>
      <label class="ann-field">About your brand<textarea data-ans="description" maxlength="1200" rows="4"${dis}>${esc(a.description || "")}</textarea></label>
      <h2>Optional sections</h2><p class="ann-note">These show in the preview and are saved as a plan only. Core shopping sections stay as they are.</p>
      ${Object.entries(ANN_EXTRA_SECTIONS).map(([p, list]) => `<fieldset class="ann-sections"><legend>${label(p)} page</legend>${list.map(t => `<label class="ann-check"><input type="checkbox" data-section="${p}:${t}" ${shown(p).includes(t) ? "checked" : ""}${dis}><span>${esc(label(t))}</span></label>`).join("")}<button type="button" class="ann-link" data-view-page="${p}">Show this page</button></fieldset>`).join("")}`, "ann-card");
  return reviewStep();
}

function productsStep() {
  const cols = answers.collections || [], ideas = answers.product_ideas || [];
  if (!cols.length) return bubble(`<p>Product ideas live inside collections, so add a collection first.</p><button type="button" class="ann-btn alt" data-go="collections">Go to collections</button>`);
  const subId = answers.subcategory_id;
  if (subId) loadAttrs(subId);
  const st = subId ? attrState.get(subId) : null;
  const total = ideas.length;
  const out = [bubble(`<p>Sketch up to five ideas per collection. These are planning notes, not real products. No prices or stock are set.</p>${!subId ? `<p class="ann-callout">Choose a subcategory in Category to unlock product questions.</p><button type="button" class="ann-btn alt" data-go="category">Choose subcategory</button>` : ""}`)];
  for (const c of cols) {
    const mine = ideas.map((p, i) => [p, i]).filter(([p]) => p.collection_key === c.key);
    out.push(bubble(`<h2>${esc(c.name || "Untitled collection")}</h2>${mine.map(([p, i]) => ideaCard(p, i, st)).join("") || `<p class="ann-empty">No ideas yet.</p>`}
      <button type="button" class="ann-btn alt" data-add-idea="${esc(c.key)}"${mine.length >= 5 || total >= 50 || readOnly ? " disabled" : ""}>Add a product idea</button>${mine.length >= 5 ? `<p class="ann-note">Five ideas is the limit for one collection.</p>` : ""}`, "ann-card"));
  }
  return out.join("");
}
function ideaCard(p, i, st) {
  const picked = new Map((p.attributes || []).map(x => [x.attribute_id, new Set(x.value_ids)]));
  let attrs = "";
  if (!answers.subcategory_id) attrs = "";
  else if (!st || st.status === "loading") attrs = `<div class="ann-skel"><i></i><i></i></div>`;
  else if (st.status === "error") attrs = `<p class="ann-error">${esc(st.error)}</p><button type="button" class="ann-btn alt" data-retry-attrs>Try again</button>`;
  else if (!st.attrs.length) attrs = `<p class="ann-note">No product questions are listed for this subcategory.</p>`;
  else attrs = `<details class="ann-attrs"><summary>Product details${(p.attributes || []).length ? ` (${p.attributes.length} chosen)` : ""}</summary>${st.attrs.map(at => `<fieldset><legend>${esc(attrName(at))}</legend><div class="ann-vals">${(at.values || []).map(v => `<label class="ann-check"><input type="checkbox" data-attr="${i}:${esc(at.id)}:${esc(v.id)}" ${picked.get(Number(at.id))?.has(Number(v.id)) ? "checked" : ""}${dis}><span>${esc(valName(v))}</span></label>`).join("")}</div></fieldset>`).join("")}</details>`;
  return `<fieldset class="ann-item"><legend>Idea ${i + 1}</legend>
    <label class="ann-field">Name<input data-idea="${i}" data-f="name" maxlength="120" value="${esc(p.name)}"${dis}></label>
    <label class="ann-field">Description<textarea data-idea="${i}" data-f="description" maxlength="1200" rows="2"${dis}>${esc(p.description || "")}</textarea></label>${attrs}
    <button type="button" class="ann-link" data-del-idea="${i}"${dis}>Remove idea</button></fieldset>`;
}

function reviewStep() {
  const a = answers, t = config().theme, dirty = isDirty();
  const rows = [["category", "Category", [catName(a.category_id), subName(a.subcategory_id)].filter(Boolean).join(", ") || "Not chosen"],
    ["style", "Style", styleName(t.style_preset)], ["palette", "Colour", `${PALETTE_NAMES[t.color_preset] || t.color_preset}, accent ${t.accent_color}, ${t.button_style} buttons`],
    ["fonts", "Type", FONT_NAMES[t.font_preset] || t.font_preset], ["collections", "Collections", (a.collections || []).map(c => c.name).join(", ") || "None planned"],
    ["products", "Product ideas", `${(a.product_ideas || []).length} planned`], ["story", "Story", a.store_name || "Not set"]];
  return bubble(`<p>${session || !dirty ? "Here is your plan." : "Here is your plan. Save it so you can come back to it."} Preview choices alone do not change the store. Use the confirmed draft and setup actions below to save changes. Publishing is always separate.</p>`) +
    bubble(`<dl class="ann-summary">${rows.map(([k, n, v]) => `<div><dt>${n}</dt><dd>${esc(v)}</dd><button type="button" class="ann-link" data-go="${k}">Change</button></div>`).join("")}</dl>
      <p class="ann-note">${dirty ? "You have unsaved changes." : session ? `Saved, revision ${revision}.` : "Not saved yet."}</p>`, "ann-card") +
    bubble(`<h2>Make the store yours</h2><p>Apply your confirmed page and catalogue choices, then complete the business, shipping and policy checks below. Store address confirmation, verified supplier selection and final publishing stay in the existing setup and editor.</p>`, "ann-card") +
    `<section class="ann-card" id="ann-application-slot"></section><section class="ann-card" id="ann-readiness-slot"></section>`;
}

/* ---------- panel drawing ---------- */
function drawSteps() {
  $("#ann-steps").innerHTML = UI_STEPS.map(([k, n], i) => `<button type="button" data-go="${k}" aria-current="${k === step ? "step" : "false"}"><i>${i + 1}</i>${esc(n)}</button>`).join("");
}
function drawFoot() {
  const i = UI_STEPS.findIndex(s => s[0] === step), dirty = isDirty();
  const last = i === UI_STEPS.length - 1;
  foot.innerHTML = `${readOnly ? `<p class="ann-callout">You can look around, but only an owner or admin can save this plan.</p>` : ""}
    ${conflict ? `<div class="ann-conflict" role="alert"><p>Another tab or person saved a newer plan. Your edits are still here and nothing was overwritten.</p><div class="ann-actions"><button type="button" class="ann-btn alt" data-reload>Load the saved plan</button><button type="button" class="ann-btn" data-overwrite>Keep my edits and save over it</button></div></div>` : ""}
    <div class="ann-actions"><button type="button" class="ann-btn alt" data-back ${i === 0 ? "disabled" : ""}>Back</button>
    <button type="button" class="ann-btn alt" data-save ${readOnly || saving || !dirty || conflict ? "disabled" : ""}>${saving ? "Saving" : "Save"}</button>
    ${last ? "" : `<button type="button" class="ann-btn" data-next ${saving || conflict ? "disabled" : ""}>${readOnly ? "Next" : "Save and continue"}</button>`}</div>
    <p class="ann-note">${dirty ? "Unsaved changes. The preview already shows them." : lastSavedAt}</p>`;
}
function draw() {
  const [, , prompt] = UI_STEPS.find(s => s[0] === step) || [];
  log.innerHTML = `<h2 class="ann-title">${esc(prompt || "")}</h2>${notice ? `<p class="ann-callout" role="status">${esc(notice)}</p>` : ""}${notes.map(n => `<p class="ann-callout">${esc(n)}</p>`).join("")}${stepBody()}`;
  drawSteps(); drawFoot(); applicationUI.mount(); readinessUI.mount();
}
function drawKeep() { // re-draw without losing the cursor in a focused field
  const y = log.scrollTop; draw(); log.scrollTop = y;
}
function go(next) {
  if (!UI_STEPS.some(s => s[0] === next)) return;
  step = next; notice = ""; page = STEP_PAGE[next] || page; collectionId = undefined;
  draw(); log.scrollTop = 0; renderPreview(); app.dataset.view = "chat";
  syncSwitch();
}
function edit(mutator, redraw = false) {
  if (readOnly) return;
  mutator(); touched = true; conflict = conflict; schedule();
  drawFoot();
  if (redraw) drawKeep();
}
function focusIdea(index) {
  const idea = answers.product_ideas?.[index];
  if (!idea) return;
  productId = (base.style_demo ? base.products?.[index]?.id : null) || `ann-product-${idea.key}`;
  page = "product";
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a"); if (!t || t.tagName === "A") return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.viewSwitch) { app.dataset.view = d.viewSwitch; syncSwitch(); if (d.viewSwitch === "canvas") setTimeout(fit, 0); return; }
  if (d.device) { rememberScroll(); canvas.dataset.device = d.device; document.querySelectorAll("[data-device]").forEach(b => b.setAttribute("aria-pressed", String(b === t))); renderPreview(false); fit(); return; }
  if (d.page) { page = d.page; collectionId = undefined; policyKind = undefined; return renderPreview(); }
  if (d.viewPage) { page = d.viewPage; return renderPreview(); }
  if ("back" in d) return go(UI_STEPS[Math.max(0, UI_STEPS.findIndex(s => s[0] === step) - 1)][0]);
  if ("next" in d) { const nx = UI_STEPS[Math.min(UI_STEPS.length - 1, UI_STEPS.findIndex(s => s[0] === step) + 1)][0]; return (readOnly ? Promise.resolve(true) : save(nx)).then(ok => { if (ok) go(nx); }); }
  if ("save" in d) return void save(step);
  if ("reload" in d) return void reloadLatest(false);
  if ("overwrite" in d) return void reloadLatest(true);
  if ("retryAttrs" in d) { attrState.delete(answers.subcategory_id); return void drawKeep(); }
  if (readOnly) return;
  if (d.pickStyle) {
    const s = styleSettings(d.pickStyle);
    return edit(() => { for (const k of ["style_preset", "color_preset", "font_preset", "accent_color", "button_style"]) if (s[k] !== undefined) answers[k] = s[k]; }, step !== "category");
  }
  if (d.palette) return edit(() => { answers.color_preset = d.palette; }, true);
  if (d.font) return edit(() => { answers.font_preset = d.font; }, true);
  if (d.button) return edit(() => { answers.button_style = d.button; }, true);
  if (d.category) {
    const r = changeCategory(answers, Number(d.category));
    return edit(() => {
      answers = r.answers; notice = "";
      const bits = [];
      if (r.cleared.subcategory) bits.push("the subcategory");
      if (r.cleared.attributes) bits.push(`${r.cleared.attributes} product detail choice${r.cleared.attributes === 1 ? "" : "s"}`);
      if (bits.length) notice = `Changing category cleared ${bits.join(" and ")} because they belonged to the old category. Your product names and descriptions are kept.`;
    }, true);
  }
  if (d.subcategory) {
    const r = changeSubcategory(answers, Number(d.subcategory));
    return edit(() => { answers = r.answers; notice = r.cleared.attributes ? `Changing subcategory cleared ${r.cleared.attributes} product detail choice${r.cleared.attributes === 1 ? "" : "s"}. Your product names and descriptions are kept.` : ""; }, true);
  }
  if ("addCol" in d) return edit(() => { const cols = answers.collections ||= []; if (cols.length < 10) cols.push({ key: nextKey("collection", cols.map(c => c.key)), name: "", description: "" }); }, true);
  if (d.delCol !== undefined) {
    const c = answers.collections[Number(d.delCol)], n = (answers.product_ideas || []).filter(p => p.collection_key === c.key).length;
    if (n && !confirm(`Removing this collection also removes its ${n} product idea${n === 1 ? "" : "s"}. Continue?`)) return;
    return edit(() => { answers.collections.splice(Number(d.delCol), 1); answers.product_ideas = (answers.product_ideas || []).filter(p => p.collection_key !== c.key); if (!answers.collections.length) delete answers.collections; if (!answers.product_ideas.length) delete answers.product_ideas; }, true);
  }
  if (d.addIdea) return edit(() => { const ideas = answers.product_ideas ||= []; if (ideas.length < 50) ideas.push({ key: nextKey("idea", ideas.map(p => p.key)), collection_key: d.addIdea, name: "", description: "", attributes: [] }); }, true);
  if (d.delIdea !== undefined) return edit(() => { answers.product_ideas.splice(Number(d.delIdea), 1); if (!answers.product_ideas.length) delete answers.product_ideas; }, true);
});
document.addEventListener("input", e => {
  const t = e.target; if (readOnly || !t.dataset) return;
  const d = t.dataset;
  if (d.ans) return edit(() => { if (d.ans === "accent_color") answers.accent_color = t.value; else answers[d.ans] = t.value; });
  if (d.col !== undefined) return edit(() => { answers.collections[Number(d.col)][d.f] = t.value; });
   if (d.idea !== undefined) return edit(() => { answers.product_ideas[Number(d.idea)][d.f] = t.value; focusIdea(Number(d.idea)); });
});
document.addEventListener("change", e => {
  const t = e.target; if (readOnly || !t.dataset) return;
  if (t.dataset.section) {
    const [p, s] = t.dataset.section.split(":");
    return edit(() => { const set = new Set(shown(p)); t.checked ? set.add(s) : set.delete(s); (answers.section_options ||= {})[p] = ANN_EXTRA_SECTIONS[p].filter(x => set.has(x)); page = p; });
  }
  if (t.dataset.attr) {
    const [i, aid, vid] = t.dataset.attr.split(":").map(Number);
    const idea = answers.product_ideas[i];
    let entry = (idea.attributes || []).find(x => x.attribute_id === aid);
    if (t.checked && entry?.value_ids.length >= 20) { t.checked = false; return say("Choose up to twenty values for one question."); }
    if (t.checked && !entry && (idea.attributes || []).length >= 30) { t.checked = false; return say("Choose up to thirty product questions."); }
    return edit(() => {
      focusIdea(i);
      if (!entry) { entry = { attribute_id: aid, value_ids: [] }; (idea.attributes ||= []).push(entry); }
      entry.value_ids = t.checked ? [...new Set([...entry.value_ids, vid])] : entry.value_ids.filter(v => v !== vid);
      if (!entry.value_ids.length) idea.attributes = idea.attributes.filter(x => x !== entry);
    });
  }
});
function syncSwitch() {
  document.querySelectorAll("[data-view-switch]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.viewSwitch === app.dataset.view)));
}

/* ---------- save and resume ---------- */
async function send(patch, nextStep, expected) {
  const res = await fetch(`${api}/session`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_revision: expected, current_step: nextStep, answers: patch }) });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}
function save(nextStep = step, forceRevision) {
  const run = queue.then(() => doSave(nextStep, forceRevision), () => doSave(nextStep, forceRevision));
  queue = run.catch(() => false);
  return run;
}
async function doSave(nextStep, forceRevision) {
  if (readOnly) return true;
  const stepName = ANN_STEPS.includes(nextStep) ? nextStep : "review";
  const patch = dirtyPatch();
  const problems = planProblems(answers);
  if (problems.length) { say(problems[0]); notice = problems[0]; drawKeep(); return false; }
   if (!Object.keys(patch).length && session?.current_step === stepName) return true;
  saving = true; drawFoot(); say("Saving your plan");
  try {
    const { res, body } = await send(patch, stepName, forceRevision ?? revision);
    if (res.status === 409) { conflict = true; say("A newer plan exists. Your edits are kept."); return false; }
    if (!res.ok) throw new Error(body.error || "Your plan could not be saved.");
    session = body.session; revision = session.revision; saved = structuredClone(session.answers || {});
    for (const k of Object.keys(patch)) {
      const mine = answers[k], sent = patch[k];
      if ((sent === null && mine === undefined) || JSON.stringify(mine) === JSON.stringify(sent)) {
        if (saved[k] === undefined) delete answers[k]; else answers[k] = structuredClone(saved[k]);
      }
    }
    const cleared = body.cleared_fields || [];
    notice = cleared.length ? "Some choices no longer matched and were cleared: " + cleared.map(c => c === "subcategory_id" ? "subcategory" : "product details").join(", ") + "." : "";
    conflict = false; touched = Object.keys(dirtyPatch()).length > 0;
    lastSavedAt = `Saved, revision ${revision}.`; say("Plan saved. Your live store is unchanged.");
    return true;
  } catch (e) { say(e.message || "Your plan could not be saved. Check your connection and try again."); notice = e.message || ""; return false; }
  finally { saving = false; draw(); renderPreview(false); }
}
async function reloadLatest(keepEdits) {
  say("Loading the saved plan");
  try {
    const res = await fetch(`${api}/session`, { credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "The saved plan could not be loaded.");
    session = body.session; revision = session?.revision ?? 0; saved = structuredClone(session?.answers || {});
    conflict = false;
    if (keepEdits) { say("Saving your edits over the newer plan"); drawFoot(); await save(step, revision); return; }
    answers = structuredClone(saved); touched = false; notice = "Loaded the latest saved plan. Your unsaved edits were discarded.";
    draw(); renderPreview(false); say("Saved plan loaded.");
  } catch (e) { say(e.message); }
}
window.addEventListener("beforeunload", e => { if (!readOnly && (isDirty() || saving || applicationUI.hasUnappliedChanges() || readinessUI.hasUnsavedChanges())) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- start ---------- */
if ((window.innerWidth || 1280) < 700) { canvas.dataset.device = "mobile"; document.querySelectorAll("[data-device]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.device === "mobile"))); }
if (clearedNote.length) notice = "Some earlier choices were cleared because they no longer matched.";
if (answers.subcategory_id && step === "products") loadAttrs(answers.subcategory_id);
draw(); syncSwitch(); renderPreview(false); fit();
say(session ? "Your saved plan is restored." : "Start anywhere. Nothing is saved until you press Save.");
