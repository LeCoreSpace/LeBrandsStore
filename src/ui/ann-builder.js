import { layout, escapeHtml as esc, accountHeader } from "./layout.js";

const json = (v) => JSON.stringify(v ?? null).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderAnnBuilder(data = {}, user = null, options = {}) {
  const store = data.store && typeof data.store === "object" ? data.store : {};
  const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  const id = encodeURIComponent(String(store.store_id || ""));
  const root = `/stores/${id}`;
  const canWrite = ["owner", "admin"].includes(data.role) && options.readOnly !== true;
  // Explicit allow-list: no tokens or secrets reach the browser.
  const payload = {
    store: { store_id: store.store_id, name: store.name },
    speakerName: store.name || user?.username || user?.name || "You",
    settings, products: data.products || [], collections: data.collections || [], layouts: data.layouts || {},
    policies: data.policies || [], reviews: data.reviews || [],
    aura_skeleton_enabled: data.aura_skeleton_enabled === true, aura_starter_enabled: data.aura_starter_enabled === true,
    role: data.role || "", canWrite,
    apiRoot: typeof options.apiRoot === "string" && /^\/[A-Za-z0-9_\/.%-]*$/.test(options.apiRoot) ? options.apiRoot.replace(/\/+$/, "") : `/api/stores/${id}/ann`,
    sessionResponse: options.sessionResponse || { session: null, preview: null, cleared_fields: [] },
    reference: options.reference || null,
  };
  const body = `<link rel="stylesheet" href="/assets/ann-builder.css">
${accountHeader(user)}
<main class="ann" id="ann-app" data-view="chat">
  <header class="ann-top">
    <div><p class="ann-eyebrow">Your store, built with Ann</p><h1>Build ${esc(store.name || "your store")} with Ann</h1></div>
    <nav class="ann-links" aria-label="Store builder"><a href="${root}">Dashboard</a><a href="${root}/editor">Theme editor</a><a href="${root}/build/ann?launch=1">Store connections</a></nav>
  </header>
  <div class="ann-switch" role="group" aria-label="Show">
    <button type="button" data-view-switch="chat" aria-pressed="true">Conversation</button>
    <button type="button" data-view-switch="canvas" aria-pressed="false">Store preview</button>
  </div>
  <div class="ann-grid">
    <section class="ann-chat" aria-label="Conversation with Ann">
      <nav class="ann-steps" id="ann-steps" aria-label="Planning steps"></nav>
      <div class="ann-log" id="ann-log" tabindex="-1"><div class="ann-skel" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <footer class="ann-foot" id="ann-foot"></footer>
      <p class="ann-status" id="ann-status" role="status" aria-live="polite"></p>
    </section>
    <section class="ann-stage" aria-label="Live store preview">
      <div class="ann-bar">
        <div class="ann-styles" id="ann-style-tabs" role="group" aria-label="Preview style"></div>
        <div class="ann-bar-end">
          <div class="ann-device" role="group" aria-label="Preview viewport"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="mobile" aria-pressed="false">Mobile</button></div>
          <details class="ann-more"><summary aria-label="More preview options">More</summary><div class="ann-more-menu"><button type="button" class="ann-btn alt sm" id="ann-open-browser">Open browser preview</button><button type="button" class="ann-btn alt sm" data-edit-prompt="logo">Brand logo</button></div></details>
        </div>
      </div>
      <div class="ann-subbar">
        <div class="ann-pages ann-modes" role="group" aria-label="Preview content">
          <button type="button" class="ann-tab" data-preview-mode="showcase" aria-pressed="true">Style showcase</button>
          <button type="button" class="ann-tab" data-preview-mode="store" aria-pressed="false">Your store</button>
        </div>
        <div class="ann-pages" id="ann-pages" role="group" aria-label="Page"></div>
      </div>
      <div class="ann-canvas" id="ann-canvas" data-device="desktop" data-updating="false"><i class="ann-sweep" aria-hidden="true"></i><p class="ann-updated" id="ann-updated" data-state="done" hidden></p><iframe id="ann-preview" sandbox="allow-same-origin" title="Live store preview" tabindex="0"></iframe></div>
      <p class="ann-note" id="ann-preview-note">Preview only. Sample imagery and prices are illustrative. Nothing here is published, and no products or orders are created.</p>
    </section>
  </div>
  <noscript><p class="ann-note">Ann needs JavaScript to show the live preview.</p></noscript>
  <script id="ann-data" type="application/json">${json(payload)}</script>
</main>
<script type="module" src="/assets/ann-builder.js"></script>`;
  return layout({ title: `Ann | ${store.name || "Store"}`, description: "Plan your store with Ann.", canonical: `https://app.lebrands.store/stores/${id}/build/ann`, body, noindex: true });
}
