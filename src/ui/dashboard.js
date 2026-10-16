import { escapeHtml, layout } from "./layout.js";
import { LE_BRANDS_LOGO, LE_BRANDS_MARK } from "./brand.js";
import { validateProduct } from "../public/validation.js";
import { CURRENT_GST_RATES, INDIAN_STATES, registeredBusinessState, registeredSupplierErrors, defaultInvoicePrefix, formatPhone } from "../public/commerce-rules.js";
import { statusLabel, stateName, indianDate, allowedTransitions, timelineSentence, accountIdentity } from "../public/dashboard-rules.js";
import { paymentState, fulfilmentState } from "../public/dashboard-view-model.js";
import { dashboardIcon } from "./dashboard-icons.js";
import { richToText } from "../public/content-form.js";

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

export function documentPage(view, data, user, body) {
  const store = obj(data.store);
  const storeId = String(store.store_id || "");
  const gst=data.draft?.gstinVerification;
  if(gst&&(gst.state!=="verified"||!gst.confirmed||!gst.verified_at||Date.now()-new Date(gst.verified_at).getTime()>30*86400000)){
    body=`<aside class="lb-card" role="alert"><strong>GSTIN needs attention</strong><p>Check your registration and registered supplier details before publishing or issuing new invoices.</p><a href="/stores/${esc(storeId)}/settings">Open Settings</a></aside>${body}`;
  }
  const title = ({
    overview: "Home", orders: "Orders", order: "Order details", products: "Products",
    "product-new": "Add product", product: "Edit product", collections: "Collections", "collection-new": "Add collection", collection: "Edit collection", customers: "Customers",
    customer: "Customer details", invoices: "Invoices", settings: "Settings", "ai-builder":"Legacy build", builder:"Build your store",
  })[view] || "Overview";
  return layout({
    title: `${title} | ${store.name || "Your store"} | LeBrands.Store`,
    description: `${title} workspace for ${store.name || "your store"}.`,
    canonical: `https://app.lebrands.store/stores/${encodeURIComponent(storeId)}/${view === "overview" ? "" : view === "builder" ? "build" : view}`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/dashboard.css"><script type="module" src="/assets/dashboard.js"></script>',
    body: `<div class="lb-app" data-store-id="${esc(storeId)}" data-role="${esc(data.role || "editor")}">
      ${header(data, user, view)}
       <main class="lb-main"><div class="lb-content">${store.approval_revoked_at ? `<p role="alert">Store approval was revoked. Your storefront is offline; your data is unchanged. ${esc(store.approval_revocation_note || "")}${store.status === "awaiting_approval" ? " Your renewed approval request is awaiting review." : ""}</p>` : store.status === "awaiting_approval" ? '<p role="status">Awaiting approval. Your storefront is offline until a LeBrands reviewer approves it.</p>' : ""}${body}</div></main></div></div>
      <div class="lb-toast" role="status" aria-live="polite" data-toast hidden></div>
      <script type="application/json" id="dashboard-data">${safeJson({ store, role: data.role, draft: data.draft, aura_skeleton_enabled: data.aura_skeleton_enabled === true, collection_id: data.collection_id || "", filters: data.filters, checkoutSettings: data.checkoutSettings })}</script>
    </div>`,
  });
}

function header(data, user, view) {
  const identity = accountIdentity(user);
  // Inline navigation icons use Lucide path data. Lucide is ISC licensed, copyright Lucide Contributors.
  const store = obj(data.store);
  const id = encodeURIComponent(store.store_id || "");
  const root = `/stores/${id}`;
  const items = [
    ["overview", "Home", root, "home"],
    ["orders", "Orders", `${root}/orders`, "orders"],
    ["products", "Products", `${root}/products`, "products"],
    ["customers", "Customers", `${root}/customers`, "customers"],
    ["invoices", "Invoices", `${root}/invoices`, "invoices"],
    ...(data.aura_skeleton_enabled === true ? [["collections", "Collections", `${root}/collections`, "products"]] : []),
  ];
  const active = view.startsWith("collection") ? "collections" : view === "order" ? "orders" : view.startsWith("product") || view === "product" ? "products" : view === "customer" ? "customers" : view;
  const storeUrl = store.subdomain ? `https://${encodeURIComponent(store.subdomain)}.lebrands.store/` : "#";
  return `<div class="lb-shell">
    <button type="button" class="lb-drawer-shade" data-drawer-close aria-label="Close navigation"></button>
    <aside class="lb-sidebar" data-sidebar>
      <div class="lb-sidebar-top"><a class="lb-wordmark" href="${root}" aria-label="LeBrands home"><span class="lb-mark">${LE_BRANDS_MARK}</span><span class="lb-logo">${LE_BRANDS_LOGO}</span></a><button type="button" class="lb-icon-button lb-sidebar-collapse" data-sidebar-collapse aria-label="Collapse sidebar" title="Collapse sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button></div>
      <div class="lb-store-switch"><span class="lb-store-avatar">${esc(String(store.name || "S").trim().slice(0,1).toUpperCase())}</span><span class="lb-store-switch-copy"><strong>${esc(store.name || "Your store")}</strong><small>Store workspace</small></span><a href="${esc(storeUrl)}" class="lb-view-store" ${store.subdomain ? 'target="_blank" rel="noopener"' : 'aria-disabled="true"'} aria-label="View store" title="View store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a></div>
      <nav class="lb-nav" data-nav aria-label="Store navigation"><span class="lb-nav-caption">Workspace</span>
        ${items.map(([key,label,href,icon]) => `<a href="${href}" class="lb-nav-link" ${key === active ? 'aria-current="page"' : ""} title="${esc(label)}">${dashboardIcon(icon)}<span>${esc(label)}</span>${key === "orders" ? `<b class="lb-count" data-open-order-count hidden title="Loading open orders"></b>` : ""}</a>`).join("")}
        <span class="lb-nav-caption lb-nav-caption-spaced">Manage</span>
        <span class="lb-nav-link is-disabled" aria-disabled="true" title="Analytics not enabled"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/></svg><span>Analytics</span><small>Not enabled</small></span>
        <a href="${root}/setup" class="lb-nav-link" title="Online store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-1.5-6h-15L3 9Zm2 0v12h14V9M9 21v-7h6v7"/></svg><span>Online store</span></a>
        <div class="lb-online-links"><a href="${root}/editor">Theme and store editor</a><a href="${root}/build">Build your store</a><a href="${root}/team">Team and order emails</a><a href="${root}/setup">Standard Builder</a><a href="${root}/settings#policies">Pages and policies</a>${store.subdomain ? `<a href="${esc(storeUrl)}" target="_blank" rel="noopener">Preview store</a>` : '<span>Preview unavailable</span>'}</div>
      </nav>
      <div class="lb-sidebar-bottom"><a href="${root}/settings" class="lb-nav-link ${active === "settings" ? "is-current" : ""}" ${active === "settings" ? 'aria-current="page"' : ""} title="Settings">${dashboardIcon("settings")}<span>Settings</span></a></div>
    </aside>
    <div class="lb-workspace">
      <header class="lb-header">
        <button type="button" class="lb-icon-button lb-menu-toggle" data-menu-toggle aria-label="Open navigation" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <form class="lb-global-search" role="search" data-global-search><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" role="combobox" aria-label="Search orders, products and customers" aria-controls="global-search-results" aria-expanded="false" aria-autocomplete="list" placeholder="Search orders, products, customers…" autocomplete="off" data-search-input><kbd>⌘ K</kbd><div id="global-search-results" class="lb-search-results" data-search-results role="region" aria-label="Search results" hidden></div></form>
        <div class="lb-header-right"><button type="button" class="lb-icon-button" data-help-button aria-label="Help" title="Help"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01"/></svg></button><details class="lb-account-menu" data-account-menu><summary class="lb-account"><span class="lb-account-avatar" aria-hidden="true">${esc(identity.initial)}</span><span class="lb-user">${esc(identity.name)}</span></summary><div class="lb-account-panel"><strong>${esc(identity.name)}</strong><form method="post" action="/logout"><button type="submit" class="lb-logout">Log out</button></form></div></details></div>
      </header>
      <div class="lb-help-popover" data-help-popover hidden><strong>LeBrands support</strong><span>For workspace help, contact your store administrator.</span></div>`;
}

function pageHeading(kicker, title, intro, actions = "") {
  return `<div class="lb-page-heading"><div><h1>${title}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}</div>${actions ? `<div class="lb-heading-actions">${actions}</div>` : ""}</div>`;
}
function buttonLink(href, label, kind = "primary") { return `<a class="lb-button ${kind === "quiet" ? "lb-button-quiet" : ""}" href="${href}">${esc(label)}</a>`; }
function exportControl(role, kind, label) { return role === "owner" ? `<button type="button" class="lb-button lb-button-outline" data-export="${esc(kind)}">${esc(label)}</button>` : `<span class="lb-export-restricted">Exports: owner only</span>`; }
function empty(title, copy, action = "") { return `<section class="lb-empty"><span class="lb-empty-mark" aria-hidden="true"></span><h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</section>`; }
function card(title, body, klass = "") { return `<section class="lb-card ${klass}"><div class="lb-card-heading"><h2>${esc(title)}</h2></div>${body}</section>`; }
function statusPill(status, method = "") { return `<span class="lb-status" data-status="${esc(status || "unknown")}">${esc(status==="unfulfilled"?"Unfulfilled":statusText(status, method))}</span>`; }
function paymentPill(order) {
  const state=paymentState(order);
  const label={paid:"Paid",cod:"COD",unpaid:"Unpaid",pending_payment:"Pending",failed:"Failed",unknown:"Not recorded"}[state];
  return `<span class="lb-status ${state==="cod"?"lb-status-cod":""}" data-status="${state}">${label}</span>`;
}
function actionError(data) { return data.error ? `<div class="lb-server-error" role="alert"><span>${esc(data.error)}</span><button type="button" data-retry>Try again</button></div>` : ""; }

function overview(data) {
  const o = obj(data.overview);
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const top = list(o.top_products), sources = list(o.sources), needs = list(o.needing_action);
  const catalogProducts = list(data.draft?.products || data.products);
  const period = Number(data.filters?.period) === 7 ? 7 : 30;
  const checks = [
    ["Products", catalogProducts.length ? "Catalogue is ready" : "Add your first product", catalogProducts.length ? "Done" : "Add product", catalogProducts.length > 0],
    ["Payments", "Review COD and optional provider setup in Ann", "Store connections", false],
    ["Shipping", "Review manual delivery and optional provider setup in Ann", "Store connections", false],
    ["Domain", "Keep your included address or set up a custom domain in Ann", "Store connections", false],
    ["Policies", "Review store policies in setup", "Review policies", false],
  ];
  const setupDone = checks.filter(item => item[3]).length;
  const setup = `<div class="lb-setup-progress"><span>${setupDone} of ${checks.length} steps complete</span><div role="progressbar" aria-label="Store setup progress" aria-valuemin="0" aria-valuemax="${checks.length}" aria-valuenow="${setupDone}"><i style="width:${setupDone / checks.length * 100}%"></i></div></div><div class="lb-checklist">${checks.map(([label, text, action, done]) => `<div class="lb-check-row"><span class="lb-check-dot ${done ? "" : "is-pending"}" aria-hidden="true"></span><div><strong>${esc(label)}</strong><small>${esc(text)}</small></div>${action === "Add product" ? `<a href="/stores/${storeId}/products/new">${action}</a>` : action === "Review policies" ? `<a href="/stores/${storeId}/setup">${action}</a>` : action === "Store connections" ? `<a href="/stores/${storeId}/build/ann?launch=1">Open</a>` : `<span class="lb-coming" ${action === "Not configured" ? 'aria-disabled="true"' : ""}>${esc(action)}</span>`}</div>`).join("")}</div>`;
  const soldTop = top.filter(p => Number(p.quantity || 0) > 0);
  const sourced = sources.filter(s => Number(s.orders || 0) > 0);
  const rankRows = soldTop.length ? soldTop.slice(0, 5).map((p, i) => `<div class="lb-rank-row"><span class="lb-rank">${String(i + 1).padStart(2, "0")}</span><strong>${esc(p.title || "Untitled product")}</strong><span>${Number(p.quantity || 0)} sold</span><b>${money(p.revenue_paise)}</b></div>`).join("") : `<div class="lb-inline-empty">${top.length ? "No product sales in this period." : catalogProducts.length ? "Product sales will appear after orders are placed." : `Add a product before sales can be ranked. <a href="/stores/${storeId}/products/new">Add a product</a>.`}</div>`;
  const sourceRows = sourced.length ? sourced.map(s => `<div class="lb-source-row"><span>${esc(s.source === "mall" ? "Mall" : s.source === "direct" ? "Direct" : "Other")}</span><strong>${Number(s.orders || 0)} ${Number(s.orders || 0) === 1 ? "order" : "orders"}</strong></div>`).join("") : `<div class="lb-inline-empty">${sources.length ? "No attributed orders in this period." : "Source attribution will appear with recorded orders."}</div>`;
  const actionRows = needs.length ? needs.slice(0, 5).map(order => {
    const paymentDue=order.status==="delivered"&&order.payment_method==="cod";
    return `<a class="lb-action-row" href="/stores/${storeId}/orders/${encodeURIComponent(order.id || "")}"><span class="lb-action-mark"></span><span><strong>${esc(order.order_number || "Order")}</strong><small>${paymentDue?"Payment to collect":"Order to fulfil"} · ${esc(order.customer_name || "Customer")} · ${date(order.created_at)}</small></span>${statusPill(order.status, order.payment_method)}</a>`;
  }).join("") : `<div class="lb-clear-state"><strong>Nothing needs attention</strong><p>Orders awaiting your next step will be listed here.</p></div>`;
  const periodControl = `<div class="lb-period-switch" data-home-range><label><span>Date range</span><select data-chart-range aria-label="Date range"><option value="today">Today</option><option value="7" ${period === 7 ? "selected" : ""}>Last 7 days</option><option value="30" ${period === 30 ? "selected" : ""}>Last 30 days</option><option value="custom">Custom range</option></select></label><label data-custom-date hidden><span>From</span><input type="date" data-chart-from></label><label data-custom-date hidden><span>To</span><input type="date" data-chart-to></label><button type="button" class="lb-button lb-button-small lb-button-outline" data-chart-apply hidden>Apply</button></div>`;
  const metrics = [
     ["Total sales", money(o.revenue_paise), `Last ${period} days`],
    ["Orders", Number(o.orders || 0).toLocaleString("en-IN"), `Last ${period} days`],
    ["Average order value", Number(o.orders || 0) ? money(o.aov_paise) : "–", "Based on recorded orders"],
    ["Online store sessions", `<span title="Session analytics are not available yet">–</span>`, "Session data unavailable"],
  ];
  return `${pageHeading("", "Home", "", buttonLink(`/stores/${storeId}/orders`, "View orders"))}
    ${actionError(data)}
    <section class="lb-card lb-setup-card"><div class="lb-card-heading lb-card-heading-toggle"><span><h2>Set up your store</h2><small>${setupDone} of ${checks.length} complete</small></span><button type="button" data-setup-toggle aria-expanded="true">Collapse</button></div><div data-setup-content>${setup}</div></section>
    <div class="lb-home-toolbar">${periodControl}<small class="lb-data-note" data-summary-scope>Last ${period} days. Sales exclude cancelled, refunded and returned orders.</small></div>
    <div class="lb-metric-grid">${metrics.map(([label, value, note], i) => `<article class="lb-metric"><div class="lb-metric-label">${esc(label)}</div><strong data-home-metric="${i}">${value}</strong><small data-home-metric-note="${i}">${esc(note)}</small></article>`).join("")}</div>
    <section class="lb-card lb-chart-card"><div class="lb-card-heading"><div><h2>Sales over time</h2><small data-chart-caption>Loading sales…</small></div></div><div class="lb-chart" data-sales-chart aria-label="Sales over time chart"><div class="lb-chart-skeleton" aria-hidden="true"></div></div><div class="lb-chart-table" data-chart-table></div><p class="lb-chart-scope" data-chart-scope>Sales exclude cancelled, returned and refunded orders.</p></section>
    <h2 class="lb-section-heading">Things to do</h2>
    <div class="lb-overview-grid"><div class="lb-overview-main">
      <div class="lb-split">${card("Top products", `<div class="lb-rank-list">${rankRows}</div>`)}${card("Orders by source", `<div class="lb-source-list">${sourceRows}</div>`)}</div>
    </div><aside>${card("Orders and payments", `<div class="lb-action-list" data-today-tasks>${actionRows}</div><div class="lb-today-invoices" data-today-invoices><p>Invoices issued today</p><span>Loading invoice records</span></div>`, "lb-attention-card")}</aside></div>`;
}

function orderTable(rows, storeId, selectable = false) {
  return `<div class="lb-table-wrap"><table class="lb-table lb-order-table"><thead><tr>${selectable ? '<th><span class="lb-sr-only">Select</span><input type="checkbox" aria-label="Select all orders" data-select-all></th>' : ""}<th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment status</th><th>Fulfilment</th><th>Items</th><th>Delivery method</th></tr></thead><tbody>${rows.map(order => `<tr ${selectable ? `data-order-row data-order-id="${esc(order.id || "")}" data-order-status="${esc(order.status || "")}" data-payment-status="${paymentState(order)}" tabindex="0" data-href="/stores/${storeId}/orders/${encodeURIComponent(order.id || "")}"` : ""}>
    ${selectable ? `<td><input type="checkbox" aria-label="Select ${esc(order.order_number || "order")}" data-order-checkbox></td>` : ""}<td><a class="lb-row-link" href="/stores/${storeId}/orders/${encodeURIComponent(order.id || "")}">${esc(order.order_number || "Order")}</a></td>
    <td>${esc(date(order.created_at))}</td><td><strong>${esc(order.customer_name || "Customer")}</strong><small>${esc(formatPhone(order.phone) || "Phone unavailable")}</small></td>
    <td>${money(order.total_paise)}</td><td>${paymentPill(order)}</td><td>${statusPill(fulfilmentState(order.status))}</td><td>${order.item_count != null || order.items_count != null ? Number(order.item_count ?? order.items_count) : "Not loaded"}</td><td>${esc(order.delivery_method || "Not recorded")}</td></tr>`).join("")}</tbody></table></div>`;
}
function ordersPage(data) {
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const rows = list(data.orders);
  const f = obj(data.filters);
  const statuses = ["", "confirmed_cod", "pending_payment", "paid", "packed", "shipped", "delivered", "cancelled", "returned", "rto"];
  const tabs = [["all","All",""],["unfulfilled","Unfulfilled",""],["unpaid","Unpaid",""],["open","Open",""],["cancelled","Cancelled","cancelled"]];
  return `${pageHeading("", "Orders", "", exportControl(data.role, "orders", "Export CSV"))}
    <div class="lb-order-tabs" role="tablist" aria-label="Order filters">${tabs.map(([key,label,status])=>`<button type="button" data-order-tab="${key}" role="tab" aria-selected="${key==="all"?"true":"false"}">${label}</button>`).join("")}</div>
    ${actionError(data)}<form class="lb-filter-bar" method="get" action="/stores/${storeId}/orders" data-filter-form>
    <label class="lb-search"><span>Search</span><input type="search" name="search" value="${esc(f.search || "")}" placeholder="Order number, name or phone"></label>
    <label><span>Status</span><select name="status">${statuses.map(s => `<option value="${esc(s)}" ${String(f.status || "") === s ? "selected" : ""}>${s ? esc(statusText(s)) : "All statuses"}</option>`).join("")}</select></label>
    <label><span>From</span><input type="date" name="from" value="${esc(f.from || "")}"></label><label><span>To</span><input type="date" name="to" value="${esc(f.to || "")}"></label>
    <button class="lb-button lb-button-small" type="submit">Apply</button><a class="lb-reset" href="/stores/${storeId}/orders">Reset</a></form>
    ${rows.length ? `<div data-order-results>${orderTable(rows, storeId, true)}</div><p class="lb-list-scope" data-orders-count>Showing ${rows.length.toLocaleString("en-IN")} loaded orders. Lists are capped at 500 records.</p>` : empty("No matching orders.", f.search || f.status || f.from || f.to ? "Try widening your filters. Your order records remain unchanged." : "New customer orders will appear here as they come in.")}`;
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
  const items = list(o.items), shipments = list(o.shipments), timeline = [...list(o.timeline),
    ...list(o.email_history).map(email=>({email:true,title:`Email: ${email.template}`,description:`${email.recipient} · ${email.status} · ${email.attempts} attempts${email.error_code?` · ${email.error_code}`:""}`,created_at:email.sent_at||email.created_at}))];
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
    const action = t.email?`${t.title} · ${t.description}`:timelineSentence(t);
    const actor = t.email ? "Email delivery" : t.actor_name || (t.actor_type === "system" ? "Customer checkout" : "Team member");
    return `<li><span class="lb-timeline-dot"></span><div><strong>${esc(action)}</strong><small>${esc(actor)} · ${esc(date(t.created_at))}</small></div></li>`;
  }).join("") : `<li class="lb-muted">No timeline events recorded.</li>`;
  const timelineMarkup = `<ol class="lb-timeline">${events}</ol>`;
  return `${pageHeading("", esc(o.order_number || "Order details"), `Placed ${date(o.created_at)}`, buttonLink(`/stores/${id}/orders`, "Back to orders", "quiet"))}
    ${actionError(data)}<div class="lb-detail-head">${statusPill(o.status, o.payment_method)}${payment}${statusActions}</div>
    <div class="lb-detail-grid"><div class="lb-detail-primary">${card("Items", `<div class="lb-table-wrap"><table class="lb-table lb-items"><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${itemRows}</tbody></table></div>`)}${card("Payment summary",tax)}
     ${card("Shipping", shipMarkup)}${card("Order timeline", timelineMarkup)}</div>
    <aside class="lb-detail-aside">${card("Customer", `<h3 class="lb-customer-name">${esc(o.customer_name || o.name || "Customer")}</h3><a href="tel:${esc(o.phone || "")}">${esc(o.phone || "Phone unavailable")}</a>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ""}`)}${card("Delivery details", address)}
     ${invoice.id ? card("Invoice", `<p>${esc(invoice.invoice_number || "Invoice")} · ${esc(invoiceStatus(invoice.status))}</p><a class="lb-inline-link" href="/stores/${id}/invoices/${encodeURIComponent(invoice.id)}">View and print invoice</a> <a class="lb-inline-link" href="/stores/${id}/invoices/${encodeURIComponent(invoice.id)}" download="${esc(invoice.invoice_number || "invoice").replaceAll("/","-")}.html">Download HTML</a>`) : card("Invoice",'<p class="lb-muted">No invoice issued yet.</p>')}
     ${card("Notes",o.notes || o.customer_note ? `<p class="lb-order-notes">${esc(o.notes || o.customer_note)}</p>` : '<p class="lb-muted">No notes recorded.</p>')}
    ${canEdit && transitions.length ? card("Update order",orderActionForm(id,uuid,transitions)) : ""}
  </aside></div>`;
}

function productRows(products, storeId, archived = false) {
  return `<div class="lb-table-wrap"><table class="lb-table lb-products-table"><thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th>GST</th><th></th></tr></thead><tbody>${products.map(p => { const imageUrl = safeHttps(p.images?.[0]?.url), href=`/stores/${storeId}/products/${encodeURIComponent(p.id)}`; return `<tr><td><div class="lb-product-cell">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(p.images[0].alt || p.title || "")}">` : `<span class="lb-product-thumb" aria-hidden="true"></span>`}<span><a class="lb-row-link" href="${href}">${esc(p.title || "Untitled product")}</a><small>${esc(p.sku || "No SKU")} · HSN ${esc(p.hsn_code || "Not recorded")}</small></span></div></td><td><span class="lb-status" data-status="${archived ? "cancelled" : esc(p.status || "active")}">${archived ? "Archived" : esc(p.status || "Active")}</span></td><td>${p.stock == null ? "Not tracked" : `${Number(p.stock).toLocaleString("en-IN")} in stock`}</td><td>${money(p.price_paise)}</td><td>${esc(p.gst_rate ?? "Not recorded")}%</td><td><a class="lb-edit-link" href="${href}">${archived ? "View" : "Edit"}</a></td></tr>`; }).join("")}</tbody></table></div>`;
}
function productsPage(data) {
  const storeId = encodeURIComponent(data.store?.store_id || ""), allProducts = list(data.products ?? data.draft?.products);
  const archived = allProducts.filter(p => p.status === "archived" || p.archived_at);
  const products = allProducts.filter(p => p.status !== "archived" && !p.archived_at);
  return `${pageHeading("", "Products", "", buttonLink(`/stores/${storeId}/products/new`, "Add product"))}${actionError(data)}
    ${products.length ? productRows(products, storeId) : empty("Your catalogue is open.", "Add a product when you are ready. Nothing is shown here until a product is saved.", buttonLink(`/stores/${storeId}/products/new`, "Add your first product"))}
    ${archived.length ? `<section class="lb-archived-products"><div class="lb-section-title"><h2>Archived products</h2><span>${archived.length} retained</span></div>${productRows(archived, storeId, true)}</section>` : ""}`;
}
function productEditor(data, isNew) {
  const storeId = encodeURIComponent(data.store?.store_id || "");
  const paramsId = data.product?.id || data.id || data.product_id || "";
  const products = list(data.draft?.products || data.products);
  const product = isNew ? {} : obj(data.product || products.find(p => String(p.id) === String(paramsId)));
  const id = isNew ? "" : String(product.id || paramsId);
  const isArchived = product.status === "archived" || Boolean(product.archived_at);
  const errors = product.title || product.id ? validateProduct(product) : {};
  const rates = [...new Set([...CURRENT_GST_RATES, ...(CURRENT_GST_RATES.includes(Number(product.gst_rate)) || product.gst_rate == null ? [] : [Number(product.gst_rate)])])].sort((a,b)=>a-b);
  const legacy = product.gst_rate != null && !CURRENT_GST_RATES.includes(Number(product.gst_rate));
  const imageList = list(product.images);
  const formFields = `<form id="lb-product-form" class="lb-product-form" data-product-form data-new="${isNew}" data-product-id="${esc(id)}" data-expected-stock="${product.stock == null ? "null" : esc(product.stock)}" data-product-status="${isArchived ? "archived" : ""}">
    ${isArchived ? `<div class="lb-archived-notice" role="status"><strong>Archived product</strong><span>This record is retained for order history. Saving keeps it archived; no restore action is available.</span></div>` : ""}
    <div class="lb-form-columns"><div class="lb-form-main">
      <label class="lb-field">Product title<input name="title" required maxlength="80" value="${esc(product.title || "")}" placeholder="For example, Everyday tote"></label>
      <label class="lb-field">Description<textarea name="description" rows="6" maxlength="2000" placeholder="What should a customer know about this product?">${esc(product.description || "")}</textarea><small>30 to 2,000 characters.</small></label>
      <section class="lb-image-editor"><div class="lb-image-top"><div><h2>Product images</h2><p>Upload up to 8 JPG, PNG or WebP images.</p></div><label class="lb-button lb-button-outline lb-file-label">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" data-image-upload multiple></label></div>
        <div class="lb-image-grid" data-images>${imageList.map((img, i) => { const imageUrl = safeHttps(img.url); return `<figure class="lb-image-card" data-image-id="${esc(img.id)}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(img.alt || "")}">` : `<div class="lb-image-missing">Image unavailable</div>`}<figcaption><label>Alt text<input value="${esc(img.alt || "")}" maxlength="200" data-image-alt></label><button type="button" class="lb-text-button" data-image-remove>Remove</button></figcaption></figure>`; }).join("")}</div>
      </section>
      <label class="lb-field">Tags<input name="tags" value="${esc(list(product.tags).join(", "))}" placeholder="Comma-separated tags"></label>
       <section class="lb-side-box"><h2>Pricing</h2><label class="lb-field">Price (₹)<input name="price" inputmode="decimal" required value="${product.price_paise == null ? "" : esc((Number(product.price_paise)/100).toFixed(2))}" placeholder="1290.00"></label><label class="lb-field">Compare-at price (₹)<input name="compare_at" inputmode="decimal" value="${product.compare_at_paise == null ? "" : esc((Number(product.compare_at_paise)/100).toFixed(2))}" placeholder="Optional"></label></section>
       <section class="lb-side-box"><h2>Inventory</h2><label class="lb-field">SKU<input name="sku" maxlength="80" value="${esc(product.sku || "")}"></label><label class="lb-field">Stock quantity<input name="stock" type="number" min="0" step="1" value="${product.stock == null ? "" : esc(product.stock)}" placeholder="Leave blank for always in stock"></label></section>
    </div><aside class="lb-form-side">
       <section class="lb-side-box"><h2>Status &amp; category</h2><label class="lb-field">Listing status<input value="${esc(isArchived ? "Archived" : product.status || (isNew ? "New listing" : "Active"))}" disabled></label><label class="lb-field">Product category<input value="Unavailable" disabled><small>Product categories are not supported by the current dashboard API.</small></label></section>
      <section class="lb-side-box"><h2>Tax</h2><label class="lb-field">HSN code<input name="hsn_code" maxlength="8" value="${esc(product.hsn_code || "")}" placeholder="4, 6 or 8 digits"></label><label class="lb-field">GST rate<select name="gst_rate" required><option value="" ${product.gst_rate==null?"selected":""}>Choose a GST rate</option>${rates.map(rate => `<option value="${rate}" ${product.gst_rate!=null&&Number(product.gst_rate) === rate ? "selected" : ""}>${rate===0?"0% / Exempt":`${rate}%`}${CURRENT_GST_RATES.includes(rate) ? "" : " · legacy rate"}</option>`).join("")}</select></label><p class="lb-muted" data-product-gst-warning role="status" hidden></p>${legacy ? `<p class="lb-legacy-notice">This product uses a legacy ${esc(product.gst_rate)}% GST rate. Confirm the correct slab before updating.</p>` : ""}</section>
       ${!isNew && !isArchived ? `<section class="lb-side-box"><h2>Stock adjustment</h2><label class="lb-field">Quantity change<input type="number" step="1" name="stock_delta" value="1"></label><label class="lb-field">Reason<input name="stock_reason" maxlength="200" placeholder="Stock count correction"></label><button type="button" class="lb-button lb-button-outline lb-full" data-stock-adjust>Adjust stock</button></section>` : ""}
    </aside></div>
    ${data.aura_skeleton_enabled === true ? productContentSection(obj(product.content)) : ""}
    <div class="lb-form-error" role="alert" data-form-error ${Object.keys(errors).length ? "" : "hidden"}>${Object.values(errors).map(esc).join(" ")}</div>
     <div class="lb-form-actions"><a class="lb-text-button" href="/stores/${storeId}/products">Cancel</a><button class="lb-button lb-button-outline" type="submit">${isNew ? "Save product" : "Save changes"}</button>${!isNew && !isArchived ? `<button type="button" class="lb-button lb-button-danger" data-archive>Archive product</button>` : ""}</div>
  </form>`;
  const validationMessage = Object.keys(errors).length ? `<div class="lb-validation-summary"><strong>Before you save</strong><ul>${Object.values(errors).map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>` : "";
  const editorActions=`<button class="lb-button" type="submit" form="lb-product-form" data-product-save>${isNew ? "Save product" : "Save changes"}</button>${buttonLink(`/stores/${storeId}/products`, "Back to products", "quiet")}`;
  return `${pageHeading("", isNew ? "Add product" : esc(product.title || "Edit product"), "", editorActions)}${actionError(data)}${validationMessage}${formFields}`;
}

function customerTable(rows, storeId) {
  return `<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>${rows.map(c => `<tr><td><a class="lb-row-link" href="/stores/${storeId}/customers/${encodeURIComponent(c.id)}">${esc(c.name || "Customer")}</a><small>${esc(c.email || "")}</small></td><td>${esc(c.phone || "Not recorded")}</td><td>${Number(c.orders_count || 0)}</td><td>${money(c.total_spent_paise)}</td><td>${esc(date(c.last_order_at))}</td></tr>`).join("")}</tbody></table></div>`;
}
function customersPage(data) {
  const rows = list(data.customers), storeId = encodeURIComponent(data.store?.store_id || ""), f = obj(data.filters);
  return `${pageHeading("", "Customers", "", exportControl(data.role, "customers", "Export CSV"))}${actionError(data)}
    <form class="lb-filter-bar lb-customer-search" method="get" action="/stores/${storeId}/customers" data-filter-form><label class="lb-search"><span>Find a customer</span><input type="search" name="search" value="${esc(f.search || "")}" placeholder="Name, phone or email"></label><button class="lb-button lb-button-small" type="submit">Search</button></form>
    ${rows.length ? customerTable(rows, storeId) : empty("No customers to show.", f.search ? "No customer matched that search. Try another name or number." : "Customer records appear after their first order.")}`;
}
function customerDetail(data) {
  const c = obj(data.customer || data.detail), storeId = encodeURIComponent(data.store?.store_id || "");
  const orders = list(c.orders), addresses = list(c.addresses);
  const addressCards = addresses.length ? addresses.map(a => addressBlock(a, a.recipient_name || "Saved address")).join("") : `<div class="lb-inline-empty">No saved addresses.</div>`;
  const rows = orders.length ? orderTable(orders, storeId) : empty("No orders yet.", "Orders placed by this customer will appear here.");
  return `${pageHeading("", esc(c.name || "Customer"), c.phone || "Customer contact details", buttonLink(`/stores/${storeId}/customers`, "Back to customers", "quiet"))}${actionError(data)}
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
  return `${pageHeading("", "Invoices", "", exportControl(data.role, "orders", "Export orders"))}${actionError(data)}
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
  const ownerActions = data.role === "owner" && ["live","awaiting_approval"].includes(store.status) ? `<div class="lb-settings-danger"><div><h3>${store.status === "live" ? "Stop accepting orders" : "Withdraw approval request"}</h3><p>${store.status === "live" ? "Unpublishing makes your public store unavailable to customers until you publish it again." : "Withdraw your request and keep your draft. You can resubmit it later."}</p></div><button type="button" class="lb-button lb-button-danger" data-unpublish>${store.status === "live" ? "Unpublish store" : "Withdraw request"}</button></div>` : `<p class="lb-muted">${data.role === "owner" ? "Your storefront is offline." : "Only the store owner can withdraw or unpublish the store."}</p>`;
  const exports = data.role === "owner"
    ? `<div class="lb-export-buttons"><button type="button" data-export="customers">Customers CSV</button><button type="button" data-export="orders">Orders CSV</button><button type="button" data-export="products">Products CSV</button></div><small>Exports are available to the store owner.</small>`
    : `<p class="lb-muted">Exports are available to the store owner.</p>`;
  const taxErrors = registeredSupplierErrors(settings);
  const taxError = name => `<span id="tax-error-${name}" data-tax-error="${name}" class="field-error" role="alert">${esc(taxErrors[name] || "")}</span>`;
  const taxForm = `<form id="lb-business-form" data-tax-settings-form novalidate><fieldset ${["owner","admin"].includes(data.role) ? "" : "disabled"}>
    <label class="lb-field">Legal business name<input name="legal_name" maxlength="120" value="${esc(settings.legal_name || "")}">${taxError("legal_name")}</label>
    ${[["business_line1","Registered address line 1",150],["business_line2","Address line 2 (optional)",150],["business_city","Registered address city",80],["business_pincode","Registered address PIN",6]].map(([name,label,max])=>`<label class="lb-field">${label}<input name="${name}" maxlength="${max}" value="${esc(settings[name] || "")}" aria-describedby="tax-error-${name}">${taxError(name)}</label>`).join("")}
    <label class="lb-field">Invoice prefix<input name="invoice_prefix" maxlength="4" value="${esc(settings.invoice_prefix || defaultInvoicePrefix(store.name))}" ${draft.invoice_prefix_locked ? "readonly" : ""}>${taxError("invoice_prefix")}<small>${draft.invoice_prefix_locked ? "Locked until the next financial year (1 April)." : "1 to 4 uppercase letters or digits. Locked after issuance this financial year."}</small></label>
    <label class="lb-field">Registered business state<select name="business_state" aria-describedby="tax-error-business_state" aria-invalid="${!!taxErrors.business_state}"><option value="">Choose the registered address state</option>${INDIAN_STATES.map(s=>`<option value="${s.code}" ${registeredBusinessState(settings)===s.code?"selected":""}>${esc(s.name)}</option>`).join("")}</select>${taxError("business_state")}</label>
    <label class="lb-field">GSTIN (required to publish)<input name="gstin" maxlength="15" autocapitalize="characters" spellcheck="false" aria-describedby="tax-error-gstin" aria-invalid="${!!taxErrors.gstin}" value="${esc(settings.gstin || "")}">${taxError("gstin")}</label>
    <label class="lb-field">Signature image (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-signature-upload><small>PNG, JPEG, WebP or safe SVG, up to 5 MB. Uses the same tenant-scoped R2 upload rules as a logo.</small></label>
    <div data-signature-preview>${settings.signature_url ? `<img src="${esc(settings.signature_url)}" alt="Authorised signature" style="max-width:180px;max-height:80px">` : ""}</div><button type="button" class="lb-text-button" data-signature-remove ${settings.signature_media_id ? "" : "hidden"}>Remove signature</button>
    <p class="lb-muted">Registered details are checked and frozen when an invoice is issued. Storefront changes remain drafts until policies are reviewed and changes published.</p>
    <p data-tax-form-error role="alert"></p><button class="lb-button lb-button-outline" type="submit">Save business details</button>
    </fieldset></form>`;
  return `${pageHeading("", "Settings", "",`<button class="lb-button" type="submit" form="lb-business-form" ${["owner","admin"].includes(data.role)?"":"disabled"}>Save business details</button>`)}${actionError(data)}
    <div class="lb-settings-layout"><nav class="lb-settings-index" aria-label="Settings sections">
      <a href="#store-details">Store details</a><a href="#business-gst">Business &amp; GST</a><a href="#policies">Policies</a>
      <a href="${`/stores/${id}/settings/checkout`}">Checkout</a><a href="/stores/${id}/build/ann?launch=1">Store connections</a><span>Users <small>Unavailable</small></span>
    </nav><div class="lb-settings-panels">
      <div id="store-details">${card("Store details", `<dl class="lb-definition"><div><dt>Store name</dt><dd>${esc(store.name || settings.brand_name || "Not set")}</dd></div><div><dt>Store address</dt><dd>${store.subdomain ? `${esc(store.subdomain)}.lebrands.store` : "Not set"}</dd></div><div><dt>Status</dt><dd>${esc(store.status === "awaiting_approval" ? "Awaiting approval" : store.status || "Setup in progress")}</dd></div><div><dt>Store setup</dt><dd><a class="lb-inline-link" href="/stores/${id}/setup">Open store setup</a></dd></div></dl>`)}</div>
      <div id="business-gst">${card("Business & GST", taxForm)}</div>
      <div id="policies">${card("Policies", `${policyMarkup}<p class="lb-settings-note">Review, publish and unpublish controls are managed in store setup.</p><div class="lb-export-buttons"><a class="lb-button lb-button-outline lb-button-small" href="/stores/${id}/setup">Review policies and publishing</a></div>`)}</div>
      ${card("Checkout", `<p>Checkout and delivery settings are available in the existing checkout settings screen.</p><div class="lb-export-buttons"><a class="lb-button lb-button-outline lb-button-small" href="/stores/${id}/settings/checkout">Open checkout settings</a></div><small>${esc(checkoutSettings.store_state ? `Registered state: ${stateName(checkoutSettings.store_state)}` : "Checkout configuration is not included in this dashboard view.")}</small>`)}
      ${card("Exports", `<p>Download a copy of your store records as CSV.</p>${exports}`)}
      ${card("Store availability", ownerActions)}
      <section class="lb-card"><div class="lb-card-heading"><h2>Store connections</h2></div><p>Choose your store address and verify optional payment and delivery accounts in Ann. Verifying an account does not activate online checkout or automatic shipping.</p><a class="lb-button lb-button-outline lb-button-small" href="/stores/${id}/build/ann?launch=1">Open store connections</a><p>User management is not available in this settings screen.</p></section>
    </div></div>`;
}

function normalizeView(view) {
  const v = String(view || "overview").toLowerCase();
  if (["dashboard", "store", "home", "overview"].includes(v)) return "overview";
  if (["order-detail", "order"].includes(v)) return "order";
  if (["new-product", "new_product", "product-new", "products-new"].includes(v)) return "product-new";
  if (["edit-product", "product-edit", "product-editor", "product-detail", "product"].includes(v)) return "product";
  if (["collections", "collection-new", "collection"].includes(v)) return v;
  if (["customer-detail", "customer"].includes(v)) return "customer";
  if (["orders", "products", "customers", "invoices", "settings"].includes(v)) return v;
  return "overview";
}


function rowsEditor(name, noun, rows, fields) {
  const row = (r) => `<fieldset class="lb-content-row" data-row>${fields.map(f => f.rich
    ? `<label class="lb-field">${esc(f.label)}<textarea data-key="${f.key}" data-original-html="${esc(r[f.key] ?? "")}" rows="3" maxlength="${f.max}">${esc(richToText(r[f.key]))}</textarea></label>`
    : `<label class="lb-field">${esc(f.label)}<input data-key="${f.key}" maxlength="${f.max}" value="${esc(r[f.key] ?? "")}"></label>`).join("")}<button type="button" class="lb-text-button" data-row-remove>Remove this ${esc(noun)}</button></fieldset>`;
  return `<div class="lb-rows" data-rows="${name}" data-noun="${esc(noun)}" data-keys="${fields.map(f => f.key + (f.rich ? ":rich" : "")).join(",")}" data-required="${esc(fields[0].key)}"><div data-row-list>${list(rows).map(row).join("")}</div><template data-row-template>${row({})}</template><button type="button" class="lb-button lb-button-outline lb-button-small" data-row-add>Add ${esc(noun)}</button></div>`;
}
function richField(name, label, value, max = 4000) {
  return `<label class="lb-field">${esc(label)}<textarea data-content="${name}" data-rich data-original-html="${esc(value ?? "")}" rows="5" maxlength="${max}" placeholder="Plain paragraphs. Start lines with - for a list.">${esc(richToText(value))}</textarea></label>`;
}
function productContentSection(c) {
  return `<section class="lb-card lb-content-card" data-content-form><div class="lb-card-heading"><h2>Product page content</h2></div><p class="lb-muted">Saved as a draft. Customers see this after you publish. Clear a field to remove that product's section content.</p>
    ${richField("description_features", "Description features", c.description_features)}
    <h3>Features</h3>${rowsEditor("features", "feature", c.features, [{ key: "label", label: "Label", max: 80 }, { key: "value", label: "Value", max: 200 }])}
    ${richField("materials_care", "Materials and care", c.materials_care)}
    <h3>Size guide</h3>${rowsEditor("size_guide", "size row", c.size_guide, [{ key: "size", label: "Size", max: 40 }, { key: "measurement", label: "Measurement", max: 120 }])}
    <label class="lb-field">Size note<textarea data-content="size_note" rows="2" maxlength="500">${esc(c.size_note || "")}</textarea></label>
    <h3>How to use</h3>${rowsEditor("how_to_use", "step", c.how_to_use, [{ key: "title", label: "Step title", max: 120 }, { key: "text", label: "Step text", max: 600 }])}
    <h3>Questions and answers</h3>${rowsEditor("faq", "question", c.faq, [{ key: "question", label: "Question", max: 200 }, { key: "answer", label: "Answer", max: 2000, rich: true }])}
    ${richField("delivery_returns", "Delivery and returns", c.delivery_returns)}
  </section>`;
}
function draftCollections(data) { return list(data.draft?.collections || data.collections); }
function collectionsPage(data) {
  const storeId = encodeURIComponent(data.store?.store_id || ""), cols = draftCollections(data);
  const rows = cols.length ? `<div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Collection</th><th>Address</th><th>Products</th><th></th></tr></thead><tbody>${cols.map(k => { const href = `/stores/${storeId}/collections/${encodeURIComponent(k.id)}`; const cover = safeHttps(k.cover?.url); return `<tr><td><div class="lb-product-cell">${cover ? `<img src="${esc(cover)}" alt="${esc(k.cover.alt || "")}">` : '<span class="lb-product-thumb" aria-hidden="true"></span>'}<a class="lb-row-link" href="${href}">${esc(k.title || "Untitled collection")}</a></div></td><td>/collections/${esc(k.slug || "")}</td><td>${list(k.product_ids).length}</td><td><a class="lb-edit-link" href="${href}">Edit</a></td></tr>`; }).join("")}</tbody></table></div>` : empty("No collections yet.", "Group products into collections. They appear on your home page and collection pages after you publish.", buttonLink(`/stores/${storeId}/collections/new`, "Add your first collection"));
  return `${pageHeading("", "Collections", "", buttonLink(`/stores/${storeId}/collections/new`, "Add collection"))}${actionError(data)}${rows}`;
}
function collectionEditor(data, isNew) {
  const storeId = encodeURIComponent(data.store?.store_id || ""), cols = draftCollections(data);
  const k = isNew ? {} : obj(cols.find(i => String(i.id) === String(data.collection_id || data.id)));
  const products = list(data.draft?.products || data.products).filter(p => p.status !== "archived" && !p.archived_at);
  const picked = new Set(list(k.product_ids)), related = new Set(list(k.related_ids));
  const cover = obj(k.cover), coverUrl = safeHttps(cover.url);
  if (!isNew && !k.id) return `${pageHeading("", "Collection not found", "", buttonLink(`/stores/${storeId}/collections`, "Back to collections", "quiet"))}${empty("This collection does not exist.", "It may have been deleted.")}`;
  const others = cols.filter(i => i.id !== k.id);
  return `${pageHeading("", isNew ? "Add collection" : esc(k.title || "Edit collection"), "", `<button class="lb-button" type="submit" form="lb-collection-form">${isNew ? "Save collection" : "Save changes"}</button>${buttonLink(`/stores/${storeId}/collections`, "Back", "quiet")}`)}${actionError(data)}
  <form id="lb-collection-form" class="lb-product-form" data-collection-form data-new="${isNew}" data-collection-id="${esc(k.id || "")}"><div class="lb-form-columns"><div class="lb-form-main">
    <label class="lb-field">Title<input name="title" required maxlength="120" value="${esc(k.title || "")}"></label>
    <label class="lb-field">Web address<input name="slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${esc(k.slug || "")}" placeholder="summer-kurtas"><small>Lowercase letters, numbers and hyphens. Shown as /collections/your-address. Not &quot;all&quot;.</small></label>
    <label class="lb-field">Description<textarea name="description" rows="5" maxlength="4000">${esc(k.description || "")}</textarea></label>
    <section class="lb-side-box" data-cover data-cover-value="${esc(JSON.stringify(k.cover || null))}"><h2>Cover image</h2><div data-cover-preview>${coverUrl ? `<img src="${esc(coverUrl)}" alt="${esc(cover.alt || "")}" style="max-width:240px">` : '<p class="lb-muted">No cover chosen. The first product image is used.</p>'}</div>
      <label class="lb-field">Alt text<input data-cover-alt maxlength="200" value="${esc(cover.alt || "")}"></label>
      <div class="lb-heading-actions"><label class="lb-button lb-button-outline lb-file-label">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" data-cover-upload hidden></label><button type="button" class="lb-button lb-button-outline" data-cover-library>Choose from library</button><button type="button" class="lb-text-button" data-cover-clear ${k.cover ? "" : "hidden"}>Remove cover</button></div><div data-cover-library-panel hidden></div></section>
    <section class="lb-side-box"><h2>Questions and answers</h2>${rowsEditor("faq", "question", k.faq, [{ key: "question", label: "Question", max: 200 }, { key: "answer", label: "Answer", max: 2000 }])}</section>
  </div><aside class="lb-form-side">
    <section class="lb-side-box"><h2>Products</h2>${products.length ? `<div class="lb-check-list" style="max-height:320px;overflow:auto">${products.map(p => `<label class="lb-check-input"><input type="checkbox" data-product-pick value="${esc(p.id)}" ${picked.has(p.id) ? "checked" : ""}>${esc(p.title || "Untitled product")}</label>`).join("")}</div>` : '<p class="lb-muted">Add products first.</p>'}</section>
    <section class="lb-side-box"><h2>Related collections</h2>${others.length ? `<div class="lb-check-list">${others.map(o => `<label class="lb-check-input"><input type="checkbox" data-related-pick value="${esc(o.id)}" ${related.has(o.id) ? "checked" : ""}>${esc(o.title || "Untitled collection")}</label>`).join("")}</div>` : '<p class="lb-muted">Other collections will be listed here. If none are chosen, all your collections are suggested.</p>'}</section>
    ${!isNew ? '<button type="button" class="lb-button lb-button-quiet" data-collection-delete>Delete collection</button>' : ""}
  </aside></div><div class="lb-form-error" role="alert" data-form-error hidden></div></form>`;
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
    case "collections": body = collectionsPage(data); break;
    case "collection-new": body = collectionEditor(data, true); break;
    case "collection": body = collectionEditor(data, false); break;
    case "customers": body = customersPage(data); break;
    case "customer": body = customerDetail(data); break;
    case "invoices": body = invoicesPage(data); break;
    case "settings": body = settingsPage(data); break;
    default: body = overview(data);
  }
  return documentPage(current, data, user, body.replace(/>\+91(\d{5})(\d{5})</g,">+91 $1 $2<"));
}
