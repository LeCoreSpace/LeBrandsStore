---
name: Ann preview fixture lifecycle
description: Safe isolated preview checks, reload resets and navigation boundaries.
---

Run persistence checks against the isolated Ann preview only after backend edits
have stopped. A Vite configuration-dependency reload recreates its in-memory
database, so an open browser can legitimately receive a stale-draft conflict
even when no second editor exists.

**Why:** A backend edit restarted Vite during a browser image-reset check.
The browser retained its prior draft token but the fixture database had been
recreated. Stable-server save, image selection, reset and fresh-load checks
succeeded without changing the production conflict checks.

**How to apply:** Check Vite restart logs before attributing a fixture conflict
to production persistence. Do not weaken optimistic concurrency or bypass
tenant/CSRF checks to accommodate this development-only lifecycle.

Keep all fixture navigation, including API-provided review destinations, inside
the isolated preview. Mocked data alone does not isolate links or redirects.

**Why:** A review destination escaped the fixture and reached the real sign-in
surface. No credentials were entered and no live write was performed.

**How to apply:** Inspect navigation destinations before testing actions, keep
test review pages incapable of publication, and never continue into real
accounts when an isolated test unexpectedly redirects there.
