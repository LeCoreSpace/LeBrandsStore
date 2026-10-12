import { readFile } from "node:fs/promises";
export function compilePageSchemaSnapshot(snapshot) {
  const fields = value => Object.fromEntries(Object.entries(value).map(([key, field]) => {
    const defaults = { text: "", richtext: "", link: "", image: null, video: null, product: null, collection: null, colour: null, toggle: true, list: [] };
    const result = { ...field, required: field.required ?? false, default: field.default ?? (field.type === "select" ? field.values[0] : defaults[field.type]) };
    if (field.itemFields) result.itemFields = fields(field.itemFields);
    return [key, result];
  }));
  return Object.fromEntries(Object.entries(snapshot.sections).map(([id, schema]) => [id, {
    pages: schema.pages === "*" ? snapshot.pages : schema.pages,
    fields: fields({ enabled: { type: "toggle" }, kicker: { type: "text", maxLength: 80 }, ...schema.fields }),
    min: schema.min ?? 0, max: schema.max ?? 0, blocks: schema.blocks ? fields(schema.blocks) : null,
    required: schema.required === "*" ? snapshot.pages : schema.required || [],
  }]));
}
export async function preparePageMigration(filename, source) {
  if (filename === "0012_aura_skeleton_sections.sql") {
    const legacy = JSON.parse(await readFile(new URL("./schema-snapshots/aura-v1.json", import.meta.url), "utf8"));
    const additions = JSON.parse(await readFile(new URL("./schema-snapshots/aura-skeleton-v1.json", import.meta.url), "utf8"));
    const schemas = { ...compilePageSchemaSnapshot(legacy), ...compilePageSchemaSnapshot(additions) };
    if (!source.includes("__AURA_SKELETON_SCHEMAS_V1__")) throw new Error("Missing Aura skeleton schema token.");
    return source.replace("__AURA_SKELETON_SCHEMAS_V1__", JSON.stringify(schemas));
  }
  if (filename !== "0010_store_pages.sql") return source;
  const snapshot = await readFile(new URL("./schema-snapshots/aura-v1.json", import.meta.url), "utf8");
  const schemas = compilePageSchemaSnapshot(JSON.parse(snapshot));
  if (!schemas.header || !schemas.footer || snapshot.includes("$schemas$")) throw new Error("Invalid Aura schema migration snapshot.");
  if (!source.includes("__AURA_SECTION_SCHEMAS_V1__")) throw new Error("Missing Aura schema migration token.");
  return source.replace("__AURA_SECTION_SCHEMAS_V1__", JSON.stringify(schemas));
}
