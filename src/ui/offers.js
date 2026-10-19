import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// renderOffers(data): data.store, data.role, data.offers = { available, items, products, collections, currency }
export function renderOffers(data = {}) {
  const store = data.store || {};
  const role = data.role || "";
  const canEdit = role === "owner" || role === "admin";
  const offers = data.offers || {};
  const available = offers.available === true;
  const storeId = String(store.store_id || "");
  const heading = `<div class="lb-page-heading"><div><h1>Offers &amp; codes</h1><p>Discounts customers get automatically or by entering a code at checkout.</p></div>${canEdit && available ? `<div class="lb-heading-actions"><button type="button" class="lb-button" data-offer-new>New offer</button></div>` : ""}</div>`;
  if (!canEdit) {
    return `${heading}<section class="lb-empty" role="alert"><h2>Offers are managed by owners and admins.</h2><p>Ask your store owner or an admin to create or change discounts.</p></section>`;
  }
  const boot = { storeId, available, items: Array.isArray(offers.items) ? offers.items : [], products: Array.isArray(offers.products) ? offers.products : [], collections: Array.isArray(offers.collections) ? offers.collections : [], currency: offers.currency || "INR" };
  const dis = available ? "" : " disabled";
  const notice = available ? "" : `<div class="lb-server-error" role="alert"><span>Offers are not available yet. The offers database update has not been applied to this store, so nothing can be saved. Try again after the update is live.</span><button type="button" data-offers-retry>Check again</button></div>`;
  const field = (label, control, hint = "") => `<label class="lb-field lbo-field"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
  return `${heading}${notice}
  <div class="lbo" data-offers-root data-available="${available}">
    <div class="lbo-alert lb-form-error" role="alert" data-offers-error hidden></div>
    <div class="lbo-tickets" data-offers-tickets aria-label="Offer tickets"></div>
    <section class="lb-card lbo-list-card"><div class="lb-card-heading"><h2>Your offers</h2></div>
      <div data-offers-list aria-live="polite"><div class="lb-skeleton" aria-label="Loading offers"><i></i><i></i></div></div></section>
    <section class="lb-card lbo-form-card" data-offer-panel hidden><div class="lb-card-heading"><h2 data-offer-form-title>New offer</h2></div>
    <div class="lbo-editor"><aside class="lbo-preview-wrap" aria-label="Ticket preview"><small class="lbo-preview-label">Live preview</small><div data-offer-preview></div></aside>
    <form class="lbo-form" data-offer-form novalidate>
      <fieldset class="lbo-set"${dis}><legend>Basics</legend>
        ${field("Offer name", `<input name="title" maxlength="120" required placeholder="Festive 10% off">`, "Shown to you and on the order record.")}
        <div class="lbo-row">
          ${field("Applies", `<select name="method"><option value="automatic">Automatically at checkout</option><option value="code">With a discount code</option></select>`)}
          <div data-code-field>${field("Discount code", `<input name="code" maxlength="32" autocapitalize="characters" spellcheck="false" placeholder="DIWALI-10">`, "3 to 32 characters. Start with a letter or digit, then letters, digits or hyphens. Saved in capitals.")}</div>
        </div>
      </fieldset>
      <fieldset class="lbo-set"${dis}><legend>Discount</legend>
        <div class="lbo-row">
          ${field("Applies to", `<select name="scope"><option value="order">Whole order</option><option value="product">Selected products</option><option value="collection">Selected collections</option></select>`)}
          ${field("Type", `<select name="kind"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>`)}
          ${field(`<span data-value-label>Percentage off (%)</span>`, `<input name="value" inputmode="decimal" required placeholder="10">`)}
        </div>
        <div data-targets hidden><div class="lbo-targets-head"><strong data-targets-label>Products</strong><input type="search" data-target-search placeholder="Search" aria-label="Search targets"></div><div class="lbo-targets" data-target-list></div><small class="lb-form-hint" data-target-count></small></div>
        <div data-max-field>${field("Maximum saving (Rs)", `<input name="max_discount" inputmode="decimal" placeholder="No cap">`, "Optional ceiling on the percentage discount per order.")}</div>
      </fieldset>
      <fieldset class="lbo-set"${dis}><legend>Requirements and limits</legend>
        <div class="lbo-row">
          ${field("Minimum spend (Rs)", `<input name="min_spend" inputmode="decimal" placeholder="None">`)}
          ${field("Minimum quantity", `<input name="min_quantity" inputmode="numeric" placeholder="1">`)}
          ${field("Total uses allowed", `<input name="usage_limit" inputmode="numeric" placeholder="Unlimited">`, "Across all customers.")}
        </div>
        <p class="lb-form-hint lbo-note">There is no limit per customer yet. Guest shoppers are not verified, so a per customer limit could not be enforced honestly. Offers do not stack or bundle in this release.</p>
      </fieldset>
      <fieldset class="lbo-set"${dis}><legend>Schedule (UTC)</legend>
        <div class="lbo-row">
          ${field("Starts (UTC)", `<input type="datetime-local" name="starts_at">`, "Leave empty to start when active.")}
          ${field("Ends (UTC)", `<input type="datetime-local" name="ends_at">`, "Times are Coordinated Universal Time. India Standard Time is UTC plus 5:30.")}
          ${field("Status", `<select name="status"><option value="draft" selected>Draft (not live)</option><option value="active">Active</option><option value="paused">Paused</option></select>`)}
        </div>
      </fieldset>
      <div class="lb-form-actions"><button type="submit" class="lb-button"${dis} data-offer-save>Save offer</button><button type="button" class="lb-button lb-button-outline" data-offer-cancel>Cancel</button></div>
    </form></div></section>
    <script type="application/json" id="offers-data">${safeJson(boot)}</script>
  </div>`;
}
