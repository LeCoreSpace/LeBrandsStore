# Catalogue masters: Phase 2

## Applied status

Applied to the project's configured external Supabase database on 2026-10-17.
Read-only verification through administrative and restricted application
connections confirmed 17 categories, 340 subcategories, and 1,698 pending/inactive
product types. The old names are compatibility views with matching counts.
No existing merchant product received a new classification.

Type/subcategory mappings, new variant-option definitions and new descriptor
definitions remain empty intentionally: the source assignments and role/value
reviews are still outstanding. Existing Ann references remain available so the
current forms continue working. This is schema readiness, not full data activation.

## Scope

The explicit staged migration `0020_catalogue_masters.sql`:

- Renames the existing physical taxonomy tables to `catalogue_categories` and
  `catalogue_subcategories`. Existing IDs, rows, foreign keys, grants and RLS
  policies remain attached to the same underlying relations.
- Adds `updated_at` and timestamp-maintenance triggers to those tables.
- Adds nine reference/value/mapping tables for product types, variant options and
  descriptors, plus four store-scoped tables for future product selections.
- Adds nullable `category_id`, `subcategory_id` and `product_type_id` references to
  `products`, with category/subcategory/type relationship constraints.
- Imports 1,698 product-type names as **pending and inactive** from the exact,
  checksum-pinned export. The upstream usage count is metadata, not a mapping.

It does not classify existing merchant products, turn old attributes into new
masters, approve inferred mappings, change current variant rows or enable new
product-form/checkout behaviour. Existing media, collections, catalogue JSON,
SKUs, prices, stock, HSN/GST and order references are retained.

## Canonical relations

Reference tables:

1. `catalogue_categories` (renamed)
2. `catalogue_subcategories` (renamed)
3. `catalogue_product_types`
4. `catalogue_subcategory_product_types`
5. `catalogue_variant_options`
6. `catalogue_variant_option_values`
7. `catalogue_product_type_options`
8. `catalogue_product_type_option_values`
9. `catalogue_descriptors`
10. `catalogue_descriptor_values`
11. `catalogue_product_type_descriptors`

Merchant selections:

- `product_variant_axes`: positions 1–3, unique per product/position and option.
- `product_variant_axis_values`: chosen values allowed for that product type.
- `product_variant_option_values`: structured links to existing `product_options`
  SKU rows, not a replacement variant table.
- `product_descriptor_values`: single/multiple controlled values or typed text,
  finite numeric or boolean values. No three-descriptor limit.

Tenant/product/type composite foreign keys prevent selections for another
merchant's product or another product's SKU. Single-select descriptors have one
row; multi-select descriptors may have several distinct values.

Product references are initially nullable for backward compatibility. A
subcategory cannot be saved without its category; a type cannot be saved without
its mapped subcategory. No title-based backfill runs.

## Permissions and approval

New reference tables are administrator-written. `lebrands_app` receives SELECT
only, filtered through forced RLS to approved data and approved parent records.
Approved but retired definitions remain readable so historical product values
can still be interpreted. Future selectors must additionally filter `is_active`.

Merchant selection tables have forced tenant RLS and SELECT-only app grants.
Future authenticated transactional write routines are Phase 3 work. This migration
does not grant arbitrary direct merchant or shared-reference writes.

Future save routines must enforce active approvals, descriptor requiredness,
complete SKU combinations and the existing 200-combination limit. The structural
constraints here do not claim to implement the entire product save workflow.

## Safe transition for old published Workers

The old `aura_library_categories` and `aura_library_subcategories` names become
SELECT-only app compatibility views, not duplicate tables. They use PostgreSQL
15+ `security_invoker=true`, so access retains the underlying table's RLS.
They project the original columns, preserving older SELECT contracts.

Current Ann queries explicitly detect the schema version. They use canonical
tables after this migration, legacy tables before it, and fail if only one
canonical table exists. There is no catch-and-ignore fallback for query errors.

Do not remove the compatibility views until old published Workers and legacy
administrative callers have been retired. Do not rewrite historical migrations
or the generator for the original migration; doing so breaks checksums.

## Verification and manual application

Offline verification:

```sh
node --experimental-test-module-mocks --test --test-concurrency=1 \
  tests/catalogue-masters.test.js tests/catalogue-audit.test.js \
  tests/ann-builder-stage4.test.js tests/ann-foundation.test.js \
  tests/catalogue-persistence.test.js
```

Tests use real foundational migrations in an isolated PGlite database. They cover
renames, compatibility RLS, legacy/new Ann reference parity, pending imports,
permissions, tenant foreign keys, the three-axis limit and typed descriptors.

For the project's external Supabase database, after confirming the target and
the prerequisite migration:

```sh
pnpm run db:migrate -- --staged-catalogue-masters
```

The existing administrative runner performs the migration and ledger write in
one transaction under an advisory lock. It requires `0019_catalogue_forms.sql`,
checks migration checksums and rejects nonadministrative roles. An already
applied unchanged migration is skipped. No startup/deployment/merge hook runs it.

Never print database URLs or credentials during preflight or verification.
Do not run this command against Replit's built-in database.

## Next gate

Phase 3 is the shared product form and authenticated save API. Before activating
all product types, obtain or approve their subcategory memberships and their
complete type-specific option/descriptor/value mappings. Phase 1 candidate
matches are still not approved source truth.
