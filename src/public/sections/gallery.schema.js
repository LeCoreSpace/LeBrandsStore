import { section, image } from "./schema-helpers.js";
export default section("gallery", "Gallery", ["home", "about", "product"], {}, { minItems: 4, maxItems: 8, blockFields: { image: image(true) } });
