# Catalogue costs and analytics: staged delivery

## Stage 1: private COGS foundation

Implemented in code, with a staged database migration. No live database
migration or production release is implied.

- **Catalogue → COGS** is available to store owners and admins.
- Select existing products by title or SKU, filter missing costs, edit up to
  50 visible rows and save the whole batch atomically.
- The product default is an optional **Cost per unit** in the shared dashboard
  and Ann product form. SKU overrides are managed in COGS.
- A blank product cost means **unknown**, not zero. A blank SKU override
  inherits the current product default. Explicit zero is a known cost.
- Costs use the store currency and existing two-decimal minor-unit money model.
  No currency conversion or tax-inclusive cost adjustment is inferred.
- History records who changed a base cost or override and when. Effective
  changes are prospective; backdated cost entry is not part of this stage.
- A new order line captures its unit cost at creation. Subsequent catalogue
  cost changes do not rewrite that snapshot. Existing order lines are marked
  historical/unknown; their costs are not reconstructed from today's prices.
- Stale revisions reject the entire batch. A stale product-form cost also
  rolls back the rest of that save. The UI preserves edits after a conflict.
- Cost data is private. It is not added to customer-facing prices, published
  snapshots, public product data or invoices. Ordinary product/stock workflows,
  business-document checks and SKU publication gates remain in force.

### Storage and access

- `products.cost_price_paise`: reuse the existing product-default field.
- `catalogue_costs`: current SKU override and base/SKU revision metadata.
- `catalogue_cost_history`: append-only changes, with labels retained when a
  product or variant is subsequently removed.
- `order_item_costs`: private immutable unit-cost capture for future reporting.
- Session- and tenant-checked PostgreSQL functions control reads and writes;
  the application role has no direct access to the three private tables.

Endpoints:

- `GET /api/stores/:id/cogs`: bounded listing and filters.
- `POST /api/stores/:id/cogs`: bounded atomic changes with expected revisions.
- `GET /api/stores/:id/cogs/:productId/history`: latest 100 cost changes.
- Existing product create/update endpoints accept an optional paired
  `cost_price_paise` and `cost_revision`; omitting both preserves existing cost.

### Release, performed by the operator

From the repository root, review and back up the target database according to
the normal operational process. Confirm the catalogue API migration
`0021_catalogue_forms_api.sql` is already applied.

```sh
pnpm run db:migrate -- --staged-catalogue-cogs
pnpm run deploy
```

The migration adds private tables/functions, seeds existing known base costs
as of migration time, and adds an order-line tenant index. It can take locks;
schedule an appropriate database maintenance window for larger catalogues.
It refuses to silently convert unsupported legacy costs above its limit.

Before migration, the COGS screen reports that its database update is needed;
product forms do not expose the new field. The command above applies only the
reviewed staged COGS migration, not every unrelated staged feature.

No migration, paid-plan enablement, recurring payment setup or production
deployment was performed as part of implementing this stage.

### Verification

Real foundational DDL in isolated PGlite exercises permissions, tenancy,
inheritance, known zero, clearing, history, revisions, transaction rollback,
private public-projection boundaries and immutable order costs. The native
preview fixture lives only under `/__cogs-preview/*`; it must never contact a
merchant database or publish a store.

## Stage 2: first commerce analytics

Next, implement an actual **Analytics** dashboard with server-calculated
sales/order KPIs, product/SKU performance and downloadable reports using the
user's report suggestions. Agree precise status, cancellation/refund, date,
timezone, currency and tax rules before aggregating amounts.

Report cost coverage explicitly. Historical or missing costs must not become
zero-cost sales, and current catalogue costs must not rewrite past margins.
Gross margin is not net profit: delivery charges/costs, payment fees, returns,
marketing and operating expenses require their own data and definitions.

## Later reporting stages

1. GST/invoice and reconciliation reports using existing document authority and
   immutable invoice data, without treating sandbox captures as tax invoices.
2. Customer/cohort and operations reports using available data. Traffic and
   conversion reports require real measurement, not fabricated metrics.
3. Contribution/profit and advanced comparisons after their cost sources are
   present. Forecasts and missing integrations must be clearly unavailable.

Private COGS CSV import/export is a separate optional enhancement. It is not
part of the current edit-and-save screen and must retain the same permissions,
explicit unknown/zero semantics, validation and stale-write protections.
