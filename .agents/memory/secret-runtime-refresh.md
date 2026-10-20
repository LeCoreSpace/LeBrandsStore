---
name: Secret runtime refresh
description: Refresh the managed service before concluding that a newly saved secret is still invalid.
---

After a user updates a runtime secret, restart the relevant managed workflow
before checking its use in a runtime or shell deployment preflight.

**Why:** A saved webhook-secret replacement still failed minimum-length checks
in successive shell preflights. Restarting the API workflow refreshed the
environment and the same boolean check then passed. Repeatedly asking the user
to replace the secret would have misdiagnosed stale runtime configuration.

**How to apply:** Validate presence and minimum-length booleans only, never
print values. Rule out an old environment once before asking the user to
resubmit a secret. Restart only the relevant managed service, not unrelated
workflows.
