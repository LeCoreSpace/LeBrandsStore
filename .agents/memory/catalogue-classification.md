---
name: Catalogue classification
description: Accepted five-master catalogue model and separation of product types, buying options and descriptors.
---

The user confirmed the catalogue should use five masters: category, subcategory,
product type, variant and descriptors.

**Why:** The user accepted the recommendation to introduce an explicit product
type between subcategory and the merchant's listing.

**How to apply:** Keep product type separate from the merchant's product title.
The variant master defines buying options and allowed values; actual combinations,
SKUs and quantities belong to individual merchant products. Descriptors capture
product facts without automatically creating SKU combinations. Use the same
classification and product-form behaviour in Ann and the dashboard. Support
product types mapped to multiple relevant subcategories rather than duplicating
the type for each branch. HSN suggestions are not verified tax classifications.

Product forms must expose all applicable product types, variant options and
descriptors, not merely a small set of suggestions. Merchants should be able to
select all descriptors that apply; descriptive fields do not share the SKU-axis
limit.

**Why:** The user explicitly requested the full selection in the product form.

**How to apply:** Filter choices by their valid taxonomy mappings, but do not hide
mapped options because they are outside a short recommended list. Keep the Ann
and dashboard forms consistent.
