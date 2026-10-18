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
    businessAccess:data.business_access||null,businessCountries:data.business_countries||[],
    planAccess:data.business_access?.plan_access||null,
    apiRoot: typeof options.apiRoot === "string" && /^\/[A-Za-z0-9_\/.%-]*$/.test(options.apiRoot) ? options.apiRoot.replace(/\/+$/, "") : `/api/stores/${id}/ann`,
    catalogueRoot: typeof options.catalogueRoot === "string" && /^\/[A-Za-z0-9_\/.%-]*$/.test(options.catalogueRoot) ? options.catalogueRoot.replace(/\/+$/, "") : `/stores/${id}`,
    sessionResponse: options.sessionResponse || { session: null, preview: null, cleared_fields: [] },
    reference: options.reference || null,
  };
  const body = `<link rel="stylesheet" href="/assets/ann-builder.css">
<link rel="stylesheet" href="/assets/ann-workspace.css">
<link rel="stylesheet" href="/assets/ann-business-documents.css">
${accountHeader(user)}
<main class="ann" id="ann-app" data-view="chat">
  <header class="ann-top">
    <div><p class="ann-eyebrow">Your store, built with Ann</p><h1>Build ${esc(store.name || "your store")} with Ann</h1></div>
    <nav class="ann-links" aria-label="Store builder"><button type="button" id="ann-business-documents">Business documents</button><a href="${root}">Dashboard</a><a href="${root}/editor">Theme editor</a><a href="${root}/build/ann?launch=1">Store connections</a></nav>
  </header>
  <aside id="ann-business-access" class="ann-note" role="status"${data.business_access?.allowed===false?"":" hidden"}>${esc(data.business_access?.message||"")} ${data.business_access?.reason==="plan_required"?`<button type="button" class="ann-link" data-ann-plan-open${data.business_access?.plan_access?.name_confirmed?"":" disabled"}>Choose your Free plan</button>`:'<button type="button" class="ann-link" data-business-open>Open business documents</button>'}</aside>
  <div class="ann-switch" role="group" aria-label="Show">
    <button type="button" data-view-switch="chat" aria-pressed="true">Conversation</button>
    <button type="button" data-view-switch="canvas" aria-pressed="false">Store preview</button>
  </div>
  <div class="ann-grid">
    <section class="ann-chat" aria-label="Conversation with Ann">
      <label class="ann-language" for="ann-language"><span>Ann’s language / भाषा</span><select id="ann-language" aria-label="Ann conversation language"><option value="en" lang="en">English</option><option value="hi" lang="hi">हिन्दी</option><option value="ta" lang="ta">தமிழ்</option><option value="mr" lang="mr">मराठी</option><option value="te" lang="te">తెలుగు</option></select></label>
      <nav class="ann-steps" id="ann-steps" aria-label="Planning steps"></nav>
      <div class="ann-log" id="ann-log" tabindex="-1"><div class="ann-skel" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <footer class="ann-foot" id="ann-foot"></footer>
      <p class="ann-status" id="ann-status" role="status" aria-live="polite"></p>
    </section>
    <section class="ann-stage" aria-label="Live store preview">
      <section class="ann-style-picker" aria-labelledby="ann-style-label">
        <h2 class="ann-control-label" id="ann-style-label">Store style</h2>
        <div class="ann-styles" id="ann-style-tabs" role="group" aria-label="Preview style"></div>
      </section>
      <div class="ann-bar">
        <div class="ann-pages ann-modes" role="group" aria-label="Preview content">
          <button type="button" class="ann-tab" data-preview-mode="showcase" aria-pressed="true">Style showcase</button>
          <button type="button" class="ann-tab" data-preview-mode="store" aria-pressed="false">Your store</button>
        </div>
        <div class="ann-bar-end">
          <div class="ann-device" role="group" aria-label="Preview viewport"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="mobile" aria-pressed="false">Mobile</button></div>
          <button type="button" class="ann-btn alt sm" data-ws-toggle aria-pressed="false" aria-controls="ann-tools">Design workspace</button>
          <button type="button" class="ann-btn alt sm" id="ann-open-browser">Open browser preview</button>
          <details class="ann-more"><summary aria-label="More preview options">More</summary><div class="ann-more-menu"><button type="button" class="ann-btn alt sm" data-edit-prompt="logo">Brand logo</button></div></details>
        </div>
      </div>
      <nav class="ann-pagebar" id="ann-pagebar" aria-label="Store preview pages">
        <span class="ann-control-label" aria-hidden="true">Pages</span>
        <div class="ann-pages" id="ann-pages" role="group" aria-label="Page"></div>
      </nav>
      <div class="ann-canvas" id="ann-canvas" data-device="desktop" data-tools="closed" data-updating="false"><i class="ann-sweep" aria-hidden="true"></i><p class="ann-updated" id="ann-updated" data-state="done" hidden></p><aside class="ann-tools" id="ann-tools" aria-label="Design workspace" hidden></aside><iframe id="ann-preview" sandbox="allow-same-origin" title="Live store preview" tabindex="0"></iframe></div>
      <p class="ann-note" id="ann-preview-note">Preview only. Sample imagery and prices are illustrative. Nothing here is published, and no products or orders are created.</p>
    </section>
  </div>
  <noscript><p class="ann-note">Ann needs JavaScript to show the live preview.</p></noscript>
  <script id="ann-data" type="application/json">${json(payload)}</script>
</main>
<script type="module" src="/assets/ann-builder.js"></script>`;
  return layout({ title: `Ann | ${store.name || "Store"}`, description: "Plan your store with Ann.", canonical: `https://app.lebrands.store/stores/${id}/build/ann`, body, noindex: true });
}
