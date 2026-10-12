import { section, text, field } from "./schema-helpers.js";
export default section("product-grid", "Collection products", ["collection"], { title: text(160), collection: field("collection", { default: null }) }, { requiredOn: ["collection"] });
