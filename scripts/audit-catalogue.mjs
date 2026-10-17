import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCsv, annReferenceSeed } from "../db/ann-reference-seed.js";
import { buildCatalogueAudit, csvText } from "../db/catalogue-audit.js";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";

// No connection module, credentials, network request or database write.
const root = new URL("../", import.meta.url);
const productFiles = [
  "attached_assets/all_product_types_1792232609406.csv",
  "attached_assets/all_product_types_(1)_1792232609405.csv",
];
const sources = [
  ...productFiles, "attached_assets/niche_categories_rows_1792039876788.csv",
  "attached_assets/niche_category_values_rows_1792039876788.csv",
  "db/staged/0015_aura_starter_library.sql",
];
const inputs = await Promise.all(sources.map(async path => {
  const data = await readFile(new URL(path, root));
  return { path, data, sha256: createHash("sha256").update(data).digest("hex") };
}));
if (inputs[0].sha256 !== inputs[1].sha256) {
  throw new Error("The two product-type exports differ. Select the authoritative source before proceeding.");
}
const migration = inputs.at(-1).data.toString("utf8");
const snapshotIds = [...migration.matchAll(
  /INSERT INTO public\.aura_library_subcategories\([^)]*\)\s*VALUES\s*\((\d+),/g
)].map(m => Number(m[1])).sort((a, b) => a - b);
if (JSON.stringify(snapshotIds) !== JSON.stringify(TAXONOMY.subcategories.map(s => s.id).sort((a, b) => a - b))) {
  throw new Error("Runtime and migration subcategory IDs differ. Resolve the taxonomy snapshot before auditing.");
}
const { attributes, values, report } = await annReferenceSeed();
const audit = buildCatalogueAudit({
  taxonomy: TAXONOMY, productTypes: parseCsv(inputs[0].data.toString("utf8")),
  attributes, values, cleaningReport: report,
});
const out = new URL("generated-artifacts/catalogue-audit/", root);
await mkdir(out, { recursive: true });
const exports = [
  ["categories.csv", TAXONOMY.categories, ["id", "name", "slug"]],
  ["subcategories.csv", TAXONOMY.subcategories, ["id", "category_id", "name", "slug"]],
  ["product-types-review.csv", audit.typeCoverage, [
    "type_key", "name", "source_usage_count", "candidate_subcategory_count",
    "approved_subcategory_count", "mapping_status", "source_count_difference",
  ]],
  ["attribute-role-review.csv", audit.attributeReview, [
    "category_id", "category", "subcategory_id", "subcategory", "source_attribute_id",
    "attribute", "suggested_role", "value_count", "review_status", "note",
  ]],
  ["reference-values.csv", audit.sourceValues,
    ["source_value_id", "source_attribute_id", "value", "sort_order"]],
  ["candidate-type-mappings.csv", audit.proposedMappings, [
    "category_id", "category", "subcategory_id", "subcategory", "type_key", "product_type",
    "evidence", "review_status", "method",
  ]],
  ["subcategory-coverage.csv", audit.subcategoryCoverage, [
    "category_id", "category", "subcategory_id", "subcategory", "attributes",
    "variant_option_candidates", "descriptor_candidates", "context_review_fields",
    "candidate_product_types", "approved_product_types",
  ]],
  ["missing-data.csv", audit.missing, ["scope", "item", "reason", "status"]],
];
for (const [name, rows, columns] of exports) {
  await writeFile(new URL(name, out), csvText(rows, columns));
}
const manifest = {
  ...audit.summary,
  duplicate_product_export_ignored: productFiles[1],
  sources: inputs.map(({ path, sha256 }) => ({ path, sha256 })),
  label_collisions: audit.collisions,
  planned_table_renames: {
    aura_library_categories: "catalogue_categories",
    aura_library_subcategories: "catalogue_subcategories",
  },
  renames_applied: false,
  exports: exports.map(([name, rows]) => ({ name, rows: rows.length })),
};
await writeFile(new URL("audit-summary.json", out), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ output: fileURLToPath(out), ...audit.summary }, null, 2));
