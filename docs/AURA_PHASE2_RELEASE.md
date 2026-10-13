# Aura Phase 2: entity content and collections

## Storage and publication

No new tables or content backfill are required. Product and collection content
is saved under the existing store-scoped `store_setup.settings.aura_content`
map. Product IDs and collection IDs identify separate content records, not
separate page templates. Collection titles, slugs, descriptions and membership
use the existing collections and collection_products tables.

Entity updates merge only one map entry atomically. Other product/collection
entries, merchant settings and invoice_prefix remain intact. Stored fields are
allowlisted, bounded, and rich text uses the existing small HTML allow-list.
Media references must belong to this store, and cover images must exist in its
uploaded media registry.

The existing publish transaction resolves this data into products and
collections in store_publications.snapshot. Raw entity maps are excluded from
the snapshot. The live renderer reads the published snapshot only. Price,
inventory and explicit catalogue updates retain previously published content
and collection assignments; they do not silently publish new theme content.
Deleting/editing a collection draft does not modify its live snapshot.
Deletion is rejected while a saved draft page section still selects that
collection, so it cannot leave an invalid layout that blocks publication.

## Manual migration command

After reviewing the staged SQL, run in Replit Shell:

```sh
node db/migrate.js --staged-aura
```

This selects **only** db/staged/0012_aura_skeleton_sections.sql. It does not
select the staged GSTIN/approval migration or other pending migrations. It
requires 0010_store_pages.sql to be recorded as applied, uses SUPABASE_DB_URL
from Secrets, validates an administrative BYPASSRLS role, and runs under the
existing migration advisory lock and transaction/checksum bookkeeping.
Any failure rolls back completely. Do not remove migration history to bypass
a checksum mismatch: an already-applied different 0012 needs a new migration.

The existing plain db:migrate command still applies every pending file in
db/migrations; it is not the command for this staged catalogue update.

The staged SQL changes only the section catalogue, the capability function and
the protected checkout save function described in AURA_PHASE1_AUDIT.md. There
is no phase-2 schema or bulk content migration. No migration or deployment was
run by the agent.

## User flow

1. After catalogue activation, use Products to edit each product's storefront
   information and Collections to create/edit its real groupings.
2. Use the shared Default product/Default collection templates in the editor.
   Enable sections you want shown; hidden sections remain intentionally hidden.
3. Save drafts, review and publish through the existing flow.
4. Named collection pages use /collections/{slug}, while /collections/all
   remains available. Unknown/unpublished slugs return the branded not-found
   page.

## Boundaries

AI generation, independent named templates, variant inventory, unsupported cart
extras and additional payment/shipping providers are not implemented here.
Checkout totals, tax, inventory checks and order submission remain protected.

## Verification

The complete offline suite passed: **319 tests, zero failures**. It includes an
isolated PGlite test running the actual catalogue SQL under forced tenant RLS:
product content persists, collection CRUD/membership works, invoice prefix and
other settings remain unchanged, foreign-store reads/writes and references are
rejected, and draft changes leave the existing publication snapshot untouched.
Pure tests cover input/HTML/media validation, collection routing, filtering,
sorting, pagination, blank clears, product/collection rendering, cart
recommendations and the staged-only migration selector.

The collection edit page was also inspected in the running local preview.
Fictional preview APIs reject all real mutations; browser save checks use
intercepted responses only. These checks are not a live migration or production
acceptance test.
