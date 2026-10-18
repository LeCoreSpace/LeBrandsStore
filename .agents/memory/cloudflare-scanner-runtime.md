---
name: Cloudflare scanner runtime
description: Edge-specific redirect behavior and reliable local runtime verification for private document screening.
---

Use `redirect: "manual"` for private scanner requests and reject every non-2xx
response. Never use `redirect: "error"` in a Cloudflare Worker.

**Why:** Workers reject the `"error"` mode before sending any request, although
Node accepts it. This can masquerade as a network outage while all Node-based
provider probes succeed.

**How to apply:** Keep a real workerd regression check in addition to Node
scanner tests. Assert that a clean verdict succeeds, redirects never reach their
destination, and unsafe files still fail closed.

The installed Wrangler dependency resolves Miniflare with a newer constructor
than its bundled README describes.

**Why:** The README's older top-level options fail validation against the
installed runtime's worker/config structure.

**How to apply:** Follow the installed declarations and its exported compatibility
converter, rather than replacing packages or following the stale README examples.
