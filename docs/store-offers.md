# Store offers: first release

## What merchants can use

**Offers & codes** is separate from Catalogue. Owners and admins can create,
edit, activate, pause and resume:

- Percentage discounts, including an optional maximum saving.
- Fixed-amount discounts.
- Automatic offers or a manually entered code.
- Whole-order, selected-product or selected-collection targeting.
- Minimum eligible spend and quantity.
- Start/end timestamps and a total usage cap.

The initial checkout remains the existing India/INR checkout. Monetary values
are integer paise; percentage values are integer basis points. Schedule inputs
and offer tickets explicitly display UTC. No recurring charge or subscription
integration is added by this feature.

## Calculation and lifecycle rules

- One best eligible offer per order. No stacking in this release.
- The best offer is the one with the lowest final payable amount, including
  delivery. A discount cannot make the customer pay more than without it.
- Product/collection minimums count only eligible lines. Collection membership
  and SKU prices come from the published snapshot, never unfinished drafts.
- Fixed discounts apply once across eligible merchandise, not once per unit.
- Percentage savings round down to a paise. Largest-remainder allocation
  distributes the saved amount exactly across eligible lines with stable ties.
- Tax is recomputed on each line after its allocation. Merchandise subtotal and
  original unit prices remain gross, and the order stores its discount
  separately. Delivery/free-delivery thresholds use merchandise after discount.
- Codes are case-normalised and unique per store. Old codes remain reserved
  rather than being recycled into unrelated promotions. A used offer's code
  or automatic/code method cannot be changed.
- An offer name is not a redeemable code. For example, naming an automatic
  promotion `SAVE100` does not create a code. Select **With a discount code**
  and enter the code explicitly if shoppers should type it.
- A rejected code does not invalidate the bag display. Cart validation returns
  current items/totals and a separate offer error, with any eligible automatic
  discount. The shopper must remove or replace the rejected code before
  ordering; server-side order creation still rejects invalid codes.
- Checkout recalculates eligibility inside its store-locked transaction.
  Management uses the same lock. Usage and stock writes roll back together.
  Client-expected savings are checked before placing a new order.
- Retrying the same checkout returns its original order without another
  redemption. Online orders hold a use; paid/fulfilled orders commit it.
  Cancelling an unpaid held order releases it. A committed use remains
  consumed after cancellation/refund, preventing repeated discount reuse.
- Per-customer limits are deliberately not exposed: current guest phone/email
  entry is not verified identity. There are no claims that one shopper can
  reliably be restricted to one use.
- Zero-total orders can use the existing COD path without collecting money.
  Razorpay is not opened for zero-value payments. A store that disables COD
  cannot complete a zero-total order until a dedicated free-order flow exists.
- Quote calls with a code share the existing checkout IP attempt limiter.
  No code list is returned through public cart endpoints.

## Database scope and future extensions

Manual migration `db/staged/0044_store_offers.sql` introduces:

- `offers`: versioned rules, combination policy, schedules, limits and revisions.
- `offer_targets`: relational product/collection selections and reserved
  exclusion support.
- `offer_codes`: store-unique codes, independent of promotion identity.
- `offer_bundles` and `offer_bundle_items`: future qualifier/reward/component
  composition, SKU/product/collection references and quantities.
- `offer_redemptions`: held, committed and released use evidence.
- `order_discounts` and `order_item_discounts`: permanent applied-rule snapshot
  and exact allocations.
- An immutable per-line `order_items.discount_paise`, captured on insert for
  new discounted orders, available to invoice snapshots.

All tables have tenant isolation. Configuration writes require the authenticated
owner/admin function; the application role has no direct offer-configuration
write privilege. Existing invoice issue/reversal functions and their privileges
are unchanged.

Future types have reserved schema values for buy-X-get-Y, bundles, tiered and
shipping offers, plus versioned JSON rules. They can only remain drafts:
database checks block activation until a supported evaluator and migration
explicitly enable them. This is extensibility, not a claim that every future
promotion is already implemented.

Historical orders/invoices are not recalculated. Order and invoice screens show
captured savings; emails use the same saved financial values. Analytics retain
their existing conservative margin rules for discounted orders rather than
inventing historical profit.

## Release

Review and back up the database through the normal operational process, then:

```bash
# Repository root. Manual administrative migration; requires the staged SKU
# checkout migration to have been recorded already.
pnpm run db:migrate -- --staged-store-offers

# After the migration succeeds, publish the updated Cloudflare Worker.
pnpm run deploy
```

Neither command was executed against the live database or Worker during
implementation. When the migration is absent, the dashboard explicitly
disables offer saves and checkout continues without discounts.

## Local verification

```bash
node --experimental-test-module-mocks --test --test-concurrency=1 \
  tests/store-offers.test.js tests/sku-checkout.test.js
```

The Vite-only `/__sku-checkout-preview/offers` route uses a synthetic,
in-memory database. It is not imported into the production Worker and must
never be used to inspect or modify real stores.
