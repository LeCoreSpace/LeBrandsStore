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

Cloudflare may automatically change fallback DNS metadata and its modified
timestamp when activating the fallback, without changing its address or proxy
configuration.

**Why:** A successful fallback activation added `fallback_origin: true` to the
origin record, so a full-record fingerprint comparison reported an unexpected
DNS change despite no DNS record write being issued.

**How to apply:** Verify the fallback record's actual name, type, address and
proxy status separately from Cloudflare-managed metadata. Preserve strict
fingerprint comparisons for unrelated records, comparing multisets rather than
matching only names/types because multiple TXT records can share both.

Keep merchant domain instructions in everyday language, with no Cloudflare,
Worker, SaaS or raw certificate-status labels. Explain how to edit an existing
same-name record instead of adding a duplicate, and preserve unrelated/email
records. Retain the exact record types, names and values needed at the domain
provider.

**Why:** The user explicitly requested understandable instructions after hitting
an existing `www` record conflict and finding payment-approval wording confusing.

**How to apply:** Use website-address, ownership and secure-connection status
labels in domain Settings and shared Ann controls. Explain payment website
approval separately from enabling payments; require acknowledgement only when
the server reports a connected payment integration, without weakening server
checks.

Keep domain connection progress, its current next step and the check action
together. Reveal only the current setup task by default; keep full record
instructions expandable and defer payment approval until the connection is ready.

**Why:** The user explicitly said scattered status and information without a
current flow are too much for a self-serving non-technical merchant.

**How to apply:** Preserve all server activation checks while using progressive
disclosure. Place current status and the next step directly below Check
connection, bringing that result into view after a check. The user repeated
that a result above the button is still easy to miss. Do not show unrelated
preference-save or duplicate status-reload controls on dedicated domain Settings.
