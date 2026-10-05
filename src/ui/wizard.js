import { escapeHtml, layout } from "./layout.js";

const APP_ORIGIN = "https://app.lebrands.store";

export function renderWizard(data = {}, user = {}) {
  const storeId = String(data.store?.store_id || "");
  const accountName = user?.name || user?.email || "";
  const safeData = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const body = `<div class="wizard-shell" id="wizard" data-store-id="${escapeHtml(storeId)}">
      <header class="wizard-top">
        <a class="wizard-brand" href="/" aria-label="LeBrands.Store dashboard"><span class="wizard-brandmark" aria-hidden="true">L</span><span>LeBrands<small>store studio</small></span></a>
        <div class="wizard-account">
          ${accountName
            ? `<span>${escapeHtml(accountName)}</span><a href="/">Dashboard</a><form method="post" action="/logout"><button type="submit">Sign out</button></form>`
            : `<a class="wizard-sign-in" href="/login">Sign in</a>`}
        </div>
      </header>
      <main class="wizard-main">
        <div class="wizard-heading"><div><h1>Bring your brand into focus.</h1><p>Setup for ${escapeHtml(data.settings?.brand_name || data.store?.name || "your store")}</p></div><div class="save-status" id="save-status" data-state="${accountName ? "saving" : "readonly"}" role="status" aria-live="polite">${accountName ? "Loading" : "Sign in to save"}</div></div>
        <div class="wizard-workspace">
          <section class="wizard-panel" id="wizard-panel" aria-live="polite"></section>
          <section class="wizard-preview-panel" id="preview-panel" aria-label="Live store preview"></section>
        </div>
      </main>
      <button class="btn mobile-preview-launch" id="open-preview" type="button">Preview store</button>
      <div class="preview-fullscreen" id="preview-fullscreen"><button class="btn btn-secondary mobile-preview-close" id="close-preview" type="button">Close preview</button></div>
      <script type="application/json" id="wizard-data">${safeData}</script>
    </div>
    <script type="module" src="/assets/wizard.js"></script>`;
  return layout({
    title: "Set up your store | LeBrands.Store",
    description: "Shape your brand's first online catalogue.",
    canonical: `${APP_ORIGIN}/stores/${encodeURIComponent(storeId)}/setup`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/wizard.css">',
    body,
  });
}
