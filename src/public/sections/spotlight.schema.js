import { section, field } from "./schema-helpers.js";
export default section("spotlight", "Product spotlight", ["home", "collection"], { product: field("product", { required: true, default: null }) });
