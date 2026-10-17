import { escapeHtml } from "./layout.js";
import { dashboardIcon } from "./dashboard-icons.js";

const esc = escapeHtml;
const CHEVRON = '<svg class="lbn-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
export const NAV_STORAGE_PREFIX = "lebrands.nav.v1.";

// kind: live (own destination) | context (capability lives inside another screen) | planned (no href) | external | owner (restricted)
export function navigationModel(root, { subdomain = "", role = "editor" } = {}) {
  const live = (label, href, views = [], extra = {}) => ({ label, href, kind: "live", views, ...extra });
  const context = (label, href, hint) => ({ label, href, kind: "context", hint, views: [] });
  const planned = label => ({ label, href: null, kind: "planned", views: [] });
  const storeUrl = subdomain ? `https://${encodeURIComponent(subdomain)}.lebrands.store/` : "";
  const settings = `${root}/settings`;
  return {
    today: live("Today", root, ["overview"]),
    groups: [
      { key: "catalogue", label: "Catalogue", icon: "products", items: [
        live("Products", `${root}/products`, ["products", "product", "product-new"]),
        live("Collections", `${root}/collections`, ["collections", "collection", "collection-new"]),
        context("Stock & SKUs", `${root}/products`, "In products"),
        planned("Vendors"), planned("Offers & codes"), planned("Media library")] },
      { key: "orders", label: "Order desk", icon: "orderDesk", items: [
        live("Order queue", `${root}/orders`, ["orders", "order"], { badge: true }),
        context("Dispatch & tracking", `${root}/orders`, "In orders"),
        context("COD & returns", `${root}/orders`, "In orders"),
        live("Customer directory", `${root}/customers`, ["customers", "customer"])] },
      { key: "money", label: "Money & records", icon: "money", items: [
        planned("Payments & settlements"),
        context("Refunds", `${root}/orders`, "In orders"),
        live("Invoices & credit notes", `${root}/invoices`, ["invoices"]),
        planned("GST summaries")] },
      { key: "studio", label: "Store studio", icon: "studio", items: [
        live("Build with Ann", `${root}/build/ann`),
        live("Theme editor", `${root}/editor`),
        planned("Menus & links"),
        live("Pages & policies", `${settings}#policies`),
        storeUrl ? { label: "Browser preview", href: storeUrl, kind: "external", hint: "Opens store", views: [] } : { label: "Browser preview", href: null, kind: "unavailable", hint: "Unavailable", views: [] }] },
      { key: "reach", label: "Brand reach", icon: "reach", items: [planned("Email campaigns"), planned("WhatsApp messages"), planned("Social campaigns")] },
      { key: "pulse", label: "Business pulse", icon: "pulse", items: [
        live("Sales performance", root, [], { hint: "On Today" }),
        context("Product performance", root, "On Today"),
        planned("Customer insights"), planned("Shopping journey")] },
      { key: "settings", label: "Settings", icon: "settings", views: ["settings"], items: [
        live("Business & invoice identity", `${settings}#business-gst`),
        live("Store address & domains", `${settings}#store-details`),
        live("Payment connections", `${root}/build/ann?launch=2`, [], { hint: "In Ann setup" }),
        live("Delivery connections", `${root}/build/ann?launch=3`, [], { hint: "In Ann setup" }),
        live("Email & messaging connections", `${root}/team`, [], { hint: "Order emails" }),
        planned("Marketing connections"),
        live("Dispatch preferences", `${settings}/checkout`),
        live("People & access", `${root}/team`),
        planned("Plan & usage"), planned("Activity history"),
        role === "owner" ? live("Data exports", `${settings}#exports`) : { label: "Data exports", href: null, kind: "owner", hint: "Owner only", views: [] }] },
    ],
  };
}

function leaf(item, view) {
  const current = item.href && item.views.includes(view);
  const label = esc(item.label);
  const hint = item.kind === "planned" ? "Planned" : item.hint;
  const small = hint ? `<small>${esc(hint)}</small>` : "";
  if (!item.href) return `<li><span class="lbn-leaf is-${item.kind === "planned" ? "planned" : "disabled"}" aria-disabled="true"><span>${label}</span>${small}</span></li>`;
  const ext = item.kind === "external" ? ' target="_blank" rel="noopener"' : "";
  return `<li><a class="lbn-leaf${item.kind === "context" ? " is-context" : ""}" href="${esc(item.href)}"${ext}${current ? ' aria-current="page"' : ""}><span>${label}</span>${item.badge ? '<b class="lb-count" data-open-order-count hidden title="Loading open orders"></b>' : ""}${small}</a></li>`;
}

export function groupIsCurrent(group, view) {
  return (group.views || []).includes(view) || group.items.some(i => i.href && i.views.includes(view));
}

export function renderSidebarNav({ storeId = "", view = "overview", role = "editor", subdomain = "" } = {}) {
  const root = `/stores/${encodeURIComponent(storeId)}`;
  const model = navigationModel(root, { subdomain, role });
  const today = model.today;
  const todayCurrent = today.views.includes(view);
  const groups = model.groups.map(group => {
    const current = groupIsCurrent(group, view);
    const open = current || group.key === "settings";
    const id = `lbn-${group.key}`;
    return `<section class="lbn-group${group.key === "settings" ? " lbn-settings" : ""}" data-nav-group="${group.key}"${current ? " data-current" : ""}>
      <h2 class="lbn-heading"><button type="button" class="lbn-toggle" data-nav-toggle aria-expanded="${open}" aria-controls="${id}" title="${esc(group.label)}">${dashboardIcon(group.icon)}<span class="lbn-label">${esc(group.label)}</span>${CHEVRON}</button></h2>
      <ul class="lbn-list" id="${id}"${open ? "" : " hidden"}>${group.items.map(i => leaf(i, view)).join("")}</ul></section>`;
  }).join("");
  return `<nav class="lb-nav lbn" data-nav data-nav-store="${esc(storeId)}" aria-label="Store navigation">
    <a class="lbn-today" href="${esc(today.href)}"${todayCurrent ? ' aria-current="page"' : ""} title="Today">${dashboardIcon("today")}<span class="lbn-label">Today</span></a>${groups}</nav>`;
}

export function storeStatus(store = {}) {
  if (store.status === "awaiting_approval") return { label: store.approval_revoked_at ? "Offline, approval pending" : "Awaiting approval", tone: "pending" };
  if (store.approval_revoked_at) return { label: "Offline, approval revoked", tone: "off" };
  if (store.status === "live") return { label: "Live", tone: "live" };
  return { label: "Not published", tone: "off" };
}
