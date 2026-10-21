# Automatic custom-domain checkout security

## Merchant flow

After the merchant adds the requested domain records, **Check connection**
verifies the real address, ownership and SSL status. When those checks pass,
the platform automatically creates or reuses that store's managed security
widget and checks its hostname configuration. **Activate domain** cannot
complete without confirmed checkout security readiness. Merchants never need
to enter their hostname in the security provider's dashboard.

Already-active domains can be repaired through the same Check connection
action. This does not place an order, send an email or turn on payments.

## One-time platform prerequisites

- The existing Cloudflare API token needs account-level **Turnstile Edit**
  (`Turnstile Sites Write` in the API reference), in addition to the existing
  zone permissions. Keep the token scoped to the platform account.
- Apply the additive staged migration:
  `node db/migrate.js --staged-checkout-security`.
- Before publishing, prepare any already-active custom domains through the
  same verified provisioning helper, checking their current ownership, DNS
  and SSL first. Do not switch existing custom checkout to the new credential
  resolver until its store configuration is ready. Stop the rollout if an
  active domain cannot be prepared; do not disable protection or alter routing.
- Publish the application only after the migration and active-domain
  preparation succeed.
- Use the established integration encryption key, or its existing session-key
  fallback. Do not rotate either key as part of this rollout.

The implementation is staged. The migration and production publish require
approval; neither is implied by building this feature.

## Isolation and recovery

- Each store owns a distinct managed widget. Its stable provider name allows
  recovery after a remote create succeeds but a local transaction fails.
- Store locks serialize setup. The remote widget is read back before a ready
  result is persisted. Name, key, secret, mode and hostname coverage must match.
- Private credentials use the existing authenticated-encryption envelope,
  bound to the store and provider purpose. The new table uses forced tenant
  RLS, with no grants to public API roles.
- Checkout HTML receives only the public site key. Email-code requests and
  new orders resolve the matching store secret on the server.
- Hostname and checkout-action verification remain mandatory. A custom domain
  never falls back to the shared platform widget.
- Included platform addresses continue using their established widget and do
  not depend on the new table.

## Capacity and failures

Dedicated store widgets avoid exhausting one shared widget's ten-hostname
list. Active store hostnames are retained when another address is added.
Provider account limits still apply: account-capacity, permission, timeout or
read-back failures leave activation blocked and produce a plain support
message. The system does not broaden hostname permissions, replace another
store's widget, disable protection, purchase capacity or claim setup succeeded.

Widgets are reused when a store reconnects its domain. Remote widgets are not
automatically deleted on address removal; this avoids deleting protection
still used by an active address. Automatic retirement and account-level
capacity monitoring are separate operator features.

## Shopper experience

Managed verification normally runs in the background. Send code waits up to
20 seconds for a real token and sends once, without another click. A changed
email cancels that pending send. If the provider specifically requires human
interaction, its challenge is shown; protection is never bypassed.
