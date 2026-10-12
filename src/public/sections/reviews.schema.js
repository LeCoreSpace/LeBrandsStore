import { section, text, select } from "./schema-helpers.js";
export default section("reviews", "Customer reviews", ["home", "product"], { title: text(160), limit: select([3, 6, 9], 3) });
