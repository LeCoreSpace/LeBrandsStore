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
