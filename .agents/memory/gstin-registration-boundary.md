---
name: GST registration and exempt invoices
description: User's GSTIN publication rule and the boundary against a new Bill of Supply flow.
---

A valid GSTIN is required to publish a store. The first two GSTIN digits must
match the registered business address state, independently established rather
than inferred from the GSTIN prefix. Verify the mod-36 check digit too.
Products may use 0% exempt GST and should show "Exempt" with zero tax as lines
on GST invoices. Do not build a separate Bill of Supply flow yet.

**Why:** The user specified this as the publication, invoice and product
behavior, replacing the earlier optional-GSTIN approach.

**How to apply:** Apply these checks consistently to wizard, Settings,
server-side publication and new invoice issuance. Existing live documents
remain historical; do not silently alter legacy financial records.

Supplier legal details must be repairable in Settings before shipping, then
frozen when the invoice is issued. Do not force an incomplete old checkout
supplier snapshot into a new financial document, or overwrite an issued one.

**Why:** The polish requirements explicitly require fixing supplier details in
Settings before marking shipped, including orders placed before those fields
were available.

**How to apply:** Invoice issuance uses complete current registered business
details while preserving the order's stored amounts and validating its tax
split. A tax-state mismatch must block issuance rather than recalculate money.
