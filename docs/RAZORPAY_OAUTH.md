# Razorpay technology-partner OAuth

Implementation is separate from release. No production migration, deployment,
secret update, merchant authorisation or payment activation is performed by adding
this code. Existing merchant API-key integrations and platform billing keys remain
separate.

## Environment configuration

Use the same variable names with different values in each environment:

| Setting | Replit development | Cloudflare production Worker |
| --- | --- | --- |
| `RAZORPAY_OAUTH_CLIENT_ID` | Development application ID | Production application ID |
| `RAZORPAY_OAUTH_CLIENT_SECRET` | Development application secret | Production application secret |
| `RAZORPAY_OAUTH_MODE` | `test` | `live` |
| `RAZORPAY_OAUTH_REDIRECT_URI` | Exact registered development callback | `https://app.lebrands.store/integrations/razorpay/callback` |
| `RAZORPAY_OAUTH_WEBHOOK_SECRET` | Separate test webhook signing secret | Separate live webhook signing secret |

Store credentials only through Replit Secrets or Cloudflare Worker Secrets.
They do not synchronise between those services. Never use OAuth credentials in
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, expose them to client JavaScript or put
them in a committed configuration file. Missing or invalid mode fails closed.
The callback defaults to the production URL above if its override is absent.
For a different development host, register its exact HTTPS callback path in the
Razorpay Development section before setting the override. Redirect and webhook
URLs are different.

The local Worker uses an explicit process-environment allowlist in
`wrangler.preview.jsonc`. The client pair and mode are included; add the webhook
secret binding after the requested signing value exists, then restart the
managed API workflow. Mode is a non-secret Replit environment variable even
though this allowlist passes it to Wrangler alongside credentials. This does not
alter the production Worker. A browser-accessible development preview is not
proof that Razorpay can reach a private webhook endpoint.

## Database change

Manual, separately approved release step:

```
node db/migrate.js --staged-razorpay-oauth
```

`db/staged/0048_razorpay_oauth.sql` requires the existing commerce runtime
migration. It adds two restricted, read-only SECURITY DEFINER functions for
partner webhook routing and scheduled refresh candidates. It does not change
existing financial functions, table ownership or stored orders. Execute is
revoked from PUBLIC and granted only to `lebrands_app`.

The resolver returns only store IDs. A valid partner HMAC is required before
calling it. A historical order ID is only a routing hint: the tenant handler
must additionally verify the encrypted account identity and configured mode
before writing anything.

## Razorpay dashboard

Save the application redirect URI:

`https://app.lebrands.store/integrations/razorpay/callback`

After the migration, production configuration and Worker deployment, register
the **Live partner webhook**:

`https://app.lebrands.store/webhooks/razorpay/oauth`

Events:

- `payment.captured`
- `payment.authorized`
- `payment.failed`
- `order.paid`
- `refund.processed`
- `account.app.authorization_revoked`

The webhook signing secret must exactly match the live
`RAZORPAY_OAUTH_WEBHOOK_SECRET`, not the OAuth client secret. Register the Test
webhook only against a reachable test deployment configured with its own test
secret/mode. Test and Live cannot share this endpoint while using different
signing secrets on a single Worker environment.

Existing API-key merchants keep their existing per-store webhook URLs and
secrets. Do not move those merchants onto the partner endpoint automatically.

## Connection and payment behaviour

- The owner initiates `Connect to Razorpay` from the existing separate Razorpay
  Settings menu. Non-owners and requests from another origin are denied.
- Authorisation uses only `read_write`; no payout/RazorpayX permissions.
- A ten-minute, hashed nonce is bound to the initiating session, store, client,
  mode, callback and credential fingerprint. The nonce is consumed in a
  committed transaction before exchanging the code. Replay and stale callbacks
  cannot overwrite a changed or disconnected integration.
- Existing credentials continue to work during authorisation and survive
  cancellation/failure. Replacement needs explicit confirmation; test
  authorisation cannot replace an existing live integration.
- Access/refresh tokens are encrypted with tenant/provider-bound encryption.
  The public Checkout key is the OAuth `public_token`; API calls use Bearer
  authorisation. Checkout HMAC uses the OAuth application secret. Legacy
  connections continue using merchant Basic credentials and their key secret.
- A successful connection leaves online payments off. Activation still requires
  live-mode credentials, verified signed payment events and the owner's
  explicit confirmation. Test authorisations cannot reserve online orders,
  confirm customer payments or process financial refund updates.
- Disconnect disables local checkout first, then asks Razorpay to revoke the
  token. An uncertain remote response leaves an explicit retry state with the
  old encrypted token retained only for revocation. Reconnection is blocked
  until that disconnection is resolved.
- Partner revocation events disable only the matching OAuth account/mode.
  Stale events cannot disable a later account replacement; duplicate
  revocations do not repeatedly change the setup revision.
- Payment attempts keep credential snapshots for historical order identity.
  Old snapshots may use a newer token only for the same OAuth account,
  application and mode. They never inherit an unrelated replacement account.

## Refresh and operations

The existing scheduled Worker calls the bounded refresh scan. It selects at most
20 connected authorisations expiring within a day; owner-triggered refresh is
also available. A committed lease prevents concurrent token rotation.

Refresh must finish and persist in a **separate transaction before financial
work**. Razorpay rotates refresh tokens; a later order/refund rollback must not
discard a newly issued token. Financial operations use a valid token or stop
with a clear refresh/reconnect error. Uncertain rotation is flagged for fresh
authorisation rather than blindly retrying a potentially consumed token.

Do not remove or change the application/client configuration while unresolved
payments still depend on it without an explicit credential-rotation plan.

## Verification scope

Synthetic local PGlite tests exercise real foundational DDL, restricted tenant
transactions, nonce consumption/replay, cancellation, legacy preservation,
encrypted persistence, refresh durability, disconnection and signed revocation.
Client tests and an isolated browser fixture cover the dashboard controls.
No test contacts Razorpay or reads live merchant data. A real merchant consent
and signed provider delivery must be checked separately after an approved
production release.

Official references:

- https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps.md
- https://razorpay.com/docs/partners/technology-partners/process-payments.md
