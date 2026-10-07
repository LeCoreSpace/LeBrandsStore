import { escapeHtml, layout } from "./layout.js";
import { validateProduct } from "../public/validation.js";
import { CURRENT_GST_RATES, INDIAN_STATES, registeredBusinessState, registeredSupplierErrors, defaultInvoicePrefix, formatPhone } from "../public/commerce-rules.js";
import { statusLabel, stateName, indianDate, allowedTransitions, timelineSentence } from "../public/dashboard-rules.js";

const esc = escapeHtml;
const money = (value) => `₹${(Number(value || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value) => value ? (indianDate(value) || "Not recorded") : "Not recorded";
const obj = (value) => value && typeof value === "object" ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const statusText = (status, method) => statusLabel(status || "unknown", method || "");
const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const safeHttps = (value) => {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
};
export function orderActionForm(storeId,orderId,transitions) {
  const next=transitions[0];
  return `<div class="lb-order-form" data-order-form data-order-id="${orderId}">
    <label>Next action<select data-next-order-action>${transitions.map(s=>`<option value="${s}">${esc(statusLabel(s))}</option>`).join("")}</select></label>
    ${transitions.includes("shipped") ? `<div data-action-fields="shipping" ${next==="shipped" ? "" : "hidden"}><label>Courier name<input name="courier"></label><label>Tracking number<input name="tracking_number"></label><label>Tracking URL<input name="tracking_url" type="url" placeholder="https://…"></label></div>` : ""}
    ${transitions.some(s=>["cancelled","returned","rto"].includes(s)) ? `<label class="lb-check-input" data-action-fields="restock" ${["cancelled","returned","rto"].includes(next) ? "" : "hidden"}><input name="restock" type="checkbox" ${next==="cancelled" ? "checked disabled" : ""}>Restock goods (automatic on cancellation)</label>` : ""}
    <p data-shipping-error hidden role="alert"><span></span> <a href="/stores/${storeId}/settings">Open Settings</a></p></div>`;
}

function documentPage(view, data, user, body) {
  const store = obj(data.store);
  const storeId = String(store.store_id || "");
  const title = ({
    overview: "Overview", orders: "Orders", order: "Order details", products: "Products",
    "product-new": "Add product", product: "Edit product", customers: "Customers",
    customer: "Customer details", invoices: "Invoices", settings: "Settings",
  })[view] || "Overview";
  return layout({
    title: `${title} | ${store.name || "Your store"} | LeBrands.Store`,
    description: `${title} workspace for ${store.name || "your store"}.`,
    canonical: `https://app.lebrands.store/stores/${encodeURIComponent(storeId)}/${view === "overview" ? "" : view}`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/dashboard.css"><script type="module" src="/assets/dashboard.js"></script>',
    body: `<div class="lb-app" data-store-id="${esc(storeId)}" data-role="${esc(data.role || "editor")}">
      ${header(data, user, view)}
      <main class="lb-main">${body}</main>
      <div class="lb-toast" role="status" aria-live="polite" data-toast hidden></div>
      <script type="application/json" id="dashboard-data">${safeJson({ store, role: data.role, draft: data.draft, filters: data.filters, checkoutSettings: data.checkoutSettings })}</script>
    </div>`,
  });
}

function header(data, user, view) {
  const store = obj(data.store);
  const id = encodeURIComponent(store.store_id || "");
  const root = `/stores/${id}`;
  const items = [
    ["overview", "Overview", root],
    ["orders", "Orders", `${root}/orders`],
    ["products", "Products", `${root}/products`],
    ["customers", "Customers", `${root}/customers`],
    ["invoices", "Invoices", `${root}/invoices`],
    ["settings", "Settings", `${root}/settings`],
  ];
  const active = view === "order" ? "orders" : view.startsWith("product") || view === "product" ? "products" : view === "customer" ? "customers" : view;
  const storeUrl = store.subdomain ? `https://${encodeURIComponent(store.subdomain)}.lebrands.store/` : "#";
  return `<header class="lb-header">
    <a class="lb-wordmark" href="${root}" aria-label="LeBrands.Store workspace"><span class="lb-mark">L</span><span>LeBrands<small>STORE WORKSPACE</small></span></a>
    <div class="lb-header-right"><span class="lb-store-name">${esc(store.name || "Your store")}</span><span class="lb-user">${esc(user?.name || user?.email || "Account")}</span><a class="lb-visit" href="${esc(storeUrl)}" ${store.subdomain ? 'target="_blank" rel="noopener"' : 'aria-disabled="true"'}>View store <span aria-hidden="true">↗</span></a>
    <button type="button" class="lb-menu-toggle" data-menu-toggle aria-label="Open navigation" aria-expanded="false"><span></span><span></span></button></div>
  </header><nav class="lb-nav" data-nav aria-label="Store navigation">
    <div class="lb-nav-inner">${items.map(([key, label, href]) => `<a href="${href}" ${key === active ? 'aria-current="page"' : ""}>${esc(label)}</a>`).join("")}
      <a class="lb-nav-mobile-store" href="${esc(storeUrl)}" ${store.subdomain ? 'target="_blank" rel="noopener"' : ""}>View store ↗</a>
    </div>
  </nav>`;
}

function pageHeading(kicker, title, intro, actions = "") {
  return `<div class="lb-page-heading"><div><div class="lb-kicker">${esc(kicker)}</div><h1>${title}</h1><p>${esc(intro)}</p></div>${actions ? `<div class="lb-heading-actions">${actions}</div>` : ""}</div>`;
}
function buttonLink(href, label, kind = "primary") { return `<a class="lb-button ${kind === "quiet" ? "lb-button-quiet" : ""}" href="${href}">${esc(label)}</a>`; }
function exportControl(role, kind, label) { return role === "owner" ? `<button type="button" class="lb-button lb-button-outline" data-export="${esc(kind)}">${esc(label)}</button>` : `<span class="lb-export-restricted">Exports: owner only</span>`; }
function empty(title, copy, action = "") { return `<section class="lb-empty"><span class="lb-empty-mark" aria-hidden="true"></span><h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</section>`; }
function card(title, body, klass = "") { return `<section class="lb-card ${klass}"><div class="lb-card-heading"><h2>${esc(title)}</h2></div>${body}</section>`; }
function statusPill(status, method = "") { return `<span class="lb-status" data-status="${esc(status || "unknown")}">${esc(statusText(status, method))}</span>`; }
function actionError(data) { return data.error ? `<div class="lb-server-error" role="alert"><span>${esc(data.error)}</span><button type="button" data-retry>Try again</button></div>` : ""; }

function overview(data) {
  const o = obj(data.overview);
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const top = list(o.top_products), sources = list(o.sources), needs = list(o.needing_action);
  const catalogProducts = list(data.draft?.products || data.products);
  const period = Number(data.filters?.period) === 7 ? 7 : 30;
  const checks = [
    ["Online payments", "Connect a payment provider", "Coming soon"],
    ["Delivery integration", "Connect your courier account", "Coming soon"],
    ["Own domain", "Use your existing domain", "Coming soon"],
    ["More products", "Build out your catalogue", "Add products", ""],
  ];
  const setup = `<div class="lb-checklist">${checks.map(([label, text, action]) => `<div class="lb-check-row"><span class="lb-check-dot ${action ? "is-pending" : ""}" aria-hidden="true"></span><div><strong>${esc(label)}</strong><small>${esc(text)}</small></div>${action === "Add products" ? `<a href="/stores/${storeId}/products/new">${action}</a>` : `<span class="lb-coming">${esc(action)}</span>`}</div>`).join("")}</div>`;
  const soldTop = top.filter(p => Number(p.quantity || 0) > 0);
  const sourced = sources.filter(s => Number(s.orders || 0) > 0);
  const rankRows = soldTop.length ? soldTop.slice(0, 5).map((p, i) => `<div class="lb-rank-row"><span class="lb-rank">${String(i + 1).padStart(2, "0")}</span><strong>${esc(p.title || "Untitled product")}</strong><span>${Number(p.quantity || 0)} sold</span><b>${money(p.revenue_paise)}</b></div>`).join("") : `<div class="lb-inline-empty">${top.length ? "No product sales in this period." : catalogProducts.length ? "Product sales will appear after orders are placed." : `Add a product before sales can be ranked. <a href="/stores/${storeId}/products/new">Add a product</a>.`}</div>`;
  const sourceRows = sourced.length ? sourced.map(s => `<div class="lb-source-row"><span>${esc(s.source === "mall" ? "Mall" : s.source === "direct" ? "Direct" : "Other")}</span><strong>${Number(s.orders || 0)} ${Number(s.orders || 0) === 1 ? "order" : "orders"}</strong></div>`).join("") : `<div class="lb-inline-empty">${sources.length ? "No attributed orders in this period." : "Source attribution will appear with recorded orders."}</div>`;
  const actionRows = needs.length ? needs.slice(0, 5).map(order => `<a class="lb-action-row" href="/stores/${storeId}/orders/${encodeURIComponent(order.id || "")}"><span class="lb-action-mark"></span><span><strong>${esc(order.order_number || "Order")}</strong><small>${esc(order.customer_name || "Customer")} · ${date(order.created_at)}</small></span>${statusPill(order.status, order.payment_method)}</a>`).join("") : `<div class="lb-clear-state"><span class="lb-clear-mark">✓</span><strong>Nothing needs attention</strong><p>Orders awaiting your next step will be listed here.</p></div>`;
  const periodControl = `<div class="lb-period-switch" aria-label="Overview period"><a href="?period=7" ${period === 7 ? 'aria-current="true"' : ""}>7 days</a><a href="?period=30" ${period === 30 ? 'aria-current="true"' : ""}>30 days</a></div>`;
  const metrics = [
    ["Today's orders", Number(o.today_orders || 0), "Placed today"],
    [`Orders · ${period} days`, Number(o.orders || 0), `Last ${period === 7 ? "seven" : "30"} days`],
    [`Gross sales · ${period} days`, money(o.revenue_paise), "Excludes cancelled and returned orders"],
    ["Average order value", Number(o.orders || 0) ? money(o.aov_paise) : "Not yet available", "Across recorded orders"],
  ];
  return `${pageHeading("Operating workspace", "The day, in view.", "A clear read on orders, gross sales and the work waiting for you.", buttonLink(`/stores/${storeId}/orders`, "Open orders"))}
    ${actionError(data)}
    ${periodControl}<div class="lb-metric-grid">${metrics.map(([label, value, note], i) => `<article class="lb-metric"><div class="lb-metric-label">${esc(label)}<span class="lb-metric-index">0${i + 1}</span></div><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join("")}</div>
    <p class="lb-data-note">Gross sales exclude cancelled, refunded and returned orders. They are not cash collected.</p>
    <div class="lb-overview-grid"><div class="lb-overview-main">
      ${card("Setup, at your pace", setup, "lb-setup-card")}
      <div class="lb-split">${card("Top products", `<div class="lb-rank-list">${rankRows}</div>`)}${card("Orders by source", `<div class="lb-source-list">${sourceRows}</div>`)}</div>
    </div><aside>${card("Needs your attention", `<div class="lb-action-list">${actionRows}</div>`, "lb-attention-card")}</aside></div>`;
}

function orderTable(rows, storeId) {
  return `<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(order => `<tr>
    <td><a class="lb-row-link" href="/stores/${storeId}/orders/${encodeURIComponent(order.id || "")}">${esc(order.order_number || "Order")}</a></td>
    <td>${esc(date(order.created_at))}</td><td><strong>${esc(order.customer_name || "Customer")}</strong><small>${esc(formatPhone(order.phone) || "Phone unavailable")}</small></td>
    <td>${Number(order.item_count ?? order.items_count ?? 0)}</td><td>${money(order.total_paise)}</td><td>${statusPill(order.status, order.payment_method)}</td></tr>`).join("")}</tbody></table></div>`;
}
function ordersPage(data) {
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const rows = list(data.orders);
  const f = obj(data.filters);
  const statuses = ["", "confirmed_cod", "pending_payment", "paid", "packed", "shipped", "delivered", "cancelled", "returned", "rto"];
  return `${pageHeading("Order desk", "Orders, without the guesswork.", "Filter the queue, open an order and keep its next step moving.", exportControl(data.role, "orders", "Export CSV"))}
    ${actionError(data)}<form class="lb-filter-bar" method="get" action="/stores/${storeId}/orders" data-filter-form>
    <label class="lb-search"><span>Search</span><input type="search" name="search" value="${esc(f.search || "")}" placeholder="Order number, name or phone"></label>
    <label><span>Status</span><select name="status">${statuses.map(s => `<option value="${esc(s)}" ${String(f.status || "") === s ? "selected" : ""}>${s ? esc(statusText(s)) : "All statuses"}</option>`).join("")}</select></label>
    <label><span>From</span><input type="date" name="from" value="${esc(f.from || "")}"></label><label><span>To</span><input type="date" name="to" value="${esc(f.to || "")}"></label>
    <button class="lb-button lb-button-small" type="submit">Apply</button><a class="lb-reset" href="/stores/${storeId}/orders">Reset</a></form>
    ${rows.length ? orderTable(rows, storeId) : empty("No matching orders.", f.search || f.status || f.from || f.to ? "Try widening your filters. Your order records remain unchanged." : "New customer orders will appear here as they come in.")}`;
}

function addressBlock(address, title = "Delivery address") {
  const a = obj(address);
  const state = a.state ? stateName(a.state) : "";
  const lines = [a.recipient_name || a.name, a.address_line_1 || a.line1, a.address_line_2 || a.line2, a.landmark, [a.city, state, a.pincode].filter(Boolean).join(", "), formatPhone(a.phone)].filter(Boolean);
  return `<div class="lb-address"><h3>${esc(title)}</h3>${lines.length ? lines.map((line, i) => `<span${i === 0 ? ' class="lb-address-name"' : ""}>${esc(line)}</span>`).join("") : `<p>Address not available.</p>`}</div>`;
}
function orderDetail(data) {
  const o = obj(data.order || data.detail);
  const totals = obj(o.totals);
  const id = encodeURIComponent(data.store?.store_id || ""), uuid = encodeURIComponent(o.id || data.id || "");
  const items = list(o.items), shipments = list(o.shipments), timeline = list(o.timeline);
  const transitions = list(allowedTransitions(o.status));
  const canEdit = ["owner", "admin"].includes(data.role);
  const canCollect = canEdit && ["shipped", "delivered"].includes(o.status) && /cod/i.test(o.payment_method || "") && !o.payment_collected_at;
  const invoice = obj(o.invoice);
  const itemRows = items.length ? items.map(item => `<tr><td><strong>${esc(item.title || "Product")}</strong><small>HSN ${esc(item.hsn_code || "Not supplied")} · GST ${esc(item.gst_rate ?? "Not recorded")}%</small></td><td>${Number(item.quantity || 0)}</td><td>${money(item.unit_price_paise)}</td><td>${money(item.total_paise)}</td></tr>`).join("") : `<tr><td colspan="4" class="lb-no-data">No line items recorded.</td></tr>`;
  const address = addressBlock(o.shipping_address);
  const statusActions = transitions.length && canEdit ? `<div class="lb-status-actions">${transitions.map(next => `<button type="button" class="lb-button lb-button-small${next === "cancelled" ? " lb-button-quiet" : ""}" data-order-status="${esc(next)}">${esc(next === "shipped" ? "Mark shipped" : next === "packed" ? "Mark packed" : `Mark ${next}`)}</button>`).join("")}</div>` : "";
  const payment = `<div class="lb-payment-state"><span class="lb-payment-label">Payment</span><strong>${esc(o.payment_collected_at ? `Collected · ${date(o.payment_collected_at)}` : /cod/i.test(o.payment_method || "") ? "Cash on Delivery · not collected" : o.payment_method || "Not recorded")}</strong>${canCollect ? `<button type="button" class="lb-text-button" data-payment-collected>Mark payment collected</button>` : ""}</div>`;
  const tax = `<div class="lb-totals">${[
    ["Items subtotal", o.subtotal_paise ?? totals.subtotal_paise], ["Delivery", o.shipping_paise ?? o.delivery_paise ?? totals.shipping_paise ?? totals.delivery_paise],
    ["Taxable value", o.taxable_paise ?? totals.taxable_paise], ["CGST", o.cgst_paise ?? totals.cgst_paise], ["SGST", o.sgst_paise ?? totals.sgst_paise], ["IGST", o.igst_paise ?? totals.igst_paise],
  ].filter(([, v]) => v != null).map(([label, value]) => `<div><span>${esc(label)}</span><strong>${money(value)}</strong></div>`).join("")}<div class="lb-total-final"><span>Order total</span><strong>${money(o.total_paise ?? totals.total_paise)}</strong></div></div>`;
  const shipMarkup = shipments.length ? shipments.map(s => { const trackingUrl = safeHttps(s.tracking_url); return `<div class="lb-shipment"><strong>${esc(s.courier || "Courier")}</strong><span>${esc(s.tracking_number || "Tracking not recorded")}</span>${trackingUrl ? `<a href="${esc(trackingUrl)}" target="_blank" rel="noopener">Track shipment ↗</a>` : ""}</div>`; }).join("") : `<p class="lb-muted">No shipment recorded yet.</p>`;
  const events = timeline.length ? timeline.map(t => {
    const action = timelineSentence(t);
    const actor = t.actor_name || (t.actor_type === "system" ? "Customer checkout" : "Team member");
    return `<li><span class="lb-timeline-dot"></span><div><strong>${esc(action)}</strong><small>${esc(actor)} · ${esc(date(t.created_at))}</small></div></li>`;
  }).join("") : `<li class="lb-muted">No timeline events recorded.</li>`;
  return `${pageHeading("Order desk", esc(o.order_number || "Order detail"), `Placed ${date(o.created_at)}`, buttonLink(`/stores/${id}/orders`, "Back to orders", "quiet"))}
    ${actionError(data)}<div class="lb-detail-head">${statusPill(o.status, o.payment_method)}${payment}${statusActions}</div>
    <div class="lb-detail-grid"><div class="lb-detail-primary">${card("Items", `<div class="lb-table-wrap"><table class="lb-table lb-items"><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${itemRows}</tbody></table></div>${tax}`)}
    ${card("Shipping", shipMarkup)}${card("Order timeline", `<ol class="lb-timeline">${events}</ol>`)}</div>
    <aside class="lb-detail-aside">${card("Customer", `<h3 class="lb-customer-name">${esc(o.customer_name || o.name || "Customer")}</h3><a href="tel:${esc(o.phone || "")}">${esc(o.phone || "Phone unavailable")}</a>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ""}`)}${card("Delivery details", address)}
    ${invoice.id ? card("Invoice", `<p>${esc(invoice.invoice_number || "Invoice")} · ${esc(invoiceStatus(invoice.status))}</p><a class="lb-inline-link" href="/stores/${id}/invoices/${encodeURIComponent(invoice.id)}">View invoice ↗</a>`) : ""}
    ${canEdit && transitions.length ? card("Update order",orderActionForm(id,uuid,transitions)) : ""}
    </aside></div>`;
}

function productRows(products, storeId, archived = false) {
  return `<div class="lb-product-grid">${products.map(p => { const imageUrl = safeHttps(p.images?.[0]?.url); return `<article class="lb-product-row"><a class="lb-product-image" href="/stores/${storeId}/products/${encodeURIComponent(p.id)}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(p.images[0].alt || p.title || "")}">` : `<span>Image pending</span>`}</a><div class="lb-product-info"><a href="/stores/${storeId}/products/${encodeURIComponent(p.id)}"><strong>${esc(p.title || "Untitled product")}</strong></a><small>${esc(p.sku || "No SKU")} · HSN ${esc(p.hsn_code || "Not recorded")}</small></div><div class="lb-product-price">${money(p.price_paise)}<small>${p.stock == null ? "Always in stock" : `${Number(p.stock)} in stock`}</small></div><span class="lb-product-gst">${archived ? `<span class="lb-archived-badge">Archived</span>` : `${esc(p.gst_rate ?? "Not recorded")}% GST`}</span><a class="lb-edit-link" href="/stores/${storeId}/products/${encodeURIComponent(p.id)}">${archived ? "View" : "Edit"}</a></article>`; }).join("")}</div>`;
}
function productsPage(data) {
  const storeId = encodeURIComponent(data.store?.store_id || ""), allProducts = list(data.products ?? data.draft?.products);
  const archived = allProducts.filter(p => p.status === "archived" || p.archived_at);
  const products = allProducts.filter(p => p.status !== "archived" && !p.archived_at);
  return `${pageHeading("Catalogue", "Products.", "Keep titles, pricing, tax and stock current.", buttonLink(`/stores/${storeId}/products/new`, "Add product"))}${actionError(data)}
    ${products.length ? productRows(products, storeId) : empty("Your catalogue is open.", "Add a product when you are ready. Nothing is shown here until a product is saved.", buttonLink(`/stores/${storeId}/products/new`, "Add your first product"))}
    ${archived.length ? `<section class="lb-archived-products"><div class="lb-section-title"><h2>Archived products</h2><span>${archived.length} retained</span></div>${productRows(archived, storeId, true)}</section>` : ""}`;
}
function productEditor(data, isNew) {
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const paramsId = data.product?.id || data.id || data.product_id || "";
  const products = list(data.draft?.products || data.products);
  const product = obj(data.product || products.find(p => String(p.id) === String(paramsId)));
  const id = isNew ? "" : String(product.id || paramsId);
  const isArchived = product.status === "archived" || Boolean(product.archived_at);
  const errors = product.title || product.id ? validateProduct(product) : {};
  const rates = [...new Set([...CURRENT_GST_RATES, ...(CURRENT_GST_RATES.includes(Number(product.gst_rate)) || product.gst_rate == null ? [] : [Number(product.gst_rate)])])].sort((a,b)=>a-b);
  const legacy = product.gst_rate != null && !CURRENT_GST_RATES.includes(Number(product.gst_rate));
  const imageList = list(product.images);
  const formFields = `<form class="lb-product-form" data-product-form data-new="${isNew}" data-product-id="${esc(id)}" data-expected-stock="${product.stock == null ? "null" : esc(product.stock)}" data-product-status="${isArchived ? "archived" : ""}">
    ${isArchived ? `<div class="lb-archived-notice" role="status"><strong>Archived product</strong><span>This record is retained for order history. Saving keeps it archived; no restore action is available.</span></div>` : ""}
    <div class="lb-form-columns"><div class="lb-form-main">
      <label class="lb-field">Product title<input name="title" required maxlength="80" value="${esc(product.title || "")}" placeholder="For example, Everyday tote"></label>
      <label class="lb-field">Description<textarea name="description" rows="6" maxlength="2000" placeholder="What should a customer know about this product?">${esc(product.description || "")}</textarea><small>30 to 2,000 characters.</small></label>
      <section class="lb-image-editor"><div class="lb-image-top"><div><h2>Product images</h2><p>Upload up to 8 JPG, PNG or WebP images.</p></div><label class="lb-button lb-button-outline lb-file-label">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" data-image-upload multiple></label></div>
        <div class="lb-image-grid" data-images>${imageList.map((img, i) => { const imageUrl = safeHttps(img.url); return `<figure class="lb-image-card" data-image-id="${esc(img.id)}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(img.alt || "")}">` : `<div class="lb-image-missing">Image unavailable</div>`}<figcaption><label>Alt text<input value="${esc(img.alt || "")}" maxlength="200" data-image-alt></label><button type="button" class="lb-text-button" data-image-remove>Remove</button></figcaption></figure>`; }).join("")}</div>
      </section>
      <label class="lb-field">Tags<input name="tags" value="${esc(list(product.tags).join(", "))}" placeholder="Comma-separated tags"></label>
    </div><aside class="lb-form-side">
      <section class="lb-side-box"><h2>Pricing</h2><label class="lb-field">Price (₹)<input name="price" inputmode="decimal" required value="${product.price_paise == null ? "" : esc((Number(product.price_paise)/100).toFixed(2))}" placeholder="1290.00"></label><label class="lb-field">Compare-at price (₹)<input name="compare_at" inputmode="decimal" value="${product.compare_at_paise == null ? "" : esc((Number(product.compare_at_paise)/100).toFixed(2))}" placeholder="Optional"></label></section>
      <section class="lb-side-box"><h2>Inventory & tax</h2><label class="lb-field">SKU<input name="sku" maxlength="80" value="${esc(product.sku || "")}"></label><label class="lb-field">Stock quantity<input name="stock" type="number" min="0" step="1" value="${product.stock == null ? "" : esc(product.stock)}" placeholder="Leave blank for always in stock"></label><label class="lb-field">HSN code<input name="hsn_code" maxlength="8" value="${esc(product.hsn_code || "")}" placeholder="4, 6 or 8 digits"></label><label class="lb-field">GST rate<select name="gst_rate">${rates.map(rate => `<option value="${rate}" ${Number(product.gst_rate) === rate ? "selected" : ""}>${rate}%${CURRENT_GST_RATES.includes(rate) ? "" : " · legacy rate"}</option>`).join("")}</select></label>${legacy ? `<p class="lb-legacy-notice">This product uses a legacy ${esc(product.gst_rate)}% GST rate. Confirm the correct slab before updating.</p>` : ""}</section>
       ${!isNew && !isArchived ? `<section class="lb-side-box"><h2>Stock adjustment</h2><label class="lb-field">Quantity change<input type="number" step="1" name="stock_delta" value="1"></label><label class="lb-field">Reason<input name="stock_reason" maxlength="200" placeholder="Stock count correction"></label><button type="button" class="lb-button lb-button-outline lb-full" data-stock-adjust>Adjust stock</button></section>` : ""}
    </aside></div>
    <div class="lb-form-error" role="alert" data-form-error ${Object.keys(errors).length ? "" : "hidden"}>${Object.values(errors).map(esc).join(" ")}</div>
    <div class="lb-form-actions"><a class="lb-text-button" href="/stores/${storeId}/products">Cancel</a><button class="lb-button" type="submit">${isNew ? "Save product" : "Save changes"}</button>${!isNew && !isArchived ? `<button type="button" class="lb-button lb-button-danger" data-archive>Archive product</button>` : ""}</div>
  </form>`;
  const validationMessage = Object.keys(errors).length ? `<div class="lb-validation-summary"><strong>Before you save</strong><ul>${Object.values(errors).map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>` : "";
  return `${pageHeading("Catalogue", isNew ? "Add a product." : esc(product.title || "Edit product"), isNew ? "A considered product listing is easier to keep accurate later." : "Changes apply to your product listing and inventory.", buttonLink(`/stores/${storeId}/products`, "Back to products", "quiet"))}${actionError(data)}${validationMessage}${formFields}`;
}

function customerTable(rows, storeId) {
  return `<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>${rows.map(c => `<tr><td><a class="lb-row-link" href="/stores/${storeId}/customers/${encodeURIComponent(c.id)}">${esc(c.name || "Customer")}</a><small>${esc(c.email || "")}</small></td><td>${esc(c.phone || "Not recorded")}</td><td>${Number(c.orders_count || 0)}</td><td>${money(c.total_spent_paise)}</td><td>${esc(date(c.last_order_at))}</td></tr>`).join("")}</tbody></table></div>`;
}
function customersPage(data) {
  const rows = list(data.customers), storeId = encodeURIComponent(data.store?.store_id || ""), f = obj(data.filters);
  return `${pageHeading("People who buy from you", "Customers.", "The customer record belongs to your store. Search it when you need it.", exportControl(data.role, "customers", "Export CSV"))}${actionError(data)}
    <form class="lb-filter-bar lb-customer-search" method="get" action="/stores/${storeId}/customers" data-filter-form><label class="lb-search"><span>Find a customer</span><input type="search" name="search" value="${esc(f.search || "")}" placeholder="Name, phone or email"></label><button class="lb-button lb-button-small" type="submit">Search</button></form>
    ${rows.length ? customerTable(rows, storeId) : empty("No customers to show.", f.search ? "No customer matched that search. Try another name or number." : "Customer records appear after their first order.")}`;
}
function customerDetail(data) {
  const c = obj(data.customer || data.detail), storeId = encodeURIComponent(data.store?.store_id || "");
  const orders = list(c.orders), addresses = list(c.addresses);
  const addressCards = addresses.length ? addresses.map(a => addressBlock(a, a.recipient_name || "Saved address")).join("") : `<div class="lb-inline-empty">No saved addresses.</div>`;
  const rows = orders.length ? orderTable(orders, storeId) : empty("No orders yet.", "Orders placed by this customer will appear here.");
  return `${pageHeading("Customer record", esc(c.name || "Customer"), c.phone || "Customer contact details", buttonLink(`/stores/${storeId}/customers`, "Back to customers", "quiet"))}${actionError(data)}
    <div class="lb-customer-metrics"><div><small>Orders</small><strong>${Number(c.orders_count || 0)}</strong></div><div><small>Total spent</small><strong>${money(c.total_spent_paise)}</strong></div><div><small>Last order</small><strong>${esc(date(c.last_order_at))}</strong></div></div>
    <div class="lb-detail-grid"><div class="lb-detail-primary">${card("Order history", rows)}</div><aside>${card("Contact", `<a href="tel:${esc(c.phone || "")}">${esc(c.phone || "Phone unavailable")}</a>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}`)}${card("Addresses", `<div class="lb-address-stack">${addressCards}</div>`)}</aside></div>`;
}
function invoiceStatus(status) {
  return ({ issued: "Issued", cancelled: "Cancelled", canceled: "Cancelled", draft: "Draft" })[String(status || "").toLowerCase()] || String(status || "Not recorded").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function invoiceType(type) {
  return ({ tax_invoice: "Tax invoice", receipt: "Bill of Supply / Order receipt", bill_of_supply: "Bill of Supply / Order receipt", credit_note: "Credit note" })[String(type || "").toLowerCase()] || String(type || "Tax invoice").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function invoicesPage(data) {
  const rows = list(data.invoices), storeId = encodeURIComponent(data.store?.store_id || "");
  const table = `<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Document</th><th>Issued</th><th>Order</th><th>Type</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(i => {
    const cancelled = ["cancelled", "canceled"].includes(String(i.status || "").toLowerCase());
    const documentNo = i.invoice_number || "Order document";
    return `<tr><td><a class="lb-row-link" href="/stores/${storeId}/invoices/${encodeURIComponent(i.id)}">${esc(documentNo)}</a>${cancelled && i.credit_note_number ? `<small>Credit note ${esc(i.credit_note_number)}</small>` : `<small>FY ${esc(i.financial_year || "Not recorded")}</small>`}</td><td>${esc(date(i.issued_at))}</td><td>${esc(i.order_number || "Not recorded")}</td><td>${esc(invoiceType(i.document_type))}</td><td>${money(i.total_paise)}</td><td><span class="lb-status lb-invoice-status" data-status="${esc(i.status || "issued")}">${esc(invoiceStatus(i.status))}</span></td></tr>`;
  }).join("")}</tbody></table></div>`;
  return `${pageHeading("Financial records", "Invoices.", "Issued order documents and cancellation records in one place.", exportControl(data.role, "orders", "Export orders"))}${actionError(data)}
    ${rows.length ? table : empty("No invoices issued yet.", "Invoices or order receipts appear when your first qualifying order is shipped.")}`;
}
function settingsPage(data) {
  const store = obj(data.store), id = encodeURIComponent(store.store_id || "");
  const draft = obj(data.draft), settings = obj(draft.settings);
  const checkoutSettings = obj(data.checkoutSettings);
  const policies = list(draft.policies);
  const policyNames = { privacy: "Privacy policy", terms: "Terms & conditions", shipping: "Shipping policy", "cancellation-refund": "Cancellation & refunds", contact: "Contact", pricing: "Pricing" };
  const checks = [
    ["Brand details and storefront", "Edit name, address, theme and setup progress.", `/stores/${id}/setup`, "Continue setup"],
    ["Checkout and delivery", "Cash on Delivery, delivery charges and GST location.", `/stores/${id}/settings/checkout`, "Checkout settings"],
  ];
  const checklist = `<div class="lb-settings-links">${checks.map(([title, desc, href, action]) => `<a href="${href}" class="lb-setting-link"><span class="lb-setting-icon">${title === "Brand details and storefront" ? "01" : "02"}</span><span><strong>${esc(title)}</strong><small>${esc(desc)}</small></span><span class="lb-setting-action">${esc(action)} ↗</span></a>`).join("")}</div>`;
  const policyMarkup = `<div class="lb-policy-list">${policyNames ? Object.entries(policyNames).map(([key,label]) => {
    const p = policies.find(item => item.kind === key);
    return `<div><span><strong>${esc(label)}</strong><small>${p ? (p.reviewed ? "Reviewed" : "Draft ready") : "Not drafted"}</small></span><a href="/stores/${id}/setup">Review in setup ↗</a></div>`;
  }).join("") : ""}</div>`;
  const ownerActions = data.role === "owner" ? `<div class="lb-settings-danger"><div><h3>Stop accepting orders</h3><p>Unpublishing makes your public store unavailable to customers until you publish it again.</p></div><button type="button" class="lb-button lb-button-danger" data-unpublish>Unpublish store</button></div>` : `<p class="lb-muted">Only the store owner can unpublish the store.</p>`;
  const exports = data.role === "owner"
    ? `<div class="lb-export-buttons"><button type="button" data-export="customers">Customers CSV</button><button type="button" data-export="orders">Orders CSV</button><button type="button" data-export="products">Products CSV</button></div><small>Exports are available to the store owner.</small>`
    : `<p class="lb-muted">Exports are available to the store owner.</p>`;
  const taxErrors = registeredSupplierErrors(settings);
  const taxError = name => `<span id="tax-error-${name}" data-tax-error="${name}" class="field-error" role="alert">${esc(taxErrors[name] || "")}</span>`;
  const taxForm = `<form data-tax-settings-form novalidate><fieldset ${["owner","admin"].includes(data.role) ? "" : "disabled"}>
    <label class="lb-field">Legal business name<input name="legal_name" maxlength="120" value="${esc(settings.legal_name || "")}">${taxError("legal_name")}</label>
    ${[["business_line1","Registered address line 1",150],["business_line2","Address line 2 (optional)",150],["business_city","Registered address city",80],["business_pincode","Registered address PIN",6]].map(([name,label,max])=>`<label class="lb-field">${label}<input name="${name}" maxlength="${max}" value="${esc(settings[name] || "")}" aria-describedby="tax-error-${name}">${taxError(name)}</label>`).join("")}
    <label class="lb-field">Invoice prefix<input name="invoice_prefix" maxlength="4" value="${esc(settings.invoice_prefix || defaultInvoicePrefix(store.name))}" ${draft.invoice_prefix_locked ? "readonly" : ""}>${taxError("invoice_prefix")}<small>${draft.invoice_prefix_locked ? "Locked until the next financial year (1 April)." : "1 to 4 uppercase letters or digits. Locked after issuance this financial year."}</small></label>
    <label class="lb-field">Registered business state<select name="business_state" aria-describedby="tax-error-business_state" aria-invalid="${!!taxErrors.business_state}"><option value="">Choose the registered address state</option>${INDIAN_STATES.map(s=>`<option value="${s.code}" ${registeredBusinessState(settings)===s.code?"selected":""}>${esc(s.name)}</option>`).join("")}</select>${taxError("business_state")}</label>
    <label class="lb-field">GSTIN (required to publish)<input name="gstin" maxlength="15" autocapitalize="characters" spellcheck="false" aria-describedby="tax-error-gstin" aria-invalid="${!!taxErrors.gstin}" value="${esc(settings.gstin || "")}">${taxError("gstin")}</label>
    <label class="lb-field">Signature image (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-signature-upload><small>PNG, JPEG, WebP or safe SVG, up to 5 MB. Uses the same tenant-scoped R2 upload rules as a logo.</small></label>
    <div data-signature-preview>${settings.signature_url ? `<img src="${esc(settings.signature_url)}" alt="Authorised signature" style="max-width:180px;max-height:80px">` : ""}</div><button type="button" class="lb-text-button" data-signature-remove ${settings.signature_media_id ? "" : "hidden"}>Remove signature</button>
    <p class="lb-muted">Registered details are checked and frozen when an invoice is issued. Storefront changes remain drafts until policies are reviewed and changes published.</p>
    <p data-tax-form-error role="alert"></p><button class="lb-button" type="submit">Save business details</button>
    </fieldset></form>`;
  return `${pageHeading("Store controls", "Settings.", "The details behind your storefront and checkout.", "")}${actionError(data)}
    <div class="lb-settings-layout"><div>${card("Registered business & GST",taxForm)}${card("Store setup", checklist)}${card("Policies", policyMarkup)}</div><aside>${card("Store identity", `<dl class="lb-definition"><div><dt>Store name</dt><dd>${esc(store.name || settings.brand_name || "Not set")}</dd></div><div><dt>Address</dt><dd>${store.subdomain ? `${esc(store.subdomain)}.lebrands.store` : "Not set"}</dd></div><div><dt>Status</dt><dd>${esc(store.status || "Setup in progress")}</dd></div><div><dt>Registered business state</dt><dd>${esc(registeredBusinessState(settings) ? stateName(registeredBusinessState(settings)) : "Not set")}</dd></div></dl>`)}${card("Exports", `<p>Download a copy of your store records as CSV.</p>${exports}`)}${card("Store availability", ownerActions)}</aside></div>`;
}

function normalizeView(view) {
  const v = String(view || "overview").toLowerCase();
  if (["dashboard", "store", "home", "overview"].includes(v)) return "overview";
  if (["order-detail", "order"].includes(v)) return "order";
  if (["new-product", "new_product", "product-new", "products-new"].includes(v)) return "product-new";
  if (["edit-product", "product-edit", "product-editor", "product-detail", "product"].includes(v)) return "product";
  if (["customer-detail", "customer"].includes(v)) return "customer";
  if (["orders", "products", "customers", "invoices", "settings"].includes(v)) return v;
  return "overview";
}

export function renderDashboard(view, data = {}, user = {}) {
  data = obj(data);
  const current = normalizeView(view);
  let body;
  if (data.loading === true) {
    body = `${pageHeading("Loading workspace", "Your store, in view.", "Preparing the latest store records.")}<div class="lb-skeleton" aria-label="Loading store dashboard"><i></i><i></i><i></i><i></i></div>`;
    return documentPage(current, data, user, body);
  }
  switch (current) {
    case "orders": body = ordersPage(data); break;
    case "order": body = orderDetail(data); break;
    case "products": body = productsPage(data); break;
    case "product-new": body = productEditor(data, true); break;
    case "product": body = productEditor(data, false); break;
    case "customers": body = customersPage(data); break;
    case "customer": body = customerDetail(data); break;
    case "invoices": body = invoicesPage(data); break;
    case "settings": body = settingsPage(data); break;
    default: body = overview(data);
  }
  return documentPage(current, data, user, body.replace(/>\+91(\d{5})(\d{5})</g,">+91 $1 $2<"));
}
