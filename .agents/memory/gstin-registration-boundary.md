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

Legacy supplier details that have not been locked by Ann must be repairable in
Settings before shipping, then frozen when the invoice is issued. Ann-confirmed
invoice identities are instead locked at address confirmation and must not be
editable by the merchant afterward. Do not force an incomplete old checkout
supplier snapshot into a new financial document, or overwrite an issued one.

**Why:** Earlier polish requirements require repairing incomplete legacy supplier
details before shipping. The user subsequently required Ann verification and
address confirmation at onboarding, with no later changes to that invoice identity.

**How to apply:** Invoice issuance uses complete current registered business
details while preserving the order's stored amounts and validating its tax
split. A tax-state mismatch must block issuance rather than recalculate money.

Registration should automatically verify GSTIN through the same provider used
by LeBrands.Space. Use the brand-confirmed principal or additional registered
address for legal business details and new invoices; verified addresses are
read-only. Provider failures may permit manual draft entry, but unverified
stores cannot issue invoices.

**Why:** The user requested automatic verification and provider-sourced
registered addresses throughout the store, including invoices.

**How to apply:** Preserve the existing financial permission boundary and
historical snapshots. Never substitute customer delivery addresses with the
merchant's registered address. Do not infer a provider contract from a key name.

Additional registered addresses are best-effort: parse each as a principal
address; skip malformed entries with warnings, never invalidate a valid
principal registration. Display/invoice city selects city, then locality,
then district, while retaining the raw provider response.

**Why:** The user does not want a future warehouse/depot address to break
Stonescence's verification, and GST responses commonly leave city empty.

**How to apply:** Use the same field-selection and warning behavior in all
verification consumers; keep provider-selected business details distinct
from customer delivery addresses.

Retain the provider's full formatted registered address for display alongside
the structured fields. Existing cached evidence may contain that fuller text
even when an earlier normalizer omitted it. Display recovery must not silently
rewrite a confirmed invoice identity or alter stored verification evidence.

**Why:** A merchant reported a missing address beginning. The provider's
formatted address and structured building/street fields can differ; silently
choosing new invoice fields would violate the confirmed-address lock.

The numbering/GSTIN polish rollout must be migrated and deployed before the
provider-verification schema is applied. The user requires the polish security
section before authorizing any migration.

**Why:** The user explicitly requires this staged rollout and approval order.

**How to apply:** Do not allow a migration command to apply both stages together.
Stage the later schema outside the active migration set until the earlier
rollout has completed. Never infer migration or deployment approval.
