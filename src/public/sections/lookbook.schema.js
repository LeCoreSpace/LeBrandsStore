import { section, text, rich, image, field } from "./schema-helpers.js";
export default section("lookbook", "Lookbook", ["home", "about"], {}, { minItems: 1, maxItems: 3, blockFields: { image: image(true), title: text(200), text: rich(2000), url: field("link", { default: "" }), label: text(80) } });
