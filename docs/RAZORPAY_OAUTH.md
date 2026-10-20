# Razorpay technology-partner OAuth

Implementation is separate from release. No production migration, deployment,
secret update, merchant authorisation or payment activation is performed by adding
this code. Existing merchant API-key integrations and platform billing keys remain
separate.

## Environment configuration

Use the same variable names in each environment. Client credentials differ
between Test and Live; the owner explicitly chose a shared webhook signing
value while retaining separate endpoints.

| Setting | Replit development | Cloudflare production Worker |
| --- | --- | --- |
| `RAZORPAY_OAUTH_CLIENT_ID` | Development application ID | Production application ID |
| `RAZORPAY_OAUTH_CLIENT_SECRET` | Development application secret | Production application secret |
| `RAZORPAY_OAUTH_MODE` | `test` | `live` |
| `RAZORPAY_OAUTH_REDIRECT_URI` | Exact registered development callback | `https://app.lebrands.store/integrations/razorpay/callback` |
| `RAZORPAY_OAUTH_WEBHOOK_SECRET` | Test webhook signing secret | Live webhook signing secret (shared value by owner choice) |

Store credentials only through Replit Secrets or Cloudflare Worker Secrets.
They do not synchronise between those services. Never use OAuth credentials in
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, expose them to client JavaScript or put
them in a committed configuration file. Missing or invalid mode fails closed.
The callback defaults to the production URL above if its override is absent.
The production client pair, mode and callback were configured through individual
Worker Secret updates, without publishing application code. Mode and callback
are non-sensitive values but intentionally use encrypted bindings too, allowing
a binding-only update that preserves existing resource bindings. Do not add
same-named plain-text Wrangler variables without an explicit binding conversion.
Their values cannot be read back through Cloudflare settings metadata.

The production webhook binding is configured using the owner-approved shared
signing value. The Razorpay webhook already exists. External checks rejected
missing, incorrect and tampered signatures and acknowledged a signed synthetic
unknown-account event. These checks do not prove Razorpay-sent delivery,
matched-account processing, Live merchant consent or financial behaviour.
Shared signing values are not cryptographic separation between environments;
retain distinct client pairs/endpoints and verify cross-environment event
handling before payment activation.
For a different development host, register its exact HTTPS callback path in the
Razorpay Development section before setting the override. Redirect and webhook
URLs are different.

The local Worker uses an explicit process-environment allowlist in
`wrangler.preview.jsonc`. The client pair, mode, callback and test webhook
signing secret are included. Restart the managed API workflow after changing
their values. Mode is a non-secret Replit environment variable even
though this allowlist passes it to Wrangler alongside credentials. This does not
alter the production Worker. A browser-accessible development preview is not
proof that Razorpay can reach a private webhook endpoint.

Account requests in the web preview also pass through the native Node adapter
to avoid local Workerd TCP/TLS limitations. Its separate explicit allowlist
must receive the same Development OAuth configuration; Wrangler's binding log
alone does not prove native-account availability. Restart the web workflow
after changes to these values. The development-only database readiness response
includes a non-secret `razorpay_oauth_available` boolean for this actual path.

## Database change

Manual, separately approved release step:

```
node db/migrate.js --staged-razorpay-oauth
node db/migrate.js --staged-razorpay-oauth-permissions
```

`db/staged/0048_razorpay_oauth.sql` requires the existing commerce runtime
migration. It adds two restricted, read-only SECURITY DEFINER functions for
partner webhook routing and scheduled refresh candidates. It does not change
existing financial functions, table ownership or stored orders. Execute is
revoked from PUBLIC and granted only to `lebrands_app`.

Apply both migrations: Supabase can also grant new functions directly to
`anon`, `authenticated` and `service_role` through its default privileges.
The targeted permissions migration removes those grants from these two
internal functions without changing global defaults or existing financial
functions. Verify effective privileges, not just the absence of PUBLIC grants.

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

### Isolated Test webhook receiver

`wrangler.oauth-test.jsonc` targets only `lebrands-razorpay-oauth-test`, using
`src/razorpay-oauth-test-worker.js`. It has no storefront routes, assets, queues
or scheduled jobs. Do not deploy it as the main store Worker.

It exposes only `/health` and `/webhooks/razorpay/oauth`, fails closed outside
Test mode, and verifies signatures before constructing a database client. The
shared handler also verifies signatures and isolates authorisations by account
and mode. Bind only Development OAuth credentials, the Test signing secret and
the encryption secret needed for the existing shared application database.
Never attach Live credentials or Live routes to this receiver.

The signing secret must have at least 16 characters; use a random string of
32 or more characters, not an account password. The same value must be saved
in the Test webhook configuration and the receiver's Worker Secrets. Keep secret
values out of commands, logs, generated reports and source files.

Real merchant consent still starts in the existing dashboard and returns to the
exact registered Development callback. The account owner completes login and
consent themselves. A public webhook receiver is not evidence of successful
merchant consent or Razorpay-sent webhook delivery.

The separately deployed Test webhook URL is:

`https://lebrands-razorpay-oauth-test.lebrandsspace.workers.dev/webhooks/razorpay/oauth`

This is an actual deployment URL returned by Cloudflare and externally checked,
not the Live partner endpoint. Register it only under **Manage Test Webhooks**.
Development consent starts from the Replit preview dashboard, not an assumed
production release. The preview must forward `/integrations/razorpay/callback`
to account routing; an unauthenticated callback should reach the login guard,
not the public site's 404 page.

Open the preview dashboard in a new top-level browser tab before signing in and
starting consent. Its development cookies are partitioned for iframe safety;
an iframe login must not be assumed to carry into a top-level OAuth callback.

A deliberately invalid-code token probe is not definitive validation of the
client credentials. Record its HTTP result without declaring the pair wrong
or requesting repeated replacements from that result alone. Complete a real
owner-consented flow with the exact registered callback to diagnose it.

Synthetic local PGlite tests exercise real foundational DDL, restricted tenant
transactions, nonce consumption/replay, cancellation, legacy preservation,
encrypted persistence, refresh durability, disconnection and signed revocation.
Client tests and an isolated browser fixture cover the dashboard controls.
These synthetic tests do not contact Razorpay or read live merchant data. Real
merchant consent and signed provider delivery must be checked separately using
the approved Test receiver before a separately approved Live release.

Official references:

- https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps.md
- https://razorpay.com/docs/partners/technology-partners/process-payments.md
