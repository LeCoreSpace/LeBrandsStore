import { ALL_PAGES, section, text, field } from "./schema-helpers.js";
export default section("announcement", "Announcement", ALL_PAGES, { enabled: field("toggle", { default: false }), text: text(200), url: field("link", { default: "" }) });
