# Aura Phase 1 audit

No backfill, live database writes, migrations or deployment were performed.
Published layouts are untouched. `defaultPageLayouts` still returns the legacy
layouts and remains the live fallback.

## Database compatibility
- The optional section catalogue update is prepared in `db/staged/0012_aura_skeleton_sections.sql`, not in the automatic migrations directory. It needs 0010 but does not depend on GSTIN migration 0011.
- It replaces the catalogue function using immutable legacy and additive snapshots, adds a constant capability marker, and updates `save_store_page` to permit protected checkout layout saves. No backfill, tables, policies, triggers or existing function privileges change.
- `save_store_page` remains SECURITY DEFINER with search_path=pg_catalog,public and its existing EXECUTE ACL. Its tenant/session checks, optimistic version locks and draft-only writes are preserved. Only its blanket checkout refusal is replaced by the header/commerce/trust/footer allow-list. Checkout restoration remains blocked.
- The capability marker is SECURITY INVOKER with search_path=pg_catalog; PUBLIC EXECUTE is revoked and lebrands_app gets EXECUTE.
- Existing database installations keep the new catalogue/starter options disabled until the update is explicitly applied. Local fictional previews enable them without accessing the database.
- Protected checkout saves allow only header, commerce, trust and footer; restoration remains unavailable. Calculations, payment and order placement logic are unchanged.

## Verification
- Offline suite: 300 passing tests, zero failures.
- Disposable in-memory PostgreSQL: the staged catalogue accepts all five starter layouts; catalogue EXECUTE remains denied to the application role; cross-store writes raise 42501; draft saves leave published layouts unchanged.
- Browser: ordered starter previews, protected product/commerce sections, loaded media, no writes on pristine page switches, no initial autosave, and conflict retention verified. The earlier index-as-force and false-success bugs were fixed and covered by regression tests.
- Successful-save and final publish browser checks remain unverified: the local mocked GET response did not contain a recoverable layout payload. SQL persistence and publishing are covered offline, not by a live-database browser test.
- No Supabase migrations, backfill, real store edits or deployment were performed.

## New schema types (`AURA_SKELETON_TYPES`, exported from `sections/index.js`)
faq, material-care, how-to-use, product-specs, size-guide, shipping-info, related-products, featured-products, collection-heading, collection-nav, collection-description.
Only existing field types are used (text, richtext, toggle, select, product, list blocks). No existing schema was changed. The aura-v1 parity test needs the additive comparison. SQL registration is the main agent's job.

## Implemented
- Renderers for all new types. Each renders nothing without real content.
- Starter builder `aura-skeleton.js`: ordered layouts for home, collection, product, cart, checkout. `mergeStarter` keeps existing content and places leftover custom sections after their previous neighbour.
- Editor, only when `data.aura_skeleton_enabled === true`: new catalog types, cart and checkout pages, "Use Aura starter layout" dialog, a starter preview banner, "Save starter draft" and "Discard preview". Pages whose draft equals the legacy default open directly as a starter preview. Preview pages are never autosaved and never count as dirty.
- Product and collection labelled Default product and Default collection. `TEMPLATE_META` is the extension point. There are no template controls yet.
- Preview item selector: product (any product) and collection (needs `collection_ids` on products, otherwise hidden). The collection preview filters the product list in the browser only.
- Collection grid: real sort, plus an "In stock only" filter when any product is sold out. Collection chips filter by `collection_ids`.
- Protected commerce, buy box and tax, stock, payment and COD logic are unchanged.
- Product buying now includes a mobile sticky add-to-cart bar using the existing cart handler and quantity field. Sold-out products disable both buying buttons; server stock checks remain unchanged.

## Skeleton versus data-backed capabilities
- The five ordered starter page layouts and section editing are implemented.
- Existing price, quantity, stock checks, cart and checkout functionality are reused.
- Product variant/size inventory, product-specific materials/FAQ/size data, named collections/routes and pagination require the next database/content phase. They are not presented as working controls without the required data.
- AI generation, image generation, additional templates and individually assigned templates remain out of this phase.

## Integration or later
- Per-product content (materials, specs, size guide, how-to-use, FAQ) is shared template text. Per-product fields need a product data source.
- Reviews render only from `data.reviews`. The starter keeps them disabled when none exist.
- Collection routes: only `/collections/all` exists, so navigation is an in-page filter, not links.
- Featured collections list (cards linking to collections) needs collection routes and images.
- Backend must pass `aura_skeleton_enabled`, `collection_ids` on products, `policies` and `reviews`, and accept the new types and cart and checkout page keys. The preview endpoint's `productId` contract was not changed.
- Cart extras (discount, gift, prepaid, notify, wishlist, newsletter) are not shown because none are functional.
- Cart and checkout preview uses the read-only commerce body, so it is not interactive.
