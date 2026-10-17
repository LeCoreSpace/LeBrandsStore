# Catalogue forms and API: Phase 3

## Applied status

Applied to the configured external Supabase database on 2026-10-17. Read-only
administrative and restricted-role checks confirmed that the migration checksum
matches, private routine permissions are correct, all 1,698 source types remain
pending/inactive, no mappings/options/descriptors were activated, and no merchant
classification or revision was backfilled.

The isolated browser pass created and reloaded a four-SKU product, edited it
through both the dashboard form and Ann's modal, and verified saved descriptors,
SEO, stock and stable SKU identities. Required-field validation and a 390-pixel
mobile layout passed. No live merchant pages or data were used.

## Scope and data boundary

The existing shared dashboard product form is also used inside Ann's collection
and product modals. It now supports category → subcategory → product type, up to
three buying-option axes, generated SKU combinations, and applicable descriptors.
Vendor, tags, collections, media, SEO, HSN and GST continue using the existing
form and product endpoints.

This phase does **not** approve reference data or classify existing products.
The Phase 1 source contains product-type names and usage counts, not verified
membership mappings. Pending masters stay unavailable. Empty type lists show a
pending-approval notice, not invented options or a broken dropdown.

Development-only PGlite preview fixtures include synthetic approved Dress/Size/
Colour/details records to exercise the UI. These are not copied into Supabase
and are not imported by the production Worker.

## Reference API

Authenticated GET:

`/api/stores/:storeId/ann/reference?catalogue=1&subcategory_id=:id&product_type_id=:id`

The existing Ann reference response remains compatible. An additive `catalogue`
object contains:

- `enabled`: whether the Phase 3 database routine exists.
- `product_types`: approved active types mapped to the selected subcategory.
- `product_type`: the selected applicable type, or null.
- `options`: approved type-specific option definitions and permitted values.
- `descriptors`: applicable typed definitions, units, requiredness and values.

With no subcategory, type lists are empty. With no selected type, options and
descriptors are empty. A mismatched/retired/pending type never becomes selectable
because its ID is known. Dashboard users need not run an Ann setup session to
use this reference endpoint.

## Product contract

Existing POST/PATCH product endpoints accept an optional top-level
`classification` object, separate from legacy `catalogue` JSON:

```json
{
  "category_id": 1,
  "subcategory_id": 2,
  "product_type_id": 123,
  "expected_revision": 0,
  "options": [{"option_id": 7, "value_ids": [10, 11]}],
  "descriptors": [
    {"descriptor_id": 9, "value_ids": [20]},
    {"descriptor_id": 12, "text_value": "Cold hand wash"},
    {"descriptor_id": 13, "number_value": 250},
    {"descriptor_id": 14, "boolean_value": false}
  ]
}
```

IDs above illustrate shape only; they are not catalogue assignments. Options
and their chosen value IDs retain axis/value order. Descriptor selections are
canonicalised by ID; controlled descriptor values are also sorted by ID.

`catalogue.axes` still carries `{name, values}` for the existing SKU generator.
The server checks those names and values against the selected master IDs and
derives category/subcategory display names from the database. Free-form labels
cannot forge approved classifications.

The existing product `variants` array carries IDs, immutable combination
attributes, generated SKUs, stock, prices and `expected_stock` for concurrency.
Every combination must be present once, with no more than 200 combinations.
Single-version products have zero axes and no variant rows.

Descriptors support single-select, multi-select, text, finite number and boolean
inputs. False and zero are valid values. Applicable required details must be
completed; descriptors are not subject to the three-axis limit.

To clear a classification:

```json
{"classification":{"clear":true,"expected_revision":3}}
```

Existing buying options must first be removed and the empty combination set
generated/saved. SKU rows with order history cannot be removed. Clearing a type
does not silently transfer stock into another SKU.

GET/setup and saved product responses include `classification`,
`catalogue_revision`, and display-only `classification_reference` metadata.
Reopened Ann and dashboard forms use the same stored state. A stale
classification revision or variant stock returns a conflict instead of
overwriting newer changes.

## Historical and unmigrated products

Legacy catalogue JSON and unclassified products remain supported. Existing
legacy buying options and quantities can still be edited. New UI choices use
approved type-specific masters once the API schema is installed.

Unchanged retired selections remain attached and visibly identified as saved.
They can survive stock, price, vendor and SEO edits without being substituted.
Changing their classification requires currently approved applicable data.
Saved descriptor values have visible fallbacks even if no longer offered.
Unsaved descriptor input is retained per type while switching between types.

Without the Phase 3 routine, the form explicitly reports the prerequisite and
retains its legacy behaviour. New classification writes return a database-update
conflict rather than pretending to persist unsupported fields.

HSN/GST are never inferred from an unreviewed type name. Existing tax validation
and legacy-rate preservation are unchanged. SKU-level checkout is not enabled
by this phase; existing publication restrictions remain.

## Transaction and permission boundary

`0021_catalogue_forms_api.sql` adds:

- Integer `products.catalogue_revision`, avoiding timestamp precision loss.
- Selected-value ordering for variant axes.
- An RLS-respecting selection reader.
- A private security-definer writer requiring the current tenant, a valid store
  session and owner/admin membership.
- Deferred SKU-consistency checks that prohibit committing incomplete
  associations, including committing a prepare/clear-links call by itself.

Shared masters and merchant selection tables remain read-only to `lebrands_app`.
Only the authenticated private routine writes the new selection tables. Base
products, variant rows and selections save in the existing store transaction.
Invalid choices, stale saves, missing required details and failed deletions roll
back parent product changes as well. Anonymous/public roles cannot call the
private routines. Existing order-history restrictions stay in place.

## Manual migration and verification

After `0020_catalogue_masters.sql`, use the existing external Supabase runner:

```sh
pnpm run db:migrate -- --staged-catalogue-api
```

Do not run against Replit's built-in database, rewrite earlier applied migrations
or add a startup/merge migration hook. No reference rows are activated by this
migration.

Focused checks:

```sh
node --experimental-test-module-mocks --test --test-concurrency=1 \
  tests/catalogue-classification-api.test.js \
  tests/catalogue-classification-ui.test.js \
  tests/catalogue-reference.test.js \
  tests/catalogue-persistence.test.js \
  tests/catalogue-forms.test.js \
  tests/catalogue-modal.test.js \
  tests/catalogue-frame-headers.test.js
```

Use `/__ann-builder-preview/catalogue/products/new` for isolated development
preview. Do not use live merchant data to seed or test catalogue masters.

## Next phase

Review and populate complete type/subcategory, option/value and descriptor/value
mappings before activating them. A controlled merchant backfill must be reviewed
separately; never classify existing products from titles or usage counts.
