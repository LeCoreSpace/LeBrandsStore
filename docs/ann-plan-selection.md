# Phase 4: Ann plan selection

This phase adds explicit Free acceptance immediately after store-name confirmation.
No paid checkout, Razorpay call, card, mandate or automatic renewal is enabled.

## Rollout

Apply the already reviewed Free service migration first if not already applied:

```sh
pnpm run db:migrate -- --staged-free-subscriptions
pnpm run db:migrate -- --staged-ann-plan-selection
pnpm run deploy
```

The Agent has not run these commands against the external database or published
the Worker. Review and run them using the existing administrative deployment flow.
This rollout does not modify any existing store's subscription or billing access.

0039 adds a platform-owned `billing_enrolment_required` marker. All stores existing
when the migration is applied receive false. Future stores default to true.
The later legacy-transition phase is responsible for existing stores.

## Merchant flow

1. Confirm the store name. Confirmation is persisted even when the name is unchanged.
2. Open the plan-selection modal. The currently offered Free price and terms come
   from the authenticated subscription API, not hardcoded checkout data.
3. Explicitly accept the terms and select Start Free plan.
4. Continue with country, Indian GST verification where applicable, documents,
   address and store design. Business approval is still separately required for
   publication. Accepting Free never approves a business or publishes a store.

The modal has no preselected acceptance, and closing it never enrols the store.
An in-chat button reopens it. Reloading restores the name/plan position from the
server. A committed enrolment can be recovered by refreshing the modal after a
network timeout. Only an owner can enrol; other members need their owner to act.

Free includes 100 published products and 1,000 published SKUs, no LeBrands.Space
placement and no custom domain. The 30-live-day clock still starts at first
successful publication, not selection, preview or document approval.

## Enforcement and compatibility

Ann writes, ordinary store mutations and theme editing require enrolment for
newly gated stores. Name-only confirmation and country recovery remain available.
Database triggers also reject unconsented Ann-session saves and publication/live
changes, and reject subscription creation before confirmed naming. The app role
cannot remove its rollout marker. Existing business/tenant/session guards remain.

Until 0039 is installed, the deployment follows explicit staged compatibility
and does not retroactively gate previously created stores. This is not a general
error fallback: a present-but-failing access function propagates its failure.
This phase checks initial enrolment, not quota or expiry enforcement, which remain
later phases.

## Local verification

`/__ann-plan-preview/` is a development-only Ann instance with real PostgreSQL
fixture DDL and real route handlers. It uses synthetic, in-memory accounts and no
production database, credentials, payments or uploaded business evidence.
The production Worker does not import this fixture.

```sh
node --test --test-concurrency=1 tests/ann-plan-selection.test.js tests/free-subscriptions.test.js
```
