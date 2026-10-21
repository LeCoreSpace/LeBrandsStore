import { escapeHtml as esc } from "./layout.js";

const obj = (v) => (v && typeof v === "object" ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const num = (n) => new Intl.NumberFormat("en-IN").format(n);
const human = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const labels = {
  published_products: "Published products", published_skus: "Published SKUs",
  public_media_bytes: "Media storage", additional_staff_seats: "Additional staff seats",
  monthly_order_soft_band: "Monthly order allowance", lebrands_space_placement: "LeBrands.Space placement",
  ann_and_theme_editor: "Ann and theme editor", branded_customisable_checkout: "Branded, customisable checkout",
  per_page_seo_metadata: "SEO titles and descriptions", transactional_emails: "Transactional emails",
  payment_partner_integration: "Payment partner integration", delivery_partner_integration: "Delivery partner integration",
  conversion_section_library: "Conversion sections", data_export: "Data export", custom_domain: "Custom domain",
};
const money = (minor, currency, exp = 2) => {
  const n = minor === null || minor === undefined ? NaN : Number(minor);
  if (!Number.isFinite(n)) return "";
  const e = Number.isInteger(exp) ? exp : 2;
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: e, maximumFractionDigits: e }).format(n / 10 ** e); }
  catch { return `${(n / 10 ** e).toFixed(e)} ${currency || ""}`; }
};
export const normInterval = (v) => {
  const s = String(v || "").toLowerCase();
  if (["year", "yearly", "annual", "annually"].includes(s)) return "year";
  if (["month", "monthly"].includes(s)) return "month";
  return "";
};
const bytes = (n) => n >= 1073741824 ? `${+(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${+(n / 1048576).toFixed(0)} MB` : `${num(n)} bytes`;
function featText(f) {
  const name = labels[f.key] || f.name || human(f.key);
  const v = f.value;
  if (f.included === false) return name;
  if (v === null || v === undefined || v === "" || v === true) return name;
  const n = Number(v);
  if (typeof v !== "boolean" && Number.isFinite(n)) {
    if (/byte|storage|size/i.test(String(f.key || "")) && n >= 1024) return `${name}: ${bytes(n)}`;
    return `${name}: up to ${num(n)}`;
  }
  return `${name}: ${String(v).replace(/_/g, " ")}`;
}
function featList(features) {
  const items = list(features).filter(Boolean);
  if (!items.length) return `<p class="pb-muted">Feature details are not listed yet.</p>`;
  return `<ul class="pb-feats">${items.map((f) => {
    const on = f.included !== false;
    return `<li data-on="${on ? "yes" : "no"}"><span class="pb-sr">${on ? "Included: " : "Not included: "}</span>${esc(featText(f))}</li>`;
  }).join("")}</ul>`;
}
function freeFeatures(ents) {
  const keys = Object.keys(obj(ents));
  const L = { published_products: "Published products", published_skus: "Published SKUs", lebrands_space_placement: "LeBrands.Space placement", custom_domain: "Custom domain", live_days: "Live days" };
  return featList(keys.map((k) => { const e = obj(ents[k]); return { key: k, name: L[k] || human(k), included: e.included === true, value: e.included === true ? e.value : null }; }));
}

export function renderPlanCards(billing, st, access, id, canFree) {
  const b = obj(billing), cat = list(b.catalogue).filter((p) => p && p.code !== "free");
  const tc = obj(b.testCheckout);
  const eid = encodeURIComponent(id);
  const reqPlan = b.requestedPlan || "", reqInt = normInterval(b.requestedInterval);
  const has = (i) => cat.some((p) => list(p.prices).some((x) => normInterval(x.billing_interval) === i));
  let initial = reqInt && has(reqInt) ? reqInt : has("month") ? "month" : has("year") ? "year" : "month";
  const sub = st && st.subscription;
  const offer = obj(st?.offer || (sub?.plan === "free" ? {
    amount_minor: 0, currency: sub.currency, live_days: sub.entitlements?.live_days?.value ?? 30,
    entitlements: sub.entitlements,
  } : null));

  // Free card
  let freeAction;
  if (sub) freeAction = `<button type="button" class="pb-btn pb-btn-quiet" disabled>${sub.plan === "free" ? "Current plan" : "Unavailable"}</button><p class="pb-reason">${sub.plan === "free" ? "Your existing Free dates are unchanged." : "Free is not available once a plan exists."}</p>`;
  else if (canFree) freeAction = access.enforced === true
    ? `<a class="pb-btn" href="/stores/${eid}/build/ann">Choose Free in Ann</a>`
    : `<button type="button" class="pb-btn" data-billing-choose-free>Choose Free</button>`;
  else freeAction = `<button type="button" class="pb-btn" disabled>Choose Free</button><p class="pb-reason">Free cannot be started for this store right now. See the status above.</p>`;
  const live = Number.isFinite(offer.live_days) ? offer.live_days : 30;
  const free = st?.offer || sub?.plan === "free" ? `<article class="pb-plan" data-plan="free"><h3>Free</h3>
    <p class="pb-state">${esc(money(offer.amount_minor, offer.currency) || "No charge")} for ${num(live)} live days from first publication</p>
    <div class="pb-price-line"><strong>${esc(money(offer.amount_minor, offer.currency) || "Free")}</strong></div>
    ${freeFeatures(offer.entitlements)}<div class="pb-plan-act">${freeAction}</div></article>` : "";

  const paid = cat.map((p) => {
    const asked = reqPlan && p.code === reqPlan;
    const name = p.name || human(p.code);
    const prices = list(p.prices);
    const quote = p.code === "flagship" || p.contract_required || (prices.length > 0 && prices.every((x) => x.price_kind !== "fixed"));
    let pricing, actions;
    if (quote) {
      const sub2 = encodeURIComponent(`${name} plan quote for my store`);
      pricing = `<div class="pb-price-line"><strong>Custom quote</strong><span>Quotation required</span></div>`;
      actions = `<div class="pb-plan-act"><a class="pb-btn pb-btn-quiet" href="mailto:support@lebrands.store?subject=${sub2}">Request a quote</a></div>`;
    } else {
      const panels = ["month", "year"].map((iv) => {
        const x = prices.find((q) => normInterval(q.billing_interval) === iv);
        const hide = iv === initial ? "" : " hidden";
        const panel = (html) => `<div class="pb-ipanel" data-plan-interval="${iv === "year" ? "annual" : "monthly"}"${hide}>${html}</div>`;
        if (!x) return {
          pricing: panel(`<div class="pb-price-line"><strong>Not offered</strong><span>No price is listed for this store's country.</span></div>`),
          actions: panel(`<div class="pb-plan-act"><button type="button" class="pb-btn" disabled>Choose ${esc(name)}</button><p class="pb-reason">No ${iv === "year" ? "yearly" : "monthly"} price is listed for this country.</p></div>`),
        };
        const exp = Number.isInteger(x.currency_exponent) ? x.currency_exponent : 2;
        const amt = money(x.amount_minor, x.currency, exp);
        const fixed = x.price_kind === "fixed" && amt && Number(x.amount_minor) > 0;
        const total = fixed ? `<strong>${esc(amt)}</strong><span>${iv === "year" ? "billed once for 12 months, paid upfront" : "for 1 month"}${x.tax_inclusive === true ? ", incl. tax" : x.tax_inclusive === false ? ", excl. tax" : ""}</span>` : `<strong>Price to be confirmed</strong>`;
        let reason = "";
        const testable = fixed && x.currency === "INR" && ["launch", "grow", "scale"].includes(p.code);
        if (!fixed) reason = "A fixed price is not listed yet.";
        else if (!testable) reason = "Test checkout is available in INR only.";
        else if (!tc.available) reason = "Test checkout is not configured.";
        else if (!tc.eligible) reason = "Approved Indian business documents are needed to test checkout. Accept Free in Ann first.";
        const btn = reason
          ? `<button type="button" class="pb-btn" disabled aria-describedby="r-${esc(p.code)}-${iv}">Choose ${esc(name)}</button><p class="pb-reason" id="r-${esc(p.code)}-${iv}">${esc(reason)}</p>`
          : `<button type="button" class="pb-btn" data-test-price="${esc(x.id)}" data-test-label="${esc(`${name}, ${x.billing_interval}`)}" data-test-amount="${esc(String(x.amount_minor))}">Choose ${esc(name)}</button><p class="pb-reason">Test payment only. No real money moves.</p>`;
        return {pricing: panel(`<div class="pb-price-line">${total}</div>`), actions: panel(`<div class="pb-plan-act">${btn}</div>`)};
      });
      pricing = panels.map((p) => p.pricing).join("");
      actions = panels.map((p) => p.actions).join("");
    }
    return `<article class="pb-plan${asked ? " is-asked" : ""}" data-plan="${esc(p.code)}"><h3>${esc(name)}${asked ? ' <span class="pb-tag">You asked about this</span>' : ""}</h3>
      <div>${pricing}</div>${featList(p.features)}<div>${actions}</div></article>`;
  }).join("");

  const toggle = cat.length ? `<div class="pb-toggle" role="group" aria-label="Billing interval">
    <button type="button" data-billing-interval="monthly" aria-pressed="${initial === "month"}">Monthly</button>
    <button type="button" data-billing-interval="annual" aria-pressed="${initial === "year"}">Yearly</button></div>
    <p class="pb-muted" data-pb-interval-note>Yearly plans are charged as one total upfront. Prices are totals for the selected interval.</p>` : "";
  const req = reqPlan && reqPlan !== "free" ? `<p class="pb-callout" role="status">You asked about the ${esc(human(reqPlan))} plan${reqInt ? `, billed ${reqInt === "year" ? "yearly" : "monthly"}` : ""}. It is highlighted below. Choosing it opens a payment simulation, not a purchase of paid service.</p>` : "";
  return `<section class="pb-card pb-cat" id="plans" aria-labelledby="pb-cat-title" data-pb-cat data-initial="${initial === "year" ? "annual" : "monthly"}">
    <div class="pb-card-head"><div><p class="pb-kicker">Plans</p><h2 id="pb-cat-title">Choose a plan</h2></div></div>
    ${toggle}${req}
    <div class="pb-plans">${free}${paid}</div>
    ${cat.length ? "" : `<p class="pb-muted">No paid plans are listed for this store's country.</p>`}
    <p class="pb-callout">Razorpay test mode only. No real money is charged, paid benefits are not activated, and there is no automatic renewal. Yearly amounts are simulated totals paid upfront. Tax is not assessed in this sandbox.</p>
    </section>`;
}
