import { section, text } from "./schema-helpers.js";
export default section("statement", "Brand statement", ["home", "about"], { text: text(500, { required: true }) });
