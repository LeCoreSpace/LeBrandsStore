import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderAnalytics(data = {}, user = {}) {
  void user;
  const storeId = String(data.store?.store_id || "");
  const allowed = data.role === "owner" || data.role === "admin";
  const root = `/stores/${esc(encodeURIComponent(storeId))}`;
  const heading = `<div class="lb-page-heading"><div><h1>Analytics</h1><p>Private sales reporting by day, order and product. Business pulse &gt; Analytics.</p></div></div>`;
  if (!allowed) {
    return `${heading}<section class="lb-empty" role="alert"><h2>Analytics are private.</h2><p>Only the store owner and admins can view sales analytics.</p><a class="lb-button" href="${root}/products">Back to products</a></section>`;
  }
  const boot = { storeId, role: data.role, store: data.store || null, analytics: data.analytics || null };
  const presets = [["this_month", "This month"], ["this_quarter", "This quarter"], ["financial_year", "Financial year"], ["last_30_days", "Last 30 days"], ["custom", "Custom range"]];
  return `${heading}
  <section class="lba" data-an-root aria-label="Analytics">
    <div class="lba-print-summary" data-an-print hidden></div>
    <form class="lb-filter-bar lba-filters" data-an-form novalidate>
      <label><span>Period</span><select name="preset" data-an-preset>${presets.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      <label data-an-custom hidden><span>From</span><input type="date" name="from"></label>
      <label data-an-custom hidden><span>To</span><input type="date" name="to"></label>
      <label><span>Timezone</span><select name="timezone" data-an-tz>${["Asia/Kolkata", "UTC", "Asia/Dubai", "Europe/London", "America/New_York"].map((z) => `<option value="${z}">${z}</option>`).join("")}</select></label>
      <label><span>Currency</span><input name="currency" value="${esc(data.store?.currency || "INR")}" maxlength="3" minlength="3" pattern="[A-Za-z]{3}" autocomplete="off" spellcheck="false" list="an-currencies" data-an-currency><datalist id="an-currencies">${["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"].map((c) => `<option value="${c}"></option>`).join("")}</datalist></label>
      <button class="lb-button lb-button-small" type="submit" data-an-apply>Apply</button>
    </form>
    <p class="lba-error" data-an-formerr role="alert" hidden></p>
    <div class="lba-tabs" role="group" aria-label="Report">
      <button type="button" data-an-report="sales" aria-pressed="true">Daily sales</button>
      <button type="button" data-an-report="orders" aria-pressed="false">Order lines</button>
      <button type="button" data-an-report="products" aria-pressed="false">Products</button>
    </div>
    <div class="lba-alert" data-an-alert role="alert" hidden></div>
    <div data-an-body aria-live="polite" aria-busy="true"><div class="lb-skeleton" aria-label="Loading analytics"><i></i><i></i><i></i><i></i></div></div>
    <div class="lba-actions lba-noprint" data-an-actions hidden>
      <button type="button" class="lb-button lb-button-small lb-button-outline" data-an-export="csv">Export CSV</button>
      <button type="button" class="lb-button lb-button-small lb-button-outline" data-an-export="xlsx">Export XLSX</button>
      <button type="button" class="lb-button lb-button-small lb-button-outline" data-an-printbtn>Print / Save PDF</button>
    </div>
    <p class="lb-muted lba-noprint" data-an-exportnote>Exports cover the whole selected report for the selected dates, not only the page shown. Reports above 10,000 rows are refused rather than truncated.</p>
    <section class="lba-defs" aria-label="Definitions">
      <h2>Definitions</h2>
      <dl>
        <dt>Booked order value</dt><dd>Stored order total including tax and shipping. It is not cash received and not profit.</dd>
        <dt>Merchandise waterfall</dt><dd>Gross merchandise less discounts and reversals gives net merchandise. Amounts include tax and follow the order date. Returned and refunded statuses are reversed in full as a status estimate, not an actual gateway refund.</dd>
        <dt>Accepted orders</dt><dd>Confirmed COD, confirmed, paid, processing, packed, shipped and delivered. Pending payment, cancelled, refunded, returned and RTO are excluded.</dd>
        <dt>Cost coverage</dt><dd>Eligible sold units that have a captured cost in the same currency. Missing costs are never treated as zero.</dd>
        <dt>Estimated product margin</dt><dd>Only for the comparable subset: known captured cost, verified ex-tax line values and no unallocated order discount. It is not an all-sales margin or net profit.</dd>
        <dt>Product item value</dt><dd>Line value before order-level discounts. It is not net revenue.</dd>
        <dt>Order register</dt><dd>One row per saved order line, including excluded statuses. Whole-order totals and discounts repeat on each line. Do not sum those repeated amounts.</dd>
      </dl>
      <p class="lb-muted">Not part of this release: traffic and sessions, customer cohorts, net profit and tax pack.</p>
    </section>
  </section>
  <script type="application/json" id="analytics-data">${safeJson(boot)}</script>`;
}
