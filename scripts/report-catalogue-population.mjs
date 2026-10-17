// Offline report generation only. No database, environment secrets or network.
import { mkdir, writeFile } from "node:fs/promises";
import { reviewedCatalogueSeed } from "../db/catalogue-reviewed-seed.js";
import { csvText } from "../db/catalogue-audit.js";

const data = await reviewedCatalogueSeed();
const out = new URL("../generated-artifacts/catalogue-population/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("summary.json", out), JSON.stringify({
  ...data.summary, sources: data.sources,
  scope: "approved_existing_proposals_only_no_merchant_backfill",
}, null, 2) + "\n");
await writeFile(new URL("unresolved-attribute-roles.csv", out), csvText(data.unresolved,
  ["category_id","category","subcategory_id","subcategory","source_attribute_id","attribute","suggested_role","value_count"]));
await writeFile(new URL("unmapped-product-types.csv", out), csvText(data.unmapped_types, ["type_key","name","source_usage_count","mapping_status"]));
await writeFile(new URL("subcategory-coverage.csv", out), csvText(data.coverage,
  ["category_id","category","subcategory_id","subcategory","attributes","approved_product_types","variant_option_candidates","descriptor_candidates","context_review_fields"]));
console.log(JSON.stringify(data.summary, null, 2));
console.log("Coverage reports: generated-artifacts/catalogue-population/");
