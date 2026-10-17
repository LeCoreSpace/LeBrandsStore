# SKU checkout

## Scope

Products with saved variants can now be published and bought by SKU. The shared Ann/dashboard product form remains the source of each product's options, generated SKUs, price overrides and stock. Existing single-SKU products and carts remain supported.

This phase does not publish the Worker, change plan limits, migrate historical orders or replace the catalogue masters.

## Database prerequisite

Apply the additive staged migration before deploying the updated Worker:

```sh
pnpm db:migrate -- --staged-sku-checkout
```

This requires the descriptor coverage migration. It adds a selected-option JSON snapshot to order lines, a readiness marker and a guard rejecting base-only order inserts for variant products. Existing `product_option_id` and `sku` columns are reused. The new guard also rejects older Workers attempting to sell a variant product without selecting its SKU. No financial write grants or existing callable function identities change.

Migration was applied to the connected Supabase database during this phase. Counts and content fingerprints of products, SKU rows, orders, existing order-line fields, invoices and collections were unchanged.

## Purchase contract

- A cart line is `{product_id, product_option_id?, quantity}`. Different SKUs of one product are separate lines. Existing base-product carts still work.
- Choosing every product option is mandatory. Missing combinations and sold-out SKUs cannot be added.
- Price and option labels come from the published product snapshot, not client input or unpublished edits.
- Available stock comes from the current store-scoped SKU row. Parent aggregate inventory is not substituted for SKU inventory.
- Quote and placement reject deleted, foreign, stale or unspecified SKU choices.
- Order placement locks inventory, rechecks stock and decrements the chosen SKU atomically. Failed transactions roll back all deductions.
- Selected SKU, readable options, price and GST amounts are copied to the order line. Subsequent catalogue edits do not rewrite them.
- Idempotency includes SKU identity. Retrying the same checkout does not create another order or deduct again.
- Cancellation and existing failed/expired payment recovery restore the same SKU exactly once, then refresh parent aggregate stock.
- Operational stock updates preserve published SKU metadata. Explicit catalogue publication refreshes SKU options and prices.
- The aggregate stock adjustment action rejects variant products; edit their individual quantities in the shared product form.

## Verification

Focused tests cover all eight saved styles, selection states, price overrides, SKU cart identity, tax, real-schema placement and snapshots, replay conflicts, last-unit requests, tenant isolation, cancellation and recovery. The isolated Vite-only `/__sku-checkout-preview/` route uses synthetic in-memory data; it is not a production route or Turnstile bypass.

Browser checks confirmed selection, sold-out states, two independently editable SKU cart lines, reload persistence and a narrow layout without horizontal overflow. The final browser submission exposed missing session configuration in the synthetic fixture. After correcting that fixture-only setting, an HTTP checkout smoke test confirmed creation (201), replay (200), receipt (200), exactly one order with two SKU lines, a ₹220 total and exactly one stock deduction per selected SKU. The final submission was verified by HTTP rather than another full browser run. No external payment gateway transaction was made.

New browser modules must also be allowed by the Worker's explicit `/assets/` route. `commerce-options.js` is registered there.
