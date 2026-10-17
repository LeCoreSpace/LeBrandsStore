// Pure, offline Phase 1 analysis. Nothing here writes to a database.
export const canonicalLabel = value => String(value ?? "").normalize("NFKC")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const TYPE_HINTS = new Set(["type", "product type", "form"]);
const OPTION_HINTS = new Set([
  "size", "color", "colour", "shade", "volume", "pack size",
  "pack quantity", "pack count", "storage capacity", "ram",
]);
const DESCRIPTOR_HINTS = new Set([
  "skin type", "concern", "ingredient", "ingredients", "key ingredients",
  "spf protection", "spf level", "water resistance", "target audience",
  "occasion", "pattern", "neckline", "sleeve", "sleeve length", "season",
  "fit", "finish", "hair type", "application", "use case",
]);

export function attributeProposal(name) {
  const key = canonicalLabel(name);
  if (TYPE_HINTS.has(key)) return "product_type_hint";
  if (OPTION_HINTS.has(key)) return "variant_option_candidate";
  if (DESCRIPTOR_HINTS.has(key)) return "descriptor_candidate";
  return "context_review_required";
}

export function validateProductTypes(rows) {
  const keys = new Set();
  return rows.map(row => {
    const key = row.type_key?.trim(), name = row.name?.trim();
    if (!key || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(key) ||
        !name || name.length > 200 || keys.has(key)) {
      throw new Error("Invalid or duplicate product type key/name.");
    }
    if (!/^[1-9][0-9]*$/.test(String(row.used_in_subcategories)) ||
        !Number.isSafeInteger(Number(row.used_in_subcategories))) {
      throw new Error(`Invalid subcategory usage count for ${key}.`);
    }
    keys.add(key);
    return { type_key: key, name, source_usage_count: Number(row.used_in_subcategories) };
  });
}

export function buildCatalogueAudit({ taxonomy, productTypes, attributes, values, cleaningReport }) {
  const types = validateProductTypes(productTypes);
  const categories = new Map(taxonomy.categories.map(c => [c.id, c]));
  const subs = new Map(taxonomy.subcategories.map(s => [s.id, s]));
  if (categories.size !== taxonomy.categories.length || subs.size !== taxonomy.subcategories.length ||
      [...subs.values()].some(s => !categories.has(s.category_id))) {
    throw new Error("Invalid category/subcategory relationships.");
  }
  const attrs = new Map();
  for (const a of attributes) {
    if (attrs.has(a.id) || !subs.has(a.subcategory_id)) throw new Error("Invalid source attribute relationship.");
    attrs.set(a.id, a);
  }
  const valueIds = new Set(), byAttribute = new Map();
  for (const v of values) {
    if (valueIds.has(v.id) || !attrs.has(v.attribute_id)) throw new Error("Invalid source value relationship.");
    valueIds.add(v.id);
    const group = byAttribute.get(v.attribute_id) || [];
    group.push(v);
    byAttribute.set(v.attribute_id, group);
  }
  const location = subId => {
    const sub = subs.get(subId), category = categories.get(sub.category_id);
    return { category_id: category.id, category: category.name,
      subcategory_id: sub.id, subcategory: sub.name };
  };
  const review = attributes.map(a => ({
    ...location(a.subcategory_id), source_attribute_id: a.id, attribute: a.name,
    suggested_role: attributeProposal(a.name), value_count: byAttribute.get(a.id)?.length || 0,
    review_status: "needs_review",
    note: "Label-based proposal only; confirm meaning and values for each product type.",
  }));
  const byName = new Map();
  for (const type of types) {
    const key = canonicalLabel(type.name), group = byName.get(key) || [];
    group.push(type);
    byName.set(key, group);
  }
  const collisions = [...byName].filter(([, group]) => group.length > 1)
    .map(([label, group]) => ({ normalized_label: label, type_keys: group.map(t => t.type_key) }));
  const links = new Map();
  for (const a of attributes.filter(a => TYPE_HINTS.has(canonicalLabel(a.name)))) {
    for (const v of byAttribute.get(a.id) || []) {
      const matches = byName.get(canonicalLabel(v.value));
      // Never guess a winner where normalized names collide.
      if (matches?.length !== 1) continue;
      const type = matches[0], key = `${a.subcategory_id}:${type.type_key}`;
      let link = links.get(key);
      if (!link) {
        link = { ...location(a.subcategory_id), type_key: type.type_key, product_type: type.name,
          evidence: [], review_status: "needs_review",
          method: "normalized_name_match_in_type_or_form_attribute" };
        links.set(key, link);
      }
      link.evidence.push({ source_attribute_id: a.id, attribute: a.name,
        source_value_id: v.id, value: v.value });
    }
  }
  const proposedMappings = [...links.values()].sort((a, b) =>
    a.subcategory_id - b.subcategory_id || a.type_key.localeCompare(b.type_key, "en"));
  const typeCoverage = types.map(type => {
    const candidateCount = proposedMappings.filter(m => m.type_key === type.type_key).length;
    return { ...type, candidate_subcategory_count: candidateCount,
      approved_subcategory_count: 0, mapping_status: candidateCount ? "candidates_need_review" : "mapping_missing",
      source_count_difference: type.source_usage_count - candidateCount };
  });
  const subcategoryCoverage = [...subs.values()].map(sub => {
    const fields = review.filter(a => a.subcategory_id === sub.id);
    return { ...location(sub.id), attributes: fields.length,
      variant_option_candidates: fields.filter(a => a.suggested_role === "variant_option_candidate").length,
      descriptor_candidates: fields.filter(a => a.suggested_role === "descriptor_candidate").length,
      context_review_fields: fields.filter(a => a.suggested_role === "context_review_required").length,
      candidate_product_types: proposedMappings.filter(m => m.subcategory_id === sub.id).length,
      approved_product_types: 0 };
  });
  const missing = [{
    scope: "all_product_types", item: "Original product-type/subcategory assignments",
    reason: "The uploaded CSV provides counts, not membership. Candidate matches are not authoritative.",
    status: "source_mapping_required_or_manual_review",
  }];
  const pilots = [
    { id: 2, type: "dress", options: [["Size", ["size"]], ["Colour", ["colour", "color"]]] },
    { id: 21, type: "serum", options: [["Volume", ["volume", "pack size"]]] },
    { id: 46, type: "ring", options: [["Ring size", ["ring size", "size"]]] },
  ];
  for (const pilot of pilots) {
    if (!subs.has(pilot.id)) continue;
    const names = new Set(attributes.filter(a => a.subcategory_id === pilot.id).map(a => canonicalLabel(a.name)));
    for (const [label, aliases] of pilot.options) {
      if (!aliases.some(name => names.has(name))) missing.push({
        scope: `${subs.get(pilot.id).name} / ${pilot.type}`, item: label,
        reason: "No matching option in the cleaned subcategory reference. Exact values and type applicability require review.",
        status: "option_definition_and_values_required",
      });
    }
  }
  const roleCounts = Object.fromEntries(["product_type_hint", "variant_option_candidate",
    "descriptor_candidate", "context_review_required"].map(role =>
    [role, review.filter(row => row.suggested_role === role).length]));
  return {
    summary: {
      scope: "repository_sources_only_not_a_live_database_audit",
      categories: categories.size, subcategories: subs.size, product_types: types.length,
      attributes: attributes.length, values: values.length, attribute_role_proposals: roleCounts,
      candidate_type_subcategory_links: proposedMappings.length, approved_links: 0,
      types_with_candidates: typeCoverage.filter(t => t.candidate_subcategory_count > 0).length,
      types_without_candidates: typeCoverage.filter(t => !t.candidate_subcategory_count).length,
      normalized_type_label_collisions: collisions.length,
      schema_import_ready: false,
      blocked_on: "Approve mappings, role assignments and missing values before activating reference imports.",
      cleaning_report: cleaningReport,
    },
    productTypes: types, typeCoverage, subcategoryCoverage, attributeReview: review,
    sourceValues: values.map(v => ({ source_value_id: v.id,
      source_attribute_id: v.attribute_id, value: v.value, sort_order: v.sort_order })),
    proposedMappings, missing, collisions,
  };
}

export function csvText(rows, columns) {
  const cell = value => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Uploaded labels are data, not spreadsheet formulas.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns, ...rows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
