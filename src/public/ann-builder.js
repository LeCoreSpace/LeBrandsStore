import { resolveShowcasePack } from "./aura-showcase-assets.js";
import { ANN_STEPS, ANN_PALETTES, ANN_FONTS, ANN_EXTRA_SECTIONS, annPreviewConfiguration } from "./ann-config.js";
import { AURA_STYLES, styleSettings } from "./aura-styles.js";
import { stylePreviewData, renderStylePreview, designPreviewData } from "./style-preview.js";
import { attachAnnDesign } from "./ann-design-ui.js";
import { attachAnnWorkspace, sectionMeta, nextSections } from "./ann-design-workspace.js";
import { attachStyleInteractions } from "./style-preview-interactions.js";
import { attachAuraSearch, attachAuraCatalog } from "./aura-ui.js";
import { attachAuraMotion } from "./aura-motion.js";
import { attachAnnApplication } from "./ann-application-ui.js";
import { attachAnnOnboarding } from "./ann-onboarding-ui.js";
import { attachAnnReplyFields } from "./ann-reply-fields.js";
import { attachAnnReadiness } from "./ann-readiness-ui.js";
import { attachStoreEssentials, connectionHref } from "./store-essentials.js";
import { openAnnBrowserPreview } from "./ann-browser-preview.js";
import { attachAnnBranding } from "./ann-branding-ui.js";
import { prefilledSection } from "./aura-starters.js";
import { initialAnswers, diffAnswers, changeCategory, changeSubcategory, nextKey, planProblems, projectAnnPreview, currentExtras, annAnsweredStages } from "./ann-projection.js";

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const boot = JSON.parse($("#ann-data").textContent);
const ref = boot.reference && Array.isArray(boot.reference.categories) ? boot.reference : null;
const readOnly = !boot.canWrite;
const storeId = encodeURIComponent(boot.store.store_id);
const api = boot.apiRoot || `/api/stores/${storeId}/ann`;
const root = `/stores/${storeId}`;

const UI_STEPS = [
  ["business", "Business", "Your name, GST details and logo"], ["selling", "Store address", "Your included store address"],
  ["style", "Style", "Choose your store's look"], ["palette", "Colours", "Choose backgrounds and button colours"],
  ["fonts", "Fonts", "Choose how your store's text looks"], ["category", "Category", "Choose your product category"],
  ["collections", "Collections", "Group related products"], ["products", "Products", "Add products and confirm your catalogue"],
  ["story", "Brand story", "Choose optional story sections"],
  ["review", "Review", "Review your store and opening checks"],
].filter(([k]) => ANN_STEPS.includes(k));
const PAGES = ["home", "collection", "product", "cart", "checkout", "about", "contact"];
const STEP_PAGE = { business: "home", selling: "home", collections: "collection", products: "product", story: "home", style: "home", palette: "home", fonts: "home", category: "home" };
const PALETTE_NAMES = { white: "White", ivory: "Ivory", stone: "Stone", midnight: "Midnight" };
const FONT_NAMES = { modern: "Modern sans", serif: "Serif", classic: "Classic" };
const label = s => s.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());

let session = boot.sessionResponse?.session || null;
let revision = session?.revision ?? 0;
let saved = structuredClone(session?.answers || {});
let answers = structuredClone(saved);
if (!session) answers = { ...initialAnswers(boot.settings, boot.store, ref || {}), ...answers };
const launchStep = new Map([["1","domain"],["2","payments"],["3","delivery"]]).get(new URL(location.href).searchParams.get("launch"));
if (launchStep) location.replace(connectionHref(boot.store.store_id, launchStep));
let step = new URL(location.href).searchParams.get("logo") === "1" ? "story" :
  (UI_STEPS.some(s => s[0] === session?.current_step) ? session.current_step : session ? "review" : "business");
let touched = false, saving = false, conflict = false, notice = "", page = "product", productId, collectionId, policyKind;
let queue = Promise.resolve(), lastSavedAt = session ? "Saved plan restored." : "";
const notes = [];
let autosavePaused = false, saveProblem = "", logMarkup = "";
const attrState = new Map(); let attrToken = 0;
const clearedNote = boot.sessionResponse?.cleared_fields || [];

let previewMode = "showcase";
// Each visit begins with samples, including previously adopted designs.
// A remembered tab preference is not consent to use the merchant's catalogue.
let ownProductsConfirmed = false;
let pendingCatalogueAction = null;
let previewSource = { store: boot.store, settings: boot.settings, products: boot.products, collections: boot.collections, layouts: boot.layouts, policies: boot.policies, reviews: boot.reviews, aura_skeleton_enabled: boot.aura_skeleton_enabled, aura_starter_enabled: boot.aura_starter_enabled };
let base = stylePreviewData(previewSource, { showcase: previewMode === "showcase" });
const applicationUI = attachAnnApplication({ api, root, readOnly,
  context: () => ({ answers, revision, dirty: isDirty() }),
  mode: "catalogueOnly",
  suggestions: () => productHints(),
  beforePrepare: () => save(step === "review" ? "review" : "products"),
  onApplied: result => { refreshAnnDraft(result.draft);readinessUI.onStoreChanged();say("Your collection and products are saved as drafts. You can keep exploring with sample products, or choose your own above the preview."); },
});
const readinessUI = attachAnnReadiness({api,root,readOnly,
  onSaved:result=>refreshAnnDraft(result.draft),
});
const brandingUI=attachAnnBranding({api,readOnly,initial:boot.settings,
  onPreview:logo=>{
    const settings={logo_media_id:logo.id || null,logo_url:logo.url || ""};
    Object.assign(boot.settings,settings);Object.assign(previewSource.settings,settings);
    base=stylePreviewData(previewSource,{showcase:previewMode==="showcase"});renderPreview(false);
  },
  onSaved:()=>{readinessUI.onStoreChanged();drawKeep();},
  onContinue:()=>advance(),
});
const essentialsUI = attachStoreEssentials({api,storeId:boot.store.store_id});
// Onboarding controllers: brand and address write the REAL draft; gstin verifies explicitly.
let obDone = { brand: false, gst: false, address: false };
function refreshAnnDraft(draft){if(!draft)return;previewSource=structuredClone(draft);boot.settings={...draft.settings};boot.store={...boot.store,...draft.store};base=stylePreviewData(previewSource,{showcase:previewMode==="showcase"});renderPreview(false);}
function onboardingDraft(env, { initial = false } = {}) {
  const name = env.store?.name;
  if (name) { boot.store.name = name;boot.speakerName=name;answers.store_name=name;previewSource.store = { ...previewSource.store, name };const h=app.querySelector("h1");if(h)h.textContent=`Build ${name} with Ann`; }
  Object.assign(boot.settings, env.settings || {});
  previewSource.settings = { ...previewSource.settings, ...(env.settings || {}) };
  obDone.brand = !!name && !/^my store$/i.test(name);
  obDone.gst = env.verification?.state==="verified"&&env.verification?.confirmed===true&&env.settings?.gstin_invoice_identity_locked===true;
  if(!readOnly&&!obDone.gst&&curIdx(prompts())>prompts().findIndex(p=>p.id==="gstin")){promptId="gstin";step="business";editing=null;detail=false;}
  // Brand and GST writes refresh the preview source only. Sample or own products consent is untouched.
  base = stylePreviewData(previewSource, { showcase: previewMode === "showcase" });
  if (!initial && obDone.brand && !readOnly && answers.store_name !== name) edit(() => { answers.store_name = name.slice(0, 120); });
  renderPreview(false); readinessUI.onStoreChanged(); if (initial) drawKeep();
}
const obCommon = { api, storeId, readOnly, onDraft: onboardingDraft, onContinue: () => advance(),
  onStateChange:()=>queueMicrotask(()=>drawComposer(true)),
  onPreview: ({ brand_name }) => { previewSource.settings = { ...previewSource.settings, brand_name }; base = stylePreviewData(previewSource, { showcase: previewMode === "showcase" }); renderPreview(false); } };
const brandUI = attachAnnOnboarding({ ...obCommon, mode: "brand" });
const gstUI = attachAnnOnboarding({ ...obCommon, mode: "gstin" });
queueMicrotask(()=>{void gstUI.refresh();});
const addressUI = attachAnnOnboarding({ ...obCommon, mode: "address", onContinue: () => { obDone.address = true; advance(); } });
const obUIs = { brand: brandUI, gstin: gstUI, address: addressUI };
const extrasNow = currentExtras(base.layouts);
const bag = new Map((base.products || []).slice(0, 2).map(p => [p.id, 1]));
const frame = $("#ann-preview"), canvas = $("#ann-canvas"), log = $("#ann-log"), foot = $("#ann-foot"), statusEl = $("#ann-status");
$("#ann-open-browser")?.addEventListener("click",()=>{
  renderPreview();
  if(!openAnnBrowserPreview({data:current,theme:config().theme,page,productId,collectionId,policyKind,device:canvas.dataset.device,bag}))
    say("Please allow pop-ups for this site, then choose Open browser preview again.");
});
const app = $("#ann-app");
const say = t => { statusEl.textContent = t; };
const config = () => annPreviewConfiguration(answers, { ...boot.settings, ...(boot.sessionResponse?.preview?.theme || {}) });
let designUI = null, workspaceUI = null;
designUI = attachAnnDesign({ api, root, readOnly, mount: canvas, say, contextual: true, getPreview: () => frame,
  sectionState: id => sectionInfo().meta.get(id) || null, onSectionAction: (id, act) => sectionAction(id, act),
  getAnswers: () => answers, getPreviewMode: () => previewMode, getBrand: () => boot.settings?.brand_name || boot.store?.name,
  getStyle: () => config().theme.style_preset,
  applyPlan: plan => {const catalogue=Object.fromEntries(["collections","product_ideas"].filter(k=>Object.hasOwn(answers,k)).map(k=>[k,structuredClone(answers[k])]));answers={...structuredClone(plan),...catalogue};},
  onDraft: draft => { previewSource = draft; },
  onActivated: ({ useOwnProducts = false, restored = false } = {}) => { if (useOwnProducts) ownProductsConfirmed = true; saved = structuredClone(answers); touched = false; autosavePaused = false; saveProblem = ""; conflict = false;
    // The saved merchant design is shown immediately. Sample catalogue is a separate choice: only real products need consent.
    setPreviewMode("store", previewSource); page = ownProductsConfirmed && !previewSource.products?.some(p => p.status !== "archived") ? "home" : "product"; draw("keep"); renderPreview(false); workspaceUI?.refresh();
    if (!restored && !readOnly) workspaceUI?.open();
    say(ownProductsConfirmed ? "Your design is saved to draft. Select text or a photo to edit it. Your live site is unchanged." : restored ? "Welcome back. Your saved design is open for editing with sample products. Choose your own products whenever you are ready." : "Your style is adopted as your draft. Edit it here with sample products. Your live site is unchanged."); },
  onChange: () => { schedule(); drawFoot(); },
  onCatalogueConfirmed: () => { ownProductsConfirmed = true; setPreviewMode("store"); const next = pendingCatalogueAction; pendingCatalogueAction = null; next?.(); draw("keep"); renderPreview(false); say("You are now previewing your own products. Your catalogue and live site have not changed."); },
  openCanvas: () => { if(designUI?.hasUnsavedChanges()){say("Save your draft changes first, then open the theme editor so you see the same design.");return;}location.assign(`${root}/editor`); },
  backToDesign: plan => { answers = { ...answers, ...structuredClone(plan) }; setPreviewMode("store"); draw("keep"); renderPreview(false); },
});

let wsCache = { key: "", value: { meta: new Map(), map: new Map() } };
function baseHtml() {
  const d = current?.settings?.ann_design; if (!d) return "";
  const b = structuredClone(current); b.settings.ann_design.sections = {};
  return renderStylePreview(b, config().theme, { page, productId, collectionId, policyKind, designEdit: true });
}
function sectionInfo() {
  const d = current?.settings?.ann_design, key = JSON.stringify([page, productId, collectionId, d?.style, d?.sections, answers.section_options, displayedKey]);
  if (!d) return { meta: new Map(), map: new Map() };
  if (wsCache.key !== key) wsCache = { key, value: sectionMeta(baseHtml(), d.sections || {}, page) };
  return wsCache.value;
}
function sectionAction(id, act) {
  if (readOnly || !designUI?.active()) return;
  const next = nextSections(baseHtml(), designUI.previewDesign()?.sections || {}, page, id, act);
  if (next) { designUI.setSections(next); workspaceUI?.refresh(); }
}
workspaceUI = attachAnnWorkspace({ mount: $("#ann-tools"), readOnly, controller: () => designUI,
  canEdit: () => previewMode === "store" && Boolean(designUI?.previewDesign()),
  getPage: () => page, getPlan: () => ({ ...config().theme, section_options: { ...extrasNow, ...answers.section_options } }),
  sectionInfo, onSectionAction: sectionAction,
  setPlan: (k, v) => edit(() => { answers[k] = v; }),
  setExtra: (type, on) => { edit(() => { const o = { ...extrasNow, ...answers.section_options }, vals = new Set(o[page] || []); on ? vals.add(type) : vals.delete(type); answers.section_options = { ...o, [page]: [...vals] }; });
    if (on) { const secs = structuredClone(designUI.previewDesign()?.sections || {}); if (secs[page]?.hidden) { secs[page].hidden = secs[page].hidden.filter(x => x !== `slot-${type}-0`); designUI.setSections(secs); } }
    workspaceUI.refresh(); },
  onToggle: on => { canvas.dataset.tools = on ? "open" : "closed"; document.querySelector("[data-ws-toggle]")?.setAttribute("aria-pressed", String(on)); fit(); },
});
const designDirty = () => Boolean(designUI?.hasUnsavedChanges());
const dirtyPatch = () => diffAnswers(saved, answers);
const isDirty = () => (touched && Object.keys(dirtyPatch()).length > 0) || designDirty();
const subsFor = c => (ref?.subcategories || []).filter(s => Number(s.category_id) === Number(c));
const catName = id => (ref?.categories || []).find(c => Number(c.category_id) === Number(id))?.name;
const subName = id => (ref?.subcategories || []).find(s => Number(s.subcategory_id) === Number(id))?.name;
const styleName = id => AURA_STYLES.find(s => s.id === id)?.name || "Saved style";
const sections = () => answers.section_options || {};
const shown = p => sections()[p] ?? extrasNow[p] ?? [];

/* ---------- preview ---------- */
let current = null, displayedKey = "", timer = 0, frameMarkup = "", frameLoading = false;
const scrolls = new Map();
const previewBags = new Map();
let activeBagKey = "";
const posKey = () => JSON.stringify([previewMode, config().theme.style_preset, page, productId || "", collectionId || "", canvas.dataset.device]);
function setPreviewMode(mode, source) {
  rememberScroll();
  // Viewing a saved design (sample or own catalogue) needs no consent. Only a design-less real catalogue preview does.
  if (mode === "store" && !ownProductsConfirmed && !designUI?.active()) mode = "showcase";
  const changed = previewMode !== mode || Boolean(source);
  previewMode = mode;
  if (source) previewSource = source;
  base = stylePreviewData(previewSource, { showcase: mode === "showcase" });
  if (changed) {
    productId = undefined; collectionId = undefined;
  }
}
function requestOwnProducts(after) {
  if (!ownProductsConfirmed) {
    pendingCatalogueAction = after || null;
    designUI?.requestCatalogue();
    say("Ready to see your own products? Confirm the choice above the preview. You can stay with samples instead.");
    return false;
  }
  setPreviewMode("store");
  after?.();
  return true;
}
function rememberScroll() {
  const d = frame.contentDocument;
  if (displayedKey && d) scrolls.set(displayedKey, d.scrollingElement?.scrollTop ?? 0);
}
function renderPreview(remember = true) {
  clearTimeout(timer);
  if (remember) rememberScroll();
  const cfg = config();
  designUI?.refresh();
  const projected = projectAnnPreview(base, cfg, { prefilled: prefilledSection, attributes: attrState.get(answers.subcategory_id)?.attrs || [] });
  const candidate=designUI?.previewDesign();
  // The showcase never overlays the merchant design; only the Your store view does.
  const dsg = previewMode === "store" ? candidate : null;
  current = dsg ? designPreviewData(previewSource, dsg) : projected.data;
  const pack = resolveShowcasePack(current);
  const bagKey = `${previewMode}:${current.style_demo ? pack.key : "real"}`;
  if (bagKey !== activeBagKey) {
    if (activeBagKey) previewBags.set(activeBagKey, new Map(bag));
    bag.clear();
    const remembered = previewBags.get(bagKey);
    for (const [id, quantity] of remembered || current.products.slice(0, 2).map(p => [p.id, 1]))
      if (current.products.some(p => p.id === id)) bag.set(id, quantity);
    activeBagKey = bagKey;
  } else {
    for (const id of bag.keys()) if (!current.products.some(p => p.id === id)) bag.delete(id);
  }
  if (!productId || !current.products.some(p => p.id === productId)) productId = current.products[0]?.id;
  displayedKey = posKey();
  frame.title = `${dsg ? "Your store design" : previewMode === "showcase" ? "Style showcase" : "Your store"}, ${styleName(cfg.theme.style_preset)}, ${canvas.dataset.device} preview`;
  const html = renderStylePreview(current, cfg.theme, { page, productId, collectionId, policyKind, designEdit: Boolean(dsg) && designUI.editing() });
  if (html !== frameMarkup) { frameMarkup = html; frameLoading = true; frame.srcdoc = html; }
  else if (!frameLoading) previewLoaded();
  const niche = subName(answers.subcategory_id) || catName(answers.category_id);
  $("#ann-preview-note").textContent = (previewMode === "showcase" ? `The same ${pack.topic} sample images and products are used across all ${AURA_STYLES.length} styles.${!pack.exact ? ` These are placeholder images${niche ? ` for your selected niche, ${niche}` : ""}; a matching image set is not available yet.` : ""} Sample products and prices are illustrative. Select Your store to see your existing catalogue. ` : base.style_demo ? "No real products yet. Sample images and illustrative prices fill this preview. " : "Your actual catalogue is shown alongside remaining planned ideas. ") +
    "Preview controls never create products, orders or publications. Use the confirmed actions in Review to save real draft changes." +
    (projected.unavailable.length ? ` Some optional sections cannot be previewed here: ${projected.unavailable.map(u => label(u.split(":")[1])).join(", ")}.` : "");
  if (dsg) $("#ann-preview-note").textContent = `This is your draft design with ${dsg.catalogue_mode==="sample" ? "sample products and illustrative prices" : "your real products"}. Select text or a photo to change it. Nothing is published until you review and publish. Your live site is unchanged.`;
  paintStage(); workspaceUI?.refresh();
}
const schedule = (ms = 70) => { clearTimeout(timer); canvas.dataset.updating = "true"; const u = $("#ann-updated"); if (u) { u.hidden = false; u.dataset.state = "pending"; u.textContent = "Updating preview"; } timer = setTimeout(() => renderPreview(), ms); };
function paintStage() {
  const cfg = config();
  $("#ann-style-tabs").innerHTML = AURA_STYLES.map(s => `<button type="button" class="ann-tab" data-pick-style="${s.id}" aria-pressed="${cfg.theme.style_preset === s.id}">${esc(s.name)}</button>`).join("");
  $("#ann-pages").innerHTML = PAGES.map(p => `<button type="button" class="ann-tab" data-page="${p}" aria-pressed="${p === page}">${p}</button>`).join("");
  document.querySelectorAll("[data-preview-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.previewMode === previewMode)));
}
function fit() {
  const width = canvas.dataset.device === "mobile" ? 390 : 1280;
  const tools = canvas.dataset.tools === "open" && (window.innerWidth || 1280) >= 700 ? 296 : 0, cw = Math.max(240, (canvas.clientWidth || 800) - tools);
  const availW = Math.max(240, cw - 24), availH = Math.max(320, (canvas.clientHeight || 700) - 24);
  const scale = Math.min(1, availW / width);
  Object.assign(frame.style, { width: `${width}px`, minWidth: `${width}px`, height: `${availH / scale}px`, transform: `scale(${scale})`, transformOrigin: "top left", left: `${Math.max(0, (cw - width * scale) / 2)}px` });
}
frame.addEventListener("load", () => {
  const doc = frame.contentDocument; if (!doc) return;
  frameLoading = false;
  previewLoaded();
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
  designUI.bindPreview(doc);
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
    attrState.set(subId, { status: "ready", token, attrs: Array.isArray(body.attributes) ? body.attributes : [],suggestions:Array.isArray(body.product_suggestions)?body.product_suggestions:[] });
  } catch (e) {
    if (attrState.get(subId)?.token !== token) return;
    attrState.set(subId, { status: "error", token, error: e.message });
  }
  if (Number(answers.subcategory_id) === Number(subId) && step === "products") drawKeep();
}
const attrName = a => a.name || a.label || a.question || `Question ${a.id}`;
const valName = v => v.label || v.name || v.value || `Option ${v.id}`;

/* ---------- conversation ---------- */
const reduce = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const dis = readOnly ? " disabled" : "";
const annContent = html => `<span class="ann-av" aria-hidden="true">A</span><div class="ann-message-content"><span class="ann-speaker">Ann</span><div class="ann-bubble">${html}</div></div>`;
const bubble = (html, cls = "") => `<div class="ann-msg ${cls}">${annContent(html)}</div>`;
const annBubble = (text, cls = "", attrs = "") => `<div class="ann-msg ${cls}"${attrs}>${annContent(`<p>${esc(text)}</p>`)}</div>`;
const CHECK = `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 6.5l2.6 2.5L10 3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

const feeds = {};
const composerDrafts = new Map(), composerOriginals = new Map();
let editing = null, detail = false, navigating = false, focusComposer = false, composerKey = "";
let promptId = "category", reached = "category";
const DETAIL_STEPS = ["collections", "products", "story"];

function prompts() {
  const list = [{ id: "store_name", step: "business" }, { id: "gstin", step: "business" }, { id: "logo", step: "business" }, { id: "included_address", step: "selling" },
    { id: "style", step: "style" }, { id: "bg", step: "palette" }, { id: "accent", step: "palette" }, { id: "button", step: "palette" }, { id: "font", step: "fonts" }, { id: "category", step: "category" }];
  if (!answers.category_id || subsFor(answers.category_id).length) list.push({ id: "subcategory", step: "category" });
  list.push({ id: "collections", step: "collections" });
  const cols = answers.collections || [];
  if (cols.length) for (const c of cols) list.push({ id: `ideas:${c.key}`, step: "products", col: c.key }); else list.push({ id: "ideas:none", step: "products" });
  list.push({ id: "catalogue", step: "products" }, { id: "sections", step: "story" }, { id: "review", step: "review" });
  return list.filter(p => UI_STEPS.some(s => s[0] === p.step));
}
function curIdx(ps = prompts()) {
  let i = ps.findIndex(p => p.id === promptId);
  if (i < 0) { i = Math.max(0, ps.findIndex(p => p.step === step)); promptId = ps[i].id; }
  return i;
}
const reachedIdx = ps => Math.max(curIdx(ps), ps.findIndex(p => p.id === reached));
promptId = new URL(location.href).searchParams.get("logo") === "1" ? "logo" : prompts().find(p => p.step === step)?.id || "category"; reached = promptId;

const cur = ps => (ps || prompts())[curIdx(ps)];
const uniqueAccents = () => [...new Map(AURA_STYLES.map(s => [s.settings.accent_color.toLowerCase(), s.name])).entries()].map(([v, n]) => ({ v, t: `${n} accent` }));
const sectionsReply = () => Object.keys(ANN_EXTRA_SECTIONS).map(pg => `${label(pg)}: ${shown(pg).map(label).join(", ") || "none"}`).join(". ");

function def(p) {
  const a = answers, t = config().theme, [k] = p.id.split(":");
  const sel = (lab, q, opts, cv, pick, extra = {}) => ({ kind: "choice", label: lab, q, opts, cur: String(cv ?? "").toLowerCase(), pick, reply: opts.find(o => String(o.v).toLowerCase() === String(cv ?? "").toLowerCase())?.t || "", ...extra });
  const txt = (key, lab, q, max, ph, area) => ({ kind: "text", key, label: lab, q, max, ph, area, reply: a[key] || "" });
  const setKey = key => v => { answers[key] = v; };
  switch (k) {
    case "category": return sel("Category", "What category of products do you sell? Pick your closest match.",
      (ref?.categories || []).map(c => ({ v: c.category_id, t: c.name })), a.category_id, v => {
        const r = changeCategory(answers, Number(v)); answers = r.answers;
        const bits = []; if (r.cleared.subcategory) bits.push("the subcategory");
        if (r.cleared.attributes) bits.push(`${r.cleared.attributes} product detail choice${r.cleared.attributes === 1 ? "" : "s"}`);
        notice = bits.length ? `Changing category cleared ${bits.join(" and ")} because they belonged to the old category. Your product names and descriptions are kept.` : "";
      });
    case "subcategory": return sel("Product type", `Lovely! Which type of ${catName(a.category_id) || "products"} do you sell?`, subsFor(a.category_id).map(s => ({ v: s.subcategory_id, t: s.name })), a.subcategory_id, v => {
      const r = changeSubcategory(answers, Number(v)); answers = r.answers;
      notice = r.cleared.attributes ? `Changing subcategory cleared ${r.cleared.attributes} product detail choice${r.cleared.attributes === 1 ? "" : "s"}. Your product names and descriptions are kept.` : "";
    });
    case "style": return sel("Style", "Let's find your look! Tap a style and watch your store change. You can switch any time.",
      AURA_STYLES.map(s => ({ v: s.id, t: s.name, sub: s.description, c: s.settings.accent_color })), t.style_preset, v => {
        const s = styleSettings(v); setPreviewMode("showcase");
        for (const key of ["style_preset", "color_preset", "font_preset", "accent_color", "button_style"]) if (s[key] !== undefined) answers[key] = s[key];
      }, { stack: true });
    case "bg": return sel("Background colour", "Which background makes your products stand out? Tap to try it.", ANN_PALETTES.map(v => ({ v, t: PALETTE_NAMES[v] || label(v) })), t.color_preset, setKey("color_preset"));
    case "accent": return { ...sel("Button colour", "Pick a colour for buttons and highlights, or choose your own.", uniqueAccents(), t.accent_color, setKey("accent_color")), kind: "accent", reply: t.accent_color, color: t.accent_color };
    case "button": return sel("Button shape", "Square, soft or rounded? Pick your button shape.", ["square", "rounded", "pill"].map(v => ({ v, t: label(v) })), t.button_style, setKey("button_style"));
    case "font": return sel("Fonts", "Which lettering feels like your brand? Tap to try a font.", ANN_FONTS.map(v => ({ v, t: FONT_NAMES[v] || label(v) })), t.font_preset, setKey("font_preset"));
    case "collections": { const items = (a.collections || []).map((c, i) => [c, i]);
      return { kind: "list", list: "col", label: "Collection", q: "Let's group your products. Name your first collection, like New arrivals. You can add more later.", ph: "For example, Everyday essentials", max: 100, items, reply: items.map(([c]) => c.name).join(", "), full: items.length >= 10 }; }
    case "ideas": {
      if (p.id === "ideas:none") return { kind: "info", label: "Products", q: "Add a collection to start your products, or explore with samples for now.", reply: "" };
      const col = (a.collections || []).find(c => c.key === p.col);
      const items = (a.product_ideas || []).map((x, i) => [x, i]).filter(([x]) => x.collection_key === p.col);
      return { kind: "list", list: "idea", label: "Product idea", q: `What goes in ${col?.name || "this collection"}? Pick up to five products, or type your own.`, ph: "For example, Soft cotton tote", max: 120, items, col: p.col, reply: items.map(([x]) => x.name).join(", "), full: items.length >= 5 || (a.product_ideas || []).length >= 50, sugg: suggestions() };
    }
    case "store_name": return { kind: "onboard", mode: "brand", label: "Store name", q: "Hi, I'm Ann! Let's bring your store to life. What's your brand name?", max: 40, ph: "Type your brand name", reply: brandUI.summary() };
    case "gstin": return { kind: "onboard", mode: "gstin", label: "GST details", q: "Type your GSTIN to find your registered name and address. These go on your invoices and cannot change after confirmation.", reply: gstUI.summary() };
    case "included_address": return { kind: "onboard", mode: "address", label: "Store address", q: "Here's your store's web address. Keep it, or type a new name below. You can connect your own domain later in Settings.", reply: addressUI.summary() };
    case "catalogue": return { kind: "catalogue", label: "Create products", q: "Ready to create draft products? Check each price, HSN, GST rate and stock. You can also do this later.", reply: "" };
    case "logo": return {kind:"logo",label:"Brand logo",q:`Add a logo for ${a.store_name || boot.store.name || "your brand"}. No logo yet? We'll use your brand name.`,reply:brandingUI.reply()};
    case "tagline": return txt("tagline", "Tagline", "Describe your brand in a few words, like Everyday comfort, made yours. Or skip for now.", 160, "A few words about your brand");
    case "description": return txt("description", "About your brand", "What's your brand's story? A couple of lines about what makes it special is plenty.", 1200, "Why you started and what makes your products special", true);
    case "sections": return { kind: "sections", label: "Optional sections", q: "Make it yours! Tap to add or remove sections, like your story or FAQs.", reply: sectionsReply() };
    default: return { kind: "review", label: "Review", q: "", reply: "" };
  }
}

function productHints(){return (attrState.get(answers.subcategory_id)?.suggestions||[]).filter(x=>x&&typeof x.name==="string"&&x.name.trim());}
const suggestions = () => productHints();
const listHtml = d => `<ul class="ann-items">${d.items.map(([it, i]) => `<li><span class="ann-it">${esc(it.name || "Untitled")}${it.description ? `<small>${esc(it.description)}</small>` : ""}</span><span class="ann-item-actions"><button type="button" class="ann-link" data-edit-item="${d.list}:${i}:name"${dis}>Rename</button><button type="button" class="ann-link" data-edit-item="${d.list}:${i}:description"${dis}>${it.description ? "Edit note" : "Add note"}</button><button type="button" class="ann-link" data-del-${d.list}="${i}"${dis}>Remove</button></span></li>`).join("")}</ul>`;
const meBubble = (html, btn = "") => `<div class="ann-msg me">${btn}<div class="ann-message-content"><span class="ann-speaker">${esc(answers.store_name?.trim() || boot.store.name?.trim() || boot.speakerName || "You")}</span><div class="ann-bubble">${html}</div></div></div>`;
const feedHtml = f => `<p class="ann-feed" data-state="${f.done ? "done" : "pending"}"><span class="ann-dot" aria-hidden="true"></span><span class="ann-feed-t">${esc(f.text)}</span><span class="ann-feed-s">${f.done ? "Preview updated" : "Updating preview"}</span><button type="button" class="ann-link ann-see" data-view-switch="canvas">See preview</button></p>`;
const feed = (id, text) => { feeds[id] = { text, done: false }; };
const item = () => editing && (editing.kind === "col" ? answers.collections : answers.product_ideas)?.[editing.i];
function editQ() {
  const it = item(); if (!it) return "";
  const n = it.name || "this one";
  return editing.follow ? `Would you like a one-line note for "${n}"? You can skip it.` : editing.field === "name" ? `What should "${n}" be called?` : `What is the new note for "${n}"?`;
}

function timeline() {
  if (!ref && step !== "review") return annBubble("I cannot load the category reference right now, so I cannot offer choices. Reload this page to try again.");
  const ps = prompts(), ci = curIdx(ps), ri = reachedIdx(ps);
  let out = "", last = "";
  ps.slice(0, ri + 1).forEach((p, i) => {
    const d = def(p), active = i === ci;
    if (p.step !== last) { last = p.step; const n = UI_STEPS.findIndex(s => s[0] === p.step); out += `<p class="ann-mark"><span>${n + 1} of ${UI_STEPS.length}</span>${esc(UI_STEPS[n][1])}</p>`; }
    if (p.id === "review") {
      if (active) out += `<span id="ann-review-start"></span>${reviewStep()}`;
      return;
    }
    out += annBubble(d.q, active ? "is-active" : "", active ? ' id="ann-active"' : "");
    if (active && notice) out += `<p class="ann-callout" role="status">${esc(notice)}</p>`;
    if (d.kind === "list") { if (d.items.length) out += meBubble(listHtml(d)); }
    else if (!active && d.kind !== "info" && (d.reply || i < ri)) out += meBubble(d.reply ? `<span class="ann-reply">${esc(d.reply)}</span>` : "<em>Skipped</em>", readOnly ? "" : `<button type="button" class="ann-edit" data-edit-prompt="${esc(p.id)}" aria-label="Edit your answer to ${esc(d.label)}">Edit</button>`);
    if (feeds[p.id]) out += feedHtml(feeds[p.id]);
    if (active && editing) out += annBubble(editQ());
    if (active) out += inlineControls(p, d);
  });
  return out;
}

const collectionsDetail = () => { const cols = answers.collections || [];
  return bubble(`${cols.length ? cols.map((c, i) => `<fieldset class="ann-item"><legend>Collection ${i + 1}</legend>
    <label class="ann-field">Name<input data-col="${i}" data-f="name" maxlength="100" value="${esc(c.name)}"${dis}></label>
    <label class="ann-field">Description<textarea data-col="${i}" data-f="description" maxlength="800" rows="2"${dis}>${esc(c.description || "")}</textarea></label>
    <button type="button" class="ann-link" data-del-col="${i}"${dis}>Remove collection</button></fieldset>`).join("") : `<p class="ann-empty">No collections yet.</p>`}
    <button type="button" class="ann-btn alt" data-add-col${cols.length >= 10 || readOnly ? " disabled" : ""}>Add a collection</button>`, "ann-card"); };
const storyDetail = () => { const a = answers;
  return bubble(`<h2>Optional sections</h2><p class="ann-note">These show in the preview and are saved as a plan only. Core shopping sections stay as they are.</p>
    ${Object.entries(ANN_EXTRA_SECTIONS).map(([p, list]) => `<fieldset class="ann-sections"><legend>${label(p)} page</legend>${list.map(t => `<label class="ann-check"><input type="checkbox" data-section="${p}:${t}" ${shown(p).includes(t) ? "checked" : ""}${dis}><span>${esc(label(t))}</span></label>`).join("")}<button type="button" class="ann-link" data-view-page="${p}">Show this page</button></fieldset>`).join("")}`, "ann-card"); };
const detailHtml = () => `<section class="ann-detail" aria-label="Detailed editor"><div class="ann-detail-h"><h2>Detailed editor</h2><button type="button" class="ann-link" data-toggle-detail>Close</button></div>${step === "products" ? productsStep() : step === "collections" ? collectionsDetail() : storyDetail()}</section>`;

/* ---------- composer ---------- */
function composerKeyFor(p, d) {
  return JSON.stringify([p.id, editing ? { kind: editing.kind, key: item()?.key, field: editing.field, follow: editing.follow } : null, d.kind, readOnly]);
}
/* Inline controls: rendered in the timeline directly under the active Ann question. */
function inlineControls(p, d) {
  const detailLink = DETAIL_STEPS.includes(p.step) && d.kind !== "info" ? `<button type="button" class="ann-link" data-toggle-detail aria-expanded="${detail}">${detail ? "Close detailed editor" : "Open detailed editor"}</button>` : "";
  const tail=detailLink+(p.step==="products"&&p.id!=="catalogue"&&answers.product_ideas?.length?`<div class="ann-comp-row"><button type="button" class="ann-btn" data-go-prompt="catalogue"${dis}>Set prices and save products</button><p class="ann-note">Ready with your first product? Confirm its price, tax and stock next. You can add more products and details later.</p></div>`:"");
  let body = "", name = d.label;
  if (d.kind === "onboard") {
    body = `<div id="ann-ob-${d.mode}-slot"></div>`;
  } else if (d.kind === "catalogue") {
    body = `<div id="ann-application-slot"></div><div class="ann-comp-row"><button type="button" class="ann-btn alt" data-continue>Continue without creating products</button></div>`;
  } else if (d.kind === "logo") {
    body=`<div id="ann-branding-slot">${brandingUI.html()}</div>`;
  } else if (d.kind === "choice" || d.kind === "accent") {
    body = `<div class="ann-chips${d.stack ? " stack" : ""}">${d.opts.map(o => `<button type="button" class="ann-chip" data-pick="${esc(o.v)}" aria-pressed="${String(o.v).toLowerCase() === d.cur}"${o.c || d.kind === "accent" ? ` style="--c:${esc(o.c || o.v)}"` : ""}${dis}>${o.c || d.kind === "accent" ? `<i class="ann-sw" aria-hidden="true"></i>` : ""}<strong>${esc(o.t)}</strong>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</button>`).join("")}
      ${d.kind === "accent" ? `<label class="ann-chip ann-color"><strong>Custom</strong><input type="color" data-accent-input value="${esc(d.color)}" aria-label="Custom accent colour"${dis}></label>` : ""}</div>
      <div class="ann-comp-row">${d.reply || readOnly ? `<button type="button" class="ann-btn alt" data-continue>${readOnly ? "Continue" : `Keep ${esc(d.reply)} and continue`}</button>` : ""}${d.kind === "choice" && !d.opts.length ? `<p class="ann-note">Nothing to choose here yet.</p>` : ""}</div>`;
  } else if (d.kind === "sections") {
    name = "Optional sections";
    body = `${Object.entries(ANN_EXTRA_SECTIONS).map(([pg, l]) => `<div class="ann-sec-row"><span>${label(pg)} page</span><div class="ann-chips">${l.map(s => `<button type="button" class="ann-chip sm" data-toggle-section="${pg}:${s}" aria-pressed="${shown(pg).includes(s)}"${dis}><strong>${esc(label(s))}</strong></button>`).join("")}</div></div>`).join("")}
      <div class="ann-comp-row"><button type="button" class="ann-btn" data-continue>${readOnly ? "Continue" : "Review my store"}</button>${tail}</div>`;
  } else if (d.kind === "text" || d.kind === "list") {
    const have = new Set((answers.product_ideas || []).map(x => x.name.trim().toLowerCase()));
    const pills = !editing && d.list === "idea" && d.sugg?.length ? `<div class="ann-chips ann-product-suggestions" role="group" aria-label="Product name suggestions">${d.sugg.filter(x => !have.has(x.name.trim().toLowerCase())).slice(0, 8).map(x => `<button type="button" class="ann-chip sm" data-suggest="${esc(x.name)}"${d.full ? " disabled" : dis}><strong>${esc(x.name)}</strong>${x.hsn_code ? `<span>HSN ${esc(x.hsn_code)}</span>` : ""}</button>`).join("")}</div><details class="ann-hsn-help"><summary>About HSN suggestions</summary><p class="ann-note">These are suggested 4-digit headings, not verified tax codes. Confirm your product's exact HSN and GST rate before saving.</p></details>` : "";
    const btn = editing ? `<button type="button" class="ann-btn alt" data-cancel-edit>${editing.follow ? "Skip note" : "Cancel"}</button>` : d.kind === "list" ? `<button type="button" class="ann-btn alt" data-continue>${d.items.length ? "Continue" : "Skip for now"}</button>` : `<button type="button" class="ann-btn alt" data-continue>${d.reply ? "Keep and continue" : "Skip"}</button>`;
    body = `${pills}<div class="ann-comp-row">${btn}${editing ? "" : tail}${p.step === "products" && !answers.subcategory_id ? `<button type="button" class="ann-link" data-go="category">Choose a subcategory for product questions</button>` : ""}</div>`;
  } else if (d.kind === "info") {
    body = `<div class="ann-comp-row"><button type="button" class="ann-btn" data-continue>Continue with samples</button><button type="button" class="ann-btn alt" data-go="collections">Add a collection</button></div>`;
  } else return "";
  return `<div class="ann-inline" role="group" aria-label="${esc(name)} options">${body}</div>`;
}

/* ---------- composer: always-available message box at the bottom ---------- */
function drawComposer(force) {
  const box = $("#ann-composer"); if (!box) return;
  const ps = prompts(), p = cur(ps), d = def(p);
  const linked = d.kind==="onboard"?null:replyFields.current(), onboarding = d.kind==="onboard" ? obUIs[d.mode]?.composer() : null;
  const key = linked ? `field:${linked.key}` : composerKeyFor(p, d);
  const ae = document.activeElement;
  const hadFocus = box.contains(ae) && ae.tagName === "TEXTAREA";
  if (!force && key === composerKey && hadFocus) return;
  const sel = hadFocus ? [ae.selectionStart, ae.selectionEnd] : null;
  // Input events already retain drafts. Do not recapture the old textarea here:
  // a successful send deliberately clears it before moving to the next prompt.
  composerKey = key;
  const it = editing ? item() : null;
  const choiceLike = d.kind === "choice" || d.kind === "accent";
  const field = editing ? editing.field : "name";
  const max = linked?.max || onboarding?.max || (choiceLike ? 120 : editing ? (editing.kind === "col" ? (field === "name" ? 100 : 800) : (field === "name" ? 120 : 1200)) : d.max || 120);
  const original = linked ? linked.value : onboarding ? onboarding.value : choiceLike ? "" : editing ? (it?.[field] || "") : d.kind === "text" ? d.reply : "";
  composerOriginals.set(key, original);
  const val = composerDrafts.get(key) ?? original;
  const area = linked ? linked.area : !choiceLike && (editing ? field === "description" : d.area);
  const full = !editing && d.kind === "list" && d.full;
  const idle = !linked&&!onboarding&&["info", "review", "sections", "catalogue", "launch", "logo"].includes(d.kind);
  const off = readOnly || full || idle || linked?.disabled || onboarding?.disabled;
  const ph = readOnly ? "Viewing only" : linked ? linked.placeholder : onboarding ? onboarding.placeholder : full ? "Limit reached" : idle ? "Choose an option above to continue" : choiceLike ? `Type your ${d.label.toLowerCase()} choice` : editing ? (editing.follow ? "Type a note, or skip it above" : "Type your change") : d.ph || "Type your answer";
  const lab = linked?.label || onboarding?.label || (editing ? (editing.follow ? "Optional note" : editing.field === "name" ? "New name" : "New note") : d.label);
  box.innerHTML = `<form class="ann-form ann-compose" data-composer novalidate><label class="ann-sr" id="ann-cq" for="ann-input">Reply to Ann: ${esc(lab)}</label>
    ${linked?`<p class="ann-note ann-reply-context">Replying to ${esc(linked.label)}</p>`:""}<div class="ann-input"><textarea id="ann-input" data-composer-input rows="${area ? 3 : 1}" maxlength="${max}"${linked?.inputMode?` inputmode="${esc(linked.inputMode)}"`:""} aria-describedby="ann-count" placeholder="${esc(ph)}"${off ? " disabled" : ""}>${esc(val)}</textarea>
    <button type="submit" class="ann-send" aria-label="Send"${off ? " disabled" : ""}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></div>
    <span id="ann-count" class="ann-note ann-hint">${off ? "" : `<span data-count>${val.length}</span> of ${max}. Enter sends, Shift+Enter adds a line. Your reply answers Ann's current question.`}</span></form>`;
  const ta = box.querySelector("textarea");
  if (ta && val) { ta.style.height = "auto"; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; }
  if (ta && !ta.disabled && (focusComposer || hadFocus)) {
    focusComposer = false;
    ta.focus({ preventScroll: true });
    const s = sel || [ta.value.length, ta.value.length];
    ta.setSelectionRange(Math.min(s[0], ta.value.length), Math.min(s[1], ta.value.length));
  } else focusComposer = false;
}


/* ---------- panel drawing ---------- */
function drawSteps() {
  const answered = new Set(annAnsweredStages(answers, ref || {}));
  if (obDone.brand) answered.add("business"); if (obDone.address) answered.add("selling");
  const doneN = answered.size, total = UI_STEPS.filter(([k]) => !["domain","payments","shipping","review"].includes(k)).length;
  const state = isDirty() ? "Unsaved changes" : designUI?.active() ? "Design saved to draft" : session ? "Plan saved" : "Nothing saved yet";
  $("#ann-steps").innerHTML = `<div class="ann-rail">${UI_STEPS.map(([k, n], i) => { const st = k === step ? "current" : answered.has(k) ? "done" : "todo";
    return `<button type="button" data-go="${k}" data-state="${st}" aria-current="${k === step ? "step" : "false"}"><i>${st === "done" ? CHECK : i + 1}</i>${esc(n)}${st === "done" ? `<span class="ann-sr"> answered</span>` : ""}</button>`; }).join("")}</div>
    <div class="ann-meter" role="progressbar" aria-label="Planning progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${doneN}"><i style="transform:scaleX(${doneN / total})"></i></div>
    <p class="ann-meter-t">${doneN} of ${total} design areas filled. ${esc(state)}. Publishing checks are separate.</p>`;
}
function drawFoot() {
  const sb = $("#ann-savebar"); if (!sb) return;
  const i = curIdx(), dirty = isDirty();
  sb.innerHTML = `${readOnly ? `<p class="ann-callout">You can look around, but only an owner or admin can save this plan.</p>` : ""}
    ${saveProblem ? `<p class="ann-callout" role="alert">${esc(saveProblem)} You can keep previewing. Your changes are not saved yet; use Retry save.</p>` : ""}
    ${conflict ? `<div class="ann-conflict" role="alert"><p>Another tab or person saved a newer plan. Your edits are still here and nothing was overwritten.</p><div class="ann-actions"><button type="button" class="ann-btn alt" data-reload>Load the saved plan</button><button type="button" class="ann-btn" data-overwrite>Keep my edits and save over it</button></div></div>` : ""}
    <div class="ann-savebar-row"><button type="button" class="ann-btn alt sm" data-back ${i === 0 ? "disabled" : ""}>Back</button>
    <button type="button" class="ann-btn alt sm" data-save ${readOnly || saving || (!dirty && !saveProblem) || conflict ? "disabled" : ""}>${saving ? "Saving" : saveProblem ? "Retry save" : "Save plan"}</button>
    <span class="ann-note">${dirty ? "Unsaved changes. The preview already shows them." : esc(lastSavedAt)}</span></div>`;
}
function scrollActive() {
  const ps = prompts(), ci = curIdx(ps), ri = reachedIdx(ps), behavior = reduce() ? "auto" : "smooth";
  const rev = $("#ann-review-start");
  if (ps[ci].id === "review" && rev) return log.scrollTo({ top: Math.max(0, rev.offsetTop - 12), behavior });
  const active = $("#ann-active");
  if (active) return log.scrollTo({ top: Math.max(0, log.scrollTop + active.getBoundingClientRect().top - log.getBoundingClientRect().top - 12), behavior });
  log.scrollTo({ top: log.scrollHeight, behavior });
}
function draw(mode = "keep") {
  curIdx();
  const y = log.scrollTop;
  const markup = timeline() + (detail && DETAIL_STEPS.includes(step) ? detailHtml() : "");
  if (markup !== logMarkup) { log.innerHTML = markup; logMarkup = markup; }
  drawSteps(); drawFoot(); drawComposer(false); applicationUI.mount(); readinessUI.mount(); essentialsUI.mount(); brandingUI.mount(); Object.values(obUIs).forEach(u => u.mount());
  if (mode === "active") scrollActive(); else log.scrollTop = y;
}
const drawKeep = () => draw("keep");
async function toPrompt(id) {
  if (navigating) return;
  let ps = prompts(); const ci = curIdx(ps);
  let ti = ps.findIndex(p => p.id === id); if (ti < 0) return;
  const gstIndex=ps.findIndex(p=>p.id==="gstin");
  if(!readOnly&&!obDone.gst&&ti>gstIndex){promptId="gstin";step="business";editing=null;detail=false;draw("active");say("Verify your GSTIN and confirm the registered invoice address before continuing.");return;}
  navigating = true;
  try {
    const saveAfterTransition = ti > ci && ps[ti].step !== step && !readOnly && !conflict && !autosavePaused;
    ps = prompts(); ti = ps.findIndex(p => p.id === id); if (ti < 0) return;
    if (ps[ti].step !== step) notice = "";
    promptId = id; step = ps[ti].step; editing = null; detail = false; page = STEP_PAGE[step] || page; collectionId = undefined;
    if (ti > ps.findIndex(p => p.id === reached)) reached = id;
    focusComposer = true;
    if (step === "products" && answers.subcategory_id) loadAttrs(answers.subcategory_id);
    draw("active"); renderPreview(); app.dataset.view = "chat"; syncSwitch();
    const d = def(ps[ti]); say(d.q ? `Ann asks: ${d.q}` : "Review your plan.");
    // Conversation and preview never wait for the network. Saving remains
    // revision-checked; failures stay visibly unsaved and publication is blocked.
    if (saveAfterTransition) void save(step, undefined, { automatic: true });
  } finally { navigating = false; }
}
function go(next) { const p = prompts().find(x => x.step === next); if (p) return toPrompt(p.id); }
function advance() {
  const ps = prompts(), i = curIdx(ps), ri = reachedIdx(ps);
  let n = i + 1;
  if (i < ri) while (n < ri && def(ps[n]).reply) n++;
  return toPrompt(ps[Math.min(n, ps.length - 1)].id);
}
function edit(mutator, redraw = false) {
  if (readOnly) return;
  mutator(); touched = !designUI?.active(); designUI?.planChanged(); schedule();
  drawFoot(); drawSteps();
  if (redraw) drawKeep();
}
function focusIdea(index) {
  const idea = answers.product_ideas?.[index];
  if (!idea) return;
  productId = (base.style_demo ? base.products?.[index]?.id : null) || `ann-product-${idea.key}`;
  page = "product";
}
function addIdeaNamed(d, p, v) {
  edit(() => { const ideas = answers.product_ideas ||= []; ideas.push({ key: nextKey("idea", ideas.map(x => x.key)), collection_key: d.col, name: v.slice(0, 120), description: "", attributes: [] }); });
  const i = answers.product_ideas.length - 1; focusIdea(i); feed(p.id, `Added product idea ${v.slice(0, 120)}`);
  editing = { kind: "idea", i, field: "description", follow: true };
}
async function submitComposer(raw) {
  if (readOnly) return;
  const v = raw.replace(/\r/g, "").trim(), p = cur(), d = def(p);
  if(d.kind==="onboard"){
    const key=composerKey,ui=obUIs[d.mode];
    if(await ui.submit(v))composerDrafts.delete(key);
    drawComposer(true);return;
  }
  if(replyFields.current()){
    try{const key=composerKey;replyFields.submit(v);composerDrafts.delete(key);drawComposer(true);say("Answer entered. Review it above, then use the save or continue button when you are ready.");}
    catch(error){say(error.message);}
    return;
  }
  if (editing) {
    const it = item(); if (!it) { editing = null; draw("active"); return; }
    const f = editing.field, kind = editing.kind;
    if (f === "name" && !v) return say("Enter a name, or cancel.");
    composerDrafts.delete(composerKey);
    const max = kind === "col" ? (f === "name" ? 100 : 800) : (f === "name" ? 120 : 1200);
    edit(() => { it[f] = v.slice(0, max); });
    feed(p.id, f === "name" ? `Renamed to ${it.name}` : `Note saved for ${it.name}`);
    editing = null; focusComposer = true; draw("active"); drawComposer(true); return;
  }
  if (!v) return say("Type an answer first, or use the skip button.");
  if (["choice", "accent"].includes(d.kind)) {
    const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = normalize(v), exact = d.opts.filter(o => normalize(o.t) === q || normalize(o.v) === q);
    const matches = exact.length ? exact : q.length >= 3 ? d.opts.filter(o => normalize(o.t).startsWith(q)) : [];
    if (matches.length !== 1) return say("Choose one of the options above, or type its name. No changes were made.");
    composerDrafts.delete(composerKey);
    notice = ""; edit(() => d.pick(matches[0].v)); feed(p.id, `${d.label}: ${matches[0].t}`); return void advance();
  }
  if (d.kind === "text") { composerDrafts.delete(composerKey); edit(() => { answers[d.key] = v.slice(0, d.max); }); feed(p.id, `${d.label} sent to your plan`); return void advance(); }
  if (d.full) return say(d.list === "col" ? "Ten collections is the limit." : "Five ideas is the limit for one collection.");
  composerDrafts.delete(composerKey);
  if (d.list === "col") {
    edit(() => { const cols = answers.collections ||= []; cols.push({ key: nextKey("collection", cols.map(c => c.key)), name: v.slice(0, 100), description: "" }); });
    page = "collection"; feed(p.id, `Added collection ${v.slice(0, 100)}`);
    editing = { kind: "col", i: answers.collections.length - 1, field: "description", follow: true };
  } else {
    addIdeaNamed(d, p, v);
  }
  focusComposer = true; draw("active"); drawComposer(true);
}

/* ---------- preview feedback ---------- */
function previewLoaded() {
  const pend = Object.values(feeds).filter(f => !f.done);
  pend.forEach(f => { f.done = true; });
  canvas.dataset.updating = "false";
  const el = $("#ann-updated");
  if (el) { el.hidden = false; el.dataset.state = "done"; el.textContent = pend.length ? `Preview updated: ${pend[pend.length - 1].text}` : "Preview updated"; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  canvas.classList.remove("flash"); void canvas.offsetWidth; canvas.classList.add("flash");
  if (pend.length) {
    document.querySelectorAll('.ann-feed[data-state="pending"]').forEach(n => { n.dataset.state = "done"; const s = n.querySelector(".ann-feed-s"); if (s) s.textContent = "Preview updated"; });
    say(`Preview updated: ${pend[pend.length - 1].text}`);
  }
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
    ["products", "Product ideas", `${(a.product_ideas || []).length} planned`], ["business", "Business", `${brandUI.summary() || "Name not set"}. ${gstUI.summary() || "GST not verified yet. It is needed before you publish."}`], ["story", "Optional sections", sectionsReply()]];
  return bubble(`<p>Your store is taking shape. ${session || !dirty ? "Here is your plan so far." : "Save your plan so you can pick up where you left off."} Keep exploring with samples, or make it yours when you are ready. Nothing is live yet.</p>`) +
    bubble(`<dl class="ann-summary">${rows.map(([k, n, v]) => `<div><dt>${n}</dt><dd>${esc(v)}</dd><button type="button" class="ann-link" data-go="${k}">Change</button></div>`).join("")}</dl>
      <p class="ann-note">${dirty ? "You have unsaved changes." : designUI?.active() ? "Design saved to draft." : session ? "Your plan is saved." : "Not saved yet."}</p>`, "ann-card") +
    bubble(`<div id="ann-essentials-slot"></div>`, "ann-card") +
    `<p class="ann-note">Real draft products are created in the catalogue step. <button type="button" class="ann-link" data-go-prompt="catalogue">Open the catalogue step</button></p>
    <details class="ann-review-step"><summary>When you are ready: getting your store ready to open</summary><section class="ann-card" id="ann-readiness-slot"></section></details>`;
}


/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a"); if (!t || t.tagName === "A") return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if ("wsToggle" in d) { workspaceUI.toggle(); return; }
  if (d.viewSwitch) { app.dataset.view = d.viewSwitch; syncSwitch(); if (d.viewSwitch === "canvas") setTimeout(fit, 0); return; }
  if (["showcase", "store"].includes(d.previewMode)) { if (d.previewMode === "store" && !designUI?.active() && !requestOwnProducts()) return; setPreviewMode(d.previewMode); return renderPreview(false); }
  if (d.device) { rememberScroll(); canvas.dataset.device = d.device; document.querySelectorAll("[data-device]").forEach(b => b.setAttribute("aria-pressed", String(b === t))); renderPreview(false); fit(); return; }
  if (d.page) { page = d.page; collectionId = undefined; policyKind = undefined; renderPreview(); workspaceUI.refresh(); return; }
  if (d.viewPage) { page = d.viewPage; return renderPreview(); }
  if ("back" in d) { const ps = prompts(), i = curIdx(ps); if (i > 0) { editing = null; return void toPrompt(ps[i - 1].id); } return; }
  if ("continue" in d) { const p = cur(), df = def(p); if (!readOnly && ["choice", "accent"].includes(df.kind) && df.reply) { edit(() => df.pick(df.cur)); feed(p.id, `${df.label}: ${df.reply}`); } editing = null; return void advance(); }
  if ("cancelEdit" in d) { composerDrafts.delete(composerKey); editing = null; focusComposer = true; draw("active"); return drawComposer(true); }
  if (d.editPrompt) { editing = null; return void toPrompt(d.editPrompt); }
  if ("toggleDetail" in d) { detail = !detail; draw("keep"); drawComposer(true); if (detail) log.scrollTo({ top: log.scrollHeight, behavior: reduce() ? "auto" : "smooth" }); return; }
  if ("save" in d) { autosavePaused = false; return void save(step); }
  if ("reload" in d) return void reloadLatest(false);
  if ("overwrite" in d) return void reloadLatest(true);
  if ("retryAttrs" in d) { attrState.delete(answers.subcategory_id); return void drawKeep(); }
  if (d.goPrompt) return void toPrompt(d.goPrompt);
  if (readOnly) return;
  if (d.suggest !== undefined) { const p = cur(), df = def(p); if (df.kind !== "list" || df.list !== "idea" || df.full || editing) return; composerDrafts.delete(composerKey); addIdeaNamed(df, p, d.suggest); focusComposer = true; draw("active"); return drawComposer(true); }
  if (d.pick !== undefined) {
    const p = cur(), df = def(p), o = df.opts.find(x => String(x.v) === d.pick); if (!o) return;
    notice = ""; edit(() => df.pick(d.pick)); feed(p.id, `${df.label}: ${o.t}`);
    return void advance();
  }
  if (d.toggleSection) {
    const [pg, sec] = d.toggleSection.split(":");
    edit(() => { const set = new Set(shown(pg)); set.has(sec) ? set.delete(sec) : set.add(sec); (answers.section_options ||= {})[pg] = ANN_EXTRA_SECTIONS[pg].filter(x => set.has(x)); page = pg; });
    feed("sections", `${label(pg)} page: ${label(sec)} ${shown(pg).includes(sec) ? "on" : "off"}`);
    draw("keep"); return drawComposer(true);
  }
  if (d.editItem) {
    const [kind, i, field] = d.editItem.split(":"), it = (kind === "col" ? answers.collections : answers.product_ideas)?.[Number(i)]; if (!it) return;
    promptId = kind === "col" ? "collections" : `ideas:${it.collection_key}`; step = kind === "col" ? "collections" : "products";
    editing = { kind, i: Number(i), field }; focusComposer = true; draw("active"); return drawComposer(true);
  }
  if (d.pickStyle) {
    const s = styleSettings(d.pickStyle);
    setPreviewMode("showcase");
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
  const t = e.target;
  if (t.matches?.("[data-composer-input]")) { if (t.value === composerOriginals.get(composerKey)) composerDrafts.delete(composerKey); else composerDrafts.set(composerKey, t.value); const c = document.querySelector("[data-count]"); if (c) c.textContent = t.value.length; t.style.height = "auto"; t.style.height = `${Math.min(140, t.scrollHeight)}px`; return; }
  if (readOnly || !t.dataset) return;
  const d = t.dataset;
  if (d.accentInput !== undefined) return edit(() => { answers.accent_color = t.value; });
  if (d.ans) return edit(() => { if (d.ans === "accent_color") answers.accent_color = t.value; else answers[d.ans] = t.value; });
  if (d.col !== undefined) return edit(() => { answers.collections[Number(d.col)][d.f] = t.value; });
   if (d.idea !== undefined) return edit(() => { answers.product_ideas[Number(d.idea)][d.f] = t.value; focusIdea(Number(d.idea)); });
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t.matches?.("[data-composer-input]") && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); t.form?.requestSubmit(); }
});
document.addEventListener("submit", e => { if (e.target.matches?.("[data-composer]")) { e.preventDefault(); submitComposer(e.target.querySelector("textarea")?.value || ""); } });
document.addEventListener("change", e => {
  const t = e.target; if (readOnly || !t.dataset) return;
  if (t.dataset.accentInput !== undefined) { feed("accent", `Accent colour: ${t.value}`); draw("keep"); return; }
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
function save(nextStep = step, forceRevision, { automatic = false } = {}) {
  const attempt = () => automatic && (autosavePaused || conflict) ? false : doSave(nextStep, forceRevision);
  const run = queue.then(attempt, attempt);
  queue = run.catch(() => false);
  return run;
}
async function doSave(nextStep, forceRevision) {
  if (readOnly) return true;
  if (designUI?.active()) return designUI.save();
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
    conflict = false; autosavePaused = false; saveProblem = ""; touched = Object.keys(dirtyPatch()).length > 0;
    lastSavedAt = "Your plan is saved."; say("Plan saved. You can come back whenever you are ready. Your live store is unchanged.");
    return true;
  } catch (e) { saveProblem = e.message || "Your plan could not be saved. Check your connection and try again."; autosavePaused = true; say(saveProblem); return false; }
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
window.addEventListener("beforeunload", e => { if (!readOnly && (composerDrafts.size || isDirty() || saving || applicationUI.hasUnappliedChanges() || readinessUI.hasUnsavedChanges() || brandingUI.hasUnsavedChanges() || Object.values(obUIs).some(u => u.hasUnsavedChanges()) || designDirty())) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- start ---------- */
const replyFields=attachAnnReplyFields({onChange:()=>drawComposer(true)});
if ((window.innerWidth || 1280) < 700) { canvas.dataset.device = "mobile"; document.querySelectorAll("[data-device]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.device === "mobile"))); }
if (clearedNote.length) notice = "Some earlier choices were cleared because they no longer matched.";
if (answers.subcategory_id && step === "products") loadAttrs(answers.subcategory_id);
foot.innerHTML = `<div id="ann-composer"></div><div id="ann-savebar"></div>`;
draw("active"); syncSwitch(); renderPreview(false); fit();
say(session ? "Your saved plan is restored." : "Ann is ready. Nothing is saved until you save the plan or finish a stage.");
