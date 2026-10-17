import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderInventory(data = {}) {
  const inv = data.inventory && typeof data.inventory === "object" ? data.inventory : {};
  const storeId = String(data.store?.store_id || inv.store_id || "");
  const boot = { inventory: inv, storeId };
  return `<div class="lb-page-heading"><div><h1>Stock &amp; SKUs</h1><p>Set counts for each SKU. Changes apply together after you review them.</p></div><div class="lb-heading-actions"><a class="lb-button lb-button-outline" href="/stores/${esc(encodeURIComponent(storeId))}/products">Products</a></div></div>
  <section class="lbi" data-inventory aria-label="Stock and SKUs">
    <div class="lbi-summary" data-inv-summary></div>
    <form class="lb-filter-bar lbi-filters" data-inv-filters>
      <label class="lb-search"><span>Search</span><input type="search" name="search" placeholder="Title or SKU" autocomplete="off"></label>
      <label><span>Availability</span><select name="availability"><option value="all">All</option><option value="in_stock">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="untracked">Not tracked</option></select></label>
      <label><span>Status</span><select name="status"><option value="all">All</option><option value="active">Active</option><option value="draft">Draft</option></select></label>
      <button class="lb-button lb-button-small" type="submit">Apply</button>
    </form>
    <div class="lbi-alert" data-inv-alert role="alert" hidden></div>
    <div class="lbi-bulk" data-inv-bulk hidden></div>
    <div data-inv-table aria-live="polite"><div class="lb-skeleton" aria-label="Loading SKUs"><i></i><i></i><i></i><i></i></div></div>
    <div class="lbi-pager" data-inv-pager></div>
    <dialog class="lbi-dialog" data-inv-dialog aria-labelledby="lbi-dlg-title"><form method="dialog" data-inv-confirm><h2 id="lbi-dlg-title">Review stock changes</h2><div data-inv-review></div>
      <label class="lbi-reason">Reason<input name="reason" minlength="3" maxlength="200" required placeholder="For example, cycle count on 12 May"></label><p class="lbi-error" data-inv-dlg-error role="alert" hidden></p>
      <div class="lbi-dlg-actions"><button type="button" class="lb-button lb-button-outline" data-inv-cancel>Back to edits</button><button type="submit" class="lb-button" data-inv-submit>Apply changes</button></div></form></dialog>
  </section>
  <script type="application/json" id="inventory-data">${safeJson(boot)}</script>`;
}
