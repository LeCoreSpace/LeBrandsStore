# Step 3: cart and Cash on Delivery

Implemented in the existing plain-JavaScript Cloudflare Worker and Aura storefront.
No deployment, remote secret configuration, migration or database isolation run
was performed by the agent. Earlier migrations and both Wrangler configs remain
unchanged.

## Routes

- Published store: product Add to cart, cart drawer, `/cart`, `/checkout`, `/track`.
- `POST /api/cart/validate`: only product IDs, quantities and optional delivery state.
- `POST /api/checkout/order`: guest contact/address, cart IDs/quantities, idempotency
  UUID, random receipt token and Turnstile token. Client prices/totals are ignored.
- `POST /api/orders/track`: order number and phone. Response contains status,
  order number and creation date only.
- `/orders/:receipt_token`: private confirmation, with no-store/no-referrer/noindex.
  Only a tenant-scoped SHA-256 digest of the 256-bit receipt token is stored.
- Store owner: `/stores/:id/settings/checkout` and `/stores/:id/orders`.
- Owner settings API: `PATCH /api/stores/:id/checkout-settings` takes the settings
  object directly, not a `{settings: ...}` wrapper.
- Local-only `/__step3-preview?view=checkout`, `cart`, `track` or `home` is an
  empty, read-only visual preview. It has no database, products, fake saves,
  Turnstile bypass or order placement.

## Required configuration

1. Create a Cloudflare Turnstile widget for the store hostnames. Set the public
   `TURNSTILE_SITE_KEY` in the **root `wrangler.jsonc`** `vars` object. Use the real
   public site key, not a test key. Add the permitted custom-domain hostnames when
   enabling custom domains. Do not put the secret key in `vars` or source code.
2. Set the Worker secret `TURNSTILE_SECRET_KEY` using the command below.
3. Existing `SESSION_SECRET` must remain configured: IP buckets are HMAC hashes,
   never raw IP addresses.
4. Apply migration `0006_cod_checkout.sql` manually with the administrative
   `SUPABASE_DB_URL`. The Worker continues to use the restricted `lebrands_app`
   Hyperdrive connection. No database migration or replacement is introduced.

Checkout fails closed when either Turnstile key is missing. Server verification
requires the request hostname and action `checkout` to match. Offline tests inject
a verifier function; there is no public request flag or environment bypass.

### Exact manual commands, from the project root

```sh
# Offline only. Does not connect to a database.
pnpm run test:offline

# LOCAL BUNDLE CHECK ONLY. Does not publish or deploy.
pnpm exec wrangler deploy --config ./wrangler.jsonc --dry-run --outdir /tmp/lebrands-step3-bundle

# MANUAL DATABASE WRITE: apply pending migrations using SUPABASE_DB_URL.
# Run only when you are ready to apply the new checkout schema.
pnpm run db:migrate

# MANUAL DATABASE TEST: creates strictly marked rls-test-* fixtures, exercises
# the restricted APP role, rolls back probes and cleans marked fixtures.
# Requires SUPABASE_DB_URL + SUPABASE_APP_DB_URL; run after the migration.
pnpm run db:test-isolation

```

**Do not run either command below until you explicitly authorize a production
deployment.** Cloudflare's `wrangler secret put` **immediately deploys a new
Worker version**; it is not a harmless configuration-only step. Apply the
migration and configure the public site key first, then, when ready to publish:

```sh
# MANUAL PRODUCTION DEPLOYMENT: enter the Turnstile secret at the secure prompt.
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --config ./wrangler.jsonc

# MANUAL PRODUCTION DEPLOYMENT: ensure production code/site-key config is published.
pnpm exec wrangler deploy --config ./wrangler.jsonc
```

Production uses **only `wrangler.jsonc`**. `wrangler.preview.jsonc` is a separate
local preview/test adapter, never a production deployment target. Its visual
checkout preview does not need either Turnstile key or a database.

## Totals, GST and stock

- All money is integer paise. Product prices, HSN and GST come from the immutable
  published catalogue, not unpublished product drafts. Current product status and
  stock are checked separately in the same store.
- Delivery is free by default; flat delivery adds `flat_paise`; free-above charges
  the flat fee below `free_above_paise`, and is free at or above the threshold.
- COD is on by default, maximum ₹3,000 **including delivery**. Missing store GST
  state blocks checkout until the owner completes settings. GSTIN prefix/address
  prefills the state; published details take precedence over unpublished drafts.
- GST is included in the product price, not added a second time. For each line:
  `gross = unit_price_paise × quantity`; round
  `taxable = gross ÷ (1 + gst_rate / 100)` half-up to the nearest paise using
  integer/BigInt arithmetic. `tax = gross - taxable`.
- Intrastate: `CGST = floor(tax / 2)` and `SGST = tax - CGST`, so the final odd
  paise is in SGST. Interstate: IGST gets all tax. Zero GST yields zero tax.
  Stored taxable value plus stored tax always equals the line total.
- Delivery is a separate charge; this step does not allocate product GST onto
  delivery or produce invoices.
- Current GST choices: 0%, 5%, 18%, 40%. Historical rates remain intact and show
  a confirmation notice. A newly created/changed rate must be a current slab.
- Customer, address, order, immutable item snapshots, order counter and stock
  reduction commit together. Store/product locks plus guarded stock updates
  prevent overselling. An error rolls all of these back.
- Order numbers use the current store-address prefix and a per-store counter
  starting at 1001. Renaming the store does not reset its counter.

## Retry safety and abuse protection

- A stable idempotency UUID plus normalized payload hash prevents duplicate orders.
  Same key/payload returns the existing order; changed payload returns 409.
- Only the payload fingerprint, UUID and random receipt token are retained for
  retries in guarded per-store sessionStorage, never contact/address payloads.
  Missing secure retry storage blocks a new purchase rather than risking duplicates.
- A committed order can be replayed after a transport error without a new captcha;
  an attempt without a committed order still requires valid Turnstile verification.
- Maximum 3 COD orders per phone per store in a rolling 24 hours, counted against
  the immutable order phone, regardless of later status changes.
- Checkout IP limit: 10 attempts/minute/store. Tracking: 10 attempts/15 minutes/store.
  Invalid submissions consume a committed attempt before the order transaction.
  Attempts older than one day are removed during subsequent limited requests.
- Cart localStorage holds only per-store product IDs and quantities, guarded by
  try/catch. Every cart/checkout load revalidates price, inventory and availability.
- Mall/direct/unknown attribution persists as a category during the tab session,
  so internal cart navigation does not erase mall referrals. Referrer paths,
  queries and customer data are not saved as attribution.
- Both new tables force tenant RLS, reject cross-store writes and revoke public/
  Supabase API-role table access. Owner routes additionally require owner membership.

## Verification limits

Offline tests cover calculations, GST rounding, bad cart input, stock/COD limits,
atomic rollback, duplicate/concurrent submissions, tenant-scoped receipts, tracking,
Turnstile failure and owner permissions. The extended real-database isolation
script is ready but was not run because migrations/database changes were forbidden.
Browser mocks can verify presentation and interactions, not real Postgres or real
Turnstile acceptance. Verify one real checkout after manual schema/key setup.

Razorpay, Shiprocket, email/SMS, OTP, invoice PDFs, fulfilment editing and the
full Step 4 dashboard remain out of scope.
