const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const id = v => {
  if (!Number.isSafeInteger(v) || v < 1) fail("Choose a valid catalogue reference.");
  return v;
};
const keys = (v, allowed) => {
  if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) fail("Use the product classification form.");
};
const ids = v => {
  if (!Array.isArray(v) || !v.length || v.length > 1000) fail("Choose the applicable reference values.");
  const values = v.map(id);
  if (new Set(values).size !== values.length) fail("Choose each reference value only once.");
  return values;
};
export function validateClassification(value) {
  keys(value, ["clear", "expected_revision", "category_id", "subcategory_id", "product_type_id", "options", "descriptors"]);
  const revision = value.expected_revision;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 2147483646) fail("Reload the current product classification before saving.");
  if ("clear" in value) {
    if (value.clear !== true || Object.keys(value).some(k => !["clear", "expected_revision"].includes(k))) fail("Check the classification reset.");
    return { clear: true, expected_revision: revision };
  }
  if (!Array.isArray(value.options) || value.options.length > 3) fail("Choose up to three product options for variants.");
  if (!Array.isArray(value.descriptors) || value.descriptors.length > 1000) fail("Check the product details.");
  const options = value.options.map(option => {
    keys(option, ["option_id", "value_ids"]);
    const values = ids(option.value_ids);
    if (values.length > 50) fail("Choose up to 50 values per variant option.");
    return { option_id: id(option.option_id), value_ids: values };
  });
  if (new Set(options.map(o => o.option_id)).size !== options.length) fail("Choose each variant option only once.");
  if (options.reduce((n, o) => n * o.value_ids.length, 1) > 200) fail("Use at most 200 combinations per product.");
  const descriptors = value.descriptors.map(field => {
    keys(field, ["descriptor_id", "value_ids", "text_value", "number_value", "boolean_value"]);
    const present = ["value_ids", "text_value", "number_value", "boolean_value"].filter(k => Object.hasOwn(field, k));
    if (present.length !== 1) fail("Choose one input type for each product detail.");
    const key = present[0], v = field[key];
    if (key === "text_value" && (typeof v !== "string" || !v.trim() || [...v].length > 4000 || /[\u0000-\u001f\u007f]/.test(v))) fail("Use a valid product detail.");
    if (key === "number_value" && (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) >= 1e18 || Math.abs(v * 1e6 - Math.round(v * 1e6)) > 0.01)) fail("Use a finite product-detail number with up to six decimal places.");
    if (key === "boolean_value" && typeof v !== "boolean") fail("Choose yes or no for this product detail.");
    return { descriptor_id: id(field.descriptor_id), [key]: key === "value_ids" ? ids(v).sort((a, b) => a - b) : key === "text_value" ? v.trim() : v };
  }).sort((a, b) => a.descriptor_id - b.descriptor_id);
  if (new Set(descriptors.map(d => d.descriptor_id)).size !== descriptors.length) fail("Choose each product detail only once.");
  return { category_id: id(value.category_id), subcategory_id: id(value.subcategory_id), product_type_id: id(value.product_type_id), expected_revision: revision, options, descriptors };
}
