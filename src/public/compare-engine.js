import { PLATFORMS } from "./compare-data.js";

const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const yes = v => v === true || v === "yes";
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

export function estimateCosts(inputs, { international = false } = {}) {
  validate(inputs);
  const { sales, aov, prepaid, gateway, delivered, billing, quotes = {} } = inputs;
  const orders = Math.ceil(sales / aov);
  return PLATFORMS.map(platform => {
    const custom = quotes[platform.id];
    let plans = custom
      ? [{ name: "Custom quote", monthly: custom.monthly, annual: null, rate: custom.rate, feeScope: platform.id === "shopify" ? "prepaid" : "all", custom: true }]
      : platform.pricingVerified ? platform.plans : [];
    if (platform.id === "lebrands") plans = plans.filter(p => p.maxOrders === null || orders <= p.maxOrders);
    if (international && platform.id === "zoho" && !custom) plans = plans.filter(p => p.name !== "Standard");
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

// Capability requirements are applied before cost/preferences. Nothing here changes
// billing, a store, the user's catalogue, or checkout availability.
export function recommend(answers, calculatorInputs) {
  if (!answers || !["managed", "self"].includes(answers.marketing) || !["fixed", "lowest"].includes(answers.budget) ||
      !["international", "zoho", "variants"].every(k => [true, false, "yes", "no"].includes(answers[k])) ||
      (answers.guided !== undefined && ![true, false, "yes", "no"].includes(answers.guided))) {
    throw new RangeError("Complete each quiz answer.");
  }
  const results = estimateCosts(calculatorInputs, { international: yes(answers.international) });
  const excluded = [], reasons = {};
  let eligible = PLATFORMS.filter(p => {
    let reason;
    if (answers.marketing === "managed" && p.id !== "shopdeck") reason = "This guide does not verify an included team running marketing for you.";
    else if (yes(answers.international) && !["shopify", "zoho"].includes(p.id)) reason = "An international selling fit is not verified in this comparison.";
    else if (yes(answers.zoho) && p.id !== "zoho") reason = "For your requested Zoho ecosystem fit, confirm native connections with Zoho rather than assume another platform includes them.";
    else if (yes(answers.variants) && p.id === "lebrands") reason = "LeBrands.Store variant checkout is not live; buying options are draft preparation only.";
    if (reason) { excluded.push({ id: p.id, reason }); return false; }
    return true;
  });
  const score = p => {
    let n = 0;
    reasons[p.id] = [];
    if (answers.marketing === "managed" && p.id === "shopdeck") { n += 10; reasons[p.id].push("You asked for managed marketing, and its official service includes consulting on marketing, pricing and RTO."); }
    if (yes(answers.international) && p.id === "shopify") { n += 6; reasons[p.id].push("International selling is part of its published platform offering. Confirm India-specific gateway availability."); }
    if (yes(answers.international) && p.id === "zoho") { n += 2; reasons[p.id].push("Multi-currency checkout is listed on Professional and above, not the Standard tier used by the lowest-cost estimate."); }
    if (yes(answers.zoho) && p.id === "zoho") { n += 10; reasons[p.id].push("You asked for the Zoho ecosystem. Confirm the exact integration and any separate licence with Zoho."); }
    if (answers.budget === "fixed" && ["lebrands", "zoho"].includes(p.id)) { n += 3; reasons[p.id].push("You prefer a subscription without a platform percentage on sales. Gateway charges still apply."); }
    if (yes(answers.guided) && p.id === "lebrands") { n += 4; reasons[p.id].push("You prefer guided setup in an Indian language. Ann's conversation supports Hindi, Tamil, Marathi and Telugu alongside English."); }
    if (yes(answers.variants) && p.id !== "lebrands") reasons[p.id].push("Check your option count and variant limits with this platform before committing.");
    if (!reasons[p.id].length) reasons[p.id].push("It remains on your shortlist after the stated capability checks.");
    return n;
  };
  const cost = id => results.find(r => r.id === id)?.total ?? Infinity;
  const scores = new Map(eligible.map(p => [p.id, score(p)]));
  eligible.sort((a, b) => (answers.budget === "lowest" ? 0 : scores.get(b.id) - scores.get(a.id)) || cost(a.id) - cost(b.id) || a.name.localeCompare(b.name));
  if (answers.budget === "lowest") eligible.forEach(p => reasons[p.id].push("Ordered by the priced estimates among eligible options. Quote-only prices are not treated as zero."));
  const primary = eligible[0]?.id || null;
  const estimate = results.find(r => r.id === primary);
  return {
    primary, alternatives: eligible.slice(1, 3).map(p => p.id), reasons, excluded,
    plan: estimate?.plan || null, estimate,
    note: !primary ? "Your requirements do not have a verified combined fit in this five-platform guide. Talk to vendors about the specific capabilities rather than treating this as a complete market search." :
      "A shortlist, not a guarantee or a recommendation of a specific feature tier. Calculator plans minimise these fees only; verify product limits, payment methods and required features. LeBrands.Store publishes this guide and its prices are proposed.",
  };
}
