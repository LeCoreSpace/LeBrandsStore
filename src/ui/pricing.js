const MAIL = "mailto:support@lebrands.store";
const mail = (plan) => `${MAIL}?subject=${encodeURIComponent(`Discuss the ${plan} plan`)}`;

const PLANS = [
  { name: "Launch", price: "₹1,499", annual: "₹14,990", pre: "", space: "Starter", blurb: "A complete branded store for a brand finding its feet.", orders: "Up to 300", staff: "2", support: "Email" },
  { name: "Grow", price: "₹3,499", annual: "₹34,990", pre: "", space: "Premium", blurb: "More ways to lift basket size, plus priority help on WhatsApp.", orders: "Up to 1,500", staff: "5", support: "WhatsApp, priority", featured: true },
  { name: "Scale", price: "₹7,999", annual: "₹79,990", pre: "", space: "Freedom", blurb: "Automation, messaging and analytics for brands with volume.", orders: "Up to 7,500", staff: "15", support: "Account manager" },
  { name: "Flagship", price: "₹19,999", annual: "Custom", pre: "From ", space: "Freedom and extras", blurb: "Design work, multiple logistics partners and a dedicated team.", orders: "Unlimited", staff: "Unlimited", support: "Dedicated team" },
];

const Y = true, N = false;
const SECTIONS = [
  { title: "Limits", rows: [
    ["Buying-option types per product", "Up to 3", "Up to 3", "Up to 3", "Up to 3"],
    ["Variants per product (within the plan's total SKU allowance)", "Up to 200", "Up to 200", "Up to 200", "Up to 200"],
    ["Orders a month (soft band, never blocks checkout)", "Up to 300", "Up to 1,500", "Up to 7,500", "Unlimited"],
    ["Staff accounts", "2", "5", "15", "Unlimited"],
    ["Commission on sales", "0%", "0%", "0%", "0%"],
    ["LeBrands.Space plan included", "Starter", "Premium", "Freedom", "Freedom and extras"],
  ] },
  { title: "Discovery on LeBrands.Space", rows: [
    ["Brand listed on LeBrands.Space", Y, Y, Y, Y],
    ["LeBrands.Space plan benefits", "Starter", "Premium", "Freedom", "Freedom"],
    ["Feature in the Top 300 blog series", N, N, N, Y],
    ["Instagram showcase and newsletter mention", N, N, N, Y],
  ] },
  { title: "Store and design", rows: [
    ["Build with Ann, theme editor and version history", Y, Y, Y, Y],
    ["Brand logo on all pages through checkout, plus favicon", Y, Y, Y, Y],
    ["Fully branded, customisable checkout", Y, Y, Y, Y],
    ["Custom domain with SSL", Y, Y, Y, Y],
    ["Media library", Y, Y, Y, Y],
    ["SEO basics (titles, sitemap, product data)", Y, Y, Y, Y],
    ["Custom sections and design work", N, N, N, Y],
  ] },
  { title: "Product page, cart and checkout", rows: [
    ["Real reviews, size guide, trust badges, FAQ and How it works", Y, Y, Y, Y],
    ["Delivery estimate and COD check by pincode (via your logistics partner)", Y, Y, Y, Y],
    ["Sticky add-to-cart, free-shipping progress bar", Y, Y, Y, Y],
    ["Pincode autofill, prepaid discount at checkout", Y, Y, Y, Y],
    ["Discount codes", "Basic", "Advanced", "Advanced", "Advanced"],
    ["Bundles (frequently bought together)", N, Y, Y, Y],
    ["Cart and post-purchase upsells", N, Y, Y, Y],
    ["Back-in-stock alerts, gift wrap, referral programme", N, Y, Y, Y],
    ["Loyalty points, upsell A/B testing", N, N, Y, Y],
  ] },
  { title: "Payments", rows: [
    ["Payment gateway integration with your own account", Y, Y, Y, Y],
    ["COD with built-in protection (bot check, COD limits, per-phone limits)", Y, Y, Y, Y],
  ], note: "Payment links, partial COD, COD fees and other payment features depend on what your payment gateway account offers." },
  { title: "Shipping and logistics", rows: [
    ["Manual tracking", Y, Y, Y, Y],
    ["One logistics partner by API (shipments, labels, AWB, tracking sync)", Y, Y, Y, Y],
    ["Branded order tracking page", Y, Y, Y, Y],
    ["Multiple logistics partners at once", N, N, N, Y],
  ], note: "Courier selection, shipping rates, serviceability, pickup locations and failed-delivery handling are managed in your logistics partner's account." },
  { title: "COD and returns", rows: [
    ["COD and Returns centre (COD orders, risk flags, remittance)", Y, Y, Y, Y],
    ["Reason tracked for every return and RTO", Y, Y, Y, Y],
    ["RTO analysis (pincode, product, value, customer type, cost)", Y, Y, Y, Y],
    ["Automatic RTO rules (prepaid-only pincodes, risk-based COD)", N, N, Y, Y],
  ] },
  { title: "Communication", intro: "Connected by API to your brand's own partner accounts.", rows: [
    ["Order emails sent by LeBrands.Store", Y, Y, Y, Y],
    ["Messaging provider: WhatsApp order updates and COD confirmation", N, "Optional", Y, Y],
    ["Email provider: email marketing", N, N, Y, Y],
    ["Messaging provider: WhatsApp automation and campaigns", N, N, Y, Y],
    ["Calling provider: click-to-call, call logs", N, N, Y, Y],
    ["Abandoned cart across channels, customer segments", N, N, Y, Y],
  ] },
  { title: "Reports and analytics", rows: [
    ["Sales and order reports", Y, Y, Y, Y],
    ["GST invoices, credit notes, GSTIN verification", Y, Y, Y, Y],
    ["GST reports for your CA (GSTR-1 style, HSN summary)", N, Y, Y, Y],
    ["Funnel, cohort and product analytics", N, N, Y, Y],
    ["Data export (CSV and media)", Y, Y, Y, Y],
  ] },
  { title: "Support", rows: [
    ["Support", "Email", "WhatsApp, priority", "Account manager", "Dedicated team, terms discussed with you"],
  ] },
];

const ADDONS = [
  ["Extra brand or store", "₹999 a month"],
  ["Extra staff accounts", "Per account, quoted"],
  ["Done-for-you setup", "₹4,999, proposed free on annual"],
  ["Store design, product photography, catalogue upload", "Quoted"],
  ["LeBrands.Space plan on its own (no store)", "Starter ₹1,500, Premium ₹2,500, Freedom ₹3,500"],
];

const BILLING_TERMS = [
  ["Free plan", "30 days free from your first successful store publication on your included yourbrand.lebrands.store address. Prepare your store before the live period begins. Choose a paid plan to continue after 30 days."],
  ["Free catalogue allowance", "Up to 100 published products and 1,000 published SKUs in total. Each sellable combination counts as one SKU; a product without variations counts as one. A parent product is not counted again on top of its variants. Multiple collection placements do not add SKUs. Published out-of-stock variants count; drafts, archived variants and sample-preview products do not."],
  ["Variant limits", "Up to 3 buying-option types and 200 variants per product, within your remaining store-wide SKU allowance. Descriptive specifications do not create SKUs."],
  ["Paid catalogue allowances", "Paid SKU allowances are still to be finalised. The entry paid plan must support at least the Free plan's 1,000 SKUs, so upgrading does not require shrinking your catalogue."],
  ["Free plan reminders and expiry", "Show remaining days and catalogue usage, with advance expiry reminders. Upgrade without rebuilding: preserve your design, products, media and URLs. Without an upgrade, pause new order-taking after expiry, but keep existing orders and fulfilment accessible. Data retention and draft inactivity limits will be disclosed before this offer is activated."],
  ["Usage and partner costs", "AI generation, media storage and messaging have separate allowances to be finalised. Payment-provider, shipping and advertising charges are separate."],
  ["Custom domains", "Available on paid plans only. Custom domain integration is not included in the 30-day Free plan."],
  ["Founding members", "Discounted pricing for the first brands. Discount to be decided."],
  ["Billing", 'One GST invoice from LeBrandsSpace Digital Pvt Ltd, for example: "Grow plan (includes LeBrands.Space Premium)".'],
  ["Upgrades and downgrades", "Store and LeBrands.Space plans move together."],
  ["Non-payment", "7-day grace period, then dashboard read-only, then store paused. Data kept for 90 days. The LeBrands.Space plan returns to free registration."],
  ["Order band exceeded", "Upgrade prompt after 2 months over the band. Checkout is never blocked."],
];

const CHECK = '<svg class="m-pr-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';

function cell(v) {
  if (v === true) return `<td class="m-pr-yes">${CHECK}<span class="m-pr-sr">Included</span></td>`;
  if (v === false) return `<td class="m-pr-no"><i aria-hidden="true"></i><span class="m-pr-sr">Not included</span></td>`;
  return `<td class="m-pr-val">${v}</td>`;
}

function planCard(p, i) {
  return `<article class="m-pr-card m-reveal${p.featured ? " is-featured" : ""}" style="--i:${i}" aria-labelledby="plan-${p.name}">
  <header>
    <div class="m-pr-card-top"><h3 id="plan-${p.name}">${p.name}</h3>${p.featured ? '<span class="m-pr-tag">Recommended</span>' : ""}</div>
    <p class="m-pr-blurb">${p.blurb}</p>
    <p class="m-pr-price"><small>${p.pre}</small><b>${p.price}</b><span>a month</span></p>
    <p class="m-pr-annual">${p.annual === "Custom" ? "Annual billing: custom quote" : `Annual: ${p.annual}, two months free`}</p>
  </header>
  <dl class="m-pr-facts">
    <div><dt>Orders a month</dt><dd>${p.orders}</dd></div>
    <div><dt>Staff accounts</dt><dd>${p.staff}</dd></div>
    <div><dt>Commission on sales</dt><dd>0%</dd></div>
    <div><dt>LeBrands.Space plan</dt><dd>${p.space}</dd></div>
    <div><dt>Support</dt><dd>${p.support}</dd></div>
    <div><dt>Custom domain with SSL</dt><dd>Included</dd></div>
  </dl>
  <a class="m-pr-btn" href="${mail(p.name)}">Discuss ${p.name}<span class="m-pr-sr"> plan by email</span></a>
</article>`;
}

function table(s, n) {
  const id = `pc-${n}`;
  return `<section class="m-pr-cat m-reveal" aria-labelledby="${id}">
  <h3 id="${id}">${s.title}</h3>${s.intro ? `<p class="m-pr-note">${s.intro}</p>` : ""}
  <div class="m-pr-scroll" role="region" tabindex="0" aria-label="${s.title}, scrollable table">
    <table class="m-pr-table">
      <caption class="m-pr-sr">${s.title}: proposed plan comparison</caption>
      <thead><tr><th scope="col">Feature</th>${PLANS.map((p) => `<th scope="col"${p.featured ? ' class="is-featured"' : ""}>${p.name}</th>`).join("")}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map(cell).join("")}</tr>`).join("")}</tbody>
    </table>
  </div>${s.note ? `<p class="m-pr-note">${s.note}</p>` : ""}
</section>`;
}

export function pricingMain() {
  return `<main class="m-pr-main" id="top-pricing">
  <section class="m-pr-hero" aria-labelledby="pricing-title">
    <div class="m-pr-wrap">
      <p class="m-kicker">Proposed pricing</p>
      <h1 id="pricing-title">Pick the size of your flagship.</h1>
      <p class="m-pr-lede">Build your complete store, then launch free for 30 days on your included store address. Choose a paid plan to continue and connect your own domain. 0% commission on your sales.</p>
    </div>
  </section>
  <section class="m-pr-plans" aria-label="Plans">
    <div class="m-pr-wrap">
      <article class="m-pr-card m-pr-free" aria-labelledby="plan-Free">
        <div>
          <div class="m-pr-card-top"><h2 id="plan-Free">Free</h2><span class="m-pr-tag">30 days</span></div>
          <p>Build and launch your complete store free for 30 days.</p>
          <ul class="m-pr-free-features">
            <li>Build with Ann and customise in the theme editor.</li>
             <li>Up to <strong>100 published products</strong> and <strong>1,000 published SKUs in total</strong>.</li>
             <li>Up to 3 buying-option types and 200 variants per product, within the total SKU allowance.</li>
             <li>Your 30 live days start with your first successful publication, not during store preparation.</li>
            <li>Use your included <strong>yourbrand.lebrands.store</strong> address.</li>
            <li>Custom domain integration is available on paid plans only.</li>
          </ul>
          <p class="m-pr-note">Each sellable combination counts as one SKU. A product without variations counts as one.</p>
          <p class="m-pr-note"><strong>Planned offer:</strong> catalogue limits, the publication-based timer and expiry controls are not implemented yet.</p>
        </div>
        <div class="m-pr-free-action">
          <p class="m-pr-price"><b>₹0</b><span>for 30 days</span></p>
          <a class="m-pr-btn" href="https://app.lebrands.store/signup">Start free for 30 days</a>
          <p class="m-pr-note">Choose a paid plan to continue after 30 days.</p>
        </div>
      </article>
      <p class="m-pr-paid-note">Paid plans below. Monthly prices are shown first. Launch, Grow and Scale include two months free with annual billing.</p>
    </div>
    <div class="m-pr-wrap m-pr-cards">${PLANS.map(planCard).join("")}</div>
    <p class="m-pr-wrap m-pr-disclose">These are proposed packages. Pricing, feature availability and assisted integration scope are confirmed with our team before you subscribe.</p>
  </section>
  <section class="m-pr-compare" aria-labelledby="compare-title">
    <div class="m-pr-wrap">
      <header class="m-pr-head m-reveal">
        <p class="m-kicker">Side by side</p>
        <h2 id="compare-title">Proposed paid plan comparison</h2>
        <p class="m-pr-lede">This comparison describes proposed packages. Several features are not yet implemented, so nothing here should be read as currently live. We confirm feature availability and assisted integration scope with you before you subscribe.</p>
      </header>
      ${SECTIONS.map(table).join("")}
    </div>
  </section>
  <section class="m-pr-addons" aria-labelledby="addons-title">
    <div class="m-pr-wrap">
      <header class="m-pr-head m-reveal"><p class="m-kicker">Any plan</p><h2 id="addons-title">Add-ons</h2><p class="m-pr-lede">Proposed prices. Anything marked Quoted is priced per account after we talk.</p></header>
      <div class="m-pr-scroll m-reveal" role="region" tabindex="0" aria-label="Add-ons, scrollable table">
        <table class="m-pr-table m-pr-addon-table">
          <caption class="m-pr-sr">Add-ons with proposed prices</caption>
          <thead><tr><th scope="col">Add-on</th><th scope="col">Price (proposal)</th></tr></thead>
          <tbody>${ADDONS.map((a) => `<tr><th scope="row">${a[0]}</th><td class="m-pr-val">${a[1]}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  </section>
  <section class="m-pr-billing" aria-labelledby="billing-title">
    <div class="m-pr-wrap">
      <header class="m-pr-head"><h2 id="billing-title">Billing terms</h2><p class="m-pr-lede">Terms for the planned subscription service. Automated billing is not enabled yet.</p></header>
      <dl class="m-pr-terms">${BILLING_TERMS.map(([name, detail]) => `<div><dt>${name}</dt><dd>${detail}</dd></div>`).join("")}</dl>
    </div>
  </section>
  <section class="m-pr-close" aria-labelledby="close-title">
    <div class="m-pr-wrap m-pr-close-in m-reveal">
      <h2 id="close-title">Not sure which plan fits? Tell us about your brand.</h2>
      <a class="m-pr-btn" href="${MAIL}">Talk to the team</a>
    </div>
  </section>
</main>`;
}
