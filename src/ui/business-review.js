import { escapeHtml as esc, layout, accountHeader, footer } from "./layout.js";

const BASE = "/admin/business-reviews";
const STATUS = { pending_review: "Pending review", changes_requested: "Changes requested", approved: "Approved", all: "All" };
const TABS = ["pending_review", "changes_requested", "approved", "all"];
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const label = (s) => STATUS[s] || String(s || "Unknown").replace(/_/g, " ");
const when = (v) => {
  if (!v) return "Not recorded";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
};
const size = (n) => {
  n = Number(n);
  if (!Number.isFinite(n) || n < 0) return "Size unknown";
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
};
const pill = (s) => `<span class="br-pill" data-status="${esc(s || "unknown")}">${esc(label(s))}</span>`;
const SCAN = { clean: "Clean", pending: "Scan pending", infected: "Malware found", failed: "Scan failed", error: "Scan failed" };
const scanLabel = (s) => SCAN[s] || String(s || "Not scanned").replace(/_/g, " ");

function docHref(storeId, url) {
  const prefix = `${BASE}/${encodeURIComponent(storeId)}/documents/`;
  const u = String(url || "");
  return u.startsWith(prefix) && /^[A-Za-z0-9._~-]+$/.test(u.slice(prefix.length)) ? u : "";
}

function notice(msg, retryHref) {
  const stale = /stale|changed|revision|latest|reload/i.test(msg);
  return `<div class="br-alert" role="alert"><strong>${esc(msg)}</strong>${stale ? `<p>This submission changed after you opened it. Reload the page and examine the latest version before deciding.</p>` : ""}${retryHref ? `<a class="br-link" href="${esc(retryHref)}">Reload</a>` : ""}</div>`;
}

function shell(title, inner, user) {
  return layout({
    title: `${title} | LeBrands.Store`,
    description: "Platform review of private business registration evidence.",
    canonical: `https://app.lebrands.store${BASE}`,
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/business-review.css">',
    body: `<a class="br-skip" href="#br-main">Skip to content</a>${accountHeader(user)}<main id="br-main" class="wrap br-main">${inner}</main>${footer()}`,
  });
}

function queue(data, user) {
  const status = TABS.includes(data.status) ? data.status : "pending_review";
  const rows = list(data.rows);
  const page = Math.max(0, parseInt(data.page, 10) || 0);
  const href = (st, p) => `${BASE}?status=${encodeURIComponent(st)}&page=${p}`;
  const tabs = TABS.map((t) => `<a class="br-tab" href="${esc(href(t, 0))}" ${t === status ? 'aria-current="page"' : ""}>${esc(label(t))}</a>`).join("");
  let body;
  if (data.error) body = notice(String(data.error), href(status, page));
  else if (!rows.length) body = `<section class="br-empty"><h2>${status === "pending_review" ? "Nothing is waiting for review." : "No submissions in this view."}</h2><p>Submissions appear here when a store owner sends registration evidence. Try another filter to see other states.</p></section>`;
  else body = `<div class="br-table-wrap"><table class="br-table"><caption class="br-sr">Business registration submissions, ${esc(label(status))}</caption><thead><tr><th scope="col">Store</th><th scope="col">Legal name</th><th scope="col">Country</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col">Submitted</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row"><a class="br-link" href="${BASE}/${encodeURIComponent(r.store_id || "")}">${esc(r.store_name || "Unnamed store")}</a></th><td data-l="Legal name">${esc(r.legal_name || "Not provided")}</td><td data-l="Country">${esc(r.country_code || "n/a")}</td><td data-l="Status">${pill(r.status)}</td><td data-l="Version">v${esc(r.submission_version ?? "0")} / rev ${esc(r.revision ?? "0")}</td><td data-l="Submitted">${esc(when(r.submitted_at))}</td></tr>`).join("")}</tbody></table></div>
    <nav class="br-pager" aria-label="Pagination">${page > 0 ? `<a class="br-btn br-btn-outline" href="${esc(href(status, page - 1))}">Previous</a>` : '<span></span>'}<span>Page ${page + 1}</span>${data.has_more ? `<a class="br-btn br-btn-outline" href="${esc(href(status, page + 1))}">Next</a>` : '<span></span>'}</nav>`;
  return shell("Business reviews", `<nav class="br-crumbs" aria-label="Breadcrumb"><a href="/account">Account</a><span aria-hidden="true">/</span><span>Business reviews</span></nav>
    <header class="br-head"><p class="br-eyebrow">Platform review workspace</p><h1>Business reviews</h1><p>Private registration evidence for platform reviewers${user?.name ? `. Signed in as ${esc(user.name)}` : ""}. Brand administrators cannot see this area.</p></header>
    <nav class="br-tabs" aria-label="Filter by status">${tabs}</nav>${body}`, user);
}

function kv(k, v) { return `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`; }

function snapshot(sub) {
  const s = obj(sub);
  const keys = Object.keys(s);
  if (!keys.length) return "";
  return `<dl class="br-snap">${keys.map((k) => kv(k.replace(/_/g, " "), esc(typeof s[k] === "object" && s[k] !== null ? JSON.stringify(s[k]) : s[k] ?? "Not recorded"))).join("")}</dl>`;
}

function detail(data, user) {
  const store = obj(data.store), v = obj(data.verification), form = obj(data.form);
  const sid = String(store.store_id || v.store_id || "");
  const docs = list(data.documents), events = list(data.events);
  const actionable = v.status === "pending_review" || v.status === "changes_requested";
  const decision = form.decision === "approved" || form.decision === "changes_requested" ? form.decision : "";
  const cur = Number(v.submission_version);
  const docRows = docs.length ? `<ul class="br-docs">${docs.map((d) => {
    const href = docHref(sid, d.download_url);
    const old = Number(d.submission_version) !== cur;
    return `<li><div><strong>${esc(d.filename || "Unnamed file")}</strong><small>${esc(d.document_type || "Document")} / ${esc(d.mime || "unknown type")} / ${esc(size(d.size_bytes))}</small><small>Submission v${esc(d.submission_version ?? "0")}${old ? " (earlier version)" : ""} / uploaded ${esc(when(d.uploaded_at))}</small></div><span class="br-scan" data-scan="${esc(d.scan_status || "unknown")}">Malware screening: ${esc(scanLabel(d.scan_status))}</span>${href ? `<a class="br-btn br-btn-outline" href="${esc(href)}" download>Download attachment<span class="br-sr"> ${esc(d.filename || "")}</span></a>` : `<span class="br-muted">Download unavailable</span>`}</li>`;
  }).join("")}</ul><p class="br-muted">Files download as attachments. They are never previewed in this page.</p>` : `<p class="br-muted">No documents were uploaded with this registration.</p>`;
  const hist = events.length ? `<ol class="br-history">${events.map((e) => `<li><div class="br-ev-head"><strong>${esc(String(e.event_type || "event").replace(/_/g, " "))}</strong><span>v${esc(e.submission_version ?? "0")} / ${esc(e.actor_name || "System")} / ${esc(when(e.created_at))}</span></div>${e.submission ? `<details><summary>Submission as recorded</summary>${snapshot(e.submission)}</details>` : ""}</li>`).join("")}</ol><p class="br-muted">History is immutable. Entries cannot be edited or removed.</p>` : `<p class="br-muted">No history has been recorded yet.</p>`;
  const act = actionable ? `<form class="br-form" method="post" action="${BASE}/${encodeURIComponent(sid)}">
    <input type="hidden" name="expected_revision" value="${esc(parseInt(v.revision, 10) || 0)}">
    <fieldset><legend>Decision</legend>
      <label class="br-radio"><input type="radio" name="decision" value="approved" required ${decision === "approved" ? "checked" : ""}><span><strong>Approve business details</strong><small>Records manual approval only. The store is not published.</small></span></label>
      <label class="br-radio"><input type="radio" name="decision" value="changes_requested" ${decision === "changes_requested" ? "checked" : ""}><span><strong>Request changes</strong><small>The owner sees your note and can resubmit.</small></span></label>
    </fieldset>
    <label class="br-field" for="br-note"><span>Reviewer note</span><textarea id="br-note" name="note" rows="5" minlength="10" maxlength="1000" required aria-describedby="br-note-help">${esc(form.note || "")}</textarea><small id="br-note-help">10 to 1000 characters. Required for either outcome and shared with the brand.</small></label>
    <label class="br-check"><input type="checkbox" name="manual_review" value="1" required><span>I examined the current submission and its supporting documents myself.</span></label>
    <button class="br-btn" type="submit">Record decision</button></form>` : `<p class="br-readonly" role="status">${v.status === "approved" ? "This submission is approved and read only in this phase." : "No decision can be recorded for this status."}</p>`;
  const err = data.error ? notice(String(data.error), `${BASE}/${encodeURIComponent(sid)}`) +
    (!actionable&&form.note?`<div class="br-alert"><strong>Your unsaved note</strong><p class="br-prose">${esc(form.note)}</p></div>`:"") : "";
  return shell(`${store.name || "Submission"} review`, `<nav class="br-crumbs" aria-label="Breadcrumb"><a href="/account">Account</a><span aria-hidden="true">/</span><a href="${BASE}">Business reviews</a><span aria-hidden="true">/</span><span>${esc(store.name || "Store")}</span></nav>
    <header class="br-head"><p class="br-eyebrow">Submission v${esc(v.submission_version ?? "0")} / revision ${esc(v.revision ?? "0")}</p><h1>${esc(store.name || "Unnamed store")}</h1><p>${pill(v.status)} Store status: ${esc(label(store.status))}</p></header>${err}
    <section class="br-scope" aria-label="What this review covers"><h2>What this decision covers</h2><dl>${kv("Malware screening", "Automated per file. Shown beside each document.")}${kv("Manual business approval", "Your decision below.")}${kv("GST verification", "A separate check. Not changed here.")}${kv("Publication", "Separate. Approval does not publish, reactivate a store or change invoice status.")}</dl></section>
    <div class="br-grid"><div>
      <section class="br-card"><h2>Registration details</h2><dl class="br-facts">${kv("Legal name", esc(v.legal_name || "Not provided"))}${kv("Country", esc(v.country_code || "n/a"))}${kv("Registration type", esc(v.registration_type || "Not provided"))}${kv("Registration number", `<code>${esc(v.registration_number || "Not provided")}</code>`)}${kv("Submitted", esc(when(v.submitted_at)))}${kv("Reviewed", esc(when(v.reviewed_at)))}${kv("Reviewed by", esc(v.reviewed_by || "Not reviewed"))}</dl>
      <h3>Owner explanation</h3><p class="br-prose">${esc(v.explanation || "No explanation supplied.")}</p>
      <h3>Latest reviewer feedback</h3><p class="br-prose">${esc(v.feedback || "No feedback recorded.")}</p></section>
      <section class="br-card"><h2>Documents</h2><p class="br-muted">Most recent 100 files, including previous submissions.</p>${docRows}</section>
      <section class="br-card"><h2>Submission and review history</h2><p class="br-muted">Most recent 100 events. All earlier records remain retained.</p>${hist}</section>
    </div><aside class="br-card br-aside"><h2>Manual review</h2>${act}<a class="br-link" href="${BASE}">Back to queue</a></aside></div>`, user);
}

export function renderBusinessReview(view, data, user) {
  const d = obj(data);
  return view === "detail" ? detail(d, user) : queue(d, user);
}
