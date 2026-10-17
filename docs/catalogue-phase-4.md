# Catalogue reference population

## Applied status

Applied to the configured external Supabase database on 2026-10-17. Read-only
administrative verification matched the expanded migration checksum and every
manifest count. Before/after fingerprints of products, product options, product
media, media, collections and collection membership matched exactly.

Restricted-role verification confirmed 188 approved visible product types,
unchanged read-only reference privileges, and correctly scoped Serum details
without unrelated Volume choices. No app code was published and no merchant
product backfill was performed.

## Authorisation and scope

On 2026-10-17 the user confirmed the mappings were reviewed and authorised
population of variants, descriptors and their values. This import approves the
existing explicit Phase 1 proposals, not mappings or attribute roles that were
never supplied. Historical Phase 1 reports remain unchanged with their original
`needs_review` statuses; this new migration records the subsequent approval.

The import is separate from merchant classification backfill and does not touch
products, SKU rows, prices, stock, GST/HSN, media, collections, SEO or orders.

## Import manifest

| Reference | Imported |
|---|---:|
| Approved type/subcategory memberships | 313 |
| Activated distinct product types | 188 |
| Source buying-option assignments | 148 |
| Distinct buying-option masters | 7 |
| Buying-option values | 161 |
| Type/option links | 142 |
| Type/option/value links | 777 |
| Product types with mapped buying options | 104 |
| Source descriptor assignments | 291 |
| Context-specific descriptor masters | 296 |
| Descriptor values, including contextual copies | 1,653 |
| Type/descriptor links | 235 |

Buying-option names are **Size, Color, Shade, Storage Capacity, Pack Size, RAM
and Volume**. Values come from the uploaded source without splitting comma-bearing
labels, inventing sizes, or transferring another type's values.

Names and case-equivalent values are deduplicated deterministically, retaining
an actual source spelling and original value ID in the stable value key.
Each product type receives only values sourced from its approved memberships.
Existing merchant snapshots and SKU strings are never normalised or rewritten.

Descriptor definitions with different allowed values are context-specific:
the schema does not have a type/descriptor/value junction. Reusing one global
enum for a shared descriptor label would expose unrelated category values.
Where the same type has multiple reviewed branches, their approved descriptor
values are combined once per descriptor name for that type.

All imported descriptors are optional controlled multi-select fields. The source
provides enum values, not a reviewed typed-input, single-select, requiredness or
unit specification. No units, numeric conversions or mandatory fields are inferred.
Merchants may choose applicable facts without creating extra SKUs.

## Explicit remaining gaps

- **1,335 source attributes** have no assigned variant/descriptor role. They
  remain unresolved and are not silently turned into either kind of master.
- **1,510 product types** lack supplied memberships and remain pending/inactive.
- Women's Clothing has no mapped product types or Size/Color source assignments
  in this review package. No clothing values were manufactured.
- Skincare's reviewed Serum/Lotion memberships do not include a Volume assignment.
  Volume choices from unrelated types must not appear there.
- Rings lacks product-type membership in the current package. Its global source
  Size definition alone is insufficient to infer a ring/type/value mapping.

These are source coverage gaps, not dropdown-loading failures. Full catalogue
coverage still requires the missing reviewed memberships and contextual roles.

## Execution and reproducibility

Run explicitly against the configured external Supabase database:

```sh
pnpm run db:migrate -- --staged-catalogue-references
```

`0022_catalogue_reviewed_references.sql` requires `0021_catalogue_forms_api.sql`.
The seed pins uploaded source hashes and the immutable taxonomy snapshot.
Do not edit this applied migration or its seed algorithm; further assignments
require a new reviewed migration. It refuses to overwrite preexisting new-master
definitions or mappings. The migration runner's ledger makes a repeated identical
command a no-op.

Generate an offline coverage report:

```sh
node scripts/report-catalogue-population.mjs
```

Outputs under ignored `generated-artifacts/catalogue-population/`:
`summary.json`, `unresolved-attribute-roles.csv`, `unmapped-product-types.csv`,
and `subcategory-coverage.csv`. No credentials or merchant data are exported.

## Verification

`tests/catalogue-population.test.js` uses actual foundational DDL in isolated
PGlite. It checks all manifest counts, active/approved flags, every one of the
313 scoped reference responses and their exact allowed values, pending exclusions,
no cross-context value leakage, duplicate-import refusal, unchanged merchant
snapshots, real product saving through the shared API using imported IDs, and
restricted-role denial of reference writes.

Both dashboard and Ann use the same reference endpoint and product form. No
frontend fork, store reconfiguration or product backfill is needed to expose an
approved mapped type's choices.
