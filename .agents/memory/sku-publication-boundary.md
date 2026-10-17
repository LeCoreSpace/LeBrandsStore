---
name: SKU publication boundary
description: Authority for SKU prices, option identity, available stock and historical order selections
---
Use the published SKU price and option identity for customer purchases, current tenant-scoped SKU quantities for availability, and copied selections for order history.

**Why:** A stock refresh must not expose unfinished catalogue edits. Using aggregate product stock can sell an unavailable size or colour, while looking up old orders from current catalogue labels can rewrite their meaning.

**How to apply:** Preserve published SKU metadata during operational inventory updates. Refresh it only through explicit catalogue publication. Never substitute a base product or another SKU when a selection is missing or stale. Cancellation and payment recovery must restore the ordered SKU, not merely the parent total.
