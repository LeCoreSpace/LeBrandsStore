const ROOT = "/admin";
const STATUSES = ["all", "draft", "live", "paused", "suspended"];
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN") : "Unknown");
const cap = (s) => { s = String(s || "unknown").replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };
const when = (v) => {
  if (!v) return "Not recorded";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
};
const day = (v) => {
  if (!v) return "Not recorded";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
};
const money = (minor, cur) => {
  const n = Number(minor);
  if (!Number.isFinite(n)) return "Amount unknown";
  const c = /^[A-Z]{3}$/.test(String(cur)) ? cur : "INR";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(n / 100); } catch { return `${c} ${(n / 100).toFixed(2)}`; }
};
const KNOWN = { draft: "neutral", live: "ok", paused: "warn", suspended: "bad" };
const chip = (text, tone) => `<span class="pa-chip" data-tone="${esc(tone || "unknown")}">${esc(text)}</span>`;
const statusChip = (s) => chip(KNOWN[s] ? cap(s) : `Unrecognised: ${s || "none"}`, KNOWN[s] || "unknown");

function subscriptionCell(sub, full) {
  if (!sub) return chip("No subscription record", "neutral");
  const mode = sub.mode === "live" ? chip("Live mode", "ok") : sub.mode === "test" ? chip("Test mode", "test") : chip("Mode unknown", "unknown");
  const st = String(sub.status || "");
  const tone = st === "active" ? "ok" : ["past_due", "halted", "cancelled", "expired"].includes(st) ? "bad" : ["trialing", "free"].includes(st) ? "neutral" : "unknown";
  const st2 = chip(st ? cap(st) : "Status unknown", tone);
  let out = `<div class="pa-stack"><span class="pa-strong">${esc(cap(sub.plan || "Plan unknown"))}</span><span>${st2} ${mode}</span>`;
  if (full) out += `<span class="pa-sub">Billing ${esc(sub.interval || "unknown")}</span>`;
  if (sub.period_end) out += `<span class="pa-sub">Period ends ${esc(day(sub.period_end))}</span>`;
  if (sub.free_expires_at) out += `<span class="pa-sub">Free access ends ${esc(day(sub.free_expires_at))}</span>`;
  return out + "</div>";
}
function paymentCell(p) {
  if (!p) return chip("No payment recorded", "neutral");
  const test = p.mode === "test";
  const mode = test ? chip("Test payment, not a subscription", "test") : p.mode === "live" ? chip("Live payment", "ok") : chip("Mode unknown", "unknown");
  const s = String(p.status || "");
  const tone = ["captured", "paid"].includes(s) ? "ok" : ["failed", "refunded", "disputed"].includes(s) ? "bad" : ["created","authorized","pending","expired","cancelled","partially_refunded"].includes(s) ? "warn" : "unknown";
  return `<div class="pa-stack"><span class="pa-strong">${esc(money(p.amount_minor, p.currency))}</span><span>${chip(s ? cap(s) : "Status unknown", tone)} ${mode}</span><span class="pa-sub">${p.captured_at ? "Captured " + esc(day(p.captured_at)) : "Not captured"}</span></div>`;
}
function needsAttention(r) {
  const out = [];
  if (r.suspended) out.push("Suspended by platform");
  if (!KNOWN[r.status]) out.push("Unrecognised store status");
  if (r.payment && !["captured", "paid"].includes(r.payment.status)) out.push("Payment " + (r.payment.status || "status unknown"));
  if (r.gst_state && r.gst_state !== "verified") out.push("GST " + String(r.gst_state).replace(/_/g, " "));
  return out;
}
function hostLine(r) {
  const d = list(r.domains);
  return d.length ? d.map((x) => esc(x.hostname)).join(", ") : "No custom domain";
}
const SUMMARY = [["stores", "Stores"], ["live", "Live"], ["draft", "Draft"], ["paused", "Paused"], ["suspended", "Suspended"], ["orders", "Orders"], ["pending_reviews", "Pending reviews"], ["custom_domains", "Custom domains"], ["payment_issues", "Payment issues"]];

const NAV = [["stores", "Stores", ""], ["business-reviews", "Business reviews", "/business-reviews"], ["integrations", "Integrations", "/integrations"], ["domains", "Custom domains", "/domains"], ["gst", "GST verification", "/gst"], ["subscriptions", "Subscriptions", "/subscriptions"], ["payments", "Payments", "/payments"], ["suspensions", "Store suspension", "/suspensions"]];
function head(title, extra) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | LeBrands.Store Operations</title><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><link rel="preload" href="/assets/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/platform-admin.css">${extra || ""}<script src="/assets/platform-admin.js" defer></script></head>`;
}
const logo = `<img src="/img/REPLACE-lebrands-light-transparent.webp" alt="LeBrands.Store" width="150" height="32">`;

export function renderPlatformAdminFrame(title, inner, admin, active = "stores", extraHead = "") {
  const a = obj(admin);
  const who = a.name || a.username || a.email || "Platform admin";
  const sub = a.username || a.email || "";
  const nav = NAV.map(([k, l, p]) => `<a href="${ROOT}${p}" ${active === k ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  return `${head(title, extraHead)}<body class="pa-app"><a class="pa-skip" href="#pa-main">Skip to content</a>
<div class="pa-shell"><aside class="pa-side"><a class="pa-brand" href="${ROOT}" aria-label="LeBrands.Store Operations home">${logo}<span>Operations</span></a>
<nav aria-label="Operations">${nav}</nav>
<div class="pa-who"><p class="pa-sub-d">Signed in as</p><strong>${esc(who)}</strong><span>${esc(sub && sub !== who ? sub : "")}</span>
<form method="post" action="${active === "business-reviews" ? "/logout" : `${ROOT}/logout`}"><button class="pa-btn pa-btn-ghost" type="submit">Sign out</button></form></div></aside>
<main id="pa-main" class="pa-main" tabindex="-1">${inner}</main></div></body></html>`;
}
const frame = renderPlatformAdminFrame;
const alertBox = (msg, href) => `<div class="pa-alert" role="alert"><strong>${esc(msg)}</strong>${href ? `<a class="pa-link" href="${esc(href)}">Reload and retry</a>` : ""}</div>`;

function login(d) {
  return `${head("Sign in")}<body class="pa-app pa-login"><main class="pa-login-card" id="pa-main"><div class="pa-login-brand">${logo}<p>Operations</p></div>
<h1>Platform administration</h1><p class="pa-lede">Restricted to the platform owner. Every action is recorded against your name.</p>
${d.error ? alertBox(String(d.error)) : ""}
<form method="post" action="${ROOT}/login" autocomplete="on"><label class="pa-field" for="pa-user"><span>Username</span><input id="pa-user" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="120" value="${esc(d.username || "")}" ${d.username ? "" : "autofocus"}></label>
<label class="pa-field" for="pa-pass"><span>Password</span><span class="pa-pw"><input id="pa-pass" name="password" type="password" required autocomplete="current-password" maxlength="256" ${d.username ? "autofocus" : ""}><button type="button" class="pa-btn pa-btn-ghost pa-toggle" data-toggle-password="pa-pass" aria-controls="pa-pass" aria-pressed="false" hidden>Show</button></span></label>
<button class="pa-btn pa-btn-primary pa-block" type="submit">Sign in</button></form>
<p class="pa-sub pa-fine">This area is not indexed and is unrelated to merchant dashboards.</p></main></body></html>`;
}

function overview(d) {
  const sum = obj(d.summary), rows = list(d.stores);
  const status = STATUSES.includes(d.status) ? d.status : "all";
  const page = Math.max(0, parseInt(d.page, 10) || 0);
  const q = String(d.query || "");
  const href = (p, st = status) => `${ROOT}?${new URLSearchParams({ ...(q ? { q } : {}), status: st, page: String(p) })}`;
  const metrics = SUMMARY.map(([k, l]) => {
    const warn = (k === "suspended" || k === "payment_issues") && Number(sum[k]) > 0;
    return `<div class="pa-metric" ${warn ? 'data-alert="true"' : ""}><dt>${l}</dt><dd>${esc(num(sum[k]))}</dd></div>`;
  }).join("");
  const tabs = STATUSES.map((s) => `<a href="${esc(href(0, s))}" ${s === status ? 'aria-current="page"' : ""}>${cap(s)}</a>`).join("");
  let body;
  if (d.error) body = alertBox(String(d.error), href(page));
  else if (!rows.length) body = `<section class="pa-empty"><h2>${q || status !== "all" ? "No stores match these filters." : "No stores exist yet."}</h2><p>${q || status !== "all" ? "Check the spelling or clear the filters to see every store." : "Stores appear here as soon as a merchant creates one."}</p>${q || status !== "all" ? `<a class="pa-btn pa-btn-line" href="${ROOT}">Clear filters</a>` : ""}</section>`;
  else body = `<div class="pa-tablewrap"><table class="pa-table"><caption class="pa-sr">Stores, ${esc(cap(status))}, page ${page + 1}</caption><thead><tr><th scope="col">Store</th><th scope="col">Status</th><th scope="col">Activity</th><th scope="col">Subscription</th><th scope="col">Latest payment</th><th scope="col">Checks</th></tr></thead><tbody>${rows.map((r) => {
    const att = needsAttention(r);
    return `<tr data-state="${esc(r.status)}" ${att.length ? 'data-attention="true"' : ""}><th scope="row"><a class="pa-store" href="${ROOT}/stores/${encodeURIComponent(r.store_id)}">${esc(r.name || "Unnamed store")}</a><span class="pa-sub pa-mono">${esc(r.subdomain)}.lebrands.store</span><span class="pa-sub">${esc(r.country || "n/a")} / ${esc(r.currency || "n/a")} / Created ${esc(day(r.created_at))}</span></th>
<td data-l="Status">${statusChip(r.suspended ? "suspended" : r.status)}${r.suspended ? `<span class="pa-sub">Revision ${esc(r.suspension_revision ?? 0)}</span>` : ""}</td>
<td data-l="Activity"><div class="pa-stack"><span><span class="pa-strong">${esc(num(r.order_count))}</span> orders</span><span><span class="pa-strong">${esc(num(r.product_count))}</span> products</span><span class="pa-sub">${hostLine(r)}</span></div></td>
<td data-l="Subscription">${subscriptionCell(r.subscription, false)}</td><td data-l="Payment">${paymentCell(r.payment)}</td>
<td data-l="Checks">${att.length ? `<ul class="pa-flags">${att.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : chip("No flags raised", "neutral")}</td></tr>`;
  }).join("")}</tbody></table></div>
<nav class="pa-pager" aria-label="Pagination">${page > 0 ? `<a class="pa-btn pa-btn-line" href="${esc(href(page - 1))}">Previous</a>` : "<span></span>"}<span>Page ${page + 1}</span>${d.has_more ? `<a class="pa-btn pa-btn-line" href="${esc(href(page + 1))}">Next</a>` : "<span></span>"}</nav>`;
  return frame("Stores", `<header class="pa-head"><div><p class="pa-eyebrow">Platform overview</p><h1>Store health</h1></div><a class="pa-btn pa-btn-line" href="${ROOT}/business-reviews">Open business reviews${Number(sum.pending_reviews) > 0 ? ` (${esc(num(sum.pending_reviews))} pending)` : ""}</a></header>
<dl class="pa-metrics" aria-label="Platform summary">${metrics}</dl>
<form class="pa-filters" method="get" action="${ROOT}" role="search"><label class="pa-field" for="pa-q"><span>Search stores</span><input id="pa-q" type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="Name or subdomain"></label>
<label class="pa-field" for="pa-st"><span>Status</span><select id="pa-st" name="status">${STATUSES.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${cap(s)}</option>`).join("")}</select></label>
<input type="hidden" name="page" value="0"><button class="pa-btn pa-btn-primary" type="submit">Apply filters</button></form>
<nav class="pa-tabs" aria-label="Quick status filter">${tabs}</nav>${body}`, d.admin, "stores");
}

const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

function storeView(d) {
  const s = obj(d.store), form = obj(d.form), hist = list(d.history);
  const sid = String(s.store_id || "");
  const suspended = !!s.suspended || s.status === "suspended";
  const action = suspended ? "restore" : "suspend";
  const rev = parseInt(s.suspension_revision, 10) || 0;
  const gstOk = s.gst_state === "verified" && s.gst_confirmed;
  const checks = [
    ["Store status", statusChip(suspended ? "suspended" : s.status)],
    ["Business verification", s.business_status ? chip(cap(s.business_status), s.business_status === "approved" ? "ok" : s.business_status === "changes_requested" ? "warn" : s.business_status === "pending_review" ? "warn" : "unknown") + ` <a class="pa-link" href="${ROOT}/business-reviews/${encodeURIComponent(sid)}">Open review</a>` : chip("Not submitted", "neutral")],
    ["GST", s.gst_state ? chip(cap(s.gst_state) + (s.gst_confirmed ? ", confirmed" : ", not confirmed"), gstOk ? "ok" : "warn") : chip("No GST record", "neutral")],
    ["Subscription", subscriptionCell(s.subscription, true)],
    ["Latest payment", paymentCell(s.payment)],
  ].map(([k, v]) => `<li><span class="pa-check-k">${k}</span><div>${v}</div></li>`).join("");
  const integ = list(s.integrations);
  const integHtml = integ.length ? `<ul class="pa-rows">${integ.map((i) => `<li><span class="pa-strong">${esc(cap(i.provider))}</span>${chip(i.status ? cap(i.status) : "Status unknown", ["connected", "active", "verified"].includes(i.status) ? "ok" : ["error", "failed", "disconnected"].includes(i.status) ? "bad" : "unknown")}<span class="pa-sub">Updated ${esc(when(i.updated_at))}</span></li>`).join("")}</ul>` : `<p class="pa-sub">No integrations recorded.</p>`;
  const doms = list(s.domains);
  const domHtml = doms.length ? `<ul class="pa-rows">${doms.map((x) => `<li><span class="pa-strong pa-mono">${esc(x.hostname)}</span>${chip(x.status ? cap(x.status) : "Status unknown", x.status === "active" || x.status === "verified" ? "ok" : x.status ? "warn" : "unknown")}${x.is_primary ? chip("Primary", "neutral") : ""}<span class="pa-sub">Updated ${esc(when(x.updated_at))}</span></li>`).join("")}</ul>` : `<p class="pa-sub">No custom domains attached.</p>`;
  const histHtml = hist.length ? `<ol class="pa-history">${hist.map((h) => `<li><div class="pa-ev"><strong>${esc(cap(h.action))}</strong><span>${esc(h.from_status ? cap(h.from_status) : "Unknown")} to ${esc(h.to_status ? cap(h.to_status) : "Unknown")}</span></div><p class="pa-prose">${esc(h.reason || "No reason recorded")}</p><span class="pa-sub">${esc(h.actor_name || "Unknown actor")} / ${esc(when(h.created_at))}</span></li>`).join("")}</ol><p class="pa-sub">History is append only. Entries cannot be edited or removed.</p>` : `<p class="pa-sub">No suspension actions have been recorded for this store.</p>`;
  const panel = `<section id="pa-suspension" class="pa-card pa-action" data-mode="${action}"><h2>${suspended ? "Restore store" : "Suspend store"}</h2>
${suspended ? `<p>Restoring ends the suspension. <strong>The store is not republished.</strong> It returns to draft and the merchant must publish it again.</p>` : `<p>Suspending <strong>takes the storefront offline immediately</strong>. Orders, products, customers and every other record are preserved.</p>`}
<p class="pa-sub">Suspension revision ${rev}. The action is rejected if another admin changed it first.</p>
${d.error ? alertBox(String(d.error), `${ROOT}/stores/${encodeURIComponent(sid)}`) : ""}
<form id="pa-suspend-form" method="post" action="${ROOT}/stores/${encodeURIComponent(sid)}/suspension" data-confirm-form data-subdomain="${esc(s.subdomain)}" data-store="${esc(s.name)}" data-action="${action}">
<input type="hidden" name="action" value="${action}"><input type="hidden" name="expected_revision" value="${rev}"><input type="hidden" name="confirmation" value="">
<label class="pa-field" for="pa-reason"><span>Reason, kept in the audit trail</span><textarea id="pa-reason" name="reason" rows="4" minlength="10" maxlength="1000" required aria-describedby="pa-reason-h">${esc(form.reason || "")}</textarea><small id="pa-reason-h">10 to 1000 characters. Visible to platform admins only.</small></label>
<button class="pa-btn ${suspended ? "pa-btn-primary" : "pa-btn-danger"} pa-block" type="submit" data-open-confirm>${suspended ? "Review restoration" : "Review suspension"}</button></form>
<noscript><p class="pa-alert">JavaScript is required to confirm this action.</p></noscript></section>
<dialog id="pa-dialog" class="pa-dialog" aria-labelledby="pa-dialog-title" aria-describedby="pa-dialog-desc"><form method="dialog" class="pa-dialog-in"><h2 id="pa-dialog-title">${suspended ? "Restore" : "Suspend"} ${esc(s.name || "store")}?</h2>
<p id="pa-dialog-desc">${suspended ? "The suspension ends but the store is NOT published. It returns to draft and the merchant must publish it again." : "The storefront goes offline at once and customers cannot reach it. All records are preserved."}</p>
<p class="pa-dialog-reason"><span class="pa-sub">Reason to be recorded</span><span data-dialog-reason class="pa-prose"></span></p>
<label class="pa-field" for="pa-confirm"><span>Type <code>${esc(s.subdomain)}</code> to confirm</span><input id="pa-confirm" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-confirm-input></label>
<div class="pa-dialog-actions"><button class="pa-btn pa-btn-line" value="cancel" data-cancel>Cancel</button><button type="button" class="pa-btn ${suspended ? "pa-btn-primary" : "pa-btn-danger"}" data-submit-confirm disabled>${suspended ? "Restore store" : "Suspend store"}</button></div></form></dialog>`;
  const fallback = `<noscript></noscript>`;
  return frame(`${s.name || "Store"}`, `<nav class="pa-crumbs" aria-label="Breadcrumb"><a href="${ROOT}">Stores</a><span aria-hidden="true">/</span><span>${esc(s.name || "Store")}</span></nav>
<header class="pa-head"><div><p class="pa-eyebrow pa-mono">${esc(s.subdomain)}.lebrands.store</p><h1>${esc(s.name || "Unnamed store")}</h1><p class="pa-sub">${statusChip(s.status)} ${esc(s.country || "n/a")} / ${esc(s.currency || "n/a")} / Created ${esc(day(s.created_at))}</p></div>
<dl class="pa-mini"><div><dt>Orders</dt><dd>${esc(num(s.order_count))}</dd></div><div><dt>Products</dt><dd>${esc(num(s.product_count))}</dd></div></dl></header>
${d.error && !panel.includes("pa-alert") ? alertBox(String(d.error)) : ""}
<div class="pa-grid"><div>
<section class="pa-card"><h2>Health checks</h2><ul class="pa-checks">${checks}</ul><p class="pa-sub">Test mode payments are never counted as live subscription revenue. Unrecognised values are shown as such, never as healthy.</p></section>
<section id="pa-domains" class="pa-card"><h2>Custom domains</h2>${domHtml}</section>
<section id="pa-integrations" class="pa-card"><h2>Integrations</h2>${integHtml}</section>
<section class="pa-card"><h2>Platform audit history</h2>${histHtml}</section></div>
<div class="pa-rail">${panel}${fallback}</div></div>`, d.admin, "stores");
}

function errorView(d) {
  const e = obj(d);
  return frame(e.title || "Something went wrong", `<section class="pa-empty pa-error"><p class="pa-eyebrow">${esc(e.status ? "Error " + e.status : "Error")}</p><h1>${esc(e.title || "This page could not be shown")}</h1><p>${esc(e.error || e.message || "The request could not be completed.")}</p><div class="pa-row"><a class="pa-btn pa-btn-primary" href="${ROOT}">Back to stores</a></div></section>`, e.admin, "stores");
}

const SECTIONS = {
  integrations: ["Integrations", "Provider connections", "Integration records per store, as last reported by each provider.", ["Integrations"], (r) => { const i = list(r.integrations); return `<td data-l="Integrations">${i.length ? `<ul class="pa-rows">${i.map((x) => `<li><span class="pa-strong">${esc(cap(x.provider))}</span>${chip(x.status ? cap(x.status) : "Status unknown", ["connected", "active", "verified"].includes(x.status) ? "ok" : ["error", "failed", "disconnected"].includes(x.status) ? "bad" : "unknown")}<span class="pa-sub">Updated ${esc(when(x.updated_at))}</span></li>`).join("")}</ul>` : chip("No integrations recorded", "neutral")}</td>`; }, "integrations"],
  domains: ["Custom domains", "Domain attachments", "Hostnames attached to each store and their verification state.", ["Domains"], (r) => { const d = list(r.domains); return `<td data-l="Domains">${d.length ? `<ul class="pa-rows">${d.map((x) => `<li><span class="pa-strong pa-mono">${esc(x.hostname)}</span>${chip(x.status ? cap(x.status) : "Status unknown", ["active", "verified"].includes(x.status) ? "ok" : x.status ? "warn" : "unknown")}${x.is_primary ? chip("Primary", "neutral") : ""}<span class="pa-sub">Updated ${esc(when(x.updated_at))}</span></li>`).join("")}</ul>` : chip("No custom domain attached", "neutral")}</td>`; }, "domains"],
  gst: ["GST verification", "GST and business checks", "GST state and business registration status. Decisions are made in business reviews, not here.", ["GST", "Business verification"], (r) => { const ok = r.gst_state === "verified" && r.gst_confirmed; return `<td data-l="GST">${r.gst_state ? chip(cap(r.gst_state) + (r.gst_confirmed ? ", confirmed" : ", not confirmed"), ok ? "ok" : "warn") : chip("No GST record", "neutral")}</td><td data-l="Business verification">${r.business_status ? chip(cap(r.business_status), r.business_status === "approved" ? "ok" : ["changes_requested", "pending_review"].includes(r.business_status) ? "warn" : "unknown") + ` <a class="pa-link" href="${ROOT}/business-reviews/${encodeURIComponent(r.store_id)}">Open review</a>` : chip("Not submitted", "neutral")}</td>`; }, "gst"],
  subscriptions: ["Subscriptions", "Plans and billing state", "Subscription record per store. Test mode is labelled and is not live revenue.", ["Subscription"], (r) => `<td data-l="Subscription">${subscriptionCell(r.subscription, true)}</td>`, "subscriptions"],
  payments: ["Payments", "Latest payments", "Most recent payment per store. Test payments are not subscriptions.", ["Latest payment"], (r) => `<td data-l="Payment">${paymentCell(r.payment)}</td>`, "payments"],
  suspensions: ["Store suspension", "Suspension state", "Suspended and active stores. Actions use the guarded control on each store page.", ["Suspension", "Control"], (r) => { const sus = !!r.suspended || r.status === "suspended"; return `<td data-l="Suspension">${sus ? chip("Suspended", "bad") + `<span class="pa-sub">Revision ${esc(r.suspension_revision ?? 0)}</span>` : chip("Not suspended", "ok")}</td><td data-l="Control"><a class="pa-btn pa-btn-line" href="${ROOT}/stores/${encodeURIComponent(r.store_id)}#pa-suspension">${sus ? "Open restore control" : "Open suspend control"}</a></td>`; }, "suspensions"],
};

function section(d) {
  const cfg = SECTIONS[d.section];
  if (!cfg) return errorView({ ...d, title: "Section not found", status: 404 });
  const [title, h1, lede, cols, cells, slug] = cfg;
  const base = `${ROOT}/${slug}`;
  const rows = list(d.stores);
  const status = STATUSES.includes(d.status) ? d.status : "all";
  const page = Math.max(0, parseInt(d.page, 10) || 0);
  const q = String(d.query || "");
  const href = (p, st = status) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), status: st, page: String(p) })}`;
  const tabs = STATUSES.map((s) => `<a href="${esc(href(0, s))}" ${s === status ? 'aria-current="page"' : ""}>${cap(s)}</a>`).join("");
  const filt = q || status !== "all";
  let body;
  if (d.error) body = alertBox(String(d.error), href(page));
  else if (!rows.length) body = `<section class="pa-empty"><h2>${filt ? "No stores match these filters." : "No stores exist yet."}</h2><p>${filt ? "Check the spelling or clear the filters to see every store." : "Stores appear here as soon as a merchant creates one."}</p>${filt ? `<a class="pa-btn pa-btn-line" href="${base}">Clear filters</a>` : ""}</section>`;
  else body = `<div class="pa-tablewrap"><table class="pa-table"><caption class="pa-sr">${esc(title)}, ${esc(cap(status))} stores, page ${page + 1}</caption><thead><tr><th scope="col">Store</th><th scope="col">Store status</th>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr data-state="${esc(r.status)}"><th scope="row"><a class="pa-store" href="${ROOT}/stores/${encodeURIComponent(r.store_id)}">${esc(r.name || "Unnamed store")}</a><span class="pa-sub pa-mono">${esc(r.subdomain)}.lebrands.store</span></th><td data-l="Status">${statusChip(r.suspended ? "suspended" : r.status)}</td>${cells(r)}</tr>`).join("")}</tbody></table></div>
<nav class="pa-pager" aria-label="Pagination">${page > 0 ? `<a class="pa-btn pa-btn-line" href="${esc(href(page - 1))}">Previous</a>` : "<span></span>"}<span>Page ${page + 1}</span>${d.has_more ? `<a class="pa-btn pa-btn-line" href="${esc(href(page + 1))}">Next</a>` : "<span></span>"}</nav>`;
  return frame(title, `<header class="pa-head"><div><p class="pa-eyebrow">${esc(title)}</p><h1>${esc(h1)}</h1><p class="pa-sub">${esc(lede)}</p></div></header>
<form class="pa-filters" method="get" action="${base}" role="search"><label class="pa-field" for="pa-q"><span>Search stores</span><input id="pa-q" type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="Name or subdomain"></label>
<label class="pa-field" for="pa-st"><span>Store status</span><select id="pa-st" name="status">${STATUSES.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${cap(s)}</option>`).join("")}</select></label>
<input type="hidden" name="page" value="0"><button class="pa-btn pa-btn-primary" type="submit">Apply filters</button></form>
<nav class="pa-tabs" aria-label="Quick status filter">${tabs}</nav>${body}`, d.admin, slug === "stores" ? "stores" : slug);
}

export function renderPlatformAdmin(view, data = {}) {
  const d = obj(data);
  if (view === "login") return login(d);
  if (view === "overview") return overview(d);
  if (view === "store") return storeView(d);
  if (view === "section") return section(d);
  return errorView(d);
}
