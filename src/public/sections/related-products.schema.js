import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("related-products", "Related products", ["product"], { title: text(160, { default: "You may also like" }), limit: select(["3", "4", "6"], "4") });
