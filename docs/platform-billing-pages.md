# Phase 5: pricing entry and Plan & billing

No schema changes, paid checkout, provider calls, mandates or charges are introduced.
The existing staged platform billing and Free-service migrations must be installed.
0039 is required to enforce the Ann-after-name sequence for new stores.

## Entry points

Public pricing Free/Launch/Grow/Scale/Flagship links open the account host's
`/plans?plan=...` entry. Signing in preserves this intent, including invalid-login
retries and the signup/login links. Only local allowlisted billing destinations
survive authentication. Mandatory password changes still happen first; their
form retains the safe destination and offers Continue to Plan & billing afterwards.

No stores: show Create a store. The normal creation flow then leads to Ann and
explicit Free acceptance after naming. Multiple owned stores: require an explicit
choice, without exposing staff-only memberships or choosing the first store.
Exactly one owned store: redirect to its billing page.

`/stores/:id/billing` is owner-only and appears as Plan & billing under dashboard
Settings. Other members see an owner-only item without a destination. Every page
load is authorized and private/no-store. GET and HEAD never enrol or charge.

## Data and controls

The page reads real subscription status, immutable entitlements, accepted terms,
publication-based Free dates and real platform payment/invoice history, capped at
50 recent records each. It never mixes merchant shopper transactions into billing.
Usage counts and enforcement remain later phases, not fabricated zero counts.

Paid country/currency prices and feature readiness come from the master tables.
Disabled paid prices may be displayed as proposals; no paid purchase or activation
control is provided. Unsupported countries do not get an Indian-price fallback.
Quotation plans never treat a null amount as zero.

Newly gated stores return to Ann for Free selection. Existing unpublished eligible
stores can voluntarily accept Free using the existing explicit-consent modal.
Already-published legacy stores keep their service unchanged pending the separate
transition phase. Missing migrations show a recoverable service error, not a fake
subscription. Business approval remains independent of plan selection.

## Verification

`tests/platform-billing-pages.test.js` checks safe redirects, sign-in continuation,
owner restrictions, store selection, real read-only billing data, explicit Free
recovery, timer persistence and quote formatting. Existing auth, navigation and
navigation-performance checks remain applicable.

`/__billing-preview/` is a development-only complete synthetic sign-in/billing
journey. It uses isolated PGlite data, public test credentials and a distinct
host-only fixture cookie. It cannot read live accounts or charge any provider.
The production Worker never imports it.
