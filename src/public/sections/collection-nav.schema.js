import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("collection-nav", "Collection navigation", ["collection"], { title: text(80, { default: "Browse" }) });
