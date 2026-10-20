import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = (v) => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const KEYS = ["meta_enabled","meta_pixel_id","meta_test_event_code","meta_domain_verification","google_enabled","ga4_measurement_id","google_ads_id","google_label_purchase","google_label_add_to_cart","google_label_begin_checkout","google_enhanced_conversions","google_site_verification"];

function publicState(storeId, m) {
  const src = m && typeof m === "object" ? m : {};
  const s = src.settings && typeof src.settings === "object" ? src.settings : {};
  const settings = {};
  for (const k of KEYS) settings[k] = k.endsWith("enabled") || k === "google_enhanced_conversions" ? s[k] === true : String(s[k] ?? "");
  return {
    store_id: String(storeId || ""), settings, can_edit: src.can_edit === true,
    revision: src.revision ?? 0, meta_token_hint: src.meta_token_hint ? String(src.meta_token_hint) : "",
    storefront_url: typeof src.storefront_url === "string" ? src.storefront_url : null,
  };
}

function field(key, label, opts = {}) {
  const hint = opts.hint ? `<small id="hint-${key}" class="lb-form-hint">${esc(opts.hint)}</small>` : "";
  return `<div class="lb-field mi-field"><label for="f-${key}">${esc(label)}</label>
    <input id="f-${key}" name="${key}" data-field="${key}" type="text" autocomplete="off" spellcheck="false" inputmode="${opts.mode || "text"}" placeholder="${esc(opts.ph || "")}" aria-describedby="${opts.hint ? `hint-${key} ` : ""}err-${key}">
    ${hint}<span class="field-error" id="err-${key}" data-error="${key}" role="alert" hidden></span></div>`;
}
function toggle(key, label, desc) {
  return `<div class="mi-toggle"><input type="checkbox" id="f-${key}" data-field="${key}" aria-describedby="desc-${key}"><label for="f-${key}"><strong>${esc(label)}</strong><small id="desc-${key}">${esc(desc)}</small></label></div>`;
}
function adv(title, body) {
  return `<details class="mi-advanced"><summary>${esc(title)}</summary><div class="mi-advanced-body">${body}</div></details>`;
}

export function renderMarketingIntegrations(data = {}) {
  const storeId = data?.store?.store_id || "";
  const st = publicState(storeId, data?.marketing);
  const root = `/stores/${encodeURIComponent(storeId)}`;
  const url = st.storefront_url;
  return `<div class="mi-page" data-mi-root data-store-id="${esc(storeId)}">
  <link rel="stylesheet" href="/assets/marketing-integrations.css">
  <div class="lb-page-heading"><div><h1>Marketing integrations</h1><p>Connect Meta and Google measurement to your storefront. Campaigns, budgets and reports stay in the provider dashboards.</p></div>
    <div class="lb-heading-actions"><a class="lb-button lb-button-outline" href="${root}/settings">Back to settings</a></div></div>
  <div class="mi-banner" data-banner role="status" aria-live="polite" hidden></div>
  <p class="lb-readonly-note mi-readonly" data-readonly hidden>You have read-only access. Ask an owner or admin to change these settings.</p>
  <section class="lb-card"><div class="lb-card-heading"><h2>Storefront</h2></div>
    <div class="mi-body"><p class="mi-text" data-storefront>${url ? `Tags load on <a class="lb-inline-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a> once saved and enabled.` : "Your storefront is not live yet. Settings can be saved now and tags start loading when the store goes live."}</p></div></section>
  <form data-form novalidate aria-describedby="mi-load-state">
  <p id="mi-load-state" class="lb-sr-only" data-live role="status" aria-live="polite"></p>
  <section class="lb-card" aria-labelledby="mi-meta-h"><div class="lb-card-heading mi-card-head"><h2 id="mi-meta-h">Meta Pixel and Conversions API</h2><span class="mi-status" data-status-for="meta" data-tone="off">Not enabled</span></div>
    <div class="mi-body">
      ${toggle("meta_enabled", "Enable Meta", "Loads the Pixel for shoppers who accept marketing cookies and sends server events when a token is saved.")}
      ${field("meta_pixel_id", "Pixel ID", { mode: "numeric", ph: "15 or 16 digits", hint: "Required when Meta is enabled." })}
      ${adv("Advanced Meta options", `<div class="lb-field mi-field"><label for="f-meta_capi_token">Conversions API access token</label>
          <input id="f-meta_capi_token" data-token type="password" autocomplete="new-password" spellcheck="false" placeholder="Leave blank to keep the saved token" aria-describedby="hint-token err-meta_capi_token">
          <small id="hint-token" class="lb-form-hint" data-token-hint></small>
          <span class="field-error" id="err-meta_capi_token" data-error="meta_capi_token" role="alert" hidden></span>
          <label class="lb-check-input mi-remove" data-remove-wrap hidden><input type="checkbox" data-remove-token>Remove the saved token when I save</label></div>
      <div class="mi-grid">${field("meta_test_event_code", "Test event code", { ph: "Example: TEST12345", hint: "Temporary. Remove after testing so server purchases can be used for live ads." })}${field("meta_domain_verification", "Domain verification code", { hint: "The content value only. Shown on your custom domain, not a shared platform domain." })}</div>
      <div class="mi-test"><div class="mi-test-row"><button type="button" class="lb-button lb-button-outline lb-button-small" data-test-meta>Send test server event</button><span class="mi-test-why" data-test-why></span></div>
        <p class="mi-text">Sends one synthetic PageView from our server using your saved token and test event code. It contains no shopper information. Check it under Test events in Events Manager.</p>
        <div class="mi-result" data-test-result role="status" aria-live="polite" hidden></div></div>`)}
    </div></section>

  <section class="lb-card" aria-labelledby="mi-g-h"><div class="lb-card-heading mi-card-head"><h2 id="mi-g-h">Google Analytics 4 and Google Ads</h2><span class="mi-status" data-status-for="google" data-tone="off">Not enabled</span></div>
    <div class="mi-body">
      ${toggle("google_enabled", "Enable Google", "Loads Google tags for shoppers who accept analytics and marketing cookies.")}
      ${field("ga4_measurement_id", "GA4 Measurement ID", { ph: "G-XXXXXXXXXX", hint: "Find it in Google Analytics → Admin → Data streams → your web stream." })}
      ${adv("Advanced Google options", `<div class="mi-grid">${field("google_ads_id", "Google Ads ID", { ph: "AW-1234567890" })}${field("google_label_purchase", "Purchase conversion label")}${field("google_label_add_to_cart", "Add to cart conversion label")}${field("google_label_begin_checkout", "Begin checkout conversion label")}${field("google_site_verification", "Site verification code", { hint: "The content value of the Google site verification tag." })}</div>
        ${toggle("google_enhanced_conversions", "Enhanced conversions", "Off by default. Requires a Google Ads ID, a purchase label and shopper consent. Leave off unless you have set it up in Google Ads.")}`)}
      <p class="mi-note" data-primary-warning role="note" hidden>Direct Ads labels are set. If you also import GA4 purchases into Google Ads, choose one primary purchase conversion in Google Ads so sales are not counted twice.</p>
    </div></section>

  <div class="mi-actions"><button type="submit" class="lb-button" data-save>Save settings</button><button type="button" class="lb-button lb-button-quiet" data-discard hidden>Discard changes</button><span class="mi-dirty" data-dirty role="status" hidden>Unsaved changes. Nothing changes on your storefront until you save.</span></div>
  <p class="mi-text">Saving stores your settings as Configured. It does not confirm that the provider receives events. Verify inside Events Manager, GA4 or Google Ads.</p>
  </form>

  <section class="lb-card" aria-labelledby="mi-c-h"><div class="lb-card-heading"><h2 id="mi-c-h">Testing and conversion checklist</h2></div>
    <div class="mi-body mi-info">
      <h3>Testing the browser Pixel</h3><p>This admin runs no trackers and cannot confirm browser events. Open your storefront, accept cookies, then watch Events Manager, Test events for Meta, and GA4 DebugView or Google Tag Assistant for Google.</p>
      <h3>Before running purchase campaigns</h3>
      <ol><li>In GA4, mark the purchase event as a key event.</li><li>Link the GA4 property to your Google Ads account.</li><li>In Google Ads, import the GA4 purchase conversion.</li></ol>
      <p>If you also enter direct Ads conversion labels, choose one primary purchase conversion so sales are not counted twice.</p>
      <h3>Finish testing before running ads</h3><p>Remove the Meta test event code when testing is finished. While that code is saved, server purchase events stay in test mode and are not used for your live ads.</p>
      <h3>Shopper consent</h3><p>Tags load only after a shopper accepts the relevant cookies. Visits that decline are excluded from tracking. Checkout is never blocked by a consent choice.</p>
      <h3>Campaigns and spend</h3><p>Creating campaigns, budgets and reading ad spend happen in Meta Ads Manager and Google Ads. LeBrands does not connect to those accounts.</p>
    </div></section>
  <script type="application/json" id="marketing-integrations-data">${safeJson(st)}</script>
  <script type="module" src="/assets/marketing-integrations.js"></script>
</div>`;
}
