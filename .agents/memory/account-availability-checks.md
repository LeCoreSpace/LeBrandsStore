---
name: Account availability checks
description: Public-page success does not establish that the deployed account database connection works.
---
Include a database-backed account check when assessing production availability;
public homepage and fresh login-page checks alone are insufficient.

**Why:** Both public pages returned HTTP 200 while requests carrying a session
cookie failed with HTTP 503 and a connector-level database error. The database
was independently reachable. Fixed-category production diagnostics identified
an account usage-limit error, rather than invalid origin credentials. Preserving
Worker bindings or refreshing valid connection details cannot clear a quota.

**How to apply:** Distinguish public rendering, session lookup, database origin
health and connector health. Use an explicitly nonexistent synthetic session
for diagnosis rather than borrowing a real account cookie. Keep database
diagnostics read-only and never weaken tenant or application-role checks.

Preview and production availability must be evaluated separately even when
they use the same database.

**Why:** The user confirmed that Preview login worked while production failed.
The user subsequently confirmed production login was working again.
Preview's restricted direct connection does not pass through the production
connector or consume its query allowance.

**How to apply:** Check provider quota errors before changing credentials,
permissions, connection-pool settings or application authentication. Consult
current provider pricing before recommending a paid plan; do not purchase or
change account billing automatically.
