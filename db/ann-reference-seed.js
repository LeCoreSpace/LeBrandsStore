import { readFile } from "node:fs/promises";

// CSV is parsed locally only. Ad-card assignments are intentionally not imported.
export function parseCsv(text) {
  const rows = [], row = [];
  let field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push([...row]); row.length = 0; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV field.");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push([...row]); }
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length) throw new Error("Invalid CSV header.");
  return rows.filter(r => r.some(Boolean)).map(r => {
    if (r.length !== header.length) throw new Error("Invalid CSV row width.");
    return Object.fromEntries(header.map((key, i) => [key, r[i]]));
  });
}
const id = value => {
  const n = Number(value);
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(n)) throw new Error("Invalid reference ID.");
  return n;
};
const label = value => {
  const cleaned = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= 200 && !/[<>\u0000-\u001f]/.test(cleaned) &&
    !/^(?:null|undefined|n\/a|none|select|choose|-)$/i.test(cleaned) ? cleaned : null;
};
const rank = value => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < 100000 ? Number(value) : 0;
export function cleanAnnReferences(attributeRows, valueRows, productSubcategoryIds) {
  const allowed = new Set(productSubcategoryIds), attributes = [], values = [];
  const aliases = new Map(), attributeKeys = new Map(), valueKeys = new Set(), attributeIds = new Set(), valueIds = new Set();
  const report = { source_attributes: attributeRows.length, source_values: valueRows.length, excluded_attributes: 0, duplicate_attributes: 0, excluded_values: 0, duplicate_values: 0 };
  for (const r of [...attributeRows].sort((a, b) => id(a.id) - id(b.id))) {
    const sourceId = id(r.id), subcategory = id(r.subcategory_id);
    if (attributeIds.has(sourceId)) throw new Error("Duplicate source attribute ID.");
    attributeIds.add(sourceId);
    const name = label(r.name);
    if (!allowed.has(subcategory) || !name) { report.excluded_attributes++; continue; }
    const key = `${subcategory}:${name.toLocaleLowerCase("en")}`;
    if (attributeKeys.has(key)) {
      aliases.set(sourceId, attributeKeys.get(key)); report.duplicate_attributes++; continue;
    }
    attributeKeys.set(key, sourceId); aliases.set(sourceId, sourceId);
    attributes.push({ id: sourceId, subcategory_id: subcategory, name, sort_order: rank(r.sort_order) });
  }
  for (const r of [...valueRows].sort((a, b) => id(a.id) - id(b.id))) {
    const sourceId = id(r.id);
    if (valueIds.has(sourceId)) throw new Error("Duplicate source value ID.");
    valueIds.add(sourceId);
    const attribute = aliases.get(id(r.niche_category_id)), value = label(r.value);
    if (!attribute || !value) { report.excluded_values++; continue; }
    const key = `${attribute}:${value.toLocaleLowerCase("en")}`;
    if (valueKeys.has(key)) { report.duplicate_values++; continue; }
    valueKeys.add(key);
    values.push({ id: sourceId, attribute_id: attribute, value, sort_order: rank(r.sort_order) });
  }
  // A question without any selectable answers is not useful reference data.
  const populated = new Set(values.map(v => v.attribute_id));
  report.empty_attributes = attributes.filter(a => !populated.has(a.id)).length;
  const result = attributes.filter(a => populated.has(a.id));
  return { attributes: result, values, report: { ...report, attributes: result.length, values: values.length } };
}
export async function annReferenceSeed() {
  const asset = name => readFile(new URL(`../attached_assets/${name}_1792039876788.csv`, import.meta.url), "utf8");
  // Pin membership to the immutable, prerequisite migration, not a changing
  // runtime taxonomy module. Re-running an applied migration keeps its checksum.
  const taxonomy = await readFile(new URL("./staged/0015_aura_starter_library.sql", import.meta.url), "utf8");
  const subcategories = [...taxonomy.matchAll(/INSERT INTO public\.aura_library_subcategories\([^)]*\)\s*VALUES\s*\((\d+),/g)].map(m => Number(m[1]));
  if (!subcategories.length) throw new Error("Product taxonomy snapshot is missing.");
  const data = cleanAnnReferences(parseCsv(await asset("niche_categories_rows")), parseCsv(await asset("niche_category_values_rows")), subcategories);
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  return {
    ...data,
    sql: `-- Clean Ann reference import: ${JSON.stringify(data.report)}\n
INSERT INTO public.ann_reference_attributes(id,subcategory_id,name,sort_order)
SELECT id,subcategory_id,name,sort_order FROM jsonb_to_recordset(${literal(data.attributes)})
AS x(id bigint,subcategory_id bigint,name text,sort_order integer);
INSERT INTO public.ann_reference_values(id,attribute_id,value,sort_order)
SELECT id,attribute_id,value,sort_order FROM jsonb_to_recordset(${literal(data.values)})
AS x(id bigint,attribute_id bigint,value text,sort_order integer);`,
  };
}
