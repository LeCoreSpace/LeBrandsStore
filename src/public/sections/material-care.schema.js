import { section, text, rich, field, select } from "./schema-helpers.js";
export default section("material-care", "Materials and care", ["product"], { title: text(160, { default: "Materials and care" }), body: rich(3000) });
