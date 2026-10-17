import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogueAudit, validateProductTypes, attributeProposal, csvText } from "../db/catalogue-audit.js";
import { parseCsv, annReferenceSeed } from "../db/ann-reference-seed.js";
import { TAXONOMY } from "../src/public/aura-taxonomy-data.js";
import { readFile } from "node:fs/promises";

const types = [
  { type_key: "dress", name: "Dress", used_in_subcategories: "2" },
  { type_key: "serum", name: "Serum", used_in_subcategories: "1" },
];
function fixture() {
  return {
    taxonomy: { categories: [{ id: 1, name: "Clothing" }],
      subcategories: [{ id: 2, category_id: 1, name: "Womens Clothing" }] },
    productTypes: structuredClone(types),
    attributes: [
      { id: 1, subcategory_id: 2, name: "Product Type" },
      { id: 2, subcategory_id: 2, name: "Material" },
    ],
    values: [
      { id: 1, attribute_id: 1, value: "dress", sort_order: 0 },
      { id: 2, attribute_id: 2, value: "Serum", sort_order: 0 },
    ],
    cleaningReport: {},
  };
}

test("type matches remain review candidates and never become approved imports", () => {
  const result = buildCatalogueAudit(fixture());
  assert.equal(result.proposedMappings.length, 1);
  assert.equal(result.proposedMappings[0].type_key, "dress");
  assert.equal(result.proposedMappings[0].review_status, "needs_review");
  assert.equal(result.proposedMappings[0].evidence[0].source_value_id, 1);
  assert.equal(result.typeCoverage.find(t => t.type_key === "serum").mapping_status, "mapping_missing");
  assert.equal(result.summary.approved_links, 0);
  assert.equal(result.summary.schema_import_ready, false);
  assert.equal(result.summary.types_without_candidates, 1);
  assert.equal(result.summary.attribute_role_proposals.context_review_required, 1);
});

test("ambiguous labels, incomplete relationships and duplicates cannot silently assign mappings", () => {
  const data = fixture();
  data.productTypes.push({ type_key: "other_dress", name: "DRESS!", used_in_subcategories: "1" });
  const result = buildCatalogueAudit(data);
  assert.equal(result.proposedMappings.length, 0);
  assert.equal(result.summary.normalized_type_label_collisions, 1);
  data.attributes[0].subcategory_id = 999;
  assert.throws(() => buildCatalogueAudit(data), /attribute relationship/);
  const badValue = fixture();
  badValue.values[0].attribute_id = 999;
  assert.throws(() => buildCatalogueAudit(badValue), /value relationship/);
  assert.throws(() => validateProductTypes([...types, types[0]]), /duplicate/);
  assert.throws(() => validateProductTypes([{ ...types[0], used_in_subcategories: "not-an-id-list" }]), /usage count/);
});

test("label classifications are proposals, not a blanket conversion of attributes into variants", () => {
  assert.equal(attributeProposal("Colour"), "variant_option_candidate");
  assert.equal(attributeProposal("Skin Type"), "descriptor_candidate");
  assert.equal(attributeProposal("Form"), "product_type_hint");
  assert.equal(attributeProposal("Material"), "context_review_required");
  assert.equal(attributeProposal("Unrecognised field"), "context_review_required");
  const data = fixture(), before = structuredClone(data);
  assert.deepEqual(buildCatalogueAudit(data), buildCatalogueAudit(data));
  assert.deepEqual(data, before);
});

test("CSV reports quote labels, protect formulas and preserve source IDs", () => {
  const text = csvText([{ id: 7, value: '=1+2,"x"\nline' }], ["id", "value"]);
  const [row] = parseCsv(text);
  assert.equal(row.id, "7");
  assert.equal(row.value, '\'=1+2,"x"\nline');
});

test("real uploaded sources reconcile without inventing approved mappings or changing source data", async () => {
  const bytes = await readFile(new URL("../attached_assets/all_product_types_1792232609406.csv", import.meta.url), "utf8");
  const duplicate = await readFile(new URL("../attached_assets/all_product_types_(1)_1792232609405.csv", import.meta.url), "utf8");
  assert.equal(bytes, duplicate);
  const { attributes, values, report } = await annReferenceSeed();
  const result = buildCatalogueAudit({
    taxonomy: TAXONOMY, productTypes: parseCsv(bytes), attributes, values, cleaningReport: report,
  });
  assert.equal(result.summary.categories, 17);
  assert.equal(result.summary.subcategories, 340);
  assert.equal(result.summary.product_types, 1698);
  assert.equal(result.summary.attributes, 1971);
  assert.equal(result.summary.values, 9613);
  assert.equal(result.attributeReview.length, attributes.length);
  assert.equal(result.sourceValues.length, values.length);
  assert.ok(result.attributeReview.every(a => a.review_status === "needs_review"));
  assert.ok(result.missing.some(m => m.scope.includes("Womens Clothing") && m.item === "Size"));
  assert.ok(result.missing.some(m => m.scope.includes("Skincare") && m.item === "Volume"));
});
