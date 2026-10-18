# Platform billing: Phase 2

## Delivery and application status

This is an additive, explicitly staged migration for the existing external
Supabase PostgreSQL database. It is not part of ordinary migrations or Worker
startup. The schema is prepared and tested offline; it has not been applied to the
connected database by the agent. No checkout, enrolment, gating, publication,
subscription charging or recurring-payment behaviour is enabled.

It follows the Phase 1 configuration in `subscription-commercial.proposed.json`.
The draft seed is frozen in the migration; do not edit it after application.
Subsequent catalogue changes require a new migration/version, not a changed
checksum for an applied migration. The JSON is not runtime payment authority.

## Tables and relationships

| Table | Purpose |
| --- | --- |
| `billing_plans` | Versioned Free, Launch, Grow, Scale and Flagship definitions. |
| `billing_plan_prices` | Versioned country/currency/interval prices in integer minor units, tax display and offer enablement. |
| `billing_features` | Feature and allowance definitions, types and implementation readiness. |
| `billing_plan_features` | Explicit per-plan feature inclusion and typed JSON values. |
| `billing_accounts` | One billing identity per store, linked to an existing user and country. |
| `billing_subscriptions` | Store/account/plan/price relationship, consent, mode, service periods, entitlement snapshot and Free live clock. |
| `billing_subscription_events` | Append-only, deduplicated subscription lifecycle evidence. |
| `billing_checkout_sessions` | One-time checkout attempts, amount/tax snapshots, purpose, expiry and provider order reference. |
| `billing_payments` | Server-verified captured payment records tied to checkout, subscription, currency, provider, amount and test/live mode. |
| `billing_webhook_events` | Private verified-event deduplication and recoverable processing status; no raw provider payloads. |
| `billing_invoices` | Separate platform invoice headers, payment relationship and issuer/customer/tax snapshots. |
| `billing_invoice_lines` | Tenant-checked invoice lines with integer arithmetic constraints. |

`stores.store_id` is the tenant identity. Billing records do not attach to
catalogue products. Merchant `orders`, `payments`, `payment_attempts`, `invoices`,
`refunds` and their numbering remain unchanged.

Each account belongs to one store. Each subscription references a price whose
plan, country, currency and interval match. Checkout, payment and invoice ancestry
uses composite foreign keys, preventing cross-store references and mismatched
payment amounts/providers/modes/currencies.

Pending paid checkouts can coexist with a current Free/paid subscription. Only
one building/trialing/active/grace/paused subscription per store is allowed.
Changing accepted plan or price requires a new subscription record; do not
rewrite the historical accepted identity. Renewal of the same purchase can
advance service periods through future verified-payment services and audit events.

## Initial catalogue

The migration seeds:

- **5 draft plans**.
- **8 disabled INR/India prices**: Free, monthly/annual Launch/Grow/Scale, and
  Flagship's non-payable quotation placeholder. Flagship's advertised “from”
  amount is not a checkout price.
- **15 feature masters**: nine core feature definitions plus six allowance/
  custom-domain definitions.
- **75 plan-feature mappings**, including explicit exclusions.
- **No billing accounts, subscriptions, checkout sessions, payments or invoices**.

Free: 100 published products, 1,000 published SKUs, 30 live days, no Space
placement and no custom domain. Trial time is initially null, not started at
enrolment. Once set, the live clock is fixed at 720 consecutive hours and cannot
be reset or cleared. The Free record cannot be deleted or reissued after expiry
or cancellation.

Paid Space mapping: Launch/Starter, Grow/Premium, Scale/Freedom,
Flagship/Freedom with contracted extras. Quotation-dependent Flagship limits
are JSON `null`, meaning **contract required**, not unlimited. The Free order
soft band is null because there is no band during Free; this is feature-specific,
not a universal interpretation of null. Staff zero and domain false are real
values, not missing allowances. Order bands must not become checkout blockers.

All offers are `draft`, and every price has `enabled=false`. Core inclusion does
not claim that unimplemented features are live; the feature master retains
implementation readiness. The future quote service must check both offer state
and price enablement, business approval, actual feature availability and account
eligibility before accepting any paid offer.

## Permissions and security

- All 12 tables have enabled and forced row-level security.
- `lebrands_app` can read the draft catalogue, but cannot write it.
- Private billing reads require both transaction-local tenant context and a valid,
  unrevoked, unexpired owner session. Staff/admin/editor membership alone does not
  grant billing access. Password-reset-required accounts are denied.
- The application cannot directly insert, update or delete any billing record.
- Webhook records are entirely private to privileged processing, including reads.
- Supabase `anon`, `authenticated` and `service_role` grants are explicitly
  revoked, including inherited default grants for the new tables/functions.
  Administrative database BYPASSRLS remains administrative authority.
- Events are append-only. Accepted subscription identity and started Free clocks
  cannot be rewritten; price economics cannot be edited in place. New prices
  need a new version.
- No secrets, cards, provider tokens or raw webhook payloads belong in these
  tables. Snapshot/summary columns must contain only validated permitted fields.
- Future privileged writers must derive identity from the owner session, validate
  tenant ownership, lock affected records and preserve business approval gates.
  No generic privileged insert/update interface is introduced here.

Free activation, first-publication clock assignment, payment verification,
webhook matching and atomic entitlement changes are future service work. Schema
constraints support them but do not implement those flows by themselves.
Invoice issuance, numbering, tax calculation, total-of-lines validation, refunds
and credit notes remain the later financial-document phase.

Initial collection is one-time payment with manual renewal. Subscription rows
reject automatic renewal and non-manual collection; no mandate table or provider
subscription identifier is introduced. Recurring billing requires a later schema
and consent change. Test records cannot be converted in place to live records.

## Apply after review

Before application, confirm that `SUPABASE_DB_URL` selects the intended database
and that `0035_business_document_review.sql` is already recorded as applied.
The runner also requires the ordinary migrations through `0010_store_pages.sql`.
Existing migrations must not be modified to satisfy checksum errors.

```bash
pnpm run db:migrate -- --staged-platform-billing
```

The existing migration runner uses one transaction, a concurrency lock, dependency
checks and checksums. Rerunning the command after successful application is a
checksum-verified no-op. No Worker deployment is required solely to apply this
schema; app features still need later implementation.

Expected administrative read-only verification:

```sql
SELECT count(*) FROM public.billing_plans;          -- 5
SELECT count(*) FROM public.billing_plan_prices;    -- 8
SELECT count(*) FROM public.billing_features;       -- 15
SELECT count(*) FROM public.billing_plan_features;  -- 75
SELECT count(*) FROM public.billing_subscriptions;  -- 0 before explicit activation
SELECT count(*) FROM public.billing_plan_prices WHERE enabled; -- 0
SELECT count(*) FROM public.billing_plans WHERE offer_state <> 'draft'; -- 0
```

## Offline verification

```bash
node --test --test-concurrency=1 tests/platform-billing-schema.test.js tests/subscription-commercial-config.test.js
```

The isolated PGlite test uses the real account/store/merchant foundational DDL
from migrations 0001–0003. The business-review migration is an explicit ordering
marker only; this test does not simulate or claim to test that approval flow.
Tests cover catalogue parity, prerequisite rollback, forced RLS, all application
write denials, API-role revocations, invalid/revoked/expired sessions, owner/staff/
tenant separation, monetary/ancestry constraints, deduplication and immutable Free
history. It never connects to the workspace's external database or payment provider.
