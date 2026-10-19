import { escapeHtml } from "./layout.js";

const esc = escapeHtml;
const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderCogs(data = {}, user = {}) {
  const storeId = String(data.store?.store_id || "");
  const role = data.role || "";
  const allowed = role === "owner" || role === "admin";
  const root = `/stores/${esc(encodeURIComponent(storeId))}`;
  void user;
  const heading = `<div class="lb-page-heading"><div><h1>Product costs</h1><p>Private cost per unit for each product and SKU. Catalogue &gt; COGS.</p></div><div class="lb-heading-actions"><a class="lb-button lb-button-outline" href="${root}/products">Products</a></div></div>`;
  if (!allowed) {
    return `${heading}<section class="lb-empty" role="alert"><h2>Costs are private.</h2><p>Only the store owner and admins can view or edit product costs.</p><a class="lb-button" href="${root}/products">Back to products</a></section>`;
  }
  const boot = { storeId, role, store: data.store || null, cogs: data.cogs || null };
  return `${heading}
  <section class="lbc" data-cogs-root aria-label="Product costs">
    <aside class="lbc-note" aria-label="How costs work">
      <strong>How costs work</strong>
      <ul>
        <li>Only owners and admins can access costs. They never appear on your storefront.</li>
        <li>A blank base cost means unknown. It is not treated as zero. Enter 0 only when a unit truly costs nothing.</li>
        <li>A SKU with a blank cost inherits the base cost of its product.</li>
        <li>Changing a cost applies from now on. Costs already recorded on past sales are not rewritten.</li>
      </ul>
    </aside>
    <form class="lb-filter-bar lbc-filters" data-cogs-filters>
      <label class="lb-search"><span>Search</span><input type="search" name="search" placeholder="Title or SKU" autocomplete="off"></label>
      <label class="lbc-check"><input type="checkbox" name="missing" value="1"><span>Missing costs only</span></label>
      <button class="lb-button lb-button-small" type="submit">Apply</button>
    </form>
    <div class="lbc-alert" data-cogs-alert role="alert" hidden></div>
    <div class="lbc-bar" data-cogs-bar hidden></div>
    <div data-cogs-table aria-live="polite"><div class="lb-skeleton" aria-label="Loading costs"><i></i><i></i><i></i><i></i></div></div>
    <div class="lbc-pager" data-cogs-pager></div>
    <dialog class="lbc-dialog" data-cogs-dialog aria-labelledby="lbc-hist-title"><div class="lbc-dlg-body"><h2 id="lbc-hist-title">Cost history</h2><p class="lb-muted">Amounts record changes to the base cost or a SKU override. A SKU shown as Inherit follows the current base cost.</p><div data-cogs-history></div><div class="lbc-dlg-actions"><button type="button" class="lb-button lb-button-outline" data-cogs-history-close>Close</button></div></div></dialog>
  </section>
  <script type="application/json" id="cogs-data">${safeJson(boot)}</script>`;
}
