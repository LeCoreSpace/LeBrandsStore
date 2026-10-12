import { section } from "./schema-helpers.js";
export default section("commerce", "Protected commerce flow", ["cart", "checkout", "track", "confirmation"], {}, { requiredOn: ["cart", "checkout", "track", "confirmation"] });
