import { escapeHtml, layout, accountHeader, footer } from "./layout.js";
import {renderBillingTest} from "./billing-test.js";

const esc = escapeHtml;
const obj = (v) => (v && typeof v === "object" ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const safeJson = (v) => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const num = (n) => new Intl.NumberFormat("en-IN").format(n);
const when = (v) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " IST";
};
const human = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const money = (minor, currency, exp = 2) => {
  const n = minor===null||minor===undefined?NaN:Number(minor);
  if (!Number.isFinite(n)) return "Not recorded";
  const e = Number.isInteger(exp) ? exp : 2;
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: e, maximumFractionDigits: e }).format(n / 10 ** e); }
  catch { return `${(n / 10 ** e).toFixed(e)} ${esc(currency || "")}`; }
};
const LABELS = {
  published_products: "Published products", published_skus: "Published SKUs", lebrands_space_placement: "LeBrands.Space placement",
  custom_domain: "Custom domain", live_days: "Live days",
};
const label = (k) => LABELS[k] || human(k);
const link = (href, text, kind = "") => `<a class="pb-btn${kind ? ` pb-btn-${kind}` : ""}" href="${esc(href)}">${esc(text)}</a>`;
const reloadBtn = (text = "Refresh plan details") => `<button type="button" class="pb-btn pb-btn-quiet" data-billing-reload>${esc(text)}</button>`;

function entRows(ents) {
  const keys = Object.keys(obj(ents));
  if (!keys.length) return `<p class="pb-muted">No entitlement details were returned for this plan.</p>`;
  return `<ul class="pb-ents">${keys.map((k) => {
    const e = obj(ents[k]);
    const on = e.included === true;
    const hasVal = e.value !== null && e.value !== undefined && e.value !== "";
    const text = !on ? "Not included" : hasVal ? (Number.isFinite(Number(e.value)) && typeof e.value !== "boolean" ? `Up to ${num(Number(e.value))}` : e.value === true ? "Included" : esc(String(e.value))) : "Included";
    return `<li data-on="${on ? "yes" : "no"}"><span class="pb-mark" aria-hidden="true">${on ? "+" : "-"}</span><span><span class="pb-sr">${on ? "Included: " : "Not included: "}</span><strong>${esc(label(k))}</strong><em>${on ? text : "Not included"}</em></span></li>`;
  }).join("")}</ul>`;
}

function remaining(sub) {
  const s = Number(sub.remaining_live_seconds);
  if (!Number.isFinite(s)) return "";
  if (s <= 0) return "No live time remaining";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return d ? `${num(d)} day${d === 1 ? "" : "s"}, ${h} hour${h === 1 ? "" : "s"} remaining` : `${h} hour${h === 1 ? "" : "s"} remaining`;
}

function dates(sub) {
  const rows = [["Plan accepted", sub.accepted_at], ["First successful publication", sub.free_live_started_at], ["Free live period ends", sub.free_expires_at]];
  const out = rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${v ? esc(when(v)) : "Not started yet"}</dd></div>`);
  const rem = remaining(sub);
  if (sub.free_live_started_at && rem) out.push(`<div><dt>Live time left</dt><dd>${esc(rem)}</dd></div>`);
  if (sub.terms_version) out.push(`<div><dt>Terms version</dt><dd>${esc(sub.terms_version)}</dd></div>`);
  if (sub.country_code) out.push(`<div><dt>Billing country</dt><dd>${esc(sub.country_code)}</dd></div>`);
  if (sub.mode) out.push(`<div><dt>Mode</dt><dd>${esc(human(sub.mode))}</dd></div>`);
  return `<dl class="pb-dl">${out.join("")}</dl>`;
}

function subscriptionCard(sub, id, access) {
  const st = sub.effective_status || sub.status || "unknown";
  const plan = human(sub.plan);
  let note = "";
  if (st === "building") note = "Your 30 live days have not started. They begin at your first successful publication, so you can prepare your store first.";
  else if (st === "expired") note = "The Free live period has ended. Your orders and data are kept. Paid plans cannot be bought online yet, so contact the team to continue.";
  else if (sub.plan==="free"&&["trialing","live","active"].includes(st)) note = "Your Free live period is running. Nothing is charged and nothing renews automatically.";
  else note = "This is the status recorded for your plan.";
  const recorded = sub.status && sub.status !== st ? `<p class="pb-muted">Recorded status: ${esc(human(sub.status))}.</p>` : "";
  const actions = st === "expired"
    ? `<a class="pb-btn" href="mailto:support@lebrands.store?subject=${encodeURIComponent("Continue my store after the Free plan")}">Contact the team</a>${reloadBtn()}`
    : `${link(`/stores/${encodeURIComponent(id)}/build/ann`, "Continue in Ann")}${reloadBtn()}`;
  return `<section class="pb-card pb-current" aria-labelledby="pb-current-title" data-state="${esc(st)}">
    <div class="pb-card-head"><div><p class="pb-kicker">Current plan</p><h2 id="pb-current-title">${esc(plan)}</h2></div><span class="pb-badge" data-s="${esc(st)}">${esc(human(st))}</span></div>
    <p>${esc(note)}</p>${recorded}
    ${dates(sub)}
    <div class="pb-actions">${actions}</div></section>`;
}

const REASONS = {
  legacy_transition_required: ["Existing store transition needed", "This store was published before plans began. Its live service is unchanged and its Free period has not been started or restarted. It cannot join a plan until the existing-store transition is arranged with the team.", "contact"],
  unsupported_country: ["Free plan not offered in this country", "The Free plan is not offered for this store's business country yet. Your store and data are unchanged.", "contact"],
  country_required: ["Business country needed", "Confirm the business country in Ann first. The Free plan and pricing depend on it.", "ann-business"],
  offer_unavailable: ["Free plan offer unavailable", "The Free plan offer is not available right now. Nothing was changed. Refresh to check again.", "reload"],
  already_enrolled: ["A plan already exists", "This store has already enrolled. Choosing Free again will not create another trial or reset its dates.", "reload"],
};

function noSubscription(state, access, id) {
  const eid = encodeURIComponent(id);
  const reason = state.reason || "";
  const contact = `<a class="pb-btn pb-btn-quiet" href="mailto:support@lebrands.store?subject=${encodeURIComponent("Plan question for my store")}">Contact the team</a>`;
  if (state.can_enrol && reason === "available") {
    const o = obj(state.offer);
    const live = Number.isFinite(o.live_days) ? o.live_days : 30;
    const primary = access.enforced === true
      ? link(`/stores/${eid}/build/ann`, "Choose Free in Ann")
      : `<button type="button" class="pb-btn" data-billing-choose-free>Review and choose Free</button>`;
    return `<section class="pb-card pb-current" aria-labelledby="pb-current-title" data-state="none">
      <div class="pb-card-head"><div><p class="pb-kicker">Current plan</p><h2 id="pb-current-title">No plan chosen yet</h2></div><span class="pb-badge" data-s="none">Not started</span></div>
      <p>Free is available for this store: ${num(live)} live days at no cost, counted from your first successful publication. No card is needed.${access.enforced === true ? " Ann will ask you to choose it right after you name your store." : " Nothing starts until you review the terms and accept."}</p>
      <div class="pb-actions">${primary}${reloadBtn()}</div></section>`;
  }
  const r = REASONS[reason];
  const [title, copy, kind] = r || ["Plan cannot be started", "The Free plan cannot be started for this store right now. Nothing was changed.", "reload"];
  const act = kind === "ann-business" ? link(`/stores/${eid}/build/ann?business=1`, "Confirm country in Ann") : kind === "contact" ? contact : "";
  return `<section class="pb-card pb-current" aria-labelledby="pb-current-title" data-state="${esc(reason || "none")}">
    <div class="pb-card-head"><div><p class="pb-kicker">Current plan</p><h2 id="pb-current-title">${esc(title)}</h2></div><span class="pb-badge" data-s="blocked">No plan</span></div>
    <p>${esc(copy)}</p>
    ${reason === "legacy_transition_required" ? `<p class="pb-muted">Your store keeps running as it does today. We will not start or restart a trial for it.</p>` : ""}
    <div class="pb-actions">${act}${kind !== "contact" ? "" : ""}${reloadBtn()}</div></section>`;
}

function offerCard(state) {
  const o = obj(state.offer);
  if (!state.offer) return "";
  return `<section class="pb-card" aria-labelledby="pb-offer-title"><div class="pb-card-head"><div><p class="pb-kicker">Free plan terms</p><h2 id="pb-offer-title">What Free would include</h2></div><span class="pb-price"><strong>${esc(money(o.amount_minor, o.currency))}</strong><small>for ${esc(num(o.live_days ?? 30))} live days</small></span></div>
    ${entRows(o.entitlements)}<p class="pb-muted">Terms version ${esc(o.terms_version || "not recorded")}. This is an offer, not an active plan.</p></section>`;
}

function usageCard() {
  return `<section class="pb-card" aria-labelledby="pb-usage-title"><h2 id="pb-usage-title">Usage</h2>
    <p>Usage against these limits is not shown here yet, and limits are not enforced from this page. We do not show a count we cannot confirm.</p></section>`;
}

function priceText(p) {
  const exp = Number.isInteger(p.currency_exponent) ? p.currency_exponent : 2;
  const amt = p.amount_minor!==null&&p.amount_minor!==undefined&&Number.isFinite(Number(p.amount_minor)) ? money(p.amount_minor, p.currency, exp) : p.price_kind==="accepted_quote_required"?"Quotation required":"Price to be confirmed";
  const per = p.billing_interval === "year" || p.billing_interval === "annual" || p.billing_interval === "yearly" ? "a year" : p.billing_interval === "month" || p.billing_interval === "monthly" ? "a month" : p.billing_interval ? esc(p.billing_interval) : "";
  const from = p.advertised_from_minor!==null&&p.advertised_from_minor!==undefined&&Number.isFinite(Number(p.advertised_from_minor)) && p.advertised_from_minor !== p.amount_minor ? ` <small>From ${esc(money(p.advertised_from_minor, p.currency, exp))}</small>` : "";
  return `${esc(amt)}${per ? ` <small>${per}</small>` : ""}${p.tax_inclusive === true ? " <small>incl. tax</small>" : p.tax_inclusive === false ? " <small>excl. tax</small>" : ""}${from}`;
}

function catalogue(cat, requestedPlan, requestedInterval) {
  const plans = list(cat).filter((p) => p && p.code !== "free");
  const req = requestedPlan && requestedPlan !== "free"
    ? `<p class="pb-callout" role="status">You asked about the ${esc(human(requestedPlan))} plan${requestedInterval ? `, billed ${esc(requestedInterval)}` : ""}. It is shown below for reference only. It has not been activated, and nothing was purchased or charged.</p>` : "";
  const body = plans.length ? `<div class="pb-plans">${plans.map((p) => {
    const asked = requestedPlan && p.code === requestedPlan;
    const prices = list(p.prices);
    return `<article class="pb-plan${asked ? " is-asked" : ""}"><h3>${esc(p.name || human(p.code))}${asked ? ' <span class="pb-tag">You asked about this</span>' : ""}</h3>
      <p class="pb-state">${esc(human(p.offer_state || "proposal"))}${p.contract_required ? ", contract required" : ""}</p>
      ${prices.length ? `<ul class="pb-prices">${prices.map((x) => `<li${requestedInterval && x.billing_interval === requestedInterval ? ' class="is-asked"' : ""}><span>${esc(human(x.billing_interval || x.price_kind))}</span><b>${priceText(x)}</b></li>`).join("")}</ul>` : `<p class="pb-muted">No price is listed for this store's country.</p>`}
      ${list(p.features).length ? `<ul class="pb-feats">${list(p.features).map((f) => `<li data-on="${f.included ? "yes" : "no"}"><span class="pb-sr">${f.included ? "Included: " : "Not included: "}</span>${esc(f.name || label(f.key))}${f.value !== null && f.value !== undefined && f.included ? `: ${esc(String(f.value))}` : ""}${f.availability ? ` <small>(${esc(human(f.availability))})</small>` : ""}</li>`).join("")}</ul>` : ""}
    </article>`;
  }).join("")}</div>` : `<p class="pb-muted">No paid plans are listed for this store's country.</p>`;
  return `<section class="pb-card" aria-labelledby="pb-cat-title"><div class="pb-card-head"><div><p class="pb-kicker">Proposal only</p><h2 id="pb-cat-title">Paid plans</h2></div></div>
    <p>These are proposed plans. Paid checkout is not available, so there is nothing to buy, cancel or renew here. Feature readiness is shown as provided.</p>${req}${body}
    <p class="pb-muted">The first paid collection is planned as a one-time payment with manual renewal. There is no recurring payment and no automatic debit.</p></section>`;
}

function history(payments, invoices, sub) {
  const pays = list(payments), invs = list(invoices);
  const isFree = !sub || sub.plan === "free";
  const payBody = pays.length ? `<div class="pb-scroll" role="region" tabindex="0" aria-label="Payment history, scrollable"><table class="pb-table"><thead><tr><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Mode</th></tr></thead><tbody>${pays.map((p) => `<tr><td>${esc(when(p.captured_at))}</td><td>${esc(money(p.amount_minor, p.currency))}</td><td>${esc(human(p.status))}</td><td>${esc(human(p.mode))}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="pb-empty">No payments recorded.${isFree ? " The Free plan has no charge, so none is expected." : ""}</p>`;
  const invBody = invs.length ? `<div class="pb-scroll" role="region" tabindex="0" aria-label="Tax invoices, scrollable"><table class="pb-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Issued</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Mode</th></tr></thead><tbody>${invs.map((i) => `<tr><td>${esc(i.invoice_number || "Not numbered")}</td><td>${esc(when(i.issued_at || i.created_at))}</td><td>${esc(money(i.total_minor, i.currency))}</td><td>${esc(human(i.status))}</td><td>${esc(human(i.mode))}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="pb-empty">No tax invoices issued.${isFree ? " A Free plan does not produce a payment or a tax invoice." : ""}</p>`;
  return `<div class="pb-two"><section class="pb-card" aria-labelledby="pb-pay-title"><h2 id="pb-pay-title">Payment history</h2>${payBody}</section><section class="pb-card" aria-labelledby="pb-inv-title"><h2 id="pb-inv-title">Tax invoices</h2>${invBody}</section></div>`;
}

export function renderPlanBillingContent(data) {
  const d = obj(data), store = obj(d.store), b = obj(d.billing), id = String(store.store_id || "");
  const eid = encodeURIComponent(id);
  const boot = { endpoint: `/api/stores/${eid}/subscription`, role: d.role || "owner", storeName: store.name || "", annUrl: `/stores/${eid}/build/ann` };
  const head = `<link rel="stylesheet" href="/assets/plan-billing.css"><link rel="stylesheet" href="/assets/ann-builder.css"><script type="module" src="/assets/plan-billing.js"></script>`;
  const title = `<div class="pb-heading"><div><p class="pb-kicker">Owner only</p><h1>Plan &amp; billing</h1><p>${esc(store.name || "Your store")}. Your plan, its limits and your payment records.</p></div></div>`;
  const tail = `<script type="application/json" id="plan-billing-data">${safeJson(boot)}</script>`;
  const status = `<div class="pb-sr" role="status" aria-live="polite" data-billing-status></div>`;
  if (b.error || !b.state) {
    return `<div class="pb-page" data-plan-billing>${head}${title}<section class="pb-card pb-error" role="alert"><h2>Plan details are unavailable</h2><p>${esc(b.error || "The plan service did not respond.")} Nothing was changed.</p><div class="pb-actions">${reloadBtn("Try again")}</div></section>${status}${tail}</div>`;
  }
  const st = obj(b.state), sub = st.subscription ? obj(st.subscription) : null, access = obj(b.access);
  const pending = store.status === "awaiting_approval" ? `<p class="pb-callout" role="status">This store is awaiting approval. Approval is separate from payment and from your plan.</p>` : "";
  const parts = [title, pending,'<p class="pb-callout">Choosing a plan does not verify your business or approve publication. Business-document approval is a separate step.</p>'];
  if (access.available === false) parts.push(`<p class="pb-callout" role="status">Plan gating is not available for this store yet, so plan limits are not applied.</p>`);
  if (sub) {
    parts.push(subscriptionCard(sub, id, access));
    parts.push(`<section class="pb-card" aria-labelledby="pb-ent-title"><h2 id="pb-ent-title">Limits and features</h2>${entRows(sub.entitlements)}</section>`);
    parts.push(usageCard());
  } else {
    parts.push(noSubscription(st, access, id));
    parts.push(offerCard(st));
  }
  parts.push(catalogue(b.catalogue, b.requestedPlan, b.requestedInterval));
  parts.push(renderBillingTest(b));
  parts.push(history(b.payments, b.invoices, sub));
  return `<div class="pb-page" data-plan-billing>${head}${parts.join("")}${status}${tail}</div>`;
}

export function renderPlanStorePicker({ stores, requestedPlan, requestedInterval } = {}, user) {
  const rows = list(stores);
  const asked = requestedPlan && requestedPlan !== "free"
    ? `<p class="pb-callout" role="status">You asked about the ${esc(human(requestedPlan))} plan${requestedInterval ? `, billed ${esc(requestedInterval)}` : ""}. Paid plans cannot be bought yet. You can read the details on your store's Plan &amp; billing page.</p>` : "";
  const items = rows.map((s) => `<li><a class="pb-store" href="${esc(s.href)}"><span class="pb-initial" aria-hidden="true">${esc(String(s.name || "S").trim().charAt(0).toUpperCase() || "S")}</span><span class="pb-store-copy"><strong>${esc(s.name || "Untitled store")}</strong><small>${s.subdomain ? `${esc(s.subdomain)}.lebrands.store` : "Address unavailable"} &middot; ${esc(human(s.status || "unknown"))}</small></span><span class="pb-go">Choose</span></a></li>`).join("");
  const main = rows.length
    ? `<ul class="pb-stores">${items}</ul>`
    : `<section class="pb-card"><h2>You have no store yet</h2><p>Create a store first, then come back to see its plan.</p><div class="pb-actions"><a class="pb-btn" href="/stores/new">Create a store</a></div></section>`;
  return layout({
    title: "Choose a store | LeBrands.Store",
    description: "Choose which of your stores to view plan details for.",
    canonical: "https://app.lebrands.store/plans",
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/plan-billing.css">',
    body: `${accountHeader(user)}<main class="wrap pb-picker"><p class="pb-kicker">Plans</p><h1>Which store is this for?</h1>
      <p class="pb-lede">Choosing a store only opens its plan page. No charges happen, and no plan is started or changed by this choice.</p>${asked}${main}
      <p class="pb-muted"><a class="inline-link" href="/">Back to your stores</a></p></main>${footer()}`,
  });
}
