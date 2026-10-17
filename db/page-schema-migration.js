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
  if (filename === "0027_d2c_food_profile_corrections.sql") {
    const marker="__D2C_MEMBERSHIP_PROFILE_CORRECTIONS_V1__";
    if(source.split(marker).length!==2)throw Error("Food profile correction marker must occur exactly once.");
    const {d2cMembershipProfileCorrections}=await import("./d2c-membership-profile-corrections.js");
    const {sql}=await d2cMembershipProfileCorrections();
    return source.replace(marker,()=>sql);
  }
  if (filename === "0026_d2c_type_memberships.sql") {
    const marker = "__D2C_TYPE_MEMBERSHIPS_V1__";
    if (source.split(marker).length !== 2) throw Error("Type membership marker must occur exactly once.");
    const { d2cTypeMembershipSeed } = await import("./d2c-type-memberships.js");
    const { sql } = await d2cTypeMembershipSeed();
    return source.replace(marker, () => sql);
  }
  if (filename === "0023_d2c_variant_profiles.sql") {
    const marker="__D2C_VARIANT_PROFILES_V1__";
    if(source.split(marker).length!==2)throw Error("Variant profile marker must occur exactly once.");
    const {d2cVariantSeed}=await import("./d2c-variant-seed.js");
    const {sql}=await d2cVariantSeed();
    return source.replace(marker,()=>sql);
  }
  if (filename === "0022_catalogue_reviewed_references.sql") {
    const marker = "__CATALOGUE_REVIEWED_REFERENCES_V1__";
    if (source.split(marker).length !== 2) throw new Error("Reviewed reference marker must occur exactly once.");
    const { reviewedCatalogueSeed } = await import("./catalogue-reviewed-seed.js");
    const { sql } = await reviewedCatalogueSeed();
    return source.replace(marker, () => sql);
  }
  if (filename === "0020_catalogue_masters.sql") {
    const marker = "__CATALOGUE_PRODUCT_TYPES_V1__";
    if (source.split(marker).length !== 2) throw new Error("Catalogue seed marker must occur exactly once.");
    const { catalogueProductTypeSeed } = await import("./catalogue-master-seed.js");
    return source.replace(marker, (await catalogueProductTypeSeed()).sql);
  }
  if (filename === "0016_ann_foundation.sql") {
    if (!source.includes("__ANN_REFERENCE_SEED_V1__")) throw new Error("Missing Ann reference seed token.");
    const { annReferenceSeed } = await import("./ann-reference-seed.js");
    return source.replace("__ANN_REFERENCE_SEED_V1__", (await annReferenceSeed()).sql);
  }
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
