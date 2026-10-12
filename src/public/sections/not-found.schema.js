import { section, text } from "./schema-helpers.js";
export default section("not-found", "Page not found", ["404"], {
  title: text(160, { default: "This page isn't here.", required: true }),
  text: text(500, { default: "Browse the collection or contact the store for help." }),
}, { requiredOn: ["404"] });
