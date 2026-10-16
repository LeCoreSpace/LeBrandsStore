# Ann launch setup operations

## Install this stage

Review and apply only this staged migration, after the Ann foundation:

```sh
node db/migrate.js --staged-launch
pnpm run db:test-isolation
pnpm run deploy
```

`--staged-launch` requires `0016_ann_foundation.sql` already applied. It creates
one tenant-isolated table for versioned launch preferences and public DNS
evidence. Existing `integrations` and `domains` tables store provider credentials
and hostname bindings. Do not manually create the table or edit old migrations.
The production deploy command continues to use the root `wrangler.jsonc`.

No live database migration, provider connection or production deployment is
performed by implementing or testing this stage.

## Credentials and verification

Owner-only, same-origin authenticated forms:

- Razorpay: key ID, key secret, webhook secret (at least 16 characters).
  A read-only `GET /v1/orders?count=1` validates API access. Returned order data
  is discarded; a test key never becomes a live key. A supplied webhook secret
  is encrypted but cannot be called verified without receiving a signed event.
- Shiprocket: separate API-user email/password, not the merchant's main login.
  Login creates a token; a read-only pickup lookup checks permissions. No real
  shipment/order is created and the transient token is not saved or returned.
- Failed checks do not overwrite previously saved credentials. Disconnect is
  separately confirmed, wipes ciphertext and restores the COD/manual preference.
- Credentials are stored using AES-256-GCM, random nonces and tenant/provider
  authenticated data. An HKDF-derived key is purpose-separated from
  `INTEGRATION_ENCRYPTION_KEY`, or the existing `SESSION_SECRET` when a dedicated
  key is not configured. Never change that key without a credential re-encryption
  plan: rotation otherwise requires owners to reconnect. Use the platform's
  secure secret configuration, never source code or chat, to configure it.

Verification does not activate online checkout or automatic fulfilment.
`runtime_ready` is deliberately server-owned and false for both providers.
Saved preferences are intentions, not live checkout settings. The working
customer checkout remains COD with existing manual fulfilment.

## Cloudflare for SaaS prerequisites

Configure these on the **production Worker**, using secure secret handling for
the token:

- `CLOUDFLARE_API_TOKEN`: least-privilege token with the zone's SSL/Custom Hostname
  write permissions. A secret available in the development shell is not
  automatically a production Worker binding.
- `CLOUDFLARE_ZONE_ID`: the 32-character ID of the actual SaaS zone, not account ID.
- `CUSTOM_DOMAIN_CNAME_TARGET`: the platform-managed fallback-origin hostname
  under `lebrands.store`, for example `brands.lebrands.store`. Provision and test
  this origin and its Worker routing before exposing activation.
- `CUSTOM_DOMAINS_ROUTING_READY=true`: operator-controlled activation gate, only
  after Cloudflare for SaaS, fallback origin and custom-host Worker routing have
  been tested end to end. It is not a merchant checkbox.

The implementation never changes zone configuration, buys domains, modifies
merchant DNS, or activates billing/plans automatically. Until configuration is
present, Ann explains that custom-domain provisioning is unavailable and keeps
the included address working.

### Domain lifecycle

Add a public custom **subdomain** such as `www.brand.com`; apex domains are not
supported by this CNAME-only stage. The hostname is globally unique in the
existing domain registry. Provision a Cloudflare Custom Hostname with TXT
certificate validation. Ann returns only public CNAME/TXT records, and the owner
adds them at their DNS provider. The CNAME should be DNS-only, not flattened or
proxied by a second provider.

Check status fetches the matching hostname's actual Cloudflare state and public
CNAME response from Cloudflare DNS-over-HTTPS. Activation freshly repeats those
checks and requires hostname **and** SSL active plus a CNAME pointing to the
configured target and the platform activation gate. If Razorpay is connected,
the owner must separately confirm approval of that hostname in Razorpay. This
is a merchant attestation, not an automated KYC/domain-approval claim.

Status checking an already active domain fails closed if DNS/SSL is no longer
verified: its local binding stops serving this store and the address preference
returns to the included address. Checks are owner-triggered in this stage, not
an automatic domain-monitoring scheduler.

Remove disables only the local store binding. It does not delete the merchant's
domain, remote Cloudflare hostname or DNS records. Re-adding that same hostname
for the same store reuses its stored Cloudflare ID. If the remote create
succeeded but the database transaction could not commit, operator reconciliation
is required before retrying; do not adopt an unowned remote hostname.

## Next execution stage, not represented as complete

- Razorpay: server-priced orders, pending-payment lifecycle and expiry,
  idempotent capture webhook processing, signature/amount/currency/store checks,
  stock reservation/release, payment retries, payment-aware cancellation/refunds,
  CSP/checkout UI, and an actual test/live end-to-end payment.
- Shiprocket: stored pickup choice, package weights/dimensions, pincode/COD
  serviceability, explicit shipping-rate rules, idempotent order push, AWB and
  tracking sync, cancellation/RTO handling, token refresh and recovery.

Do not set a metadata field or client flag to pretend these execution paths are
implemented. Keep existing invoice financial-privilege and tenant boundaries.

## Provider references

- https://razorpay.com/docs/api/orders/fetch-all/
- https://razorpay.com/docs/webhooks/validate-test/
- https://apidocs.shiprocket.in/
- https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/
