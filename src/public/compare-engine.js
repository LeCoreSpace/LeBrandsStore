import { PLATFORMS } from "./compare-data.js";

const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const validNumber = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function validate(inputs) {
  if (!inputs || !validNumber(inputs.sales, 0, 1e9) || !validNumber(inputs.aov, 0.01, 1e7) ||
      !["prepaid", "gateway", "delivered"].every(k => validNumber(inputs[k], 0, 100)) ||
      !["monthly", "annual"].includes(inputs.billing)) throw new RangeError("Enter valid sales, average order value, percentages and a billing term.");
  for (const [id, quote] of Object.entries(inputs.quotes || {})) {
    if (!["shopify", "zoho"].includes(id) || !quote || !validNumber(quote.monthly, 0, 1e9) || !validNumber(quote.rate, 0, 100)) {
      throw new RangeError("A custom quote needs a non-negative monthly fee and a transaction rate from 0 to 100.");
    }
  }
}

export function estimateCosts(inputs) {
  validate(inputs);
  const { sales, aov, prepaid, gateway, delivered, billing, quotes = {} } = inputs;
  const orders = Math.ceil(sales / aov);
  return PLATFORMS.map(platform => {
    const custom = quotes[platform.id];
    let plans = custom
      ? [{ name: "Custom quote", monthly: custom.monthly, annual: null, rate: custom.rate, feeScope: platform.id === "shopify" ? "prepaid" : "all", custom: true }]
      : platform.pricingVerified ? platform.plans : [];
    if (platform.id === "lebrands") plans = plans.filter(p => p.maxOrders === null || orders <= p.maxOrders);
    const candidates = plans.flatMap(p => {
      if (p.from) return [];
      const annualUpfront = !p.custom && billing === "annual" ? p.annual : null;
      const subscription = p.custom || billing === "monthly" ? p.monthly : annualUpfront === null ? null : annualUpfront / 12;
      if (!validNumber(subscription, 0, 1e9)) return [];
      const base = p.feeScope === "prepaid" ? sales * prepaid / 100 : p.feeScope === "delivered" ? sales * delivered / 100 : p.feeScope === "none" ? 0 : sales;
      const platformFee = Math.min(base * p.rate / 100, p.cap === undefined ? Infinity : sales / aov * p.cap);
      const gatewayFee = sales * prepaid / 100 * gateway / 100;
      let note = p.custom ? "Your custom monthly quote, not a verified public rate. Annual commitment is not assumed." : "";
      if (platform.id === "lebrands") note = "Proposed recurring price after the proposed Free period. Order bands guide this estimate; they are not checkout caps. Billing is not enabled.";
      if (platform.id === "shopify" && !custom) note = "Lowest subscription plus third-party prepaid fees, not a recommendation of every feature on that tier. Introductory discounts are excluded.";
      if (platform.id === "shopdeck") note = "3% of the delivered share of sales. Ad spend, shipping and taxes are additional; the gateway input remains your assumption.";
      if (platform.id === "dukaan") note = "Average-basket estimate for non-manual orders. Plans have different features; the lowest-cost tier may not include everything you need." +
        (billing === "monthly" ? " Only the Free tier can be priced monthly from the checked source; paid monthly quotes are unverified." : " Published annual offers may change.");
      return [{
        id: platform.id, name: platform.name, status: "estimated", plan: p.name,
        total: round(subscription + platformFee + gatewayFee),
        subscription: round(subscription), platformFee: round(platformFee), gatewayFee: round(gatewayFee),
        annualUpfront, note,
      }];
    });
    candidates.sort((a, b) => a.total - b.total || a.subscription - b.subscription);
    return candidates[0] || {
      id: platform.id, name: platform.name, status: "quote", plan: platform.id === "lebrands" ? "Flagship" : null,
      total: null, subscription: null, platformFee: null, gatewayFee: null, annualUpfront: null,
      note: platform.id === "lebrands" ? "Flagship is proposed from ₹19,999/month and needs a tailored quote. A starting price is not ranked as a complete cost." : "No verified price for this billing term. Check the official source.",
    };
  });
}

