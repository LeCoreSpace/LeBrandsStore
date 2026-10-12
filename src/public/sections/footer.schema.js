import { ALL_PAGES, section, text, field, linkItem } from "./schema-helpers.js";
export default section("footer", "Footer", ALL_PAGES, { brand_line: text(500), links: field("list", { default: [], minItems: 0, maxItems: 8, itemFields: linkItem }), social_links: field("list", { default: [], minItems: 0, maxItems: 8, itemFields: linkItem }) }, { requiredOn: ALL_PAGES });
