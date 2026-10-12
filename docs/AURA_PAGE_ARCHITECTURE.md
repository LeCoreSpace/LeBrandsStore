# Aura storefront, section editor and rollout review

## Implementation boundaries

- The real wizard, dashboard, order processing and historical invoice records are preserved.
- Merchant themes retain the merchant's selected accent and preset, not the platform plum.
- Presets: ivory, stone, midnight, white. Font presets: editorial serif, modern, classic serif.
- Section definitions live in `src/public/sections/`. Each defines its type/id, label, permitted pages, typed fields, defaults, required fields and item limits.
- Pages are ordered arrays of `{id,type,settings,blocks}`. The same Aura renderer is used for draft/editor previews and published storefronts.
- No arbitrary HTML, CSS or JavaScript. Rich text is limited to the schema allow-list. Unknown fields/types, excessive lengths, unsafe links, foreign products/collections and foreign media paths are rejected.
- Image variants must have actual dimensions, unique URLs/widths, a matching aspect ratio and owned media records. A single URL is never advertised as multiple resolutions.
- Real merchant photography is not replaced. Optional galleries, reviews and other empty content do not produce fabricated content.

## Editor

Account routes: `/editor` redirects to the first accessible store; `/stores/:id/editor` opens its editor. The dashboard links to the editor separately from guided setup.

The editor provides page selection, schema-based section controls, add/reorder/hide/duplicate/delete, undo/redo, iframe selection, limited inline short-text editing, desktop/tablet/mobile preview sizes, tenant media upload/reuse, alt text/focal points, theme controls, contrast warnings, autosave, conflict recovery, publish review and history restoration.

Phone-width editor screens are read-only. Tablet/desktop editing is supported. Owner/admin may publish; staff and the legacy editor role may save drafts. Unsupported read-only roles cannot save pages. Checkout is excluded from the editor and rejected by both the HTTP save/restore layer and database save function.

The media library paginates. Search filters loaded records and says so. Image uploads create a WebP primary and smaller useful variants when supported; derivative failures are reported and preserve the successful primary. Video uploads remain original files.

Publish flushes pending theme saves and page autosaves. Draft settings and layouts do not affect the live store before republishing. Restoring a historical layout changes the draft only.

## Migration 0010: every security change

File: `db/migrations/0010_store_pages.sql`. It is intended for manual review/application, not automatic rollout by the agent.

### Tables, policies and privileges

- Creates `store_pages` and `store_page_versions`, owned by postgres.
- Both tables have RLS **ENABLED and FORCED**.
- `pages_tenant` and `page_versions_tenant` are store-context-scoped policies with both USING and WITH CHECK clauses.
- REVOKE ALL on both tables from PUBLIC and lebrands_app; GRANT SELECT only to lebrands_app. No direct APP INSERT/UPDATE/DELETE.
- REVOKE ALL on both tables from anon, authenticated and service_role when those roles exist.
- Extends the media upload-type constraint to permit video, without changing existing image/logo semantics.
- Adds bounded JSONB `media.renditions`, default `[]`, and GRANT UPDATE(renditions) to lebrands_app. Existing tenant media RLS remains in force.

### Functions and triggers

All listed functions are owned by postgres. EXECUTE is revoked from PUBLIC, lebrands_app, and any existing anon/authenticated/service_role roles. Only the two draft RPCs listed below are granted back to lebrands_app.

| Function | Responsibility |
| --- | --- |
| aura_section_schemas | Immutable database schema snapshot, expanded by the migration runner before hashing/execution |
| aura_validate_fields | Typed fields, lengths, rich-text allow-list, safe URLs and tenant references |
| aura_validate_sources | Actual image-source dimensions, ownership-shaped URLs, unique widths and matching aspect ratios |
| aura_guard_media_sources | Checks rendition references against real same-store media records |
| aura_validate_layout | Page eligibility, known sections, required sections, uniqueness, blocks and field validation |
| aura_section | Default section-instance constructor |
| aura_default_layout | Backfill/default layout construction from current merchant content |
| guard_store_page_layout | Guards stored layout validation and publication boundaries |
| initialize_store_page_layouts | Initial ordered layouts for newly created stores |
| sync_wizard_page_slots | Synchronises wizard-owned content slots into draft layouts without publishing |
| initialize_aura_product_image | Seeds an untouched default home hero from the first actual product photo; does not overwrite an editor-authored page or selected hero |
| store_page_actor | Validates the session/store and draft-edit role |
| save_store_page | Authenticated, store-scoped draft save with expected-version conflict detection; checkout denied |
| restore_store_page | Authenticated history-to-draft restoration through the same save boundary |
| publish_store_page_layouts | Copies draft to published during explicit publication, records history and retains the last 20 per page |

Triggers:

1. `guard_media_sources`: BEFORE INSERT/UPDATE on media.
2. `store_page_layout_guard`: BEFORE INSERT/UPDATE on store_pages.
3. `initialize_store_page_layouts`: AFTER INSERT on stores.
4. `sync_wizard_page_slots`: AFTER UPDATE OF settings on store_setup.
5. `initialize_aura_product_image`: AFTER INSERT on product_media.
6. `publish_store_page_layouts`: AFTER INSERT/UPDATE OF snapshot on store_publications.

GRANT EXECUTE back to lebrands_app **only**:

- `save_store_page(uuid,text,jsonb,integer,text)`
- `restore_store_page(uuid,text,integer,integer,text)`

Isolation/permission denials use 42501; invalid layouts use 22023; stale expected versions use 40001 (HTTP 409).

Existing stores are backfilled from their current settings/publication data. Live rendering selects published layouts only. Catalogue-only snapshot updates do not publish unrelated page drafts.

## GSTIN flow: staged migration 0011

File: `db/staged/0011_gstin_approval.sql`, deliberately outside the migration-runner directory.

The provider URL is constructed only in `src/gstin/provider.js`, using server-side GSTIN_KEY, with an eight-second timeout and fixed/redacted errors. No browser key, provider URL or raw response is exposed.

Local format/checksum/state checks happen before a lookup. A valid principal address is required; malformed additional addresses are skipped with warnings. Display/invoice city selects city, locality, then district. Raw provider responses are retained server-side.

Active Regular registrations may be verified. Inactive/Composition registrations cannot publish or issue invoices. Provider errors allow an unverified draft/manual-review path, but never verified invoice issuance. Registered supplier fields are confirmed from server-held data, not client-supplied addresses.

Successful/blocked lookups cache for 24 hours; errors have a short retry cooldown. Paid attempts are limited to three per rolling minute and ten per Indian calendar day. Settings opening and financial invoice preflight recheck records older than 30 days. Invoice preflight runs in a separate committed transaction so a later invoice failure cannot roll back a paid-attempt count or an adverse verification result.

### Every 0011 security change

- Adds approval/revocation metadata to stores and awaiting_approval to the status constraint.
- Creates `store_gstin_verifications`, owned by postgres, RLS ENABLED + FORCED.
- REVOKE ALL from PUBLIC/lebrands_app; GRANT SELECT,INSERT only to lebrands_app.
- `gstin_select` and `gstin_insert` policies scope rows to the current store. No APP UPDATE/DELETE.
- Creates `gstin_lookup_attempts`, owned by postgres, RLS ENABLED + FORCED.
- REVOKE ALL from PUBLIC/lebrands_app; GRANT SELECT only to lebrands_app.
- `gstin_quota_read` scopes read access to the current store.
- `reserve_gstin_lookup(uuid)` is postgres-owned SECURITY DEFINER with a fixed search path, context checks, an advisory transaction lock and atomic quota reservation. EXECUTE is revoked from PUBLIC/APP, then granted only to lebrands_app.
- The two new tables and quota function revoke privileges from any existing anon/authenticated/service_role roles.
- `guard_store_approval()` plus BEFORE INSERT/UPDATE trigger denies any non-postgres change to approval/revocation fields, with 42501. Its EXECUTE privileges are revoked from PUBLIC/APP and the existing optional roles.
- `invoice_supplier(uuid)` is replaced. It reads **published** settings, requires current Active/Regular verification with matching GSTIN, legal/trade names and a registered selected address, and returns the trade name. Existing private-function privileges remain private.
- Existing live stores remain live and receive migration approval metadata and an audit event.
- No Worker approval endpoint or approval UI is added. `db/admin-approve-store.js` uses only the administrative connection, reviews the submitted published supplier, requires an explicit manual-review flag plus note for unverified cases, blocks inactive/Composition cases, and supports audited revocation.
- Manual approval does not grant invoice verification. Historical invoice supplier snapshots are not rewritten.

## Rollout and verification

No real database migration or deployment has been performed for this work.

1. Review the existing 0009 security report in `docs/STEP4_POLISH_REVIEW.md`; confirm that release is applied/deployed.
2. Review/apply 0010 manually, then deploy the Worker using **root wrangler.jsonc only**.
3. Review 0011 separately. Only after approval, promote it from staged to migrations and apply/deploy in order.
4. Ensure GSTIN_KEY is bound to the production Worker without exposing its value.
5. Verify authenticated editor/GSTIN flows on the migrated environment and review real-store performance.

The offline suite includes actual isolated PostgreSQL compilation/backfill/RLS/publish/history/approval/quota/supplier tests. Browser tests use isolated fictional API responses because live schema rollout has not been authorised; they must not be described as a production authenticated end-to-end test.

Performance and screenshot evidence belongs under ignored `generated-artifacts/`, not Git or deployment output. The 4G LCP/CLS targets require measured evidence, not a claim based on appearance. Existing large merchant assets are preserved and may require same-photo optimisation after rollout.

### Current verification result

- Offline suite: **261 passed, 0 failed**, including isolated native database tests.
- Browser: isolated editor autosave, reorder, undo/redo, duplicate/delete/undo, media reuse, theme review, approval-pending publication response, draft-only restore and 409 recovery passed. Tablet editing and phone read-only behavior passed. These were mocked API writes, not production authenticated writes.
- A detected mobile header overflow was fixed and independently checked: viewport 402px, document scroll width 402px.
- Screenshots cover the four palette/font pairings at desktop/mobile sizes, collection/product/cart mobile, checkout, and a local Stonescence theme preview built only from its public homepage content and original photo.
- Synthetic cold-cache 4G baseline (150ms latency, 1.6Mbps download, 750kbps upload, 4x CPU slowdown, DPR 1): **LCP 2.97–3.23 seconds**, **CLS 0.00018–0.01231**. CLS meets the 0.05 target; **LCP does not yet meet 2.5 seconds**. Do not report performance acceptance as complete. These are Replit preview measurements, not real-store production measurements.
- Remaining: LCP optimisation and real authenticated validation after an authorised schema rollout. No real migration, deployment or paid provider lookup was performed.
