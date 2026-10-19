---
name: Shopper email verification
description: Mandatory verified shopper email before new checkout orders, distinct from merchant sign-in.
---

The user requires email authentication for shoppers before ordering, because
transactional emails need a usable customer address. Email is not optional
at new checkout. This is separate from merchant account authentication.

**Why:** The user explicitly rejected an optional-email guest checkout and
asked for automatic city/state assistance from the PIN alongside better contact
and address arrangement.

**How to apply:** Keep code verification server-enforced and store/email-bound,
without treating it as marketing consent. Preserve recovery of existing orders
when a checkout request is retried. PIN lookup assists editable address fields,
not delivery-service eligibility or proof of identity.
