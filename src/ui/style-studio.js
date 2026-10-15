import { layout, escapeHtml as esc, accountHeader, footer } from "./layout.js";
import { AURA_STYLES } from "../public/aura-styles.js";

const json = (v) => JSON.stringify(v ?? null).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const STYLES = AURA_STYLES.map(style => [style.id, style.name, style.description, style.settings.accent_color]);
const PAGES = ["home", "collection", "product", "cart", "checkout", "about", "contact"];

export function renderStyleStudio(data = {}, user = null, options = {}) {
  const store = data.store && typeof data.store === "object" ? data.store : {};
  const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  const id = encodeURIComponent(String(store.store_id || ""));
  const root = `/stores/${id}`;
  const canApply = ["owner", "admin"].includes(data.role) && options.readOnly !== true;
  const why = options.readOnly === true
    ? "This is a read-only view, so styles cannot be applied."
    : !["owner", "admin"].includes(data.role) ? "Only a store owner or admin can apply a style. You can still preview every option." : "";
  const payload = { store, settings, products: data.products || [], collections: data.collections || [], layouts: data.layouts || {}, policies: data.policies || [], reviews: data.reviews || [], aura_skeleton_enabled: data.aura_skeleton_enabled === true, aura_starter_enabled: data.aura_starter_enabled === true, role: data.role || "", readOnly: options.readOnly === true, initialPage: options.initialPage, immersive: options.immersive === true };
  const body = `<link rel="stylesheet" href="/assets/style-studio.css">
${accountHeader(user)}
<main class="wrap ss">
  <header class="ss-head">
    <div><h1>Style studio</h1><p>Explore five styles for ${esc(store.name || "your store")}. Each is a scrollable, interactive store with desktop and mobile views. Preview shopping never places orders.</p></div>
    <nav class="ss-links" aria-label="Store builder"><a href="${root}/build">Builder</a><a href="${root}/editor">Editor</a></nav>
  </header>
  <div class="ss-grid">
    <section class="ss-panel" aria-label="Style controls">
      <div><h2>Style</h2><div class="ss-choices">${STYLES.map(([k, n, d, c]) => `<button type="button" class="ss-choice" data-style-choice="${k}" aria-pressed="false" style="--c:${c}"><strong>${n}</strong><span>${d}</span></button>`).join("")}</div></div>
      <div><h2>Adjust</h2>
        <label class="ss-field">Background<select id="as-palette"><option value="white">White</option><option value="ivory">Ivory</option><option value="stone">Stone</option><option value="midnight">Midnight</option></select></label><br>
        <label class="ss-field">Typeface<select id="as-font"><option value="serif">Serif</option><option value="modern">Modern</option><option value="classic">Classic</option></select></label><br>
        <label class="ss-field">Accent colour<input id="as-accent" type="color" value="#7a1f3d"></label>
      </div>
      <div class="ss-actions">
        ${why ? `<p class="ss-warn">${esc(why)}</p>` : ""}
        <button class="btn" id="as-apply" type="button" ${canApply ? "" : 'disabled aria-disabled="true"'}>Apply style to draft</button>
        <button class="btn alt" id="as-reset" type="button">Reset preview</button>
        <p class="ss-note">Nothing is saved until you press Apply. Applying changes theme styling only. It never changes your catalogue, layouts or live publication.</p>
        <p class="ss-note" id="as-catalog-note">Where your catalogue is empty, the preview shows demo products. Demo items are not saved to your store.</p>
        <p class="ss-status" id="as-status" role="status" aria-live="polite"></p>
      </div>
    </section>
    <section class="ss-stage" aria-label="Preview">
      <div class="ss-preview-controls">
        <div class="ss-preview-styles" role="group" aria-label="Preview style">${STYLES.map(([key, name]) => `<button type="button" class="ss-tab" data-style-choice="${key}" aria-pressed="false">${esc(name)}</button>`).join("")}</div>
        <div class="ss-device-switch" role="group" aria-label="Preview viewport"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="mobile" aria-pressed="false">Mobile</button></div>
      </div>
      <div class="ss-bar">
        <div class="ss-tabs" role="group" aria-label="Page">${PAGES.map((p, i) => `<button type="button" class="ss-tab" data-page="${p}" aria-pressed="${i === 0}">${p}</button>`).join("")}</div>
        <button type="button" class="ss-tab" id="as-fullscreen" aria-pressed="false">Open interactive preview</button>
      </div>
      <div class="ss-canvas" id="as-canvas" data-device="desktop"><iframe id="as-preview" sandbox="allow-same-origin" title="Store style preview" tabindex="0"></iframe></div>
      <p class="ss-note ss-preview-hint">Scroll inside the preview to explore the store. Links and the sample bag are interactive. No orders or payments.</p>
    </section>
  </div>
  <script id="style-studio-data" type="application/json">${json(payload)}</script>
</main>
${footer()}
<script type="module" src="/assets/style-studio.js"></script>`;
  return layout({ title: `Style studio | ${store.name || "Store"}`, description: "Preview and apply a store style.", canonical: `https://app.lebrands.store/stores/${id}/styles`, body, noindex: true });
}
