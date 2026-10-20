# Store marketing integrations

## Release boundary

The shared-database migration and Cloudflare publication were separately
approved and completed on 20 October 2026. No existing store was automatically
opted into Meta or Google tracking. Future migrations and publications still
require their own approval.

The additive migration is `db/staged/0050_marketing_integrations.sql`. Use the
existing migration/checksum procedure and apply this new file only. Do not
reapply or rewrite historical migrations to make their recorded names match.
The reviewed command is `node db/migrate.js --staged-marketing-integrations`.
Existing Razorpay authorisations, payment activation, COD and invoice rules
must remain unchanged.

## Brand setup

Open **Settings → Marketing integrations**.

* Meta: enable it and enter the brand's Pixel ID.
* Google: enable it and enter the brand's GA4 Measurement ID.
* Advanced Meta: optionally save a Conversions API token, a temporary test event
  code, or a domain-verification content value. Tokens are encrypted for that
  store, never returned to the browser, and displayed only as a last-four hint.
  Leaving the token field blank preserves it; removal is explicit.
* Advanced Google: optionally enter an Ads ID and conversion labels, site
  verification, and enable enhanced conversions after configuring them in Ads.
* Meta domain verification is emitted only on the brand's custom domain.
  Google verification is scoped to the merchant storefront, not platform pages.

Owner/admin users can edit. Other authorised members have read-only access.
Concurrent edits require reloading rather than overwriting another user's save.
Saving means **Configured**, not independently verified.

## Shopper consent and events

Optional providers are not loaded until the shopper accepts the relevant
purpose. Rejecting tracking does not prevent shopping. Privacy controls allow
later changes and respect browser privacy signals. Changing already-active
preferences requires a clean reload; checkout warns before discarding entered
details. Consent is separate from required shopper email verification.

Shared published-storefront tracking covers page views, product views, valid
cart additions, checkout entry, product searches and confirmed purchases.
Neither admin pages, editors, draft previews nor native Replit Preview send
merchant tracking events.

Checkout events require the actual checkout page and a validated non-empty
cart. Reopening consent on a product page is not starting checkout.
Purchase events require a saved COD order or a captured INR Razorpay payment
matching its payment attempt, payment ID and order amount. Clicking Place order,
an unverified paid status, abandoned checkout or failed payment is not a purchase.
COD conversion means an order was placed, not that cash was received.

Saved order totals and items are authoritative. Meta receives the final total;
GA4 receives merchandise revenue with tax and shipping separately. Product/SKU
identities survive later catalogue deletion. Transactions are store-qualified.
Browser and server Meta purchases share an immutable event ID.

Private receipt tokens must not reach vendor URLs or event payloads. A clean
confirmation URL uses essential HttpOnly access proof. Different order tabs
remain distinct, and receipt access still works if marketing is later disabled.

## Server delivery and testing

Optional Meta server purchases use the existing five-minute scheduled worker,
durable jobs, bounded retries and leased claims. Current consent and settings
are checked again before dispatch. A changed configuration or withdrawn
marketing consent stops pending delivery. No new shared Meta/Google API secrets
are needed; a CAPI token belongs to the individual store.

Marketing matching hashes and captured browser/network details are cleared
after seven days. Consent records expire after 180 days. These technical
defaults do not replace review of the brand's privacy notice and legal duties.

The server test sends one synthetic PageView with the saved test code; it does
not use a real shopper, order or payment. **Remove the Meta test event code after
testing**, otherwise server purchase events remain in test mode.

Verify browser events with Events Manager and Google Tag Assistant/GA4 DebugView
after accepting cookies. Provider blocking can prevent browser delivery.
GA4 and Google Ads purchases are browser-delivered: a shopper who never opens
the confirmed receipt may not be counted there. Optional Meta server delivery
does not require returning to the receipt page.
If importing GA4 purchases and configuring direct Google Ads conversions,
choose only one primary purchase goal to avoid double counting.

Automated checks use disposable PostgreSQL and isolated memory-only browser
fixtures with stubbed vendor SDKs. They do not prove receipt by a live brand's
Meta or Google account. Verify that separately after approved rollout and setup.
Campaign creation, budgets, spend reporting, product feeds and refund conversion
adjustments are outside this release.
