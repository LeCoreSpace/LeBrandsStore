# D2C descriptor coverage

## Applied status

Applied manually to the configured external Supabase database on 2026-10-17 using
`0028_d2c_descriptor_coverage.sql`, after the membership and food-profile corrections.
No application publish was performed.

| Measure | Result |
|---|---:|
| Product types with applicable descriptors | 1,698 |
| Types without descriptors | 0 |
| Contextual descriptor profiles | 113 |
| Descriptor definitions added | 177 |
| Total descriptor definitions | 473 |
| Controlled preset values added | 225 |
| Total descriptor preset values | 1,878 |
| Active type/descriptor links | 16,179 |

These counts describe reference coverage, not filled-in merchant products.
Nothing is automatically selected or entered for a product.

## Fields and applicability

Every type receives relevant optional details, with common manufacturer, origin
and package-content fields. Domain profiles add facts such as fabric and fit,
metal composition and stones, ingredients and storage, connectivity and warranty,
author/page count, pet species, vehicle fitment or instrument construction.
Explicit semantic exceptions distinguish haircare from skincare, pet medicines
from human products, food names from bag/supplement profiles, and plant supplies
from live plants.

All new definitions are optional. Controlled lists use multi-select; manufacturer-
specific facts use text; suitable measurements use numbers with explicit units;
yes/no inputs include an unset state, and an explicit false is preserved.
Descriptors do not use the three-axis limit or generate SKUs.

Existing same-label definitions and applicability IDs take precedence over the new
curated vocabulary. Previously reviewed labels, values, requiredness, mappings and
timestamps are unchanged. Definitions with different controlled value contexts
must not be merged just because their display names match.

These are merchant declarations, not independent verification of certifications,
health benefits, safety ratings, licences, ingredients or warranties. No HSN/GST,
medical dosage, manufacturer compatibility or product facts are inferred.
The curated baseline is not a blanket promotion of every historically unresolved
uploaded attribute into a descriptor; ambiguous roles still require semantic
review rather than conversion based only on the subcategory.

## Application behaviour

The existing authenticated `catalogueReference` response and shared product form
serve both Ann's modal and the dashboard. No second catalogue or form was added.
The shared form explains that product details do not create variants or change
stock and requests manufacturer information for ingredients, safety and warranty.

Selections persist in `product_descriptor_values`; shared descriptor masters
remain read-only to the application role. Existing unchanged/retired selections
are preserved when updating stock or other product data. Invalid context or input
type is rejected atomically.

This phase does not add public storefront specification rendering, SKU checkout,
inventory reservations, plan enforcement or automatic merchant backfills.
Products with variants retain their existing draft-only publication restriction.

## Verification

- Full foundational migration sequence tested in PGlite, not an invented schema.
- Every expected field is present for all 1,698 types.
- Existing 296 descriptor definitions, 1,653 values and 235 mappings preserved
  exactly, including IDs, status and timestamps.
- Before/after external database fingerprints matched for ten merchant catalogue
  tables and eight taxonomy/variant-reference tables.
- Text, enum, numeric and explicit false values round-trip through the shared
  authenticated product API, form state builder, renderer and reload.
- Product stock and SEO are preserved; details alone create no SKU rows.
- Unrelated/wrong-type choices fail atomically; unchanged retired selections
  survive stock updates.
- Replay is idempotent; conflicting retired references abort instead of reviving.
- External restricted-role reads expose all 1,698 types with descriptors, and
  eight representative shared form responses were checked. Reference writes
  remain denied.
- API workflow restarted successfully; existing product-form screenshot renders.

## Reproduction and reports

```sh
pnpm db:migrate -- --staged-d2c-descriptors
node db/audit-d2c-descriptors.js
node --test --test-concurrency=1 tests/d2c-descriptors.test.js
```

The expanded migration and its seed/definition/profile helpers are immutable
after application. Any future change requires a new migration.

Read-only audits export shared reference metadata, never merchant selections:

- `generated-artifacts/d2c-descriptors/coverage.csv`: per-type fields and counts.
- `generated-artifacts/d2c-descriptors/details.csv`: mappings, input types,
  units and preset values.
- `generated-artifacts/d2c-descriptors/summary.json`: counts.

Generated reports remain excluded from Git and deployment.
