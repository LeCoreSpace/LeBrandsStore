---
name: Platform billing test mode
description: Test payment evidence must never become authority for live paid service.
---

Keep platform Razorpay sandbox captures separate from current service authority.
Test payment evidence may be retained and shown to the owner, but a captured
simulation must not replace Free, reset its clock, issue a tax invoice or unlock
paid benefits. Live paid activation needs its own reviewed commercial release.

**Why:** The paid prices remain proposals, tax and issuer rules are not approved,
and advertised feature delivery is not fully validated. A successful test
transaction proves only the checkout plumbing, not the right to charge or
provide a live paid plan.

**How to apply:** Treat test subscriptions as non-current records and test
payments as simulation-only history. When later implementing live collection,
review tax, invoices, readiness, entitlements and launch controls separately
rather than promoting an old test record.
