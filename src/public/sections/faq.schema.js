import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("faq", "FAQ", ["home", "collection", "product", "cart"], { title: text(160, { default: "Frequently asked questions" }) }, { minItems: 1, maxItems: 12, blockLabel: "Questions", blockFields: { question: text(240, { required: true }), answer: rich(2000) } });
