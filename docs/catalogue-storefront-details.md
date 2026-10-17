# Storefront product details

Selected catalogue descriptors now appear on product pages in standard layouts
and all eight saved Ann styles. Existing theme features remain; selected facts
take precedence over same-label feature copy so conflicting values are not
displayed together. Unset facts and unrelated products' facts are not injected.
Numeric zero, explicit “No”, units and all selected enum labels are preserved.
Labels and values are escaped by the storefront renderers.

## Publication boundary

- Full store publication resolves selected facts into `product_details`, an array
  of plain `{label,value}` rows in each public product.
- An explicit live catalogue save refreshes only the target product's facts.
- Stock, price and archive updates do not approve draft descriptor changes.
  Operational refreshes retain the target's previously published facts.
- Theme content and collection assignment retain their existing separate
  publication boundary.
- Public products omit internal classification selections, master reference IDs
  and catalogue revisions.
- Older snapshots without `product_details` can render their already-published
  classification references. An explicit empty `product_details` array means
  cleared facts and never falls back to another classification.
- Live pages read only their tenant's publication. No live master or draft
  catalogue queries were added.

No schema migration, merchant backfill, automatic publication or SKU checkout
change is part of this phase. Newly populated draft facts require publication or
an explicit live catalogue save; restarting the app does not publish them.

## Rendering

In standard layouts, enabled specifications own the rows. When that section is
absent or disabled, facts appear within the main product details instead of
remaining hidden by the legacy default. Saved Ann styles use their existing
product feature/specification presentation. Home pages, collection pages,
related-product cards and shared style demos do not receive descriptor injection.
No saved layouts or shared style definitions are rewritten.

## Checks

Focused projection, publication-sync, tenant-read and rendering tests pass,
including all saved styles, escaped values, no duplication, empty snapshots,
legacy snapshots, archive removal and preserved unrelated products.

The relevant eight-file regression pass also passed all 67 tests covering Aura
styles/showcases/layouts/skeletons/collections and authenticated catalogue
save/reload, GST, SEO, memberships and stable variant inventory.

The broader suite was not clean: the design helper reported failures in Ann,
editor, builder and signup tests and did not compare them against a baseline.
Those failures are not claimed to be pre-existing or fixed by this work.

```sh
node --test --test-concurrency=1 \
  tests/storefront-product-details.test.js \
  tests/product-details-rendering.test.js \
  tests/dashboard.test.js
```
