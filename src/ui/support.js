import { escapeHtml as esc, layout, accountHeader, footer } from "./layout.js";
import { renderPlatformAdminFrame } from "./platform-admin.js";
import { documentPage } from "./dashboard.js";

const PAGE_SIZE = 25;
const STATUS = { created: "Created", pending: "Pending", closed: "Closed" };
const STATUS_TABS = [["all", "All"], ["created", "Created"], ["pending", "Pending"], ["closed", "Closed"]];
const PRIORITY = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const SOURCES = { account: "Account", onboarding: "Store setup", dashboard: "Dashboard", ann: "Ann", theme_editor: "Theme editor" };
const WAITING = { brand: "Waiting on you", support: "Waiting on support" };
const ADMIN_WAITING = { brand: "Waiting on brand", support: "Waiting on support" };
const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const safeJson = (v) => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const when = (v) => {
  if (!v) return "Not recorded";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
};
const time = (v) => `<time datetime="${esc(v || "")}">${esc(when(v))}</time>`;
const chip = (status) => `<span class="sp-status" data-status="${esc(STATUS[status] ? status : "unknown")}">${esc(STATUS[status] || "Unknown status")}</span>`;
const ticketNo = (n) => { const s = String(n ?? "").replace(/\D/g, ""); return s ? `SUP-${s.padStart(6, "0")}` : "Ticket"; };

function alertBox(error, notice) {
  return `<div class="sp-live" data-live>${error ? `<div class="sp-alert" role="alert"><span>${esc(error)}</span></div>` : ""}${notice ? `<div class="sp-notice" role="status">${esc(notice)}</div>` : ""}</div>`;
}

function listView(data, base) {
  const f = obj(data.filters), page = Math.max(0, parseInt(data.page, 10) || 0);
  const status = STATUS_TABS.some(([k]) => k === f.status) ? f.status : "all";
  const q = String(f.q || ""), category = String(f.category || "all");
  const tickets = list(data.tickets), total = Number(data.total) || 0;
  const href = (p, st = status) => `${base}?${new URLSearchParams({ status: st, ...(q ? { q } : {}), ...(category !== "all" ? { category } : {}), page: String(p) })}`;
  const filtered = q || status !== "all" || category !== "all";
  const tabs = STATUS_TABS.map(([k, l]) => `<a href="${esc(href(0, k))}"${k === status ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const admin = data.admin === true;
  const rows = tickets.map((t) => `<tr data-ticket-row data-ticket-id="${esc(t.id)}"><th scope="row"><a class="sp-ticket-link" href="${base}/${encodeURIComponent(t.id)}"><span class="sp-no">${esc(ticketNo(t.ticket_number))}</span><span class="sp-subject">${esc(t.subject)}</span></a></th>
<td data-l="Status">${chip(t.status)}</td>${admin ? `<td data-l="Priority"><span class="sp-pri" data-priority="${esc(t.priority)}">${esc(PRIORITY[t.priority] || t.priority || "")}</span></td><td data-l="Brand">${esc(t.requester_name || "")}</td>` : ""}
<td data-l="Store">${esc(t.store_name || "Account only")}</td><td data-l="Last activity">${time(t.last_activity_at)}</td></tr>`).join("");
  const body = data.error ? "" : tickets.length
    ? `<div class="sp-tablewrap"><table class="sp-table"><caption class="sp-sr">${admin ? "Support inbox" : "Your tickets"}, ${esc(STATUS[status] || "All")}, page ${page + 1}</caption><thead><tr><th scope="col">Ticket</th><th scope="col">Status</th>${admin ? '<th scope="col">Priority</th><th scope="col">Brand</th>' : ""}<th scope="col">Store</th><th scope="col">Last activity</th></tr></thead><tbody data-ticket-body>${rows}</tbody></table></div>
<nav class="sp-pager" aria-label="Pagination">${page > 0 ? `<a class="sp-btn" href="${esc(href(page - 1))}">Previous</a>` : "<span></span>"}<span>Page ${page + 1} of ${Math.max(1, Math.ceil(total / PAGE_SIZE))}, ${total.toLocaleString("en-IN")} ${total === 1 ? "ticket" : "tickets"}</span>${(page + 1) * PAGE_SIZE < total ? `<a class="sp-btn" href="${esc(href(page + 1))}">Next</a>` : "<span></span>"}</nav>`
    : `<section class="sp-empty"><h2>${filtered ? "No tickets match these filters." : admin ? "The inbox is clear." : "You have no tickets yet."}</h2><p>${filtered ? "Clear the filters to see every ticket." : admin ? "New tickets from brands will appear here." : "Ask us anything, with or without a store. Replies appear in this list."}</p>${filtered ? `<a class="sp-btn" href="${base}">Clear filters</a>` : admin ? "" : `<a class="sp-btn sp-primary" href="${base}/new">Start a ticket</a>`}</section>`;
  return `<header class="sp-head"><div><p class="sp-eyebrow">${admin ? "Operations" : "Help &amp; support"}</p><h1>${admin ? "Support inbox" : "My tickets"}</h1></div>${admin ? "" : `<a class="sp-btn sp-primary" href="${base}/new">New ticket</a>`}</header>
${alertBox(data.error, data.notice)}${data.error ? `<p><a class="sp-btn" href="${esc(href(page))}">Try again</a></p>` : ""}
<form class="sp-filters" method="get" action="${base}" role="search"><label class="sp-field"><span>Search</span><input type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="Subject or ticket number"></label>
<label class="sp-field"><span>Topic</span><select name="category"><option value="all">All topics</option>${list(data.categories).map((c) => `<option value="${esc(c.code)}"${c.code === category ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
<input type="hidden" name="status" value="${esc(status)}"><input type="hidden" name="page" value="0"><button class="sp-btn sp-primary" type="submit">Apply</button></form>
<nav class="sp-tabs" aria-label="Status filter">${tabs}</nav>${body}`;
}

function newView(data, base) {
  const stores = list(data.stores), cats = list(data.categories);
  const src = SOURCES[data.source] ? data.source : "account";
  return `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="${base}">My tickets</a><span aria-hidden="true">/</span><span>New ticket</span></nav>
<header class="sp-head"><div><p class="sp-eyebrow">Help &amp; support</p><h1>New ticket</h1><p class="sp-sub">You do not need a store to ask for help. Never include passwords, API secrets or card details.</p></div></header>
${alertBox(data.error, data.notice)}
<form class="sp-form" data-new-form novalidate data-source="${esc(src)}">
<label class="sp-field"><span>Topic</span><select name="category_code" required aria-describedby="e-category_code"><option value="">Choose a topic</option>${cats.map((c) => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join("")}</select><small class="sp-err" id="e-category_code" data-error="category_code" hidden></small></label>
<label class="sp-field"><span>Related store <em>(optional)</em></span><select name="store_id" aria-describedby="h-store"><option value="">No store, account question</option>${stores.map((s) => `<option value="${esc(s.store_id)}"${String(data.store_id || "") === String(s.store_id) ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select><small id="h-store">Choosing a store makes the ticket visible to that store's authorised team. Leave empty to keep it private to you.</small><small class="sp-err" data-error="store_id" hidden></small></label>
<label class="sp-field"><span>Subject</span><input name="subject" required minlength="5" maxlength="160" autocomplete="off" aria-describedby="e-subject"><small class="sp-err" id="e-subject" data-error="subject" hidden></small></label>
<label class="sp-field"><span>What is happening?</span><textarea name="body" required rows="8" maxlength="20000" aria-describedby="e-body"></textarea><small class="sp-err" id="e-body" data-error="body" hidden></small></label>
<details class="sp-context"><summary>Context sent with this ticket</summary><dl data-context-list></dl><p class="sp-sub">Only the page path, theme, section or provider name. Never query strings, secrets or settings.</p></details>
<div class="sp-actions"><button class="sp-btn sp-primary" type="submit" data-submit>Send ticket</button><a class="sp-btn" href="${base}">Cancel</a></div></form>
<noscript><p class="sp-alert">JavaScript is required to send a ticket.</p></noscript>`;
}

function msgHtml(m, admin) {
  const internal = m.visibility === "internal";
  const mine = admin ? m.author_role === "platform_admin" : m.author_role === "brand";
  return `<li class="sp-msg" data-role="${esc(m.author_role)}" data-visibility="${esc(m.visibility)}"${mine ? " data-mine" : ""}><div class="sp-msg-head"><strong>${esc(m.author_name || "Unknown")}</strong><span class="sp-badge">${m.author_role === "platform_admin" ? "LeBrands support" : "Brand"}</span>${internal ? '<span class="sp-badge sp-internal">Internal note, not sent to the brand</span>' : ""}${time(m.created_at)}</div><p class="sp-body">${esc(m.body)}</p></li>`;
}
function eventLabel(e) {
  if (e.event_type === "status_changed") return `Status changed${e.old_status ? ` from ${STATUS[e.old_status] || e.old_status}` : ""} to ${STATUS[e.new_status] || e.new_status || "unknown"}`;
  return ({ created: "Ticket created", assigned: "Assignment changed", priority_changed: "Priority changed", message_added: "Message added", participant_changed: "Participants changed", attachment_added: "Attachment added", redacted: "Message redacted" })[e.event_type] || String(e.event_type || "Event").replace(/_/g, " ");
}
const NOTE_TYPE = { ticket_created: "Ticket created email", ticket_closed: "Ticket closed email", ticket_reply: "Reply email" };
function notifLabel(n) {
  const d = n.delivery_status;
  const state = d ? String(d).replace(/_/g, " ") : n.state === "enqueued" ? "queued with the email service" : n.state === "cancelled" ? "cancelled" : "queued, not yet handed over";
  return `${NOTE_TYPE[n.notification_type] || "Email"} for ${n.audience === "admin" ? "support" : "the brand"}: ${state}`;
}

export function ticketPanels(t, admin) {
  const messages = list(t.messages), events = list(t.events), notes = list(t.notifications);
  return { thread: messages.map((m) => msgHtml(m, admin)).join(""), events: events.map((e) => `<li><span>${esc(eventLabel(e))}</span>${time(e.created_at)}</li>`).join(""), notes: notes.map((n) => `<li><span>${esc(notifLabel(n))}</span>${time(n.created_at)}</li>`).join("") };
}

function detailView(data, base) {
  const t = obj(data.ticket), admin = data.admin === true;
  const p = ticketPanels(t, admin);
  const closed = t.status === "closed";
  const wait = t.status === "pending" && t.waiting_on ? (admin ? ADMIN_WAITING : WAITING)[t.waiting_on] : "";
  const adminsOpts = `<option value="">Unassigned</option>${list(data.admins).map((a) => `<option value="${esc(a.user_id)}"${a.user_id === t.assigned_admin_user_id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}`;
  const assignee = list(data.admins).find((a) => a.user_id === t.assigned_admin_user_id);
  const opt = (map, cur) => Object.entries(map).map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
  const workflow = admin ? `<form class="sp-form sp-side" data-workflow-form data-admin="1" aria-label="Ticket workflow"><h2>Workflow</h2>
<label class="sp-field"><span>Assigned to</span><select name="assigned_admin_user_id">${adminsOpts}</select></label>
<label class="sp-field"><span>Priority</span><select name="priority">${opt(PRIORITY, t.priority)}</select></label>
<label class="sp-field"><span>Waiting on</span><select name="waiting_on"><option value=""${t.waiting_on ? "" : " selected"}>Nobody</option>${opt(ADMIN_WAITING, t.waiting_on)}</select></label>
<label class="sp-field"><span>Status</span><select name="status" data-status-select><option value=""${""}>Keep ${esc(STATUS[t.status] || "current")}</option>${t.status !== "pending" ? '<option value="pending">Pending</option>' : ""}${t.status !== "closed" ? '<option value="closed">Closed</option>' : ""}</select></label>
<label class="sp-field" data-resolution-field hidden><span>Public resolution, sent to the brand</span><textarea name="resolution" rows="4" maxlength="20000"></textarea><small>Only sent when the status is set to Closed. Your draft is kept otherwise.</small></label>
<small class="sp-err" data-error="workflow" hidden></small><button class="sp-btn sp-primary" type="submit" data-submit>Save changes</button></form>`
    : `<form class="sp-form sp-side" data-workflow-form aria-label="Resolve ticket"><h2>${closed ? "This ticket is closed" : "Is this resolved?"}</h2>
${closed ? '<p class="sp-sub">Need more help? Reopen it and we will pick it up again.</p><input type="hidden" name="status" value="pending"><button class="sp-btn sp-primary" type="submit" data-submit>Reopen ticket</button>'
    : '<label class="sp-field"><span>Resolution note</span><textarea name="resolution" rows="4" maxlength="20000" required placeholder="What fixed it?"></textarea></label><input type="hidden" name="status" value="closed"><button class="sp-btn" type="submit" data-submit>Close ticket</button>'}<small class="sp-err" data-error="workflow" hidden></small></form>`;
  const reply = `<form class="sp-form" data-reply-form aria-label="Reply"><label class="sp-field"><span>${admin ? "Reply or add a note" : closed ? "Reply to reopen this ticket" : "Reply"}</span><textarea name="body" rows="5" required maxlength="20000"></textarea></label>
${admin ? '<fieldset class="sp-radio"><legend class="sp-sr">Visibility</legend><label><input type="radio" name="visibility" value="public" checked> Public reply to the brand</label><label><input type="radio" name="visibility" value="internal"> Internal note, support only</label></fieldset>' : '<input type="hidden" name="visibility" value="public">'}
<small class="sp-err" data-error="body" hidden></small><div class="sp-actions"><button class="sp-btn sp-primary" type="submit" data-submit>Send</button></div></form>`;
  return `<nav class="sp-crumbs" aria-label="Breadcrumb"><a href="${base}">${admin ? "Support inbox" : "My tickets"}</a><span aria-hidden="true">/</span><span>${esc(ticketNo(t.ticket_number))}</span></nav>
<header class="sp-head"><div><p class="sp-eyebrow sp-mono">${esc(ticketNo(t.ticket_number))}</p><h1 data-subject>${esc(t.subject)}</h1></div><div data-status-chip>${chip(t.status)}</div></header>
${alertBox(data.error, data.notice)}<div class="sp-live" data-conflict></div>
<div class="sp-detail"><div class="sp-main"><ol class="sp-thread" data-thread aria-label="Conversation">${p.thread}</ol>${reply}</div>
<aside class="sp-aside"><dl class="sp-meta" data-meta>${metaHtml(t, admin, assignee, wait)}</dl>${workflow}
<section class="sp-box"><h2>Activity</h2><ol class="sp-events" data-events>${p.events || '<li class="sp-sub">No activity recorded.</li>'}</ol></section>
<section class="sp-box"><h2>Email status</h2><ol class="sp-events" data-notes>${p.notes || '<li class="sp-sub">No email activity recorded yet.</li>'}</ol></section></aside></div>`;
}
export function metaHtml(t, admin, assignee, wait) {
  const r = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  return r("Status", chip(t.status)) + (wait ? r("Waiting", esc(wait)) : "") + (admin ? r("Priority", esc(PRIORITY[t.priority] || t.priority || "")) + r("Brand", esc(t.requester_name || "")) + r("Assigned", esc(assignee?.name || (t.assigned_admin_user_id ? "Another admin" : "Unassigned"))) : "") + r("Store", esc(t.store_name || "Account only")) + r("Opened from", esc(SOURCES[t.source] || "Account")) + r("Created", time(t.created_at)) + r("Last activity", time(t.last_activity_at));
}

function errorView(data, base) {
  return `<section class="sp-empty sp-error"><h1>This page could not be shown</h1>${alertBox(data.error || "We could not load support right now.", data.notice)}<p>Nothing was changed.</p><div class="sp-actions"><a class="sp-btn sp-primary" href="">Try again</a><a class="sp-btn" href="${base}">Back to tickets</a></div></section>`;
}

export function renderSupport(view, data = {}, user = null, nonce = "") {
  const d = obj(data), admin = d.admin === true;
  const dash = !admin && d.dashboard && obj(d.dashboard.store).store_id ? d.dashboard : null;
  const base = admin ? "/admin/support" : dash && /^\/stores\/[^/?#]+\/support$/.test(String(d.base || "")) ? d.base : "/support";
  const v = ["list", "new", "detail", "error"].includes(view) ? view : "error";
  const inner = v === "list" ? listView(d, base) : v === "new" ? newView(d, base) : v === "detail" ? detailView(d, base) : errorView(d, base);
  const t = obj(d.ticket);
  const boot = { view: v, admin, apiRoot: admin ? "/api/admin/support" : "/api/support", base, source: SOURCES[d.source] ? d.source : "account", context: obj(d.context), storeId: d.store_id || null, filters: d.filters, page: d.page, ticket: v === "detail" ? t : undefined, admins: admin ? list(d.admins) : undefined };
  const title = v === "list" ? (admin ? "Support inbox" : "My tickets") : v === "new" ? "New ticket" : v === "detail" ? ticketNo(t.ticket_number) : "Support";
  const head = '<link rel="stylesheet" href="/assets/support.css" data-catalogue-confirm-style><script type="module" src="/assets/support.js"></script>';
  const bodyInner = `<div class="sp-root" data-support-root>${inner}<div class="sp-toast" role="status" aria-live="polite" data-sp-toast hidden></div><script type="application/json" id="support-data">${safeJson(boot)}</script></div>`;
  if (admin) return renderPlatformAdminFrame(title, bodyInner, d.adminUser || user, "support", head);
  if (dash) return documentPage("support", { store: obj(dash.store), role: dash.role || obj(dash.store).role }, user, bodyInner, head, { nonce, navigationFeedback: false });
  return layout({
    nonce,
    // Async replies and the leave guard own their feedback; a full-page
    // navigation spinner must not remain after a cancelled link or form save.
    navigationFeedback: false,
    title: `${title} | Help & support | LeBrands.Store`, description: "Help and support for your LeBrands.Store account.", canonical: `https://app.lebrands.store${base}`, noindex: true, extraHead: head,
    body: `${accountHeader(user)}<main class="wrap sp-wrap"><nav class="sp-top" aria-label="Support"><a href="/">Your stores</a><a href="/support"${v === "list" ? ' aria-current="page"' : ""}>My tickets</a><a href="/support/new"${v === "new" ? ' aria-current="page"' : ""}>New ticket</a></nav>${bodyInner}</main>${footer()}`,
  });
}
