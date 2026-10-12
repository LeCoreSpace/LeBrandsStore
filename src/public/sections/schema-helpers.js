export const ALL_PAGES = ["home", "collection", "product", "about", "contact", "policy-privacy", "policy-terms", "policy-shipping", "policy-cancellation-refund", "policy-contact", "policy-pricing", "cart", "checkout", "track", "confirmation", "404"];
export const field = (type, options = {}) => ({ type, required: false, ...options });
export const text = (maxLength = 200, options = {}) => field("text", { maxLength, default: "", ...options });
export const rich = (maxLength = 5000) => field("richtext", { maxLength, default: "" });
export const image = (required = false) => field("image", { required, default: null });
export const select = (values, value = values[0]) => field("select", { values, default: value });
export const linkItem = { label: text(80, { required: true }), url: field("link", { required: true, default: "" }) };
export function section(id, name, pages, fields = {}, options = {}) {
  const complete = { enabled: field("toggle", { default: true }), kicker: text(80), ...fields };
  return { id, name, allowedPages: pages, fields: complete, defaults: Object.fromEntries(Object.entries(complete).map(([key, value]) => [key, value.default])), minItems: 0, maxItems: 0, requiredOn: [], ...options };
}
