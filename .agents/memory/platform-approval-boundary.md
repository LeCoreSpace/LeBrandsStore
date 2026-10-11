---
name: Platform approval boundary
description: Staff-only store approval, first go-live, manual review and staged rollout decisions.
---

Every store's first go-live requires approval from LeBrands staff, even when
GSTIN verification succeeds. Brand owners, admins and staff cannot approve
any store, including their own. The approval mechanism is an administrative
script using the postgres connection, not a Worker endpoint or brand UI.
Awaiting stores are offline; revocation also takes stores offline without
deleting data. Existing stores already live at rollout stay live with
approval attributed to the migration.

**Why:** The user explicitly defined the reviewer boundary, lifecycle and
legacy-store exception; brand roles are not platform reviewers.

**How to apply:** Protect approval metadata in the database from APP writes,
not only in UI/API allowlists. Keep approval/revocation plus audit atomic.
Require a documented manual-review flag and note when there is no valid
provider verification. Manual approval is not GSTIN verification and must
not unlock tax invoices while registration remains unverified. Never add a
brand-facing approve endpoint or approval control.
