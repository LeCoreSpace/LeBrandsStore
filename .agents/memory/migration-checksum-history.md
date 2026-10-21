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

New migrations selected through the shared runner must let that runner own the transaction, including the checksum insertion.

**Why:** An inner COMMIT in the SQL source would release the runner's advisory lock and commit schema changes before its checksum record, breaking the intended atomic boundary.

**How to apply:** Keep new runner-managed SQL free of nested transaction boundaries. Do not rewrite already-applied historical files to retrofit this convention.
