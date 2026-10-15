---
name: Offline test memory
description: Concurrent PGlite test processes can exhaust workspace memory and disconnect the shell.
---
Keep offline database-test concurrency bounded while preview workflows are running.

**Why:** An unbounded full-suite run exhausted workspace resources and disconnected
the shell before completing. The bounded run completed successfully.

**How to apply:** Treat an interrupted run as unverified, not passing. Use bounded
parallelism for the database-heavy offline suite rather than launching many
independent PGlite instances alongside the app and browser.
