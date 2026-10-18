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
retention review policy are configured. Signature checks and the isolated
preview's mock scanner are not production malware screening. Keep evidence in
a separate private bucket, not the public product-media bucket.

**Why:** Tax documents contain sensitive business information. Accepting them
through public media or presenting unconfigured scanning as protection would
create a privacy and reviewer-safety risk.

**How to apply:** Keep missing-configuration messages explicit. Distinguish
retention review dates from a deletion guarantee. Do not silently enable
production uploads, substitute an echo scanner, or infer legal requirements for
unreviewed countries.

Private business evidence forms must own their native text inputs rather than
moving the entered details into Ann's shared chat composer.

**Why:** A modal makes the background composer inaccessible, and registration
details should stay inside the dedicated private submission flow.

**How to apply:** Keep modal form fields independent of conversation input
enhancements and test non-Indian free-text/exception paths as well as Indian
read-only GST details.
