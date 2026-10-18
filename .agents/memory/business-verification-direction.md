---
name: Business verification direction
description: Country-aware onboarding, supporting documents and deferred administrative review.
---
Registration must collect country and phone with a visible calling code and
country-specific format validation. Treat account country as self-declared,
not proof of the business's registered jurisdiction or phone ownership.

**Why:** The user requested country/phone registration and country-aware Ann
business verification.

**How to apply:** Reuse existing account contact data; do not assume India for
legacy accounts. Business country must be established separately before using it
to change tax or publication rules.

Indian businesses should upload their GST registration certificate after GSTIN
verification. Non-Indian businesses should submit applicable country-specific
tax/business evidence for review before subscription. The admin dashboard is
explicitly deferred.

**Why:** The user requested supporting documents for both groups, country-based
verification before subscription, and phased implementation with database changes.

**How to apply:** Separate provider GST verification from document review and
subscription eligibility. Do not activate a manual-review subscription gate
until a restricted staff review process exists. Keep documents private and
define exceptions and reviewed jurisdiction requirements before collection.
Complete and confirm one phase before proceeding, as requested earlier.

Private evidence collection must fail closed until a real security scanner and
the agreed retention policy are configured. Signature checks and the isolated
preview's mock scanner are not production malware screening. Keep evidence in
a separate private bucket, not the public product-media bucket.

**Why:** Tax documents contain sensitive business information. Accepting them
through public media or presenting unconfigured scanning as protection would
create a privacy and reviewer-safety risk.

**How to apply:** Keep missing-configuration messages explicit. Do not silently enable
production uploads, substitute an echo scanner, or infer legal requirements for
unreviewed countries.

The user specified retention "for ever till the brands subscription is with us
(for compliance)". Retain business evidence throughout the brand's subscription,
not on an arbitrary 30–365-day deletion schedule. Post-cancellation retention
and applicable legal holds have not been decided.

**Why:** The user stated the subscription-duration retention requirement for
compliance; this is a product policy, not a verified statement of statutory law.

**How to apply:** Keep files private and retain submission/replacement history.
Do not invent a post-cancellation deletion deadline or claim retention alone
satisfies all jurisdiction-specific compliance obligations.

Approval is manual through the planned admin dashboard. After document
submission, the merchant should be able to continue store creation. If manual
verification fails, suspend the store and notify the merchant to upload
replacement evidence through dashboard Settings for verification again.

**Why:** The user explicitly confirmed this review and recovery workflow.

**How to apply:** Separate pending review from rejection; do not require manual
approval merely to continue store creation. Keep the authenticated document
replacement route available to a suspended merchant.

The user explicitly chose: "Allow building only; require approval before going
live". Pending-review merchants may build and save drafts, but manual business
approval is required before publication.

**Why:** The user confirmed the distinction between store creation and accepting
live orders while documents await review.

**How to apply:** Enforce approval at the server-side publication boundary, not
just through a disabled button. Approval must not bypass GST, checkout or other
publication safeguards. Provide a working restricted staff approval path before
activating a gate that otherwise nobody can clear. Subscription billing remains
a separate implementation concern.

Private business evidence forms must own their native text inputs rather than
moving the entered details into Ann's shared chat composer.

**Why:** A modal makes the background composer inaccessible, and registration
details should stay inside the dedicated private submission flow.

**How to apply:** Keep modal form fields independent of conversation input
enhancements and test non-Indian free-text/exception paths as well as Indian
read-only GST details.

The user explicitly requested: "make all existing stores to india".
Assign India to business country for all stores present at the country/access
rollout, without changing account countries, historic invoices or evidence.
New stores still need an explicit business-country choice.

**Why:** The user replaced the previously proposed legacy-country exemption
with an explicit assignment for existing stores.

**How to apply:** Stage the data change for the user to run personally. Explain
that editor gating will apply to existing stores too; make private evidence
collection operational before activating a gate that merchants cannot complete.
