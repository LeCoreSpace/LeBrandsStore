import test from "node:test";
import assert from "node:assert/strict";
import { generatePolicies } from "../src/store/policies.js";

const data = checkout_settings => ({
  settings: {
    brand_name: "Example Studio", legal_name: "Example Studio Private Limited",
    address: "10 Sample Street, Chennai 600001", support_email: "care@example.invalid",
    support_phone: "+919876543210", gstin: "33AAPFU0939F1ZV",
  },
  checkout_settings,
});
const policy = (kind, checkout) => generatePolicies(data(checkout)).find(p => p.kind === kind).body;

test("all six policies contain substantial customer-facing sections and the saved business identity", () => {
  const policies = generatePolicies(data());
  assert.deepEqual(policies.map(p => p.kind), ["privacy", "terms", "shipping", "cancellation-refund", "contact", "pricing"]);
  for (const draft of policies) {
    assert.equal(draft.reviewed, false);
    assert.ok(draft.body.length > 1600 && draft.body.length < 20000, draft.kind);
    assert.ok(draft.body.includes("Example Studio Private Limited"), draft.kind);
    assert.ok(draft.body.includes("care@example.invalid"), draft.kind);
    assert.ok(draft.body.includes("+91"), draft.kind);
    assert.doesNotMatch(draft.body, /ordering.*not.*available|business must|before publication|\[insert|\[your|TODO/i);
  }
  assert.match(policy("privacy"), /Cookies and similar technologies/);
  assert.match(policy("terms"), /mandatory consumer rights/i);
  assert.match(policy("shipping"), /Damaged, incorrect or missing deliveries/);
  assert.match(policy("cancellation-refund"), /original payment method/);
  assert.match(policy("contact"), /registered business address is not automatically a returns/);
  assert.match(policy("pricing"), /Indian rupees \(INR\)/);
});

test("shipping and pricing use only explicitly saved delivery charges, without invented defaults", () => {
  for (const kind of ["shipping", "pricing"]) {
    assert.doesNotMatch(policy(kind), /delivery is free|standard delivery charge is ₹/i);
    assert.match(policy(kind, { delivery_mode: "free" }), /Standard delivery is free/);
    const flat = policy(kind, { delivery_mode: "flat", flat_paise: 9909 });
    assert.match(flat, /₹99\.09/);
    const threshold = policy(kind, { delivery_mode: "free_above", flat_paise: 9909, free_above_paise: 150000 });
    assert.match(threshold, /₹1,500\.00 or more/);
    assert.match(threshold, /₹99\.09/);
    assert.doesNotMatch(policy(kind, { delivery_mode: "flat", flat_paise: -10 }), /₹|NaN/);
    assert.doesNotMatch(policy(kind, { delivery_mode: "flat", flat_paise: "9909" }), /₹/);
  }
});

test("COD is advertised only when explicitly enabled with a valid saved limit", () => {
  for (const kind of ["terms", "pricing"]) {
    assert.doesNotMatch(policy(kind), /Cash on Delivery is available/);
    assert.doesNotMatch(policy(kind, { cod_enabled: false, cod_max_paise: 300000 }), /Cash on Delivery is available/);
    assert.doesNotMatch(policy(kind, { cod_enabled: true }), /Cash on Delivery is available/);
    assert.match(policy(kind, { cod_enabled: true, cod_max_paise: 300000 }), /Cash on Delivery is available for eligible orders up to ₹3,000\.00/);
  }
});

test("unknown return windows, refund timelines, support hours and payment providers are not invented", () => {
  const combined = generatePolicies(data()).map(p => p.body).join("\n");
  assert.doesNotMatch(combined, /\b(?:7|14|30)[ -]day|24\/7|Razorpay|Stripe|Cloudmersive|WhatsApp|guaranteed delivery/i);
  assert.match(policy("cancellation-refund"), /expected processing timeline/);
  assert.match(policy("shipping"), /contact support before ordering/i);
  const original = data();
  generatePolicies(original);
  assert.equal(original.policies, undefined);
});
