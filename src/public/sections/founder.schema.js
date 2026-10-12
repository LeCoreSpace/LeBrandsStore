import { section, text, rich, image } from "./schema-helpers.js";
export default section("founder", "Founder story", ["home", "about"], { portrait: image(true), story: rich(4000), name: text(160, { required: true }) });
