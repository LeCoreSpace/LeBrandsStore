import { PLATFORMS, COMPARISON_ROWS } from "../public/compare-data.js";
import { DEFAULTS, esc, resultsHtml, referenceCostText, scenarioText } from "../public/compare.js";
import { estimateCosts } from "../public/compare-engine.js";


export const COMPARE_FAQ = [
  { q: "Are the prices verified?", a: "Each platform is marked verified or not verified with the date it was checked against its official source. Unknown values are shown as quote only, never as zero." },
  { q: "Are LeBrands.Store plans live?", a: "No. The plans are proposed and automated billing is not enabled. The proposed Free plan is 30 live days on your included address, without a custom domain. The timer is not shipped yet." },
  { q: "What does the calculator leave out?", a: "GST and other taxes, shipping, advertising, apps and themes, domain renewals and payment-method surcharges. It estimates subscription, platform fee and gateway fee only." },
  { q: "How are gateway and per-order fees treated?", a: "Gateway percent applies to the prepaid share. ShopDeck is charged on the delivered share. Dukaan orders are sales divided by average order value." },
];

const field = (name, label, value, hint, extra = "") => `<div class="c-field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${esc(value)}" ${extra}>${hint ? `<small>${hint}</small>` : ""}</div>`;

function diffTable() {
  const ids = ["lebrands", "shopify", "zoho", "shopdeck", "dukaan"];
  const cls = (id) => (id === "lebrands" ? ' class="is-own"' : "");
  const head = PLATFORMS.map((p) => `<th scope="col"${cls(p.id)}>${esc(p.name)}${p.id === "lebrands" ? '<span class="c-tag">Our platform</span>' : ""}</th>`).join("");
  const estimates = estimateCosts({ ...DEFAULTS, quotes: {} });
  const row = (r) => `<tr${r.type === "estimate" ? " data-estimate-row" : ""}><th scope="row">${esc(r.label)}</th>${ids.map((id) => r.type === "estimate"
    ? `<td${cls(id)} data-reference-cost="${id}">${esc(referenceCostText(estimates.find(x => x.id === id)))}</td>`
    : `<td${cls(id)}>${esc(r.cells[id])}</td>`).join("")}</tr>`;
  const groups = [];
  for (const r of COMPARISON_ROWS) {
    const last = groups[groups.length - 1];
    if (last && last.name === r.section) last.rows.push(r); else groups.push({ name: r.section, rows: [r] });
  }
  const body = groups.map((g) => `<tbody aria-label="${esc(g.name)}"><tr class="c-group"><th scope="rowgroup" colspan="6">${esc(g.name)}</th></tr>${g.rows.map(row).join("")}</tbody>`).join("");
  return `<div class="c-scroll" role="region" tabindex="0" aria-label="Platform differentiators, scrollable table"><table class="c-table c-diff"><caption class="c-sr">Main differentiators across five platforms</caption><thead><tr><th scope="col">Differentiator</th>${head}</tr></thead>${body}</table></div>
  <p class="c-foot" data-reference-scenario>${esc(scenarioText(DEFAULTS))}</p>
  <p class="c-foot" role="status" data-estimate-status></p>
  <p class="c-foot">LeBrands.Store pricing and explicitly marked features are proposed. Not verified means unconfirmed, not unavailable.</p>`;
}

function sources() {
  return `<ul class="c-srcs">${PLATFORMS.map((p) => `<li><b>${esc(p.name)}</b>: ${p.id === "lebrands" ? "Proposed terms" : p.pricingVerified ? "Pricing verified" : "Pricing not verified"}${p.checkedOn ? `, checked ${esc(p.checkedOn)}` : ""}. ${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">Official source<span class="c-sr"> for ${esc(p.name)} (opens in a new tab)</span></a>` : ""}${(p.additionalSources || []).map((s) => ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}<span class="c-sr"> (opens in a new tab)</span></a>`).join("")}</li>`).join("")}</ul>`;
}

export function compareMain() {
  return `<main class="c-main" id="top-compare">
  <section class="c-hero" aria-labelledby="compare-title"><div class="c-wrap">
    <h1 id="compare-title">Compare five store builders for India</h1>
    <p class="c-lede">LeBrands.Store plans are proposed. Competitor prices are a dated snapshot from official sources.</p>
  </div></section>

  <section class="c-sec" id="differentiators" aria-labelledby="diff-title"><div class="c-wrap">
    <h2 id="diff-title" class="c-h2">Main differentiators</h2>
    ${diffTable()}
  </div></section>

  <section class="c-sec c-alt" id="calculator" aria-labelledby="calc-title"><div class="c-wrap">
    <h2 id="calc-title" class="c-h2">Cost calculator</h2>
    <form class="c-calc" data-calc novalidate aria-describedby="calc-errors">
      <fieldset><legend>Your store</legend><div class="c-grid">
        ${field("sales", "Monthly sales (\u20B9)", DEFAULTS.sales, "")}
        ${field("aov", "Average order value (\u20B9)", DEFAULTS.aov, "")}
        ${field("prepaid", "Prepaid share (%)", DEFAULTS.prepaid, "")}
        ${field("gateway", "Gateway fee (%)", DEFAULTS.gateway, "")}
        ${field("delivered", "Delivered share (%)", DEFAULTS.delivered, "")}
      </div></fieldset>
      <fieldset class="c-bill"><legend>Billing</legend>
        <label><input type="radio" name="billing" value="annual" checked> Annual</label>
        <label><input type="radio" name="billing" value="monthly"> Monthly</label>
      </fieldset>
      <details class="c-note"><summary>Optional: custom Shopify or Zoho quote</summary>
        <p class="c-muted">Fill both fields of a platform to replace its published price.</p>
        <div class="c-grid">
          ${field("shopifyMonthly", "Shopify monthly (\u20B9)", "", "")}
          ${field("shopifyRate", "Shopify transaction rate (%)", "", "")}
          ${field("zohoMonthly", "Zoho Commerce monthly (\u20B9)", "", "")}
          ${field("zohoRate", "Zoho Commerce transaction rate (%)", "", "")}
        </div>
      </details>
      <div class="c-actions"><button class="m-pr-btn" type="submit">Recalculate</button><button class="c-link" type="reset" data-calc-reset>Reset to defaults</button></div>
      <p class="c-sr" role="status" aria-live="polite" data-status></p>
      <div id="calc-errors" class="c-errors" role="alert" data-errors hidden></div>
      <div class="c-results" data-results>${resultsHtml(estimateCosts({ ...DEFAULTS, quotes: {} }), DEFAULTS)}</div>
      <noscript><p class="c-muted">Estimates for the displayed defaults. Enable JavaScript to recalculate.</p></noscript>
      <p class="c-foot">Estimates only. Fees only, no tax, shipping, ads or apps.</p>
    </form>
  </div></section>

  <section class="c-sec" id="method" aria-labelledby="faq-title"><div class="c-wrap">
    <h2 id="faq-title" class="c-h2">FAQ and sources</h2>
    <div class="m-faq-list">${COMPARE_FAQ.map((f) => `<details class="m-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
    <details class="m-faq-item c-method"><summary>Methodology and sources</summary>
      ${sources()}
      <p>Published by LeBrands.Store, so this is our guide, not an independent review. Annual totals are divided by 12 with the upfront commitment shown separately. Check each vendor's current terms. LeBrands.Store is not affiliated with the others. <a href="/contact">Spotted an error? Tell us.</a></p>
    </details>
  </div></section>

  <section class="c-sec c-close" aria-labelledby="cc-title"><div class="c-wrap c-close-in">
    <h2 id="cc-title">See the proposed plans.</h2>
    <div class="c-actions"><a class="m-pr-btn" href="/pricing">LeBrands.Store pricing</a><a class="m-pr-btn c-rose" href="https://app.lebrands.store/signup">Open your store</a></div>
  </div></section>
</main>`;
}
