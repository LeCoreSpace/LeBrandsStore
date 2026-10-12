import { section, text } from "./schema-helpers.js";
export default section("contact", "Contact", ["contact"], { title: text(160) }, { requiredOn: ["contact"] });
