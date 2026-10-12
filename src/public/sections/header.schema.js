import { ALL_PAGES, section, select, field, linkItem } from "./schema-helpers.js";
export default section("header", "Header", ALL_PAGES, { logo_position: select(["left", "center"]), links: field("list", { default: [], minItems: 0, maxItems: 5, itemFields: linkItem }) }, { requiredOn: ALL_PAGES });
