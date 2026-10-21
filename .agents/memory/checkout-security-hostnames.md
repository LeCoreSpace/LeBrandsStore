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
