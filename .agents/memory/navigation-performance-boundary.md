---
name: Navigation performance boundary
description: Improve navigation without weakening draft consistency, tenant isolation or delivery of current browser modules
---

Optimise signed-in navigation without caching private HTML, merchant drafts or live stock across requests. Long-lived public asset caching needs versioned filenames first.

**Why:** This is a multi-tenant editing application. Faster transitions must not serve another store's data, overwrite a newer draft with stale content, or mix incompatible browser-module versions after a deployment.

**How to apply:** Prefer smaller page-specific reads and versioned browser bundles. Preserve fresh authenticated responses and explicit public-asset delivery controls rather than broadly caching existing responses.

Audit a handler's full call chain before treating it as a read. The HTTP GET method alone is not evidence that the handler has no side effects.

**Why:** Some page-opening paths record workflow activity. Reads also need a coherent draft revision when another tab can save; removing all coordination is not an acceptable substitute for reducing exclusive-lock contention.

**How to apply:** Use compatible read coordination only on audited read paths. Keep write serialization, session checks, tenant context and optimistic-concurrency guarantees intact.
