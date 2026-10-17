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

// The supplied differentiator list, excluding the monthly-sales cost scenario.
// Keep current product facts and planned features distinct. Calculator prices
// remain independently sourced in PLATFORMS, not copied from the brief.
const cells = (...values) => Object.fromEntries(PLATFORMS.map((p, i) => [p.id, values[i]]));
export const COMPARISON_ROWS = [
  { section: "Build your store", label: "How easy to build", cells: cells(
    "Ann asks questions. Pick answers and build your store with a live preview.",
    "AI store from a prompt, then theme setup",
    "Drag-and-drop builder, done yourself",
    "Their team sets it up; confirm the timeline",
    "Basic store in minutes from a phone") },
  { section: "Build your store", label: "Who builds it", cells: cells(
    "You, guided by Ann", "You or a hired agency", "You", "The platform's team", "You") },
  { section: "Build your store", label: "Hiring needed", cells: cells(
    "No", "Optional; depends on the work", "No", "No; setup team included", "No") },
  { section: "Build your store", label: "Theme options", cells: cells(
    `${AURA_STYLES.length} styles, with optional sections`,
    "Free and paid themes in a large Theme Store",
    "Ready templates",
    "Multiple customisable themes advertised",
    "7 free themes; 14+ on Growth (check current plan)") },
  { section: "Build your store", label: "How much you can customise", cells: cells(
    "Edit text, images and supported video; add or remove sections; inline theme editor",
    "Extensive theme editing, code access and apps",
    "Drag-and-drop editing within templates",
    "Customisation advertised; confirm editing access",
    "Theme editor on Growth and above") },
  { section: "Understand the cost", label: "Commission on sales", cells: cells(
    "0%; gateway charges separate",
    "2% / 1% / 0.6% on online payments; 0% on COD",
    "0%; gateway charges separate",
    "3% + GST on delivered orders",
    "4.99% to 0.99%; ₹200/order cap; manual orders excluded") },
  { section: "Understand the cost", label: "Paid extras", cells: cells(
    "Native store tools in proposed plans; partner charges separate",
    "Paid apps and premium themes",
    "Books, Inventory and CRM are separate products",
    "Ad spend on top",
    "More plugins on higher plans") },
  { section: "Included tools", label: "COD and RTO tools", cells: cells(
    "COD by default; returns reasons, RTO tracking and analysis planned",
    "COD supported; RTO through apps",
    "COD; confirm RTO analytics",
    "Team-managed RTO; partial COD and early COD payout advertised",
    "COD supported") },
  { section: "Control your business", label: "You own customer data", cells: cells(
    "Brand-owned records; confirm export scope",
    "Yes; check export scope",
    "Yes; check export scope",
    "Not verified publicly",
    "Yes; check export scope") },
  { section: "Control your business", label: "Payment and courier accounts", cells: cells(
    "Your own Razorpay and courier accounts; activation required",
    "Your own gateway; couriers through apps",
    "Your own gateway and shipping",
    "Run through ShopDeck; confirm account ownership",
    "Dukaan Pay or your Razorpay; Dukaan Delivery or your own") },
  { section: "Find customers", label: "Built-in discovery", cells: cells(
    "LeBrands.Space mall placement planned",
    "Shop app; AI chat availability varies by region",
    "No general marketplace; ONDC channel listed",
    "Managed paid ads",
    "No built-in discovery listed") },
  { section: "Find customers", label: "Who runs marketing", cells: cells(
    "You", "You or an agency", "You", "ShopDeck's team", "You") },
  { section: "India and support", label: "Built for India", cells: cells(
    "INR, GST-verified onboarding, COD by default",
    "INR plans; GST invoicing and Indian payments may need setup or apps",
    "INR; Chennai-based company",
    "INR; focused on tier-2 and tier-3 sellers",
    "INR; Hindi support") },
];
