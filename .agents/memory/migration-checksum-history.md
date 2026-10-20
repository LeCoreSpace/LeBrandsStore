---
name: Historical migration checksums
description: Distinguish recorded application from exact historical SQL alignment during production release checks.
---

Do not infer exact schema/source alignment merely because every migration
filename is recorded. Preserve historical ledger checksums; never overwrite
them or rerun old migrations just to clear a release preflight.

**Why:** A read-only production audit found older staged SQL files had diverged
from their recorded checksums even though no filenames were pending. The OAuth
migrations matched and their effective grants were correct, so the two findings
needed separate treatment.

**How to apply:** Audit selected migration checksums and permissions explicitly.
Report historical discrepancies without calling them pending migrations or
silently repairing them. A UI-only code release can proceed without migrations
when comparing deployed/release runtime modules confirms no database-dependent
runtime change. Reconcile historical SQL separately with owner-approved scope.
