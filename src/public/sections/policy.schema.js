import { section } from "./schema-helpers.js";
export default section("policy", "Published policy", ["policy-privacy", "policy-terms", "policy-shipping", "policy-cancellation-refund", "policy-contact", "policy-pricing"], {}, { requiredOn: ["policy-privacy", "policy-terms", "policy-shipping", "policy-cancellation-refund", "policy-contact", "policy-pricing"] });
