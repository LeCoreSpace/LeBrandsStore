# Ann: domains, payments and shipping

## Database and release

The store owner can keep the included address, COD and manual fulfilment. All
connections are optional and only owners can change them. Mandatory business,
GST, policy, stock and platform approval checks remain unchanged.

Apply these migrations yourself, in this order. The launch migration requires
the previously deployed Ann foundation. Already-applied migrations are skipped.

```sh
node db/migrate.js --staged-launch
node db/migrate.js --staged-commerce
pnpm run db:test-isolation
```

Then publish the Worker using the **root** production configuration only.
Nothing here executes migrations or a production deployment automatically.
The existing five-minute scheduled trigger must stay enabled: it recovers
payments and shipping/refund jobs even if the browser closes.

## Credentials and future OAuth

Merchant API credentials are entered in Ann's secure connection fields, never
in conversation. They are encrypted with AES-GCM using a tenant/provider-bound
key. Set a stable `INTEGRATION_ENCRYPTION_KEY` Worker secret before first use;
otherwise the existing stable `SESSION_SECRET` is used. Do not rotate either
without re-encrypting credentials, including outstanding order/job snapshots.

Snapshots are necessary to settle orders already started with old credentials
after account disconnection or reconnection. They are never returned to the
browser. Disconnect stops new orders/jobs using that account, not recovery of
existing obligations. Retain old provider credentials until those orders settle.

Partner OAuth is deliberately not enabled. The runtime credential adapter
accepts a provider access token independently of checkout/fulfilment. Partner
approval, OAuth consent/callback, token refresh/revocation and account mapping
remain a later explicit integration, not a pretend OAuth button.

## Razorpay activation

1. Complete merchant KYC, payment activation and website approval in Razorpay.
2. In Ann, connect the merchant's **live** API key/secret and a strong webhook
   secret. Test keys can be verified but cannot activate live-store checkout.
3. Register the webhook URL displayed by Ann in the merchant's Razorpay account.
   Use that same webhook secret. Subscribe to `payment.captured`, `order.paid`,
   `payment.authorized`, `payment.failed`, `refund.processed`.
4. Send a signed provider test event, then reload Ann. Ann marks the webhook
   verified only after valid HMAC verification. Verification does not prove KYC.
5. Confirm KYC and approval of the checkout address, then explicitly turn on
   online payments. COD remains available if enabled in checkout settings.

Checkout prices and paise totals come from the server's published catalogue,
not browser amounts. A pending order reserves actual tracked stock. Gateway
order IDs are recovered by the local order's receipt on retries. Card/UPI entry
is hosted by Razorpay's official Checkout SDK, not our forms.

A signed browser callback is verified using the **server-stored** gateway order
ID, then the payment is fetched/captured server-side. Signed captured webhooks
and background reconciliation can also settle the order. Both paths verify
store, gateway order, payment ID, currency and exact amount; they share the same
locked, idempotent transition. Failed events cannot downgrade captured payments.

The checkout window is 20 minutes. Recovery checks the provider before releasing
a pending reservation, and keeps stock reserved on uncertain provider responses.
Late captured payments after expiry/cancellation queue a refund rather than
shipping released inventory. Duplicate callbacks/events never deduct stock twice.

Cancelling/returning an online captured order queues a full refund. Unknown refund
responses are reconciled first, not blindly retried. Existing partial refunds need
operator reconciliation. Provider processing and bank settlement are not instant.
Pending, cancelled and refunded receipts never claim a confirmed payment.

## Shiprocket activation

1. Create a merchant API user in Shiprocket, complete KYC and add/fund the wallet.
2. Connect that API user's email/password in Ann.
3. Refresh pickup locations, choose the real pickup location, and enter the
   **actual packed parcel** weight/dimensions and maximum number of items that
   fit it. This is a merchant-specified standard parcel, not invented per-SKU
   measurements. Carts exceeding its declared limit cannot use automatic
   shipping. Use manual fulfilment for mixed/oversized packages.
4. Set a maximum estimated courier charge and choose whether to request pickup
   automatically. Save settings, then separately consent to automatic charges
   and turn on shipping.

Before checkout commits, Shiprocket serviceability is checked for delivery PIN,
parcel, COD/prepaid and the charge ceiling. At booking, rates are checked again
and the cheapest eligible courier within that ceiling is selected. Customer
delivery charges remain the explicit free/flat/threshold checkout rules; they
are not a claim that Shiprocket fees equal the customer's shipping charge.
Final carrier reweighing/fees can differ from estimates.

Committed COD orders and captured online orders create a durable tenant-scoped
outbox job. The scheduler creates the carrier order, assigns AWB, optionally
requests pickup, and polls tracking. Login is refreshed on token expiry.
Booking is **not** shipment/delivery confirmation. Actual dispatch scans invoke
the existing protected invoice path; delivered scans update delivery. A delivery
scan is not COD remittance proof; collection stays explicitly reconciled.

Store connections lists recent jobs and actionable errors. Ordinary Retry
reconciles existing remote IDs before doing anything. For an uncertain mutation,
the owner must first check the provider and explicitly confirm that no matching
order/AWB/pickup/refund exists before authorizing another attempt. Do not tick
this merely to clear an error. Carrier cancellations are requested and their
actual status checked; an RTO request is not a completed cancellation.

RTO/returns remain controlled through existing merchant order actions, which
retain invoice/credit-note privilege and explicit restock rules. Do not infer a
restock or bank/COD payout from an ambiguous carrier scan.

## Cloudflare platform setup

The account owner must enable Cloudflare for SaaS and accept its plan/hostname
charges separately. This implementation never buys a plan or domain.

The operator script uses the existing shell Cloudflare credentials, without
printing their values. First run the read-only check:

```sh
node scripts/configure-custom-domains.mjs
```

It checks the active `lebrands.store` zone and conflicts, then prints its plan.
The following command **changes shared infrastructure**: it creates only missing
originless/proxied DNS records, a `*/*` Worker route and the SaaS fallback origin.
The route sends all custom-hostname traffic entering this SaaS zone to
`lebrands-store`; more-specific routes retain priority. Run only after reviewing
the printed plan and confirming Cloudflare for SaaS billing:

```sh
node scripts/configure-custom-domains.mjs --apply
```

It refuses to overwrite conflicting records, a different catch-all Worker, or a
different fallback origin. Partially successful setup is safe to rerun.
If the read-only check reports `403` for DNS records, grant DNS Read for this
zone. Applying the setup also needs DNS Edit and Worker Routes Edit. Do not
interpret a successful Worker deployment as proof that its token has DNS access.

Production Worker bindings:

- `CLOUDFLARE_API_TOKEN`: Worker secret with this zone's custom hostname read/write,
  DNS read and Worker route read permissions. The operator setup token additionally
  needs DNS/Worker route write and zone read. A shell secret is **not**
  automatically a deployed Worker secret.
- `CLOUDFLARE_ZONE_ID`: actual zone ID printed by the check, not account ID.
- `CUSTOM_DOMAIN_CNAME_TARGET=brands.lebrands.store`
- `CLOUDFLARE_WORKER_NAME=lebrands-store`

The operator creates fallback `store-origin.lebrands.store` (proxied AAAA `100::`)
and customer CNAME target `brands.lebrands.store`. The default root Wrangler
configuration deliberately contains only the platform's existing domain routes.
Cloudflare rejects `*/*` with error 10022 until Cloudflare for SaaS is enabled,
which would otherwise partially fail an ordinary deployment.

Only after the account owner has enabled Cloudflare for SaaS and reviewed route
conflicts, add `{"pattern":"*/*","zone_name":"lebrands.store"}` to the root
configuration's `routes` array and run the checked platform setup. Once customer
domains are activated, retain that route on future deployments. Do not add it
merely because payment or shipping integrations are being deployed.
The old `CUSTOM_DOMAINS_ROUTING_READY` flag is no longer proof of readiness:
activation freshly reads actual fallback, DNS and Worker route configuration.

### Merchant domain lifecycle

In Ann, add a **subdomain**, such as `www.brand.com`. Apex/root domains are not
supported in this CNAME-only flow. Ann provisions a Cloudflare custom hostname
and displays public CNAME/TXT ownership/certificate records. Add those at the
merchant's DNS provider, then Check status.

Activation requires: matching owned hostname, active Cloudflare hostname and SSL,
public CNAME pointing to the target, actual active fallback/proxied target/Worker
route, and merchant attestation that Razorpay approves the new address when
connected. It never treats a checkbox as automatic KYC/SSL proof.

Checks are owner-triggered, not continuous DNS monitoring. Failed checks disable
an active local binding. Remove disables only our binding, not remote DNS or the
merchant's domain. Re-add of an owned hostname reuses its Cloudflare ID. If remote
creation succeeded but DB commit failed, operator reconciliation is required;
never adopt another tenant's remote hostname.

## Verification boundary

Automated tests use the real staged DDL and isolated PostgreSQL plus simulated
provider HTTP responses. Browser checks use isolated sample data and mocked SDK/
provider responses. No real charges, shipments, external DNS changes, or live
database migrations are performed by these tests. A merchant live payment,
refund, funded shipping booking and DNS propagation still require the connected
provider accounts and production configuration above.

## References

- https://razorpay.com/docs/api/orders/
- https://razorpay.com/docs/webhooks/validate-test/
- https://apidocs.shiprocket.in/llms.txt
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/
