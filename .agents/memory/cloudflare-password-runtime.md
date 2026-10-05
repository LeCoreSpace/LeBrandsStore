---
name: Cloudflare password runtime compatibility
description: Local WebCrypto success does not establish production Workers PBKDF2 work-factor support.
---

Keep the requested 600,000 PBKDF2-SHA256 iterations. Never lower the work factor
to work around a Cloudflare runtime limitation.

**Why:** The Step 1 account specification explicitly requires WebCrypto at
600,000 iterations. Investigation on 2026-10-05 found Cloudflare's workerd issue
1346 describes a removed local default limit but potentially retained production
limits. Local Node/workerd hashing can pass while the production Worker rejects it.
Source: https://github.com/cloudflare/workerd/issues/1346

**How to apply:** Before any future account release, confirm the work factor on
the actual Cloudflare production runtime/plan. Treat support as a release gate,
not something established by offline tests. If requirements must change, get the
user's decision rather than silently substituting a weaker algorithm or count.
