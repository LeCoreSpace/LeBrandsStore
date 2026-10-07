# Step 4 polish and migration 0009 review

Migration: `db/migrations/0009_required_gstin.sql`. **Unapplied.**
Migrations 0001–0008 are unchanged. No deployment or production-data edit
was performed while implementing this work.

## A–E implementation status

| Section | Before this polish | Now |
| --- | --- | --- |
| A: numbering | Long subdomain prefix, full FY, `/CN/`; no prefix editor or FY lock | Short editable prefix; invoice `STN/26-27/0001`, credit `STNC/26-27/0001`; DB lock and overflow rejection |
| B: invoice contents | Required/checksummed GSTIN, exempt lines, totals and valid GSTIN test vector present; remaining items incomplete | Separate CGST/SGST or IGST rates, `Invoice No.`, frozen `NOS`, structured supplier address, signature upload/printing, formatted phones |
| C: order/timeline | Checkout already wrote `order.created`; metadata omitted payment method; timeline repeated raw metadata and all fields were visible | Payment method added to new events only; plain sentences, empty-state/padding fixes, action-dependent controls and cancellation confirmation |
| D: overview | Several muted captions already present; attention query lacked names; period control small | Customer name selected, muted helpers enforced and larger selected period toggle |
| E: verification | Existing offline and isolation coverage present; polish cases absent | Added offline polish cases and five isolation checks; actual isolation execution requires manual application of 0009 |

## Exact database permissions

No table grants/revokes, role membership, policies or RLS settings change.
`invoices` and `invoice_sequences` remain APP SELECT-only with forced,
tenant-scoped RLS exactly as 0008 configured them. Invoice items remain
embedded in immutable snapshots; `order_items` is not an invoice-items table.

**GRANT:** EXECUTE on `issue_invoice(uuid)` and `cancel_invoice(uuid)` to
`lebrands_app`, reaffirming the existing 0008 grants.

**REVOKE:** ALL function privileges from PUBLIC and APP on:

- `gstin_is_valid(text,text)`
- `default_invoice_prefix(text)`
- `invoice_serial(text,text,bigint,boolean)`
- `guard_invoice_prefix()`
- `supplier_is_complete(jsonb)`
- `invoice_supplier(uuid)`
- `validate_new_tax_invoice()`

ALL function privileges on the two financial authorities are revoked from
PUBLIC, not from APP. ALL function privileges on all nine functions are also
revoked from `anon`, `authenticated`, and `service_role`, when those roles exist.

## Functions

All nine functions are explicitly owned by `postgres`.

| Function | New/replaced | Security and fixed search path | Purpose |
| --- | --- | --- | --- |
| `gstin_is_valid` | New | Invoker, immutable; `pg_catalog` | Pattern, mod-36 checksum, known state and prefix/state match |
| `default_invoice_prefix` | New | Invoker, immutable; `pg_catalog` | First three consonants/alphanumerics of brand name; letters fallback; `STO` if empty. Stonescence → STN |
| `invoice_serial` | New | Invoker, immutable; `pg_catalog` | Short FY, minimum four-digit padding, valid prefix/sequence, 16-character ceiling; failures `23514` |
| `guard_invoice_prefix` | New | Definer; `pg_catalog, public` | Current-IST-FY prefix lock, tenant context check on changes, removal/deletion protection; failures `42501` |
| `supplier_is_complete` | New | Invoker, immutable; `pg_catalog, public` | Required legal name, street, city, PIN and valid state-matched GSTIN |
| `invoice_supplier` | New | Invoker; `pg_catalog, public` | Reads one explicit store's current registered Settings and tenant-owned signature media; incomplete details `23514` |
| `validate_new_tax_invoice` | New | Invoker; `pg_catalog, public` | Complete supplier, GST-only new documents and zero tax on exempt lines; failures `23514` |
| `issue_invoice` | Replaced | Definer; `pg_catalog, public` | Tenant-checked idempotent issuance, short serial, immutable NOS/items/current supplier snapshot and atomic counter allocation |
| `cancel_invoice` | Replaced | Definer; `pg_catalog, public` | Tenant-checked idempotent cancellation; separate short credit series; never changes original invoice number or financial snapshot |

The two authorities retain explicit `store_id` filters on every tenant read
and write and reject missing/invalid context or cross-store orders with `42501`.
They lock the store row first, matching the Worker's outer transaction, then
the settings/order rows and counter. Settings row locking serializes prefix
editing with issuance. Failed issuance/cancellation rolls back allocation.
The existing 0008 invoice/counter immutability triggers remain unchanged.

## Triggers, constraint and default initialization

- `validate_new_tax_invoice`: BEFORE INSERT, each row, on `invoices`.
- `guard_invoice_prefix`: BEFORE UPDATE OF settings, each row, on `store_setup`.
- `guard_invoice_prefix_delete`: BEFORE DELETE, each row, on `store_setup`.
- `invoice_prefix_valid`: CHECK on `store_setup.settings`, enforcing
  `^[A-Z0-9]{1,4}$` when a prefix is stored.
- Existing stores without a prefix receive the default in their settings.
  This pins their default against later brand renames. No issued invoice,
  credit note or counter is renumbered/reset.

## Numbering and historical behavior

- Invoice: `PREFIX/YY-YY/NNNN`, e.g. `STN/26-27/0001`.
- Credit note: `PREFIXC/YY-YY/NNNN`, e.g. `STNC/26-27/0001`.
- Separate consecutive counters per store and Indian FY, April–March.
- Four digits is minimum padding. More digits are permitted only if the
  full serial still fits 16 characters; otherwise raise `23514`.
- New credit notes use their issuance FY, even when the original invoice is
  from an earlier FY. The original invoice's number/FY remain untouched.
- Prefix locks after any invoice or credit issuance in the current FY.
  Returning/cancelling an invoice does not unlock it; next 1 April does.
- Existing cancelled documents return their existing credit number unchanged.
- Supplier details are repairable in Settings before issuance, then frozen.
  Stored order amounts are never recalculated; an inconsistent tax split blocks.
- Optional signatures use the existing logo upload rules: tenant-scoped R2,
  5 MB, PNG/JPEG/WebP/safe SVG, with ownership checked before attachment.
- No new Bill of Supply or full credit-note document flow.

## Verification

`pnpm run test:offline`: **137 passed, 0 failed**. JavaScript syntax and diff
checks passed; previous migrations and both Wrangler configs are unchanged.
No direct invoice/counter DML remains in Worker code.

Browser checks passed for Settings errors and canonical structured saves,
action-dependent fields, cancellation confirmation, readable empty timeline,
and the shipping rejection/Settings link. Browser writes were mocked and the
pages used owner-role preview fixtures, not authenticated end-to-end access.
The optional signature uploader was inspected in code and its rendered output
covered offline, but no real signature upload was performed.

Run `pnpm run test:offline` for offline tests.
Only after separately reviewing and manually applying the migration, run
`pnpm run db:test-isolation`. That command creates/cleans marked RLS fixtures;
it was not run as part of this implementation.

Existing isolation denial expectations remain `42501`. Positive formatting
expectations and synthetic suppliers were updated to meet the new requirements,
not relaxed. No new secrets are required.
