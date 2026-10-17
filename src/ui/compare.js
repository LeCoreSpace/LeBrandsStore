import { PLATFORMS } from "../public/compare-data.js";
import { DEFAULTS, QUIZ_DEFAULT, esc, inr, resultsHtml } from "../public/compare.js";
import { estimateCosts } from "../public/compare-engine.js";

export const COMPARE_FAQ = [
  { q: "Are the prices on this page verified?", a: "Each platform row says whether its pricing is verified and when it was checked against the official source. Where a figure is not verified it is shown as not verified, never as zero. Shopify and Zoho Commerce use their published Indian prices by default, and you can override them with your own quote." },
  { q: "Are LeBrands.Store plans live?", a: "No. The Launch, Grow, Scale and Flagship plans are proposed and automated billing is not enabled. The proposed Free plan gives 30 live days from first publication on your included address, without a custom domain. The timer and enforcement are not shipped yet." },
  { q: "What does the calculator leave out?", a: "GST and other taxes, shipping, advertising, apps and themes, domain renewals, payment-method surcharges and currency conversion. It estimates subscription, platform transaction fee and gateway fee only." },
  { q: "How are gateway fees treated?", a: "Your gateway percent is applied to the prepaid share of sales. Cash on Delivery orders carry no gateway fee in this estimate. Your real gateway contract may differ." },
  { q: "How does ShopDeck get calculated?", a: "On the delivered share of sales, because its fee basis is stated that way. Set the delivered percent to match your own delivery rate." },
  { q: "How is Dukaan's per-order fee estimated?", a: "Orders are approximated as monthly sales divided by average order value. A mixed basket size will move the real count." },
  { q: "Which languages does Ann speak?", a: "Ann holds the store-building conversation in English, Hindi, Tamil, Marathi and Telugu." },
  { q: "Can LeBrands.Store sell variants at checkout today?", a: "Variant checkout is draft only, so the quiz does not recommend LeBrands.Store when you need variant selling." },
  { q: "Why these five platforms?", a: "This is a focused shortlist of subscription-based store builders and a managed selling service relevant to Indian brands. It is not a ranking of the whole market." },
];

const field = (name, label, value, hint, extra = "") => `<div class="c-field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${esc(value)}" ${extra}>${hint ? `<small>${hint}</small>` : ""}</div>`;
const sel = (name, label, opts, val) => `<div class="c-field"><label for="q-${name}">${label}</label><select id="q-${name}" name="${name}">${opts.map(([v, t]) => `<option value="${v}"${v === val ? " selected" : ""}>${t}</option>`).join("")}</select></div>`;

function plans(p) {
  if (!p.plans || !p.plans.length) return '<p class="c-muted">No verified plan prices for India. A regional quote is needed.</p>';
  return `<div class="m-pr-scroll" role="region" tabindex="0" aria-label="${esc(p.name)} plans, scrollable table"><table class="m-pr-table"><caption class="c-sr">${esc(p.name)} plans</caption><thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th><th scope="col">Annual upfront</th><th scope="col">Rate</th></tr></thead><tbody>${p.plans.map((x) => `<tr><th scope="row">${esc(x.name)}</th><td class="m-pr-val">${x.from ? "From " : ""}${inr(x.monthly)}</td><td class="m-pr-val">${x.from ? "Custom quote" : inr(x.annual)}</td><td class="m-pr-val">${typeof x.rate === "number" ? `${x.rate}%` : "Not verified"}</td></tr>`).join("")}</tbody></table></div>`;
}

function ledger() {
  return PLATFORMS.map((p, i) => `<article class="c-plat${p.id === "lebrands" ? " is-own" : ""}" aria-labelledby="pl-${esc(p.id)}">
  <div class="c-plat-main"><span class="c-plat-no" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
    <div><h3 id="pl-${esc(p.id)}">${esc(p.name)}</h3><p>${esc(p.summary)}</p></div></div>
  <dl class="c-plat-facts">
    <div><dt>Pricing model</dt><dd>${esc(p.modelLabel)}</dd></div>
    <div><dt>Starting price</dt><dd>${esc(typeof p.startingPrice === "number" ? inr(p.startingPrice) : p.startingPrice || "Not verified")}</dd></div>
    <div><dt>Fees</dt><dd>${esc(p.feeLabel)}</dd></div>
    <div><dt>Build</dt><dd>${esc(p.build)}</dd></div>
    <div><dt>Domain</dt><dd>${esc(p.domain)}</dd></div>
    <div><dt>Marketing</dt><dd>${esc(p.marketing)}</dd></div>
  </dl>
  <p class="c-caution"><b>Worth knowing:</b> ${esc(p.caution)}</p>
  ${p.statusNote ? `<p class="c-muted">${esc(p.statusNote)}</p>` : ""}
  <details class="c-plans"><summary>Plan prices</summary>${plans(p)}</details>
  <p class="c-src">${p.id === "lebrands" ? "Proposed terms" : p.pricingVerified ? "Pricing verified" : "Pricing not verified"}${p.checkedOn ? `, checked ${esc(p.checkedOn)}` : ""}. ${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" rel="noopener" target="_blank">Official source<span class="c-sr"> for ${esc(p.name)} (opens in a new tab)</span></a>` : ""}${(p.additionalSources || []).map(s => ` · <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a>`).join("")}</p>
</article>`).join("");
}

export function compareMain() {
  return `<main class="c-main" id="top-compare">
  <section class="c-hero" aria-labelledby="compare-title"><div class="c-wrap">
    <p class="m-kicker">Compare</p>
    <h1 id="compare-title">Five ways to open a store in India. Priced in the open.</h1>
    <p class="c-lede">LeBrands.Store, Shopify, Zoho Commerce, ShopDeck and Dukaan, side by side. We show what we could verify, mark what we could not, and let you test the numbers with your own sales.</p>
    <p class="c-honest">LeBrands.Store plans are proposed, not live billing. Competitor prices are a dated snapshot from the official sources, not a live quote.</p>
    <nav class="c-jump" aria-label="On this page"><a href="#platforms">Platforms</a><a href="#calculator">Calculator</a><a href="#quiz">Quiz</a><a href="#method">FAQ and method</a></nav>
  </div></section>

  <section class="c-sec" id="platforms" aria-labelledby="plat-title"><div class="c-wrap">
    <header class="c-head"><p class="m-kicker">The five</p><h2 id="plat-title">What each one is, and what to watch.</h2></header>
    <div class="c-ledger">${ledger()}</div>
  </div></section>

  <section class="c-sec c-alt" id="calculator" aria-labelledby="calc-title"><div class="c-wrap">
    <header class="c-head"><p class="m-kicker">Calculator</p><h2 id="calc-title">Your month, your numbers.</h2>
    <p class="c-lede">Fees only. Tax, shipping, ads and apps are excluded. Gateway fee applies to the prepaid share. ShopDeck is charged on the delivered share. Dukaan orders are approximated as sales divided by average order value.</p></header>
    <form class="c-calc" data-calc novalidate aria-describedby="calc-errors">
      <fieldset><legend>Your store</legend><div class="c-grid">
        ${field("sales", "Monthly sales (\u20B9)", DEFAULTS.sales, "Gross order value in a month.")}
        ${field("aov", "Average order value (\u20B9)", DEFAULTS.aov, "")}
        ${field("prepaid", "Prepaid share (%)", DEFAULTS.prepaid, "Rest is Cash on Delivery.")}
        ${field("gateway", "Gateway fee (%)", DEFAULTS.gateway, "From your own gateway contract.")}
        ${field("delivered", "Delivered share (%)", DEFAULTS.delivered, "Used for ShopDeck.")}
      </div></fieldset>
      <fieldset class="c-bill"><legend>Billing</legend>
        <label><input type="radio" name="billing" value="annual" checked> Annual billing</label>
        <label><input type="radio" name="billing" value="monthly"> Monthly billing</label>
      </fieldset>
      <fieldset><legend>Optional: override Shopify and Zoho with a custom quote</legend>
        <p class="c-muted">Blank fields use the published Indian prices from each official source. Fill both fields only for a custom assumption, such as a negotiated or regional quote. It replaces the published price in this estimate.</p>
        <div class="c-grid">
          ${field("shopifyMonthly", "Shopify monthly (\u20B9, custom assumption)", "", "")}
          ${field("shopifyRate", "Shopify transaction rate (%, custom assumption)", "", "")}
          ${field("zohoMonthly", "Zoho Commerce monthly (\u20B9, custom assumption)", "", "")}
          ${field("zohoRate", "Zoho Commerce transaction rate (%, custom assumption)", "", "")}
        </div>
      </fieldset>
      <div class="c-actions"><button class="m-pr-btn" type="submit">Recalculate</button><button class="c-link" type="reset" data-calc-reset>Reset to defaults</button></div>
      <p class="c-sr" role="status" aria-live="polite" data-status></p>
      <div id="calc-errors" class="c-errors" role="alert" data-errors hidden></div>
      <div class="c-results" data-results>${resultsHtml(estimateCosts({ ...DEFAULTS, quotes: {} }), DEFAULTS)}</div>
      <noscript><p>These are estimates for the displayed defaults. Enable JavaScript to recalculate or take the quiz.</p></noscript>
      <p class="c-muted">Only Dukaan's Free tier can be priced monthly from the checked source; select annual billing to compare its published paid offers. Estimates only. LeBrands.Store plans are proposed. The proposed Free plan is 30 live days on your included address, with no custom domain.</p>
    </form>
  </div></section>

  <section class="c-sec" id="quiz" aria-labelledby="quiz-title"><div class="c-wrap c-quiz-wrap">
    <header class="c-head"><p class="m-kicker">Optional quiz</p><h2 id="quiz-title">Six questions, plain rules.</h2>
    <p class="c-lede">Platforms that cannot do what you need are removed first. Then your preference and cost order what is left. Nothing leaves your browser. Your answers are saved here only if storage is allowed.</p></header>
    <form class="c-quizform" data-quiz>
      ${sel("marketing", "Who handles marketing?", [["managed", "I want it managed for me"], ["self", "I will run it myself"]], QUIZ_DEFAULT.marketing)}
      ${sel("international", "Do you need to sell internationally?", [["no", "No"], ["yes", "Yes"]], QUIZ_DEFAULT.international)}
      ${sel("zoho", "Do you need Zoho integration?", [["no", "No"], ["yes", "Yes"]], QUIZ_DEFAULT.zoho)}
      ${sel("variants", "Do you need variants at checkout?", [["no", "No"], ["yes", "Yes"]], QUIZ_DEFAULT.variants)}
      ${sel("guided", "Would you prefer guided setup in an Indian language?", [["no", "No preference"], ["yes", "Yes, conversational guidance would help"]], QUIZ_DEFAULT.guided)}
      ${sel("budget", "What matters on cost?", [["fixed", "A predictable fixed fee"], ["lowest", "The lowest estimate"]], QUIZ_DEFAULT.budget)}
      <div class="c-actions"><button class="m-pr-btn" type="submit">Show my match</button><button class="c-link" type="reset" data-quiz-reset>Reset quiz</button></div>
    </form>
    <p class="c-sr" role="status" aria-live="polite" data-quiz-status></p>
    <div class="c-quiz-out" data-quiz-out></div>
  </div></section>

  <section class="c-sec c-alt" id="method" aria-labelledby="faq-title"><div class="c-wrap c-faq">
    <header class="c-head"><p class="m-kicker">FAQ and method</p><h2 id="faq-title">How we got these numbers.</h2></header>
    <div class="m-faq-list">${COMPARE_FAQ.map((f) => `<details class="m-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
    <div class="c-method"><h3>Our method</h3><p>Published by LeBrands.Store. This is our guide, not an independent review. Sources are linked beside each platform and were reviewed on ${esc(PLATFORMS[0].checkedOn)}. Prices are a dated snapshot, not a live vendor quote.</p><p>The calculator compares recurring subscription and estimated transaction costs, excluding introductory promotions. Annual totals are divided by 12, with the subscription commitment shown separately. A cheapest plan is not necessarily a feature-equivalent plan. Gateway charges use your assumption, not a promise from any platform.</p><p>Recommendation requirements are checked before cost and preferences. Unverified capabilities are not assumed, starting-price quotes are not ranked, and incomplete matches are stated explicitly. Your quiz answers stay in this browser.</p><p>Check each vendor's current terms before signing up. All trademarks belong to their owners. LeBrands.Store is not affiliated with the other platforms listed. <a href="/contact">Spotted an error? Tell us.</a></p></div>
  </div></section>

  <section class="c-sec c-close" aria-labelledby="cc-title"><div class="c-wrap c-close-in">
    <h2 id="cc-title">See the proposed plans, or start building with Ann.</h2>
    <div class="c-actions"><a class="m-pr-btn" href="/pricing">LeBrands.Store pricing</a><a class="m-pr-btn c-rose" href="https://app.lebrands.store/signup">Open your store</a></div>
  </div></section>
</main>`;
}
