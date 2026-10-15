import { escapeHtml, layout } from "./layout.js";
import { LE_BRANDS_LOGO, LE_BRANDS_MARK } from "./brand.js";

const APP_ORIGIN = "https://app.lebrands.store";
const esc = escapeHtml;
const safeJson = value => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * Section editor shell. The client (editor.js in /assets) fills the three panes.
 * options.readOnly renders the shell without edit controls (used for signed-out previews and tests).
 */
export function renderEditor(data = {}, user = {}, options = {}) {
  const store = data.store || {};
  const storeId = String(store.store_id || "");
  const role = String(data.role || "editor");
  const publishAllowed = role === "owner" || role === "admin";
  const settings = data.settings || {};
  const brand = settings.brand_name || store.name || "Your store";
  const payload = {
    store: { store_id: storeId, name: store.name, subdomain: store.subdomain, status: store.status },
    settings,
    products: (data.products || []).map(item => ({ id: item.id, title: item.title, price_paise: item.price_paise, status: item.status, images: (item.images || []).slice(0, 8), description: item.description, stock: item.stock, compare_at_paise: item.compare_at_paise, tags: item.tags, sku: item.sku, collection_ids: Array.isArray(item.collection_ids) ? item.collection_ids : undefined, content: item.content && typeof item.content === "object" ? item.content : undefined })),
    policies: (data.policies || []).map(item => ({ kind: item.kind, title: item.title, body: item.body })),
    reviews: (data.reviews || []).slice(0, 9).map(item => ({ body: item.body || item.text, author: item.author || item.name })),
    aura_skeleton_enabled: data.aura_skeleton_enabled === true,
    aura_starter_enabled: data.aura_starter_enabled === true,
    collections: (data.collections || []).map(item => ({ id: item.id, title: item.title || item.name, name: item.name || item.title, slug: item.slug, description: item.description, product_ids: Array.isArray(item.product_ids) ? item.product_ids : undefined, cover: item.cover || null, faq: Array.isArray(item.faq) ? item.faq : [], related_ids: Array.isArray(item.related_ids) ? item.related_ids : [] })),
    published_settings: data.published_settings ?? null,
    layouts: data.layouts || {},
    page_versions: data.page_versions || {},
    role,
    readOnly: Boolean(options.readOnly),
  };
  const root = `/stores/${encodeURIComponent(storeId)}`;
  const body = `<div class="ed" id="editor" data-store-id="${esc(storeId)}" data-role="${esc(role)}" data-can-publish="${publishAllowed}">
    <header class="ed-top">
      <a class="ed-brand" href="${root}" aria-label="Back to dashboard"><span class="ed-mark">${LE_BRANDS_MARK}</span><span class="ed-logo">${LE_BRANDS_LOGO}</span></a>
      <div class="ed-title"><strong>${esc(brand)}</strong><small>Store editor</small></div>
      <div class="ed-tools">
        <button type="button" class="ed-btn ed-ghost" id="ed-undo" aria-label="Undo" title="Undo (Ctrl Z)" disabled>Undo</button>
        <button type="button" class="ed-btn ed-ghost" id="ed-redo" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled>Redo</button>
        <span class="ed-status" id="ed-status" role="status" aria-live="polite" data-state="saved">Saved</span>
        <button type="button" class="ed-btn ed-ghost" id="ed-theme">Theme</button>
        <a class="ed-btn ed-ghost" href="${root}/styles" id="ed-styles">Explore styles</a>
        <button type="button" class="ed-btn ed-ghost" id="ed-history">Version history</button>
        ${publishAllowed ? `<button type="button" class="ed-btn ed-primary" id="ed-publish">Review and publish</button>` : `<span class="ed-note" id="ed-staff-note">Staff can save drafts. An owner or admin publishes.</span>`}
      </div>
    </header>
    <div class="ed-phone-note" role="note"><strong>Use a larger screen to edit.</strong> The editor needs a tablet or computer. Below is a read-only preview of your store.</div>
    <div class="ed-conflict" id="ed-banner" role="alert" hidden></div>
    <div class="ed-body">
      <aside class="ed-left" aria-label="Pages and sections">
        <label class="ed-label" for="ed-page">Page</label>
        <select id="ed-page" class="ed-select"></select>
        <div id="ed-preview-pick" class="ed-preview-pick" hidden><label class="ed-label" for="ed-preview-item">Preview item</label><select id="ed-preview-item" class="ed-select"></select></div>
        ${payload.aura_skeleton_enabled ? '<button type="button" class="ed-btn ed-small" id="ed-starter">Use Aura starter layout</button>' : ""}
        <div class="ed-conflict" id="ed-starter-banner" role="status" hidden></div>
        <div class="ed-left-head"><h2>Sections</h2><button type="button" class="ed-btn ed-small" id="ed-add">Add section</button></div>
        <ol class="ed-sections" id="ed-sections"></ol>
        <div id="ed-warnings" class="ed-warnings" aria-live="polite"></div>
      </aside>
      <main class="ed-center" aria-label="Preview">
        <div class="ed-viewbar">
          <div class="ed-seg" role="group" aria-label="Preview size">
            <button type="button" data-view="desktop" aria-pressed="true">Desktop</button>
            <button type="button" data-view="tablet" aria-pressed="false">Tablet</button>
            <button type="button" data-view="mobile" aria-pressed="false">Mobile</button>
          </div>
          <span class="ed-hint">Click a section to select it. Click a heading to edit it in place.</span>
        </div>
        <div class="ed-stage" id="ed-stage"><div class="ed-frame" id="ed-frame" data-view="desktop"><iframe id="ed-preview" title="Store preview" sandbox="allow-same-origin"></iframe></div></div>
      </main>
      <aside class="ed-right" id="ed-props" aria-label="Section settings"></aside>
    </div>
    <div class="ed-toast" id="ed-toast" role="status" aria-live="polite" hidden></div>
    <div id="ed-modal-root"></div>
    <script type="application/json" id="editor-data">${safeJson(payload)}</script>
  </div>
  <script type="module" src="/assets/editor.js"></script>`;
  return layout({
    title: `Store editor | ${brand} | LeBrands.Store`,
    description: `Edit the sections of ${brand}.`,
    canonical: `${APP_ORIGIN}${root}/editor`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/editor.css">',
    body,
  });
}
