import { section, text, image, field } from "./schema-helpers.js";
export default section("press", "As featured in", ["home", "about"], { title: text(160) }, { minItems: 1, maxItems: 12, blockFields: { name: text(160, { required: true }), logo: image(), url: field("link", { default: "" }) } });
