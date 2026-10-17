import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { annReferenceSeed, parseCsv } from "./ann-reference-seed.js";
import { buildCatalogueAudit } from "./catalogue-audit.js";

// Reviewed source proposals authorised by the user on 2026-10-17.
// Context-review fields and missing type memberships are NOT approved by this import.
// Immutable migration input: changed sources/roles require a new migration.
const sources = [
  ["attached_assets/all_product_types_1792232609406.csv", "6da7213349f3b124dcf0f339193d471941e7115af644e007c4e6e545cdcdd221"],
  ["attached_assets/niche_categories_rows_1792039876788.csv", "180cd27c088162cba7b9a37eb61353a01a7582658fdc81db9ed4d69295469ffd"],
  ["attached_assets/niche_category_values_rows_1792039876788.csv", "f7e8cb4f9a0ce9835a7dbdf8d614250ac5a96a83fb12130b6fcef2d8bb7c6f8f"],
  ["db/staged/0015_aura_starter_library.sql", "083f3565d500b4e8973afa006e13815e4bb40f2c64402bb80e01e3943953cf60"],
];
const hash = value => createHash("sha256").update(value).digest("hex");
const key = value => String(value).toLocaleLowerCase("en");
const stableKey = (prefix, value) => `${prefix}_${hash(value).slice(0, 32)}`;
const unquote = value => value.replaceAll("''", "'");

function taxonomySnapshot(sql) {
  const categories = [...sql.matchAll(/INSERT INTO public\.aura_library_categories\([^)]*\)\s*VALUES\((\d+),'((?:''|[^'])*)','((?:''|[^'])*)'\);/g)]
    .map(m => ({ id: Number(m[1]), name: unquote(m[2]), slug: unquote(m[3]) }));
  const subcategories = [...sql.matchAll(/INSERT INTO public\.aura_library_subcategories\([^)]*\)\s*VALUES\((\d+),(\d+),'((?:''|[^'])*)','((?:''|[^'])*)'\);/g)]
    .map(m => ({ id: Number(m[1]), category_id: Number(m[2]), name: unquote(m[3]), slug: unquote(m[4]) }));
  if (categories.length !== 17 || subcategories.length !== 340) throw new Error("Catalogue taxonomy snapshot does not match the reviewed input.");
  return { categories, subcategories };
}

export async function reviewedCatalogueSeed() {
  const inputs = await Promise.all(sources.map(async ([path, expected]) => {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    if (hash(bytes) !== expected) throw new Error(`Reviewed catalogue source changed: ${path}. Add a new migration.`);
    return bytes.toString("utf8");
  }));
  const cleaned = await annReferenceSeed();
  const audit = buildCatalogueAudit({ taxonomy: taxonomySnapshot(inputs[3]), productTypes: parseCsv(inputs[0]),
    attributes: cleaned.attributes, values: cleaned.values, cleaningReport: cleaned.report });
  if (audit.proposedMappings.length !== 313 ||
      audit.summary.attribute_role_proposals.variant_option_candidate !== 148 ||
      audit.summary.attribute_role_proposals.descriptor_candidate !== 291) {
    throw new Error("Reviewed catalogue proposal counts changed.");
  }
  const values = new Map();
  for (const v of cleaned.values) {
    const list = values.get(v.attribute_id) || [];
    list.push(v); values.set(v.attribute_id, list);
  }
  const role = new Map(audit.attributeReview.map(a => [a.source_attribute_id, a.suggested_role]));
  const options = new Map(), optionByAttribute = new Map(), descriptors = new Map();
  const chosenValues = rows => {
    const unique = new Map();
    for (const v of rows) if (!unique.has(key(v.value))) unique.set(key(v.value), v);
    return [...unique.values()];
  };
  const descriptor = (name, rows) => {
    const items = chosenValues(rows);
    const descriptorKey = stableKey("descriptor", JSON.stringify([key(name), items.map(v => key(v.value)).sort()]));
    if (!descriptors.has(descriptorKey)) descriptors.set(descriptorKey, {
      key: descriptorKey, name, input_type: "multi_select", unit: null,
      items: items.map((v, sort_order) => ({ key: `source_value_${v.id}`, label: v.value, sort_order })),
    });
    return descriptors.get(descriptorKey);
  };
  // Import all explicitly classified source definitions, even where membership is
  // still missing. Applicability, not global existence, controls form visibility.
  for (const a of cleaned.attributes) {
    if (role.get(a.id) === "variant_option_candidate") {
      const optionKey = stableKey("option", key(a.name));
      if (!options.has(optionKey)) options.set(optionKey, { key: optionKey, name: a.name, items: [], seen: new Map() });
      const option = options.get(optionKey);
      const selected = [];
      for (const v of values.get(a.id) || []) {
        if (!option.seen.has(key(v.value))) {
          const item = { key: `source_value_${v.id}`, label: v.value, sort_order: option.items.length };
          option.items.push(item); option.seen.set(key(v.value), item);
        }
        selected.push(option.seen.get(key(v.value)).key);
      }
      optionByAttribute.set(a.id, { option, value_keys: [...new Set(selected)] });
    } else if (role.get(a.id) === "descriptor_candidate") descriptor(a.name, values.get(a.id) || []);
  }
  const attrsBySubcategory = new Map();
  for (const a of cleaned.attributes) {
    const group = attrsBySubcategory.get(a.subcategory_id) || [];
    group.push(a); attrsBySubcategory.set(a.subcategory_id, group);
  }
  const typeOptions = new Map(), typeDetails = new Map();
  for (const mapping of audit.proposedMappings) {
    for (const a of attrsBySubcategory.get(mapping.subcategory_id) || []) {
      if (optionByAttribute.has(a.id)) {
        const { option, value_keys } = optionByAttribute.get(a.id), linkKey = `${mapping.type_key}:${option.key}`;
        if (!typeOptions.has(linkKey)) typeOptions.set(linkKey, { type_key: mapping.type_key, option_key: option.key, value_keys: [] });
        const link = typeOptions.get(linkKey);
        link.value_keys = [...new Set([...link.value_keys, ...value_keys])];
      } else if (role.get(a.id) === "descriptor_candidate") {
        const linkKey = `${mapping.type_key}:${key(a.name)}`;
        if (!typeDetails.has(linkKey)) typeDetails.set(linkKey, { type_key: mapping.type_key, name: a.name, rows: [] });
        typeDetails.get(linkKey).rows.push(...values.get(a.id));
      }
    }
  }
  // Descriptor enum values are scoped to an exact context-specific definition:
  // the schema has no type/descriptor/value junction. Never expose an unrelated
  // category's value union through a shared descriptor with the same name.
  const descriptor_links = [...typeDetails.values()].map((d, sort_order) => ({
    type_key: d.type_key, descriptor_key: descriptor(d.name, d.rows).key, sort_order, is_required: false,
  }));
  const payload = {
    type_links: audit.proposedMappings.map(m => ({ subcategory_id: m.subcategory_id, type_key: m.type_key })),
    options: [...options.values()].map(({ seen, ...o }) => o),
    option_links: [...typeOptions.values()].map((o, sort_order) => ({ ...o, sort_order })),
    descriptors: [...descriptors.values()], descriptor_links,
  };
  const summary = {
    approved_type_links: payload.type_links.length, activated_product_types: new Set(payload.type_links.map(m => m.type_key)).size,
    source_option_assignments: 148, source_descriptor_assignments: 291,
    options: payload.options.length, option_values: payload.options.reduce((n, o) => n + o.items.length, 0),
    type_option_links: payload.option_links.length, type_option_value_links: payload.option_links.reduce((n, o) => n + o.value_keys.length, 0),
    types_with_buying_options: new Set(payload.option_links.map(o => o.type_key)).size,
    descriptors: payload.descriptors.length, descriptor_values: payload.descriptors.reduce((n, d) => n + d.items.length, 0),
    type_descriptor_links: payload.descriptor_links.length,
    unresolved_role_assignments: audit.attributeReview.filter(a => a.suggested_role === "context_review_required").length,
    types_without_membership: audit.typeCoverage.filter(t => !t.candidate_subcategory_count).length,
  };
  return { payload, summary, unresolved: audit.attributeReview.filter(a => a.suggested_role === "context_review_required"),
    coverage: audit.subcategoryCoverage.map(s => ({ ...s, approved_product_types: s.candidate_product_types })),
    unmapped_types: audit.typeCoverage.filter(t => !t.candidate_subcategory_count),
    sources: sources.map(([path, sha256]) => ({ path, sha256 })),
    sql: `INSERT INTO catalogue_reference_seed_v1(payload) VALUES ('${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb);` };
}
