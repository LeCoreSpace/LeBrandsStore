---
name: Invoice permission boundary
description: Why financial mutations must not regain direct APP table-write privileges.
---

Keep APP financial document/counter access read-only. Route mutations through
tenant-checked, narrowly scoped privileged database functions. Do not relax
isolation denial expectations to accept FK/CHECK failures instead of 42501.

**Why:** The user corrected three invoice isolation failures: table writes reached
foreign-key/check constraints rather than failing at the privilege boundary.
Constraints are a second layer, not a substitute for denying APP writes.

**How to apply:** Future invoice/credit-note changes must extend the controlled
mutation authority, not restore direct APP table writes. Keep already-applied
migrations immutable and add a new migration for permission changes.
