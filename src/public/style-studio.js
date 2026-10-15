import { AURA_STYLES, STYLE_IDS, STYLE_THEME_KEYS, styleSettings, stylePatch } from "./aura-styles.js";
import { stylePreviewData, renderStylePreview } from "./style-preview.js";
import { attachStyleInteractions } from "./style-preview-interactions.js";
import { styleDemonstration } from "./style-demo-copy.js";
import { attachAuraMotion } from "./aura-motion.js";
import { themeSnapshot } from "./editor-state.js";
import { attachAuraSearch, attachAuraCatalog } from "./aura-ui.js";

const $ = selector => document.querySelector(selector);
const boot = JSON.parse($("#style-studio-data").textContent);
const original = themeSnapshot(boot.settings);
const catalogue = stylePreviewData(boot);
// The projection the frame actually renders: showcase styles swap ids, real catalogues never do.
const catalogueFor = style => catalogue.style_demo ? styleDemonstration(catalogue, style) : catalogue;
let current = catalogue;
const bags = new Map();
const bagFor = () => {
  const key = catalogue.style_demo ? (settings.style_preset || "saved") : "real";
  if (!bags.has(key)) bags.set(key, new Map((current.products || []).slice(0, 2).map(p => [p.id, 1])));
  return bags.get(key);
};
const frame = $("#as-preview"), canvas = $("#as-canvas"), status = $("#as-status");
const readOnly = boot.readOnly === true || !["owner", "admin"].includes(boot.role);
let settings = { ...original }, page = ["home","collection","product","cart","checkout","about","contact"].includes(boot.initialPage) ? boot.initialPage : "product", productId = catalogueFor(original.style_preset).products?.[0]?.id;
let collectionId, policyKind, dirty = false, saving = false;
const scrollPositions = new Map(), stylePages = new Map();
let displayedKey = "";
const positionKey = () => JSON.stringify([settings.style_preset || "saved", page, productId || "", collectionId || "", policyKind || "", canvas.dataset.device || "desktop"]);
function rememberScroll() {
  const doc = frame.contentDocument;
  if (displayedKey && doc) scrollPositions.set(displayedKey, doc.scrollingElement?.scrollTop ?? doc.defaultView?.scrollY ?? 0);
}
const api = `/api/stores/${encodeURIComponent(boot.store.store_id)}/setup`;
const message = text => { status.textContent = text; };

function controls() {
  document.querySelectorAll("[data-style-choice]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.styleChoice === settings.style_preset)));
  $("#as-palette").value = settings.color_preset;
  $("#as-font").value = settings.font_preset;
  $("#as-accent").value = settings.accent_color;
  document.querySelectorAll("[data-page]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.page === page)));
  $("#as-apply").disabled = readOnly || saving || !dirty || !STYLE_IDS.includes(settings.style_preset);
}
function preview(remember = true) {
  if (remember) rememberScroll();
  current = catalogueFor(settings.style_preset);
  if (!(current.products || []).some(p => p.id === productId)) productId = current.products?.[0]?.id;
  if (collectionId && !(current.collections || []).some(c => c.id === collectionId)) collectionId = undefined;
  controls();
  displayedKey = positionKey();
  const styleName = AURA_STYLES.find(style => style.id === settings.style_preset)?.name || "Your saved style";
  frame.title = `${styleName}, interactive ${canvas.dataset.device || "desktop"} store preview`;
  frame.srcdoc = renderStylePreview(catalogue, settings, { page, productId, collectionId, policyKind });
  $("#as-catalog-note").textContent = catalogue.style_demo
    ? "Illustrative sample products and prices for each style. These products are preview-only and will not be added to your catalogue."
    : "Your existing catalogue and page content. Cart and checkout use illustrative items only, not a real order.";
}
function change(patch) {
  Object.assign(settings, patch);
  dirty = STYLE_THEME_KEYS.some(key => settings[key] !== original[key]);
  message(dirty ? "Preview updated. Nothing saved yet." : "Your saved draft style. No changes to apply.");
  preview();
}
document.querySelectorAll("[data-style-choice]").forEach(button =>
  button.addEventListener("click", () => {
    stylePages.set(settings.style_preset || "saved", { page, productId, collectionId, policyKind });
    const next = stylePages.get(button.dataset.styleChoice) || { page: "home", productId: catalogueFor(button.dataset.styleChoice).products?.[0]?.id };
    ({ page, productId, collectionId, policyKind } = next);
    change(styleSettings(button.dataset.styleChoice));
  }));
$("#as-palette").addEventListener("change", event => change({ color_preset: event.target.value }));
$("#as-font").addEventListener("change", event => change({ font_preset: event.target.value }));
$("#as-accent").addEventListener("input", event => change({ accent_color: event.target.value }));
document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
  page = button.dataset.page; collectionId = undefined; policyKind = undefined; preview();
}));
document.querySelectorAll("[data-device]").forEach(button => button.addEventListener("click", () => {
  rememberScroll();
  canvas.dataset.device = button.dataset.device;
  preview(false);
  fitViewport();
  document.querySelectorAll("[data-device]").forEach(other =>
    other.setAttribute("aria-pressed", String(other === button)));
}));
$("#as-reset").addEventListener("click", () => {
  settings = { ...original }; dirty = false; message("Preview reset to your saved draft. Nothing changed."); preview();
});
frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  if (!doc) return;
  // Child scripts/forms are sandboxed. All preview navigation is owned here.
  doc.addEventListener("submit", event => event.preventDefault(), true);
  doc.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    const path = new URL(link.getAttribute("href") || "/", location.origin).pathname;
    if (path.startsWith("/products/")) { page = "product"; productId = decodeURIComponent(path.split("/")[2]); }
    else if (path.startsWith("/collections/")) {
      page = "collection";
      const slug = decodeURIComponent(path.split("/")[2]);
      collectionId = current.collections?.find(c => c.slug === slug || c.id === slug)?.id;
    } else if (path.startsWith("/policies/")) { page = "policy"; policyKind = path.split("/")[2]; }
    else if (path === "/pages/about") page = "about";
    else if (path === "/pages/contact") page = "contact";
    else if (path === "/cart") page = "cart";
    else if (path === "/checkout") page = "checkout";
    else if (path === "/") page = "home";
    else return;
    preview();
  });
  attachAuraSearch(doc, current);
  attachAuraCatalog(doc, current, { page, collectionId });
  attachAuraMotion(doc);
  attachStyleInteractions(doc, current, bagFor(), page, productId, next => { page = next; preview(); });
  const key = displayedKey;
  doc.defaultView?.scrollTo({ top: scrollPositions.get(key) || 0, behavior: "instant" });
  doc.defaultView?.addEventListener("scroll", () => {
    scrollPositions.set(key, doc.scrollingElement?.scrollTop ?? doc.defaultView?.scrollY ?? 0);
  }, { passive: true });
});
$("#as-fullscreen").addEventListener("click", () => {
  const active = document.body.classList.toggle("ss-immersive");
  $("#as-fullscreen").textContent = active ? "Return to style controls" : "Open interactive preview";
  $("#as-fullscreen").setAttribute("aria-pressed", String(active));
  fitViewport();
});
function fitViewport() {
  if (!frame.style) return;
  const width = canvas.dataset.device === "mobile" ? 390 : 1280;
  const available = Math.max(240, (canvas.clientWidth || 1316) - 36);
  const scale = Math.min(1, available / width);
  const immersive = document.body.classList.contains?.("ss-immersive") || false;
  const height = immersive
    ? Math.max(200, canvas.clientHeight ? canvas.clientHeight - 36 : (window.innerHeight || 900) - 190)
    : 720;
  Object.assign(frame.style, {
    width: `${width}px`, minWidth: `${width}px`, maxWidth: "none",
    height: `${height / scale}px`, transform: `scale(${scale})`, transformOrigin: "top left",
    left: `${Math.max(0, ((canvas.clientWidth || 1316) - width * scale) / 2)}px`,
  });
}
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitViewport).observe(canvas);
window.addEventListener("resize", fitViewport);
async function request(options = {}) {
  const response = await fetch(api, {
    credentials: "same-origin", headers: { "content-type": "application/json" }, ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Style could not be saved.");
  return body;
}
$("#as-apply").addEventListener("click", async () => {
  if (readOnly || saving || !dirty) return;
  const sent = stylePatch(settings);
  saving = true; controls(); message("Saving style to your draft...");
  try {
    const fresh = await request();
    const latest = themeSnapshot(fresh.settings);
    if (STYLE_THEME_KEYS.some(key => original[key] !== latest[key]))
      throw new Error("Your draft theme changed in another tab. Reload this page before applying a style.");
    await request({ method: "PATCH", body: JSON.stringify({ settings: sent }) });
    Object.assign(original, sent); dirty = STYLE_THEME_KEYS.some(key => settings[key] !== sent[key]);
    message("Style saved to your draft. Open the editor to review and publish. Your live store is unchanged.");
  } catch (error) { message(error.message); }
  finally { saving = false; controls(); }
});
window.addEventListener("beforeunload", event => {
  if (!readOnly && (dirty || saving)) { event.preventDefault(); event.returnValue = ""; }
});
// Do not automatically change a merchant's saved styling on initial load.
if ((window.innerWidth || 1280) < 640) {
  canvas.dataset.device = "mobile";
  document.querySelectorAll("[data-device]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.device === "mobile")));
}
if (boot.immersive) $("#as-fullscreen").click();
preview();
fitViewport();
message("Choose a style to compare. Nothing is saved until you apply it.");
