# Invoice lockdown: migration 0008 review

Subsequent GST registration requirements are implemented in a separate,
unapplied migration, `0009_required_gstin.sql`. That migration rejects new
receipts/invalid GSTINs and nonzero tax on exempt lines via an INSERT-only
guard. Historical invoices and the protections in 0008 remain unchanged.

This migration is **not applied**. Migration 0007 is already applied and is
unchanged. No migrations, live isolation tests, deployments, secrets, Wrangler
configurations or UI changes were executed as part of this fix.

## Why

The three failing permission probes currently reach FK/CHECK errors because
APP can write invoices/counters. They must fail with SQLSTATE `42501` before
those constraints. Existing isolation test expectations remain unchanged.

## Every privilege and policy change

1. **`invoices` and `invoice_sequences`:**
   `REVOKE ALL ... FROM PUBLIC, lebrands_app`, removing INSERT, UPDATE, DELETE,
   TRUNCATE, REFERENCES, TRIGGER and existing SELECT grants.
   `GRANT SELECT ... TO lebrands_app` restores only reads, never writes.
   PUBLIC receives no privileges.
2. **RLS:** explicitly ENABLE and FORCE RLS on both tables. Replace each existing
   `tenant_isolation` FOR ALL policy with a FOR SELECT policy TO `lebrands_app`.
   The predicate is unchanged:
   `store_id = NULLIF(current_setting('app.store_id',true),'')::uuid`.
   No write policy is added.
3. **`issue_invoice(uuid)` and `cancel_invoice(uuid)`:**
   postgres-owned SECURITY DEFINER functions, each with
   `SET search_path = pg_catalog, public`.
   Revoke ALL function privileges (EXECUTE) from PUBLIC and grant EXECUTE only
   to `lebrands_app`, apart from the owner.
4. **`protect_issued_invoice()` and `protect_invoice_counter()`:**
   replace their bodies without modifying migration 0007; set their owner to
   postgres and revoke ALL/EXECUTE from PUBLIC and `lebrands_app`. Existing
   trigger execution does not need APP to have direct EXECUTE privileges.
5. **Supabase API roles:** if `anon`, `authenticated` or `service_role` exist,
   revoke ALL/EXECUTE on all four functions from them. This removes possible
   Supabase default function ACL grants; these functions are not PostgREST APIs.

There is no separate invoice-line table in this schema. Invoice items are frozen
under `invoices.snapshot.items` and covered by the invoice privileges/guards.
`order_items` belongs to checkout and its existing privileges are unchanged.
No other table permissions or policies are altered.

## Every function/trigger

- **`issue_invoice(p_order_id uuid)`** returns invoice id/number. Rejects missing
  or malformed transaction-local store context and absent/cross-store orders
  with 42501. It explicitly checks `orders.store_id` under an order-row lock
  before looking for an existing invoice, rather than relying on definer RLS.
  An existing invoice is returned without consuming a number, even if cancelled.
  New issuance requires a shipped/delivered/returned/RTO order and validates
  supplier/GST/place-of-supply consistency, preserving the previous logic.
  It obtains the store/FY counter row with FOR UPDATE, increments it, and inserts
  the document plus item/supplier/customer/totals snapshot in the same transaction.
  New counter rows start at zero with ON CONFLICT DO NOTHING; first issuance uses
  one. Counter creation/increment and document insertion roll back together.
  The counter key, Asia/Kolkata April FY, sanitized 12-character store prefix
  (fallback STO), and minimum four-digit padding are unchanged. Values beyond
  four digits are not truncated.
- **`cancel_invoice(p_order_id uuid)`** is necessary to retain Step 4 credit-note
  handling without any APP UPDATE. It has the same context and explicit order
  ownership checks (42501), and allows new cancellation only when the order is
  cancelled/returned/RTO. No invoice means no mutation; an already-cancelled
  invoice returns unchanged. It locks/increments the credit counter in the
  original invoice FY and records only cancelled status, credit number and date.
  It cannot edit amounts or snapshots. The `/CN/` format is unchanged.
- **`protect_issued_invoice()`** retains the existing BEFORE UPDATE trigger,
  now raising 42501 for immutable-field changes or incomplete cancellation.
  It additionally freezes row id/creation time. New BEFORE DELETE trigger
  `invoice_delete_lockdown` always raises 42501, and runs alphabetically before
  the older generic history-deletion trigger. No cleanup bypass was added:
  the existing guarded, marked-fixture admin cleanup already disables triggers
  transaction-locally.
- **`protect_invoice_counter()`** retains the existing BEFORE UPDATE trigger
  and its same store/FY/reset/skip restrictions, but raises 42501 instead of
  23514. No additional APP write rights are granted for this trigger.

Business validation inside issuance/cancellation still uses 23514. This is not
an isolation denial: direct APP table writes cannot reach those checks now.
The Worker maps function permission errors to safe HTTP 403 and business errors
to safe HTTP 409 without exposing raw PostgreSQL errors.

## Worker/test changes

The Worker calls `issue_invoice()` for creation and `cancel_invoice()` for the
credit-note mutation, then reads the invoice with tenant-scoped SELECT. Audits
still use the current member actor in the surrounding transaction, so an audit
failure rolls back the financial mutation too. No direct Worker INSERT/UPDATE/
DELETE/TRUNCATE on invoices or counters remains.

Original isolation tests and the strict `denied()` 42501 assertion are unchanged.
Added live-isolation probes cover own-store function issuance/item snapshot,
cross-store/missing-context denials, idempotence, consecutive numbers, APP invoice
DELETE denial, and cross-store cancellation denial. They use marked stores and
roll back APP-created orders/documents.

Offline tests assert the SQL privilege/function/guard declarations and exercise
the Worker adapter against a transaction/function-boundary model. These do
**not** execute PL/pgSQL or prove live privileges/concurrency. Real isolation
verification is deferred until you review and manually apply migration 0008.

Safe offline command:

```sh
pnpm run test:offline
```

**Release coordination:** migration 0008 revokes rights used by the old deployed
Worker. Apply it and release the matching Worker as a coordinated change.
Until the matching Worker is released, old shipping/cancellation writes will
fail safely. No release or database command was run for this task.

## Files

- New: `db/migrations/0008_invoice_lockdown.sql`
- Updated: `src/dashboard/repository.js`
- Updated: `db/dashboard-isolation.js` (added checks only)
- Updated: `tests/helpers/dashboard-db.js`
- Updated: `tests/dashboard.test.js` (counter SQL assertion moved to migration)
- New: `tests/invoice-lockdown.test.js`
- New: `docs/INVOICE_LOCKDOWN_REVIEW.md`
