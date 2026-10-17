import { PLATFORMS, COMPARISON_ROWS } from "../public/compare-data.js";
import { esc } from "../public/compare.js";


export const COMPARE_FAQ = [
  { q: "Are the prices verified?", a: "Each platform is marked verified or not verified with the date it was checked against its official source. Unknown values are shown as quote only, never as zero." },
  { q: "Are LeBrands.Store plans live?", a: "No. The plans are proposed and automated billing is not enabled. The proposed Free plan is 30 live days on your included address, without a custom domain. The timer is not shipped yet." },
  { q: "Which languages does Ann support?", a: "Ann's guided conversations support English, Hindi, Tamil, Marathi and Telugu. This does not translate your storefront, product content or partner dashboards." },
  { q: "Are product variants ready for checkout?", a: "Buying options, variant SKUs and quantities can be prepared in the shared product form in Ann and the dashboard. Variant checkout is not enabled yet, so products with buying options cannot currently be published." },
  { q: "Which costs are separate?", a: "Payment gateway charges, shipping, advertising, applicable taxes and partner services are separate. Check each provider's current terms and plan limits." },
];

function diffTable() {
  const ids = ["lebrands", "shopify", "zoho", "shopdeck", "dukaan"];
  const cls = (id) => (id === "lebrands" ? ' class="is-own"' : "");
  const head = PLATFORMS.map((p) => `<th scope="col"${cls(p.id)}>${esc(p.name)}${p.id === "lebrands" ? '<span class="c-tag">Our platform</span>' : ""}</th>`).join("");
  const row = (r) => `<tr><th scope="row">${esc(r.label)}</th>${ids.map(id => `<td${cls(id)}>${esc(r.cells[id])}</td>`).join("")}</tr>`;
  const groups = [];
  for (const r of COMPARISON_ROWS) {
    const last = groups[groups.length - 1];
    if (last && last.name === r.section) last.rows.push(r); else groups.push({ name: r.section, rows: [r] });
  }
  const body = groups.map((g) => `<tbody aria-label="${esc(g.name)}"><tr class="c-group"><th scope="rowgroup" colspan="6">${esc(g.name)}</th></tr>${g.rows.map(row).join("")}</tbody>`).join("");
  return `<div class="c-scroll" role="region" tabindex="0" aria-label="Platform differentiators, scrollable table"><table class="c-table c-diff"><caption class="c-sr">Main differentiators across five platforms</caption><thead><tr><th scope="col">Differentiator</th>${head}</tr></thead>${body}</table></div>
  <p class="c-foot">LeBrands.Store pricing and explicitly marked features are proposed. Not verified means unconfirmed, not unavailable.</p>`;
}

function sources() {
  return `<ul class="c-srcs">${PLATFORMS.map((p) => `<li><b>${esc(p.name)}</b>: ${p.id === "lebrands" ? "Proposed terms" : p.pricingVerified ? "Pricing verified" : "Pricing not verified"}${p.checkedOn ? `, checked ${esc(p.checkedOn)}` : ""}. ${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">Official source<span class="c-sr"> for ${esc(p.name)} (opens in a new tab)</span></a>` : ""}${(p.additionalSources || []).map((s) => ` <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}<span class="c-sr"> (opens in a new tab)</span></a>`).join("")}</li>`).join("")}</ul>`;
}

export function compareMain() {
  return `<main class="m-pr-main" id="top-compare">
  <section class="m-pr-hero" aria-labelledby="compare-title"><div class="m-pr-wrap">
    <p class="m-kicker">Compare platforms</p>
    <h1 id="compare-title">Compare five store builders for India</h1>
    <p class="m-pr-lede">LeBrands.Store plans are proposed. Competitor prices are a dated snapshot from official sources.</p>
  </div></section>

  <section class="c-sec" id="differentiators" aria-labelledby="diff-title"><div class="m-pr-wrap">
    <header class="m-pr-head"><h2 id="diff-title">Main differentiators</h2></header>
    ${diffTable()}
  </div></section>

  <section class="c-sec" id="method" aria-labelledby="faq-title"><div class="m-pr-wrap">
    <header class="m-pr-head"><h2 id="faq-title">FAQ and sources</h2></header>
    <div class="m-faq-list">${COMPARE_FAQ.map((f) => `<details class="m-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
    <details class="m-faq-item c-method"><summary>Methodology and sources</summary>
      ${sources()}
      <p>Published by LeBrands.Store, so this is our guide, not an independent review. Not verified means a comparable feature was not confirmed, not that it is unavailable. Check each vendor's current terms, limits and add-ons. LeBrands.Store is not affiliated with the others. <a href="/contact">Spotted an error? Tell us.</a></p>
    </details>
  </div></section>

  <section class="m-pr-close" aria-labelledby="cc-title"><div class="m-pr-wrap m-pr-close-in">
    <h2 id="cc-title">See the proposed plans.</h2>
    <div class="c-actions"><a class="m-pr-btn" href="/pricing">LeBrands.Store pricing</a><a class="m-pr-btn c-rose" href="https://app.lebrands.store/signup">Open your store</a></div>
  </div></section>
</main>`;
}
