import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("product-specs", "Specifications", ["product"], { title: text(160, { default: "Specifications" }), show_sku: field("toggle", { default: true }) }, { minItems: 1, maxItems: 20, blockLabel: "Specifications", blockFields: { label: text(80, { required: true }), value: text(240) } });
