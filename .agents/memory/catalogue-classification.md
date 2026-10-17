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

All five masters should follow the catalogue naming convention, including
renaming the existing category and subcategory tables.

**Why:** The user explicitly requested consistent catalogue-prefixed names.

**How to apply:** Preserve IDs and relationships when renaming; do not keep
legacy names as the canonical schema merely to avoid updating application SQL.
Complete one phase and confirm its outcome before proceeding to the next phase,
as the user requested for this rollout.

Catalogue schema changes and published Worker updates happen independently.
Retiring legacy schema aliases requires checking deployed consumers, not merely
finding no legacy queries in the current workspace.

**Why:** The application uses a shared external database, so a schema rename can
reach an older published Worker before updated application code is published.

**How to apply:** Preserve RLS-safe transitional reads until those consumers are
retired. Canonical schema names remain catalogue-prefixed; compatibility must not
turn into duplicated independently writable masters.

Existing merchant products are grandfathered while master mappings are reviewed.
Retiring a definition must not force merchants to recreate SKUs or reclassify a
product just to update quantities, prices, vendor or SEO. Preserve exact saved
selections; require approved active mappings for changed selections.

**Why:** A staged catalogue rollout must not interrupt inventory maintenance or
silently replace previously chosen meanings while reference data is incomplete.

**How to apply:** Keep this boundary identical in Ann, dashboard forms and save
validation. Treat reference activation and merchant backfill as separately
reviewed work, never as side effects of opening or saving a form.

The user confirmed existing mapping proposals were reviewed and authorised
reference population on 2026-10-17. Historical Phase 1 reports still say
`needs_review`; that is their original audit status, not a reversal of approval.

**Why:** Approval was given in conversation, not by rewriting the uploaded CSVs.

**How to apply:** Consult the applied import manifest and current reference
status rather than re-requesting approval of the same proposals. Missing
memberships and attributes without an assigned role are distinct unresolved
source gaps; approval does not supply those missing assignments.
