# Ann Stage 6: guided setup and launch readiness

Ann's Review screen now reads and saves actual business, support, policy and
shipping/payment settings. These are separate from saved Ann planning answers.
Saving the conversation plan does not save the setup forms.

## Merchant flow

1. Apply confirmed page/catalogue choices using Stage 5.
2. Review the actual business details. Select an existing owned logo or use the
   existing setup for uploads. Confirm and save this group separately.
3. The owner confirms delivery charges, an optional free-delivery threshold,
   COD availability/limit and the tax origin state. These settings affect the
   current live checkout immediately, not only a future published draft.
4. Edit and review each policy individually. Changes to business or checkout
   details clear policy reviews while retaining edited policy text.
5. Resolve the shared readiness errors. Missing product photos/tax data link to
   Products; address confirmation, GSTIN supplier selection and uploads link to
   the existing setup; final review/publication links to the existing editor.

Regenerating policies explicitly overwrites all six policy texts and clears
reviews. Its checkbox names that consequence. Templates remain starting drafts,
not legal advice or evidence that the merchant's terms are correct.

## Contract and boundaries

- GET `/api/stores/:id/ann/readiness` returns real settings, owned logo choices,
  business/product validation errors, policies, checkout configuration, actual
  address/status and authoritative checklist items.
- PATCH uses `expected_draft`, `confirm: true`, an action and its corresponding
  payload: `business/settings`, `checkout/checkout`, `policy/policy`, or
  `generate-policies`. Unknown keys, subdomain and invoice-prefix changes are
  rejected here.
- Existing shared settings, policy and checkout parsers/repositories are reused.
  Existing supplier protection is applied. Admins may edit business/policies;
  only owners may change checkout settings, matching the merchant controller.
- Writes run in the existing tenant-checked store transaction. A stale settings,
  policy, catalogue or checkout snapshot returns 409. Typed edits remain until
  the user explicitly reloads and accepts discarding them.
- Saved sections refresh their data/checks without discarding unsaved work in
  other sections. Business/checkout saves clear even unsaved review ticks.
- Cash on Delivery is the supported payment method here. No online gateway,
  custom-domain connection, carrier integration, provider verification or
  platform approval is invented or enabled by answering questions.
- There is no Ann publish endpoint or automatic completion flag. The existing
  editor rechecks publication, GST and platform approval rules independently.

## Verification and release

The isolated `/__ann-builder-preview` uses separate in-memory PGlite with real
foundational migrations and the actual handlers/repositories. Its browser-only
dataset has six labelled fictional policy drafts. It never connects to the
external merchant database, sends email, takes payment or publishes.

Offline tests cover exact INR parsing, consent, origin/membership/role checks,
unknown-field rejection, stale snapshots, real business normalization, policy
generation/review, and preserving policy text while invalidating its review.

No new migration or backfill is required. The user publishes the Cloudflare
application using:

```sh
pnpm run test:offline && pnpm run deploy
```
