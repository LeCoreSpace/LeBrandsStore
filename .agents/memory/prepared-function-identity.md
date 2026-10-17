---
name: Prepared PostgreSQL function identity
description: Compatibility constraint for changing privileged functions used by already published Workers.
---

Preserve the original callable identity when adding guards to a PostgreSQL
function. Do not simply rename a live function into a private implementation and
revoke its execute grant without considering already-prepared callers.

**Why:** This application's published Workers use prepared statements and can
outlive a database migration. Compatibility must cover those connections, not
only a new connection resolving the function by name.

**How to apply:** Prefer an in-place function replacement that keeps its
signature and identity. If a compatibility entry point is needed, ensure both
old and current identities still pass the same ownership and session guards.
Check the unchanged/retired selection path too; a SECURITY DEFINER function does
not inherit ordinary RLS protection from its caller.
