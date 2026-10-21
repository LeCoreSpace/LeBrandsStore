---
name: SKU publication boundary
description: Authority for SKU prices, option identity, available stock and historical order selections
---
Use the published SKU price and option identity for customer purchases, current tenant-scoped SKU quantities for availability, and copied selections for order history.

**Why:** A stock refresh must not expose unfinished catalogue edits. Using aggregate product stock can sell an unavailable size or colour, while looking up old orders from current catalogue labels can rewrite their meaning.

**How to apply:** Preserve published SKU metadata during operational inventory updates. Refresh it only through explicit catalogue publication. Never substitute a base product or another SKU when a selection is missing or stale. Cancellation and payment recovery must restore the ordered SKU, not merely the parent total.

Bulk inventory maintenance is strictly stock-only: retain the existing publication's other fields rather than copying the current administrative product.

**Why:** The administrative product may contain unfinished titles, prices or option edits; changing quantities is not permission to publish those edits.

Subscription counting is a separate policy from publication authority. See
[Subscription capacity policy](subscription-capacity-policy.md) for the user's
explicit decision that drafts consume product and SKU allowances.
