---
name: Transactional email queue recovery
description: Why private email delivery capabilities must be recoverable without storing reset links
---

Private reset, invitation, and verification emails use a server-secret-derived delivery capability bound to the token digest.

**Why:** Queue publication can fail after the database commits the email job. A random capability known only to the original request would leave that job permanently undeliverable. The digest and job identifier can be enumerated by the trusted dispatcher without exposing a reset link or recipient; only the Worker secret can derive the capability.

**How to apply:** Preserve the capability check when changing private email jobs or retries. Never put raw reset/invitation links or bearer tokens in dispatcher listings, logs, public APIs, or tenant-scoped email history. Check expiry again when claiming a delayed job.
