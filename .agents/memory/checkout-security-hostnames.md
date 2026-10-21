---
name: Checkout security hostname boundary
description: Custom-domain SSL activation does not authorize the checkout security widget.
---

Treat checkout security hostname authorization as separate from custom-domain
ownership, SSL readiness and storefront routing. Keep server-side token
verification bound to the actual request hostname and checkout action.

**Why:** A custom merchant domain served the live storefront with valid SSL
while its checkout widget failed because only the platform domain was allowed.
The operator token could read Turnstile settings but its update was denied
with 403. This is platform configuration, not something shoppers should fix.

**How to apply:** Verify exact hostname coverage before claiming custom-domain
checkout readiness. Never work around the failure by disabling token checks,
weakening CSP, accepting other-host tokens or enabling unrestricted hostnames.
Domain activation automation needs separate Turnstile write permission and must
preserve existing allowed hostnames and widget keys. Cloudflare documents a
10-hostname limit per standard widget, so account for capacity rather than
assuming a single widget supports unlimited merchant domains.

Per-domain manual security registration is an emergency workaround, not an
acceptable finished self-service domain flow.

**Why:** The user objected to having to type each new custom domain into
Cloudflare and questioned the value of integration if this remains manual.

**How to apply:** Design automatic security provisioning and readiness checks
into domain activation, with capacity management and a one-time platform
permission setup. Do not pass this operational task to each merchant.

Use dedicated store security configurations rather than accumulating every
merchant on one shared widget. Preserve included platform-address protection
independently, and stop activation explicitly on provider capacity failures.

**Why:** The user approved automatic setup for new custom domains, with
provider limits managed by the platform rather than recurring merchant tasks.
The standard widget hostname cap makes a single ever-growing allowlist
unsuitable for a multi-store product.

**How to apply:** Keep custom-store credentials tenant-bound and encrypted,
recover interrupted remote provisioning without duplicating widgets, and
verify readiness before activation. Account limits are still real; never
equate per-store provisioning with unlimited provider capacity.

Production credential preparation must use the deployed checkout encryption
context, never a presumed match with workspace login/session secrets.

**Why:** Offline preparation could encrypt and decrypt its own credentials, but
the deployed Worker could not read them. A separate checkout-only production
key resolved this without rotating login or payment-integration keys.

**How to apply:** Treat workspace and Cloudflare secret stores as separate
contexts. Prepare credentials in the trusted runtime or with its explicit
checkout key, require the dedicated key before provisioning, and verify a
live custom-domain checkout before declaring a rollout complete. Do not
overwrite established authentication or integration keys to repair this.
