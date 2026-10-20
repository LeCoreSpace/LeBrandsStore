---
name: Supabase function default grants
description: Restrict new internal functions against direct API-role grants, not only PUBLIC access.
---

For new application-internal functions, explicitly remove both PUBLIC access
and any direct Supabase API-role grants. Preserve the intended `lebrands_app`
grant and the database administrator's ownership privileges.

**Why:** Supabase granted new OAuth lookup functions directly to `anon`,
`authenticated` and `service_role` even though their migration revoked PUBLIC.
A clean local database did not reproduce those defaults. An effective-privilege
check against the shared database exposed the difference.

**How to apply:** Reproduce Supabase default grants in local migration fixtures
and check `has_function_privilege` for each relevant role after application.
Fix an applied migration with a new targeted migration; never rewrite its
checksum or change global default privileges to solve a function-specific
problem. Do not remove an existing function's documented caller permissions.
