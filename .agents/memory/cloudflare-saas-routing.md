---
name: Cloudflare SaaS routing prerequisite
description: Keep ordinary deployments independent of optional Cloudflare for SaaS activation.
---

Do not add the SaaS catch-all `*/*` route to the default production configuration
before the account owner enables Cloudflare for SaaS.

**Why:** A real deployment uploaded the Worker and updated its schedule/queue
triggers but Cloudflare rejected the catch-all route with error 10022 because
SaaS was not enabled. Successful trigger changes were not rolled back. DNS
permissions alone do not satisfy this separate platform prerequisite.

**How to apply:** Preserve the existing platform domain routes for normal
publishing. After verified SaaS enablement and conflict review, deliberately add
and retain the catch-all in the same root production configuration when enabling
customer domains. Keep runtime domain activation gated by actual platform checks.

Merchants may save a pending hostname and prepare its platform CNAME even while
SaaS provisioning is unavailable. This is **not** a verified or live custom
domain. Ownership/SSL TXT records are supplied only after Cloudflare accepts
the hostname. The CNAME can be checked through read-only public DNS before
provisioning, but that proves only the CNAME, not ownership or SSL. Activation
must still fail closed until Cloudflare SaaS
routing, DNS, ownership and SSL are verified.
