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

After a frontend fix, verify the served module source and use a fresh browser
context before treating repeated old behaviour as a failed fix. Restarting the
server does not replace JavaScript already loaded in an open page.

**Why:** A continuing browser check reported the old hidden-inline-input
behaviour after the fix; a fresh same-origin context loaded the current modules
and confirmed that the input was visible and editable.

**How to apply:** Prefer this focused diagnostic over repeated source changes
or rerunning the full browser journey.

Keep all fixture navigation, including API-provided review destinations, inside
the isolated preview. Mocked data alone does not isolate links or redirects.

**Why:** A review destination escaped the fixture and reached the real sign-in
surface. No credentials were entered and no live write was performed.

**How to apply:** Inspect navigation destinations before testing actions, keep
test review pages incapable of publication, and never continue into real
accounts when an isolated test unexpectedly redirects there.

After changing Worker dependencies, re-establish the isolated adopted design
through the fixture API before continuing browser editing checks. Do not try to
complete real GST onboarding to repair a missing synthetic design.

**Why:** A Worker dependency change restarted Vite and erased the in-memory
adoption. The tester reached GST onboarding rather than the intended editor.

**How to apply:** Confirm the fixture editor returns 200 before browser handoff.
Keep setup synthetic, and check newly imported browser modules return 200 too;
a unit-tested controller can still fail to initialize if a module is not served.
