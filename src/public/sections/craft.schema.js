import { section, text, image } from "./schema-helpers.js";
export default section("craft", "Craft and materials", ["home", "about", "product"], { title: text(160) }, { minItems: 1, maxItems: 8, blockFields: { image: image(true), caption: text(240) } });
