import { section, text, field } from "./schema-helpers.js";
export default section("featured-collection", "Featured collection", ["home", "about"], { title: text(160), collection: field("collection", { default: null }), limit: field("select", { values: [3, 6, 9], default: 3 }) });
