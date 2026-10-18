# Phase 3: Free subscription service

## Status and scope

Implemented and tested offline against real account, store, registration,
business-document and manual-review migrations. The new migration has not been
applied to the connected Supabase database by the agent.

This phase adds the service and API that Phase 4's Ann plan-selection modal will
use. It does not yet add that modal or require a subscription to enter Ann/the
editor. Existing stores are not enrolled, charged, locked or taken offline.
Paid plans, payment-provider calls, recurring payments and mandates remain off.

## Apply and deploy

The user confirmed applying `0037_platform_billing.sql`. Apply the next additive
migration to the same intended database:

```bash
pnpm run db:migrate -- --staged-free-subscriptions
```

After migration succeeds, deploy the updated Worker using the existing command:

```bash
pnpm run deploy
```

Deploying first does not bypass the missing migration: the service returns 503
without creating records. The migration enables only the version-one India/INR
Free offer. All paid offers remain draft and paid prices disabled. The planning
JSON is not runtime offer authority.

## API

Authenticated owner only; responses use `Cache-Control: no-store`.

### `GET /api/stores/:storeId/subscription`

Returns:

- `subscription`: current subscription, or historical subscription when no
  current one exists, otherwise null.
- `free_enrolment_exists`: whether Free has ever been activated for this store.
- `can_enrol`, `reason`, `country_code`.
- `offer`: the available Free offer with its server-owned price ID, terms
  version, 30 live days and entitlement values; otherwise null.
- `server_time`, with subscription clock timestamps and remaining live seconds.

`HEAD` also authorizes access but returns no body. Neither request enrols a store,
starts a clock, resets consent or persistently updates expiry state.

### `POST /api/stores/:storeId/subscription/free`

Same-origin JSON request:

```json
{
  "price_id": "UUID returned by the current Free offer",
  "terms_version": "free-v1",
  "accepted": true
}
```

Unknown fields, including client-supplied prices, user/store identity, status,
expiry timestamps, country overrides and mode are rejected. A stale/wrong price
ID fails before enrolment. Current terms and explicit boolean acceptance are
required in both JavaScript and PostgreSQL.

The database checks an unexpired, unrevoked owner session and tenant context;
forged user metadata, editor membership and platform reviewer status do not grant
billing ownership. The store row is locked to serialize acceptance. The account,
Free subscription, entitlement snapshot and consent event commit atomically.

Successful activation returns the same response shape as GET. Repeated
acceptance returns the existing subscription without rewriting acceptance,
adding events, restarting Free or reviving an expired/cancelled record. No
checkout session, payment, invoice or mandate is created.

## Country and identity

The business country confirmed in Ann takes precedence; otherwise use the
owner's registration country. Do not silently use `stores.country`'s India
default for an unknown or foreign account. Only India has an approved price in
the initial catalogue. Missing countries and unsupported markets do not enrol.
Global Free eligibility requires a separately approved country-price rollout.

Free selection precedes business-document review. Consequently billing accounts
can now have `legal_name=NULL` and `identity_status='unconfirmed'`, rather than
inventing a legal identity from a brand name. The confirmed-identity constraint
still requires a real legal name. Future paid checkout must require confirmed
business identity and the existing business approval checks.

Free activation is permitted while business documents are pending, but does not
approve evidence, replace GST verification or publish the store.

## First successful publication

Free is initially `building`, with both live timestamps null. Database AFTER
triggers observe the publication snapshot and actual `stores.status='live'`
inside the existing publication transaction. They start a building Free
subscription only when both exist and the existing business-publication check
passes.

The transition to `trialing`, the start timestamp, expiry at exactly 720 hours
and one `free.live_started` event are atomic with successful publication. Any
later transaction failure rolls them all back. Document approval alone, saving
a draft, viewing a preview and publishing a snapshot while still draft do not
start Free. Unpublish/republish and repeated POSTs never reset the clock.

Expiry is reported from database time as `effective_status='expired'` and zero
remaining seconds. This does **not** yet implement scheduled reminders,
subscription-state jobs, catalogue quotas, checkout suspension or enforcement.
Those remain their designated entitlement/lifecycle phases.

## Legacy stores

A store already live or possessing a pre-enrolment publication returns
`legacy_transition_required`. No fresh trial is silently started. Explicit
legacy notice, consent and the approved one-time legacy window belong to the
existing-store transition phase. Existing business suspensions remain independent.

## Verification

```bash
node --test --test-concurrency=1 tests/free-subscriptions.test.js tests/platform-billing-schema.test.js tests/subscription-commercial-config.test.js tests/business-review.test.js
pnpm exec wrangler deploy --dry-run --outdir /tmp/lebrands-free-worker
```

The tests use isolated PostgreSQL-compatible databases and synthetic identities/
documents only, with no external database writes or payment-provider calls.
They verify authorization, consent, persistence, repeat requests, real business
review gates, legacy exclusion, failed-publication rollback, the exact clock,
country eligibility and effective expiry. A dry-run builds but does not publish.
