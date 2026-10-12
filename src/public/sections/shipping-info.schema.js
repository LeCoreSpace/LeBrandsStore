import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("shipping-info", "Shipping information", ["product", "cart"], { title: text(160, { default: "Shipping and returns" }), body: rich(1500), show_policy_links: field("toggle", { default: true }) });
