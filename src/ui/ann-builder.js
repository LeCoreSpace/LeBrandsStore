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
    <div class="ann-top-actions" id="ann-top-actions" aria-label="Design actions" hidden></div>
  </header>
  <aside id="ann-business-access" class="ann-note" role="status"${data.business_access?.allowed===false?"":" hidden"}>${esc(data.business_access?.message||"")} ${data.business_access?.reason==="plan_required"?`<button type="button" class="ann-link" data-ann-plan-open${data.business_access?.plan_access?.name_confirmed?"":" disabled"}>Choose your Free plan</button>`:'<button type="button" class="ann-link" data-business-open>Open business documents</button>'}</aside>
  <div class="ann-switch" role="group" aria-label="Show">
    <button type="button" data-view-switch="chat" aria-pressed="true">Conversation</button>
    <button type="button" data-view-switch="canvas" aria-pressed="false">Store preview</button>
  </div>
  <section class="ann-toolbar" id="ann-toolbar" aria-label="Builder controls">
    <details class="ann-tb-d ann-tb-step" id="ann-step-menu"><summary aria-label="Onboarding steps"><span class="ann-tb-k">Step</span><span class="ann-tb-v" id="ann-step-current">Business</span><span class="ann-tb-n" id="ann-step-count"></span></summary><div class="ann-tb-pop ann-tb-steps"><nav class="ann-steps" id="ann-steps" aria-label="Planning steps"></nav></div></details>
    <div class="ann-tb-flex" id="ann-tb-flex">
      <label class="ann-language" for="ann-language"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="7.2"/><path d="M2.8 10h14.4M10 2.8c2.2 2.2 2.2 12.2 0 14.4M10 2.8c-2.2 2.2-2.2 12.2 0 14.4"/></svg><span class="ann-sr">Ann’s language / भाषा</span><select id="ann-language" aria-label="Ann conversation language"><option value="en" lang="en">English</option><option value="hi" lang="hi">हिन्दी</option><option value="ta" lang="ta">தமிழ்</option><option value="mr" lang="mr">मराठी</option><option value="te" lang="te">తెలుగు</option></select></label>
      <div class="ann-tb-view ann-tb-lockable" id="ann-tb-view">
        <details class="ann-tb-d" id="ann-style-menu"><summary aria-label="Store style"><span class="ann-tb-k" id="ann-style-label">Style</span><span class="ann-tb-v" id="ann-style-current"></span></summary><div class="ann-tb-pop ann-tb-styles"><div class="ann-styles" id="ann-style-tabs" role="group" aria-label="Preview style"></div></div></details>
        <details class="ann-tb-d" id="ann-mode-menu"><summary aria-label="Preview content"><span class="ann-tb-k">Show</span><span class="ann-tb-v" id="ann-mode-current">Style showcase</span></summary><div class="ann-tb-pop ann-tb-modes"><div class="ann-pages ann-modes" role="group" aria-label="Preview content">
          <button type="button" class="ann-tab" data-preview-mode="showcase" aria-pressed="true">Style showcase</button>
          <button type="button" class="ann-tab" data-preview-mode="store" aria-pressed="false">Your store</button></div></div></details>
        <div class="ann-device" role="group" aria-label="Preview viewport"><button type="button" data-device="desktop" aria-pressed="true" aria-label="Desktop" title="Desktop"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="10" rx="1.2"/><path d="M7 17h6M10 13.5V17"/></svg></button><button type="button" data-device="mobile" aria-pressed="false" aria-label="Mobile" title="Mobile"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="8" height="15" rx="1.6"/><path d="M9 14.8h2"/></svg></button></div>
      </div>
    </div>
    <span class="ann-tb-sp"></span>
    <button type="button" class="ann-btn alt sm ann-tb-preview ann-tb-lockable" id="ann-open-browser" aria-label="Open browser preview" title="Open browser preview"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5V12M11 3h6v6M17 3l-7.5 7.5"/></svg><span>Preview</span></button>
    <details class="ann-tb-d ann-more" id="ann-more"><summary aria-label="More">More</summary><div class="ann-tb-pop ann-more-menu">
      <div id="ann-tb-slot" class="ann-tb-slot"></div>
      <button type="button" class="ann-btn alt sm ann-tb-lockable" data-ws-toggle aria-pressed="false" aria-controls="ann-tools">Design workspace</button>
      <div class="ann-tb-item ann-tb-lockable" id="ann-edit-toggle" hidden></div>
      <button type="button" class="ann-btn alt sm ann-tb-lockable" data-edit-prompt="logo">Brand logo</button>
      ${data.business_access?.plan_access?.available?`<div class="ann-tb-item" id="ann-store-plan"><button type="button" class="ann-btn alt sm" data-ann-plan-open${data.business_access.plan_access.enforced&&!data.business_access.plan_access.name_confirmed?" disabled":""}>Store plan</button></div>`:""}
    </div></details>
  </section>
  <div class="ann-grid">
    <section class="ann-chat" aria-label="Conversation with Ann">
      <div class="ann-log" id="ann-log" tabindex="-1"><div class="ann-skel" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <footer class="ann-foot" id="ann-foot"></footer>
      <p class="ann-status" id="ann-status" role="status" aria-live="polite"></p>
    </section>
    <section class="ann-stage" aria-label="Live store preview">
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
