# D2C product-type membership completion

## Applied status

Applied manually to the configured external Supabase database on 2026-10-17:

- `0026_d2c_type_memberships.sql`
- `0027_d2c_food_profile_corrections.sql`

No application publish was performed. Existing application code reads these
reference tables dynamically; Ann and the dashboard use the same authenticated
reference endpoint and shared product-form controller.

| Measure | Result |
|---|---:|
| Source product types with active functional memberships | 1,698 |
| Types without memberships | 0 |
| Active type/subcategory links | 2,058 |
| Previously reviewed links preserved exactly | 313 |
| Additional links | 1,745 |
| Newly activated product types | 1,510 |
| New general-purpose subcategories | 5 |
| Types with applicable variant options | 1,698 |
| Types with existing descriptor assignments | 119 |

The original source's usage counts are not membership IDs and are not forced
to match the curated number of branches. A type can appear in multiple
functionally appropriate subcategories without duplicating its master row.

## Taxonomy policy

Most links use the existing 340 subcategories. Five general-purpose branches fill
real gaps: Watches; Fabrics & Sewing; Candles & Home Fragrance; Books & General
Reading; Fashion Accessories. Generic items must not be labelled Luxury,
Handloom, Handmade, Silver, Organic or another unverified product property.
Existing approved links are preserved, including historical specialized branches;
this import is not a review or deletion of those earlier associations.

The curated import uses explicit type groups and homogeneous physical-family
placements from an immutable profile snapshot. Heterogeneous families such as
apparel, baby equipment and vehicle parts require explicit per-type placements.
Unknown types or missing assignments fail rather than entering an “Other” bucket.
Every link is recorded with its basis in the downloadable audit.

These are catalogue reference branches, not new theme packs or new permission
to sell regulated goods. No HSN, GST rate, dosage, organic certification,
material, condition, gender restriction or manufacturer compatibility is inferred.
No requirement that every possible specialized subcategory contain a type is
invented where the source has no matching product.

## Targeted profile corrections

Functional review identified Dragées (confectionery) and Pouch Meal as incorrectly
assigned to supplement and bag profiles in the earlier immutable import.
The separate correction migration gives both the existing food profile.
Incorrect applicability is retired rather than deleted; shared master IDs,
values and saved merchant selections remain intact. Existing unchanged selection
paths remain grandfathered.

## Safety and verification

The migration rejects taxonomy ID/slug collisions, missing/inactive parents,
rejected/explicitly retired types and existing non-approved memberships instead
of silently overriding operator decisions. New links are additive, existing
approved rows retain exact timestamps, and replaying the import is idempotent.
No callable PostgreSQL function identity, permission or RLS policy changes.

Before/after database fingerprints matched for all ten merchant catalogue tables:
products, product options, SKU axes/values, SKU option values, product descriptors,
collections/membership, product media and media. Five other shared reference
tables also matched. All 313 earlier membership rows matched exactly.
Only type status, new memberships/subcategories and the two targeted profile
applicability corrections change.

Verification includes the real foundational migration sequence in PGlite,
restricted-role reads and write denials, shared form reference responses,
cross-subcategory rejection, taxonomy collision/retirement rollback and replay.
The external restricted application role sees all 1,698 types through active
memberships; eight representative existing/new branches returned their typed
variant options. A screenshot confirmed the existing product form still renders.

## Reproduction

```sh
pnpm db:migrate -- --staged-d2c-memberships
pnpm db:migrate -- --staged-d2c-food-profiles
node db/audit-d2c-memberships.js
node db/audit-d2c-variants.js
node --test --test-concurrency=1 tests/d2c-type-memberships.test.js
```

The runner enforces dependency order and expanded-source checksums. Applied SQL
and its imported seed helpers are immutable. Further reference changes require
new migrations, never rewriting an applied seed.

Reports contain shared catalogue metadata only:
`generated-artifacts/d2c-memberships/memberships.csv` and `summary.json`.
Generated reports are ignored by Git and deployment.

## Remaining phase boundaries

Descriptors are not expanded in this phase. Existing descriptor definitions,
values and links remain unchanged; comprehensive type-specific descriptor
coverage is the next catalogue phase.

SKU checkout/publication, inventory reservation, plan limits, billing and merchant
classification backfills are not enabled or changed. Products with variants
retain the existing draft-only publication restriction.
