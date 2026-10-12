import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("featured-products", "Featured products", ["home", "collection"], { title: text(160, { default: "Featured products" }) }, { minItems: 1, maxItems: 8, blockLabel: "Products", blockFields: { product: field("product", { required: true, default: null }) } });
