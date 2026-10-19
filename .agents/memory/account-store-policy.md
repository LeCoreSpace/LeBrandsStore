---
name: Account ownership and Free transition policy
description: Two owned stores, one live; preserve paid plans and historical Free clocks.
---
Accounts may own two stores, with at most one live and the other retained as a
draft. After the first owned store, replace generic creation with draft-store
creation; hide creation at two. Staff memberships do not consume ownership slots.

**Why:** The user approved one live store plus one additional draft. Ownership,
not invitations to help another merchant, defines the account's store quota.

**How to apply:** Enforce creation and publication in the database as well as the
UI. Existing multiple-live owners choose which currently live store to retain;
never choose for them or delete their data. Changing the retained store must
not bypass publication, business-review or suspension checks.

Assign eligible legacy account stores to Free without resetting any existing
Free clock. Preserve live paid subscriptions. Historical Free uses the original
first publication, not the migration date or the latest publication snapshot.

**Why:** The user explicitly chose historical counting and preservation of paid
subscriptions, rather than a fresh 30-day migration allowance.

**How to apply:** Missing original publication evidence needs confirmation, not
an invented date. Platform assignment is not merchant consent; record its source
honestly. Returning a previously published store to draft does not reset or pause
its elapsed 30-day period. Ownerless historical fixtures are outside account
migration scope.
