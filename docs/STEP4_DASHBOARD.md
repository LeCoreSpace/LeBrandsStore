# Step 4: brand dashboard

Implemented on the existing Cloudflare Worker/Supabase stack. No deployment,
migration, new secret, external integration or real order execution was performed.
Production uses only the root `wrangler.jsonc`; the preview config is unchanged.

## Surfaces

- `https://app.lebrands.store/stores/:id`: Overview, Orders, Products,
  Customers, Invoices, Settings and View store navigation.
- Overview periods are seven/thirty India-calendar days including today.
  Gross sales and AOV exclude cancelled, refunded, returned and RTO orders;
  these are not cash-collection metrics. Today's order count includes all
  orders placed today. Lists show up to 500 matching records; full CSV exports
  are not limited to that UI cap.
- Orders support status/date/search filters; details include tax components,
  customer/address, shipment, invoice and actor/time audit timeline.
  Owner/admin may fulfil orders and record COD collection; editors can read.
- Fulfilment: Confirmed → Packed → Shipped → Delivered. Shipping requires
  courier, tracking number and HTTPS link. Cancellation is permitted only
  before shipping. Shipped orders can be returned/RTO; delivered orders can
  be returned. Returns/RTO can optionally restore stock. Restocking is based
  on the original deduction marker, not the product's current tracking setting.
- COD collection is explicitly recorded with an India-time date, independently
  of fulfilment. Recording collection does not charge or refund anyone.
- Products reuse wizard validation, image/alt-text data, R2 upload APIs and
  paise prices. Legacy GST remains unchanged with a notice. Archived products
  remain visible and cannot be implicitly restored. Ordered products cannot
  be deleted. Dashboard saves publish only the changed complete product,
  never other setup/policy/product drafts. Optimistic stock checks prevent an
  ordinary product edit from overwriting stock sold after the editor loaded.
- Customer search/detail contains their orders and state-name addresses.
- Settings links back into existing store/theme/policy wizard steps and checkout
  settings, and includes an explicitly confirmed owner-only unpublish action.
- Only owners can download CSVs. Exports are logged, generated from same-store
  queries, include all rows matching the orders date range, and neutralise
  spreadsheet formulas. There is no OTP/SMS or background download-link service
  in this phase.

## Invoice and history rules

- Shipping issues a document in the same transaction as the shipment/status
  and audit writes. Invoice counters use a transactional per-store/FY atomic
  UPSERT, not PostgreSQL sequences. Failed issuance rolls back its number.
  Repeating issuance for the same order returns its existing document.
- FY boundaries use Asia/Kolkata and April 1. Numbers follow
  `STORE/2026-27/0001`. Receipt documents share that store/FY series.
- Supplier details and the original stock-deduction flags are captured on new
  checkouts. Existing orders without a supplier snapshot use their currently
  published supplier identity at first issuance. The migration backfills old
  deduction flags from the current product tracking setting; historical tracking
  changes cannot be reconstructed.
- A GSTIN store gets the stored order's GST-inclusive line tax split, supplier/
  customer state codes, place of supply, Indian amount in words and signatory
  line. GSTIN/state or stored tax-split inconsistencies block shipping rather
  than silently issuing a misleading invoice.
- Without GSTIN, issue a clearly labelled Bill of Supply / Order receipt
  without GST tax lines. Document contents are immutable after issuance.
- Returns/RTO cancel an issued document and record a unique credit-note number
  in its original invoice FY. Pre-shipment cancellation also cancels an existing
  invoice if one is present. Full credit-note documents/refunds are not built.
  Invoice numbers are never reused and invoices cannot be deleted.
- The brand can print/save PDF from the invoice's HTML page. Customers can
  open the invoice from their private order-confirmation URL once shipped.
  The bearer receipt token is scoped to one store/order; invoice pages are
  no-store, no-referrer and noindex. `/track` shows current status and shipment.
- Audit entries are append-only for the APP role. Account tables remain private;
  a tenant-context-checked function resolves only same-store member names.

## Verification and manual commands

Offline tests model transactions and concurrent requests. They are not a claim
of live PostgreSQL concurrency verification. The extended isolation script uses
marked RLS fixtures, rolls back APP mutations, and probes dashboard queries,
invoices, exports, actor names, audit immutability and non-member route denial.
Do not run it before applying the new schema.

Safe offline checks, from project root:

```sh
pnpm run test:offline
pnpm exec wrangler deploy --config ./wrangler.jsonc --dry-run --outdir /tmp/lebrands-step4-bundle
```

**Manual database writes only when you choose to apply/test the schema:**

```sh
pnpm run db:migrate
pnpm run db:test-isolation
```

The new migration is `db/migrations/0007_brand_dashboard.sql`; earlier migration
files are unchanged. The existing administrative/restricted Supabase secrets are
used by these scripts. No new secrets or configuration changes are needed.
Turnstile still requires the previously documented existing Worker secret;
this step does not configure, replace or reveal it.

No production publication command has been executed. Do not use
`wrangler secret put` as a harmless configuration step: it immediately publishes
a new Worker version.

Read-only, database-free visual preview:
`/__step4-preview?view=overview` (also orders/products/customers/invoices/settings).
It explicitly has no signed-in account, database or real totals. No dev sign-in
bypass or writable public fixture endpoint has been added.

## Files

New:
- `db/migrations/0007_brand_dashboard.sql`
- `db/dashboard-isolation.js`
- `src/dashboard/repository.js`
- `src/dashboard/routes.js`
- `src/public/dashboard-rules.js`
- `src/public/dashboard.js`
- `src/public/dashboard.css`
- `src/ui/dashboard.js`
- `src/ui/invoice.js`
- `tests/dashboard.test.js`
- `tests/helpers/dashboard-db.js`
- `docs/STEP4_DASHBOARD.md`

Updated:
- `db/isolation-fixtures.js`
- `db/test-isolation.js`
- `src/auth/routes.js`
- `src/checkout/merchant.js`
- `src/checkout/repository.js`
- `src/checkout/routes.js`
- `src/index.js`
- `src/preview.js`
- `src/public/commerce-view.js`
- `src/public/commerce.js`
- `src/store/repository.js`
- `src/store/routes.js`
- `src/ui/accounts.js`
- `tests/checkout.test.js`

Project memory notes record the phase boundary and invoice/stock decisions
separately; they do not contain credentials or customer information.
