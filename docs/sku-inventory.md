# SKU inventory controls

## Dashboard

Catalogue → **Stock & SKUs** opens `/stores/:storeId/inventory`.

- One row per saved variant SKU, or one row for a product without variants.
- Product and option labels, SKU, listing status, current stock and proposed quantity.
- Store-wide counts for tracked, available, low-stock (1–5), sold-out and untracked SKUs.
- Search by product, SKU or option text; availability/status filters and 50-row pages.
- Untracked products are view-only here. Enable stock tracking in the product form.
- Select visible tracked rows and preview **Set to**, **Add** or **Remove** quantity changes.
- Review the before/after values and give a reason before saving.

The existing product forms, checkout, other dashboard menus and plan limits are unchanged. No database migration is needed.

## Write contract and safety

`GET /api/stores/:storeId/inventory` returns the current page, store-wide summary and opaque revision strings. `POST /api/stores/:storeId/inventory/bulk` accepts:

```json
{
  "reason": "Received a shipment",
  "items": [{
    "product_id": "saved-product-uuid",
    "product_option_id": "saved-variant-uuid",
    "expected_stock": 3,
    "expected_revision": "unchanged revision from the inventory response",
    "stock": 8
  }]
}
```

Omit `product_option_id` for a product without variants. At most 100 distinct rows are accepted per request. Quantities must be nonnegative whole numbers within PostgreSQL integer limits; a product's combined variant stock must also fit that limit.

Updates use absolute desired quantities, not a retryable increment command. Store membership, existing inventory-role permissions and same-origin checks apply. Store, product and SKU locks use the same order as checkout. Both current quantity and precise database revision must match. A sale followed by a restock cannot silently erase the fact that inventory changed.

Any missing, foreign, archived, untracked, invalid or stale row rejects the whole batch. Database failures roll back earlier writes too. Successful updates refresh parent aggregates and record actor, reason and before/after quantities in the existing audit log. There is no new financial-write permission.

Publication refreshes patch stock only. Draft titles, prices, option labels, descriptions, classification and other unpublished content are not copied into the live store. Unpublished listings are not activated, and unpublished SKU quantities do not inflate the live product's total.

## Client behavior

Unsaved edits require confirmation before filtering, paging, navigation or reload. Background/focus refreshes do not replace edits in progress; superseded responses are ignored. A stock conflict keeps the proposed quantities visible and offers a confirmed reload. Successful saves use returned server quantities and refetch revisions.

## Verification

Real-schema tests cover base and variant rows, SQL pagination, search and filters, permissions/origin checks, stale/ABA rejection, atomic rollback, aggregate overflow, archive/untracked restrictions, audit and publication preservation. The Vite-only `/__inventory-preview/` fixture uses synthetic in-memory data for browser checks, including a concurrent synthetic checkout; it is not a production route.
