# Phase 6: Razorpay test checkout

## Scope and boundaries

Owner-only Plan & billing now has a separate test checkout for the six India/INR
Launch, Grow and Scale monthly/annual reference prices. Flagship is still quotation
only. The pricing-page sign-in and store-picker continuation from Phase 5 reaches
this same page.

This is a sandbox, not a sale:

- Only `rzp_test_*` credentials are accepted. Replacing them with live keys will
  **disable this service**, not enable live charging.
- No recurring mandate, provider subscription, automatic renewal, refund,
  upgrade/proration, invoice issuance or commercial launch is introduced.
- Paid master offers remain draft/disabled. No claimed feature readiness changes.
- The simulated total is the reference base price. Tax is **not assessed**, not
  approved at zero. The confirmation modal states this before consent.
- Tests do not activate live subscriptions or paid benefits. Test subscriptions
  stay pending, while captured payments and append-only consent/verification
  evidence are recorded. They never replace the current Free plan or restart its
  dates, even after cancellation/expiry. The UI lists test checkouts and test
  payment history separately from current service.
- A separate future release must approve tax/issuer configuration, sellable offers,
  quotas and feature readiness, service activation, invoices, expiry/renewal,
  webhook automation and live key handling before real charging is allowed.

The existing Free acceptance and Indian business-document approval are required
before testing. Country eligibility comes from approved business evidence, never
language, browser locale or account-country suggestion. Existing published stores
without Free enrolment retain the separate reviewed transition.

## Data and runtime

Additive staged migration `0040_billing_test_checkout.sql` depends on 0039.

- `billing_test_configuration` is a private, forced-RLS singleton, initially off.
  APP and API roles have no direct access or writes.
- A separate administrative opt-in stores only SHA256 of a capability derived by
  HMAC from the existing Worker `SESSION_SECRET`, domain-separated for platform
  test billing. No raw secret/capability is stored or returned.
- Financial operations require that Worker capability **and** a valid owner
  session and tenant context. Tenant staff and ordinary APP SQL callers cannot
  forge payment completion by asserting a boolean or sending provider JSON.
- Narrow `billing_test_state` and `billing_test_write` functions own the writes.
  Generic APP financial table writes remain forbidden.
- The existing `billing_free_state` function is replaced **in place**, preserving
  its callable identity while excluding sandbox records from current service.
- Existing billing checkout/subscription/payment/event tables are reused. Brand
  shopper orders, payments, credentials and invoices are untouched.

Authenticated APIs, all mutations POST with same-origin validation:

| Suffix under `/api/stores/:id/subscription` | Operation |
| --- | --- |
| `/checkout` | Explicit `paid-test-v1` consent, price UUID and request UUID. Amount/currency/tax/tenant are never accepted from the browser. |
| `/resume` | Reopen an existing, unexpired test order; never creates another. |
| `/confirm` | Verify callback HMAC against the **stored** order ID, then fetch the provider payment and check captured status, exact order/amount/currency and no refund. |
| `/reconcile` | Owner-initiated server fetch to recover lost callbacks. Never trusts browser success. |

The reservation commits before order creation. Retrying its UUID never repeats an
uncertain provider POST. Recovery fetches orders by exact receipt, rejects
non-unique/mismatched results, and binds only that order. Owner/store locks and
database uniqueness serialize duplicate tabs and settlement replays.

The browser requests status explicitly after an interrupted payment. There is no
unattended webhook/scheduled reconciliation in this phase, so a lost callback
does not automatically produce a payment record until the owner checks it.
Late captured payments remain recoverable after the checkout UI expires.

The SDK loads only after explicit consent. The server enforces test-only
credentials independently of the browser. Provider redirects fail closed using
manual redirect mode, with bounded network timeouts.

## Apply and enable test checkout

Apply the staged migration and explicitly enable test checkout against the
intended external database. These steps do not publish the Worker:

```sh
pnpm run db:migrate -- --staged-billing-test-checkout
node db/billing-test-config.js enable
```

The explicit enable script requires the administrative `SUPABASE_DB_URL`, existing
`SESSION_SECRET`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in its runtime.
It prints only success/failure, never secrets. The Worker must have the **same**
`SESSION_SECRET` and both Razorpay test secrets configured through Cloudflare
Worker secrets. Replit secret existence alone does not prove Worker binding.
Rotating SESSION_SECRET requires rerunning the opt-in script.

The enable script checks credential presence and the test prefix; provider
authentication is actually checked when the runtime calls Razorpay. This phase's
automated provider tests use a simulator, not the real merchant account.

Configure automatic capture in the Razorpay **test** account, or manually capture
an authorized test payment there before clicking Check test payment. Authorized
alone never records a successful payment.

When ready to publish, use the project's existing `pnpm run deploy` process.
Publishing is a separate user action.

To stop new test checkout writes without changing Free:

```sh
node db/billing-test-config.js disable
```

## Verification

```sh
node --test --test-concurrency=1 tests/platform-billing-checkout.test.js \
  tests/platform-billing-pages.test.js tests/browser-bundles.test.js \
  tests/browser-module-delivery.test.js
```

Offline tests apply real staged/foundational DDL in isolated PGlite, with a
synthetic provider. They cover owner/staff isolation, capability denial, approval/
country/terms checks, live-key rejection, amount/order/status tampering,
idempotency, lost provider responses, callback recovery, test payment history and
unchanged Free/live entitlement authority. No external database/provider writes.

Local browser fixture `/__billing-test-preview/` uses only in-memory synthetic
accounts/provider records. It is absent from the published Worker. Credentials:
`billing-owner@example.test` / `Billing preview password 73!`.
Browser tests intercept the provider SDK and use this fixture's capture endpoint;
this verifies application UI wiring, not Razorpay-hosted SDK/account readiness.
