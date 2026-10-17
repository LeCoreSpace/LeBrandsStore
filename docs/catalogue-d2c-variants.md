# D2C variants

Merchant-facing terminology is **Variants** in Ann, the shared dashboard product form, pricing and comparison copy. Option dimensions (Size, Color, Volume, etc.) are **Product options**. Descriptors remain descriptive product details, not automatic SKUs.

## Coverage and limits

- Every one of the 1,698 source product types has an explicit curated profile. Unassigned types fail the seed rather than receiving an unrelated generic size/color fallback.
- Standard preset values are context-scoped. A value existing globally does not make it available to every product type.
- Brand-specific shades, strengths, dimensions, models, compatibility and licence names have custom values, not invented universal presets.
- A seller can select up to three option dimensions, up to 50 values per dimension and at most 200 generated variants. Dimensions are optional; a single-version product still has its base SKU.
- Auto-generated SKUs, editable stock per SKU, existing IDs and stock concurrency rules are retained.
- Custom values belong to one store, one product type and one approved option. They do not become public reference choices. At most 500 custom values can be retained per store/type/option; this is an abuse/data-size limit, not a billing limit.
- Adding a value does not silently regenerate or overwrite the SKU grid. Existing rows remain until the seller deliberately generates the revised variants.
- No changes to checkout readiness, publication restrictions, plan enforcement, tax classification, descriptors, global templates or category-membership approvals.

## Manual database updates

Apply only after reviewing tests, using the existing external Supabase database:

```sh
pnpm db:migrate -- --staged-d2c-variants
pnpm db:migrate -- --staged-store-variant-values
pnpm db:migrate -- --staged-catalogue-writer-identity
node db/audit-d2c-variants.js
```

The first migration requires the reviewed-reference migration. The following migrations require their immediate predecessor. Existing migration files and their checksums are unchanged. Once applied, these seed helpers/profile definitions are immutable; use a new migration for later catalogue revisions.

The coverage audit writes shared, non-merchant metadata to `generated-artifacts/d2c-variants/`. It separately reports missing product-type/subcategory memberships. Defining variants does **not** approve those missing memberships or make pending types selectable. Existing reviewed associations are preserved.

## Compatibility and privacy

The API detects the private-value function before advertising custom-value support. Older databases keep working without showing unsupported controls. Existing published Workers remain compatible with additive shared values.

Private values and their applicability links use tenant-filtered RLS. Only the session-authorised owner/admin function can create them. Public masters remain read-only to the application role. The original catalogue writer retains its callable identity, with ownership checks added before its unchanged selection and validation logic. The compatibility entry point delegates to this guarded writer; no callable unguarded legacy writer remains. This preserves prepared callers as well as blocking guessed private value IDs. Triggers also enforce ownership at the association boundary.

The isolated browser fixture uses small synthetic Dress references and the private-value migration. Full data coverage and real prerequisite DDL are checked separately in the database integration tests.
