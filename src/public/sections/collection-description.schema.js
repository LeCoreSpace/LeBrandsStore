import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("collection-description", "Collection description", ["collection"], { title: text(160), body: rich(3000) });
