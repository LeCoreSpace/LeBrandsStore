---
name: Cloudflare password runtime compatibility
description: User-confirmed production PBKDF2 ceiling and the approved peppered password scheme.
---

The user confirmed production Workers reject PBKDF2 above 100,000 iterations,
while local Wrangler does not enforce that ceiling. The approved scheme is
HMAC-SHA256 with `PASSWORD_PEPPER`, then PBKDF2-SHA256 at exactly 100,000 iterations.

**Why:** The user explicitly replaced the earlier 600,000-iteration requirement
after confirming the production limitation. Local success must not be used to
justify increasing the work factor beyond the production ceiling.

**How to apply:** Follow the current password rules in replit.md; never revive
the obsolete 600,000-iteration requirement or the superseded release-blocker
warning from earlier conversation context.
