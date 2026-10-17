# Catalogue reference audit: Phase 1

## Scope and execution

Run `node scripts/audit-catalogue.mjs` from the repository root.
Run `node --test tests/catalogue-audit.test.js` to verify the analysis.

This is an offline audit of repository sources, not a live database inventory.
It does not read credentials, connect to a database, alter tables, seed reference
records, change merchant products or enable SKU checkout. Outputs are generated
under `generated-artifacts/catalogue-audit/`, which is excluded from Git and deployment.
The script and tests are the reproducible, versioned deliverable.

## Five masters

1. Category: reuse existing IDs.
2. Subcategory: reuse existing IDs and category relationships.
3. Product type: preserve each uploaded `type_key`.
4. Variant options: buying options and approved values that can form SKU combinations.
5. Descriptors: product facts with controlled values or validated typed inputs.

There are more than five physical tables: value sets, applicability mappings and
merchant selections need separate relationships. Actual merchant SKU combinations
remain separate from these shared masters.

All applicable choices must be available in the shared Ann/dashboard product form.
Only SKU axes are limited to three; descriptors do not share this limit. A product
may also have no buying options and a single SKU.

## Source handling and outputs

- `categories.csv` and `subcategories.csv`: current taxonomy IDs and relationships.
- `product-types-review.csv`: unique types, upstream usage counts and mapping coverage.
- `attribute-role-review.csv`: every cleaned attribute, original ID and suggested role.
- `reference-values.csv`: all cleaned values and their original attribute/value IDs.
- `candidate-type-mappings.csv`: evidence-backed proposals, never approved assignments.
- `subcategory-coverage.csv`: coverage across every subcategory, including gaps.
- `missing-data.csv`: missing membership source and priority pilot option gaps.
- `audit-summary.json`: counts, cleanup accounting, source hashes and rename targets.

The two uploaded product-type CSVs must have identical hashes; otherwise execution
fails until the authoritative input is selected. One is used, not both.

The existing Ann cleaner is reused. It excludes non-product taxonomy rows,
deduplicates source attribute/value rows and preserves its cleanup report. No source
CSV or previously applied migration is edited.

## Proposed mappings are not source truth

`used_in_subcategories` is a count, not an ID or membership list. It cannot populate
the subcategory/product-type junction table.

The audit can recover *candidate evidence* where an existing `Type`, `Product Type`
or `Form` field contains a normalized exact match to an uploaded type name. These
matches require review. Matching words elsewhere in descriptor values is not used.
Ambiguous normalized names are reported rather than choosing one.

Attribute roles are conservative label-based suggestions. All remain `needs_review`.
For example, Material can describe a dress or be a buying option for another type.
Length, Fit, Form and similar concepts need type-specific review. Names alone are
not enough to approve allowed values, SKU semantics or tax classification.

Gap checks highlight Women's Clothing Size/Colour, Skincare Volume and Ring size.
They are priority examples, not a claim that every missing option in all types has
been discovered. Missing option values are not invented or marked approved.

## Phase 2 rename and compatibility requirements

The requested canonical names are:

- `aura_library_categories` -> `catalogue_categories`
- `aura_library_subcategories` -> `catalogue_subcategories`

Use an additive, explicit migration sequence and preserve IDs. PostgreSQL table
renames retain existing rows and foreign-key targets, but string SQL references,
seed tools, tests, application queries and administrative scripts must be audited
and updated or safely bridged. Do not edit applied migrations to rename their
historical SQL. Old/new application versions must have a deliberate compatibility
strategy, including RLS-safe access; do not add unreviewed compatibility views.

Before applying anything, confirm the actual database migration state. Repository
files cannot establish that staged migrations are installed in development or production.
No rename has been applied in Phase 1.

## Review gate before reference imports

1. Obtain the original subcategory/type assignment export, or explicitly approve
   reviewed candidate and manually authored mappings.
2. Approve type-specific variant/descriptor roles, allowed values and units.
3. Resolve gaps and ambiguous labels; pilot clothing, skincare and jewellery first.
4. Keep unreviewed reference records inactive. Do not claim all 1,698 types have
   complete selling schemas merely because their names were imported.
5. Preserve existing products, SKU IDs, quantities, prices, HSN/GST, media, URLs and
   orders. Do not retroactively turn saved variants into descriptors or delete
   historical values because the new master differs.

Later phases add schema/imports, the shared form/API, controlled backfill and
end-to-end commerce verification. These are not completed by this audit.
