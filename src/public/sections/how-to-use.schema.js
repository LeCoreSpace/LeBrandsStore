import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("how-to-use", "How to use", ["product"], { title: text(160, { default: "How to use" }) }, { minItems: 1, maxItems: 10, blockLabel: "Steps", blockFields: { title: text(120, { required: true }), text: text(500) } });
