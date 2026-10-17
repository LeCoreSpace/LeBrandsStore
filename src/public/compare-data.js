import { PRICING_PLANS } from "./pricing-plans.js";
import { AURA_STYLES } from "./aura-styles.js";

// Reviewed against the vendor's own pages on this date, not supplied-brief prices.
// Subscription prices are INR, excluding tax. Annual is the full annual commitment.
export const CHECKED_ON = "2026-10-17";
const rupees = n => `₹${n.toLocaleString("en-IN")}`;
export const PLATFORMS = [
  {
    id: "lebrands", name: "LeBrands.Store", modelLabel: "Proposed subscription, no platform commission",
    summary: "A guided, India-first storefront with Ann and an inline theme editor.",
    startingPrice: `Proposed ${PRICING_PLANS[0].name}: ${rupees(PRICING_PLANS[0].monthlyFee)}/month; ${rupees(PRICING_PLANS[0].annualFee)}/year`,
    feeLabel: "0% platform commission; gateway charges separate",
    build: "Ann guides setup with conversations in English, Hindi, Tamil, Marathi and Telugu.",
    domain: "Included store address. Custom domains are proposed for paid plans; self-serve activation is not available.",
    marketing: "You run your own marketing. No promised traffic or sales.",
    caution: "Buying options can be prepared as drafts, but variant checkout is not live. First publication requires approval.",
    statusNote: "Commercial proposal, not active subscription billing. The proposed Free offer is 30 live days with no custom domain; the timer and quota enforcement are not enabled.",
    sourceUrl: "https://lebrands.store/pricing", checkedOn: CHECKED_ON, pricingVerified: true,
    plans: PRICING_PLANS.map(p => ({ name: p.name, monthly: p.monthlyFee, annual: p.annualFee, rate: 0, feeScope: "none", maxOrders: p.orderBand, from: p.name === "Flagship" })),
  },
  {
    id: "shopify", name: "Shopify", modelLabel: "Subscription plus third-party payment fees",
    summary: "A commerce platform with international selling, themes, apps and point-of-sale tools.",
    startingPrice: "Basic: ₹1,994/month or ₹17,988/year",
    feeLabel: "Third-party provider fee: 2%, 1% or 0.6%, plus your gateway",
    build: "Themes, a website builder and an integrated commerce assistant.",
    domain: "Custom domain connection is listed. Domain purchase is separate.",
    marketing: "You or your marketing team manage acquisition.",
    caution: "App, theme and POS add-ons can cost extra. Confirm which payment and international features are available for your business.",
    statusNote: "Indian subscription prices checked on the regional page. Promotional introductory offers are excluded from recurring estimates.",
    sourceUrl: "https://www.shopify.com/in/pricing?country=IN", checkedOn: CHECKED_ON, pricingVerified: true,
    additionalSources: [{ label: "Manual payment fee treatment", url: "https://help.shopify.com/en/manual/payments/manual-payments" }],
    plans: [
      { name: "Basic", monthly: 1994, annual: 17988, rate: 2, feeScope: "prepaid" },
      { name: "Grow", monthly: 7447, annual: 67188, rate: 1, feeScope: "prepaid" },
      { name: "Advanced", monthly: 30164, annual: 272160, rate: 0.6, feeScope: "prepaid" },
    ],
  },
  {
    id: "zoho", name: "Zoho Commerce", modelLabel: "Subscription, no platform transaction fee",
    summary: "A store builder within the wider Zoho business software ecosystem.",
    startingPrice: "Standard: ₹999/month or ₹7,188/year",
    feeLabel: "0% platform transaction fee; gateway charges separate",
    build: "Store themes, product listings and built-in commerce management.",
    domain: "Custom domain mapping is listed; domain purchase is separate.",
    marketing: "You run acquisition. Other Zoho products have their own terms.",
    caution: "Standard lists 500 products. Multi-currency checkout starts on Professional; verify any specific Zoho connection you need.",
    statusNote: "Standard and higher plans are compared here. The ₹99/month micro-store offer, billed annually, has different limits and is not treated as equivalent.",
    sourceUrl: "https://www.zoho.com/commerce/pricing.html", checkedOn: CHECKED_ON, pricingVerified: true,
    additionalSources: [{ label: "Official INR pricing data", url: "https://www.zohowebstatic.com/sites/zweb/json/pricing/commerce-pricing-val.json" }],
    plans: [
      { name: "Standard", monthly: 999, annual: 7188, rate: 0, feeScope: "none" },
      { name: "Professional", monthly: 2999, annual: 21588, rate: 0, feeScope: "none" },
      { name: "Premium", monthly: 3999, annual: 41988, rate: 0, feeScope: "none" },
    ],
  },
  {
    id: "shopdeck", name: "ShopDeck", modelLabel: "Managed service with a delivered-order fee",
    summary: "A storefront and consulting team for marketing, pricing and RTO management.",
    startingPrice: "₹0 subscription and website setup; success fee applies",
    feeLabel: "3% + GST on delivered orders",
    build: "A team helps set up the website, ad accounts, campaigns and payment gateway.",
    domain: "Confirm domain ownership and connection terms with their team.",
    marketing: "Their consultants support marketing, pricing and RTO strategy. You fund ad spend.",
    caution: "A managed service is not equivalent to a DIY subscription. Advertising and other operating expenses are not included in this estimate.",
    statusNote: "The official site states no subscription or setup fee and 3% + GST on delivered orders. No profitability or traffic guarantee is implied here.",
    sourceUrl: "https://shopdeck.com", checkedOn: CHECKED_ON, pricingVerified: true,
    plans: [{ name: "Success-based", monthly: 0, annual: 0, rate: 3, feeScope: "delivered" }],
  },
  {
    id: "dukaan", name: "Dukaan", modelLabel: "Free or paid subscription plus per-order service fee",
    summary: "An online storefront with built-in plugins and tiered commerce tools.",
    startingPrice: "Free plan; Starter published at ₹2,500/year",
    feeLabel: "4.99%, 3.99%, 1.99% or 0.99%; capped at ₹200/order",
    build: "Themes and plugins, with different features on different tiers.",
    domain: "A custom domain feature is listed; confirm the eligible plan.",
    marketing: "You manage marketing using the available tools.",
    caution: "The published service fee excludes manual orders. Per-order caps are estimated using your average basket; mixed baskets can produce different charges.",
    statusNote: "Published annual offers are used, not struck-through list prices. Monthly paid-plan prices were not confirmed. The Free plan is a separate feature set.",
    sourceUrl: "https://mydukaan.io/pricing", checkedOn: CHECKED_ON, pricingVerified: true,
    plans: [
      { name: "Free", monthly: 0, annual: 0, rate: 4.99, feeScope: "all", cap: 200 },
      { name: "Starter", monthly: null, annual: 2500, rate: 3.99, feeScope: "all", cap: 200 },
      { name: "Growth", monthly: null, annual: 8000, rate: 1.99, feeScope: "all", cap: 200 },
      { name: "Infinity", monthly: null, annual: 50000, rate: 0.99, feeScope: "all", cap: 200 },
    ],
  },
];

// Concise differentiators for the comparison matrix. Unknown is not unavailable.
// Order is the same as PLATFORMS. Prices/fees stay in the shared platform records.
const cells = (...values) => Object.fromEntries(PLATFORMS.map((p, i) => [p.id, values[i]]));
export const COMPARISON_ROWS = [
  { section: "Build your store", label: "Who builds the store?", cells: cells("You, guided by Ann", "You, with AI + themes", "You, with templates", "Their team assists", "You, with themes") },
  { section: "Build your store", label: "Outside hiring", cells: cells("Optional for custom work", "Optional; depends on scope", "Optional", "Setup team included", "Optional") },
  { section: "Build your store", label: "Design control", cells: cells(`Inline edits; menus; ${AURA_STYLES.length} styles`, "Theme editor + apps", "Template editor", "Confirm customisation limits", "Theme editor on Growth+") },
  { section: "Build your store", label: "Builder conversation languages", cells: cells("English, Hindi, Tamil, Marathi, Telugu", "Not verified", "Not verified", "Confirm with their team", "Not verified") },
  { section: "Understand the cost", label: "Platform commission / fee", cells: cells("0%; gateway extra", "2% / 1% / 0.6% on prepaid*", "0%; gateway extra", "3% + GST on delivered orders", "4.99% to 0.99%; ₹200/order cap") },
  { section: "Understand the cost", label: "Paid extras", cells: cells("Partner costs; plan scope proposed", "Apps, themes, POS add-ons", "Other Zoho licences separate", "Ad spend + operating costs", "Plugins vary by plan") },
  { section: "Understand the cost", label: "Monthly subscription", cells: cells(
    `Proposed: ${rupees(PLATFORMS[0].plans[0].monthly)}`,
    `Basic: ${rupees(PLATFORMS[1].plans[0].monthly)}`,
    `Standard: ${rupees(PLATFORMS[2].plans[0].monthly)}`,
    "₹0 subscription; success fee",
    "Free tier; paid monthly quote needed") },
  { section: "Understand the cost", label: "Annual subscription upfront", cells: cells(
    `Proposed Launch: ${rupees(PLATFORMS[0].plans[0].annual)}`,
    `Basic: ${rupees(PLATFORMS[1].plans[0].annual)}`,
    `Standard: ${rupees(PLATFORMS[2].plans[0].annual)}`,
    "₹0 subscription; success fee",
    `Starter: ${rupees(PLATFORMS[4].plans[1].annual)}`) },
  { section: "Understand the cost", label: "Estimated monthly cost", type: "estimate" },
  { section: "Included tools", label: "COD and RTO tools", cells: cells("COD; RTO tools planned", "Manual COD supported", "Confirm COD / RTO tools", "RTO consulting; partial COD", "COD listed on Starter+") },
  { section: "Included tools", label: "Conversion features", cells: cells("Review / trust sections; automation planned", "Theme features + apps", "Check features by plan", "Confirm included tools", "Check features by plan") },
  { section: "Included tools", label: "Customer messaging", cells: cells("Order email; Arattai planned", "Email + apps; costs vary", "Confirm channels / licences", "Confirm channels / charges", "Confirm channels / charges") },
  { section: "Included tools", label: "Integrations", cells: cells("GST check; provider activation required", "Large app / integration ecosystem", "Zoho ecosystem; check licences", "Team-managed setup", "Plugins vary by plan") },
  { section: "Included tools", label: "Variant selling", cells: cells("Draft preparation only", "Check option / variant limits", "Check option / variant limits", "Confirm variant support", "Check option / variant limits") },
  { section: "Included tools", label: "Store mobile app", cells: cells("Proposed add-on", "Confirm app service / cost", "Not verified", "Free Android app listed", "Not verified") },
  { section: "Control your business", label: "Customer data", cells: cells("Brand-owned records; confirm export scope", "Confirm export scope / terms", "Confirm export scope / terms", "Confirm ownership / export", "Confirm export scope / terms") },
  { section: "Control your business", label: "Payment / courier accounts", cells: cells("Your accounts; activation required", "Your providers / apps", "Your chosen integrations", "Confirm account ownership", "Own gateway options; check tier") },
  { section: "Control your business", label: "Leaving / portability", cells: cells("Confirm export + domain portability", "Export tools; check scope", "Confirm export + domain transfer", "Confirm export + domain transfer", "Confirm export + domain transfer") },
  { section: "Control your business", label: "Custom domain", cells: cells("Paid-plan proposal; not self-serve", "Supported; domain extra", "Supported; domain extra", "Confirm with their team", "Confirm eligible plan") },
  { section: "Find customers", label: "Built-in discovery", cells: cells("Mall placement proposed", "Channels vary by region", "ONDC sales channel listed", "Managed paid advertising", "Confirm available channels") },
  { section: "Find customers", label: "Who runs marketing?", cells: cells("You", "You or your agency", "You", "Their consulting team", "You") },
  { section: "Find customers", label: "Selling in AI chats", cells: cells("Not verified", "AI channels listed; region limits", "Not verified", "Not verified", "Not verified") },
  { section: "India and support", label: "India-specific setup", cells: cells("GST-verified onboarding + INR", "INR pricing; tax setup varies", "INR pricing; tax setup varies", "India-focused managed service", "India-focused store builder") },
  { section: "India and support", label: "Support", cells: cells(`Proposed: ${PRICING_PLANS[0].support}`, "Plan-dependent; confirm SLA", "Plan-dependent; confirm SLA", "Team-assisted; confirm SLA", "Plan-dependent; confirm SLA") },
];
