import { section, text, rich } from "./schema-helpers.js";
export default section("about", "About the brand", ["about"], { title: text(240), body: rich(10000) });
