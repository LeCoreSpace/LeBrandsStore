import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseCsv } from "./ann-reference-seed.js";
import { validateProductTypes } from "./catalogue-audit.js";

// Immutable input for the migration checksum. New exports require a new migration.
const SOURCE = "../attached_assets/all_product_types_1792232609406.csv";
const SHA256 = "6da7213349f3b124dcf0f339193d471941e7115af644e007c4e6e545cdcdd221";
export async function catalogueProductTypeSeed() {
  const bytes = await readFile(new URL(SOURCE, import.meta.url));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== SHA256) throw new Error("Catalogue product-type source changed; add a new reviewed migration.");
  const types = validateProductTypes(parseCsv(bytes.toString("utf8")));
  const json = JSON.stringify(types).replaceAll("'", "''");
  return {
    count: types.length, sha256: hash,
    sql: `INSERT INTO public.catalogue_product_types(type_key,name,source_usage_count)
      SELECT type_key,name,source_usage_count FROM jsonb_to_recordset('${json}'::jsonb)
      AS source(type_key text,name text,source_usage_count integer) ORDER BY type_key;`,
  };
}
