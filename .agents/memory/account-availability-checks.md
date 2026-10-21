---
name: Account availability checks
description: Public-page success does not establish that the deployed account database connection works.
---
Include a database-backed account check when assessing production availability;
public homepage and fresh login-page checks alone are insufficient.

**Why:** Both public pages returned HTTP 200 while requests carrying a session
cookie failed with HTTP 503 and a connector-level database error. The database
was independently reachable, and preserving Worker bindings did not prove that
the connector could establish its origin connection.

**How to apply:** Distinguish public rendering, session lookup, database origin
health and connector health. Use an explicitly nonexistent synthetic session
for diagnosis rather than borrowing a real account cookie. Keep database
diagnostics read-only and never weaken tenant or application-role checks.
