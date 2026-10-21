---
name: SKU publication boundary
description: Authority for SKU prices, option identity, available stock and historical order selections
---
Use the published SKU price and option identity for customer purchases, current tenant-scoped SKU quantities for availability, and copied selections for order history.

**Why:** A stock refresh must not expose unfinished catalogue edits. Using aggregate product stock can sell an unavailable size or colour, while looking up old orders from current catalogue labels can rewrite their meaning.

**How to apply:** Preserve published SKU metadata during operational inventory updates. Refresh it only through explicit catalogue publication. Never substitute a base product or another SKU when a selection is missing or stale. Cancellation and payment recovery must restore the ordered SKU, not merely the parent total.

Bulk inventory maintenance is strictly stock-only: retain the existing publication's other fields rather than copying the current administrative product.

**Why:** The administrative product may contain unfinished titles, prices or option edits; changing quantities is not permission to publish those edits.

Current-plan product/SKU usage retains the published-catalogue definition.

**Why:** The user explicitly approved the usage overview (“perfect with this
data”). The existing allowances describe published products and SKUs, so early
editing checks must not silently redefine what consumes those allowances.

**How to apply:** Keep draft preparation distinct from publication validation.
Changing the counted scope requires an explicit commercial-policy decision,
not merely moving a warning into the product form.
