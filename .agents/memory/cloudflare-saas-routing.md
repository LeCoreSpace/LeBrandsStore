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
