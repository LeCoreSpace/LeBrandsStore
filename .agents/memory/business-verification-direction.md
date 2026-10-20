---
name: Business verification direction
description: Country-aware onboarding, private evidence and platform administrative authority.
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
tax/business evidence for review before subscription. The user has authorized a
separate platform admin dashboard for cross-store operational status, billing
visibility, private document review and audited suspension controls.

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

Do not send registration documents to public/shared malware-intelligence
submission services. Obtain approval before introducing an external document
processor, and verify its privacy/retention terms.

**Why:** Business evidence is private; choosing an antivirus service must not
silently expose it to additional parties or public sample sharing.

**How to apply:** Prefer the approved private processing boundary. If no scanner
is configured, retain the explicit upload block instead of claiming signature
checks or a mock are genuine malware screening.

Use Cloudmersive's standard hosted endpoint for managed private scanning rather
than provisioning self-hosted ClamAV for this project.

**Why:** The user selected managed private scanning and explicitly chose
“Use Cloudmersive’s standard hosted endpoint”.

**How to apply:** Standard hosted processing is approved; do not impose an
India-only residency requirement or claim the standard endpoint provides one.
Account pricing/limits, contractual setup, credentials and synthetic validation
still need confirmation before activation. This selection does not authorize
buying a plan or sending real business evidence as test material.

The user specified retention "for ever till the brands subscription is with us
(for compliance)". Retain business evidence throughout the brand's subscription,
not on an arbitrary 30–365-day deletion schedule. Post-cancellation retention
and applicable legal holds have not been decided.

**Why:** The user stated the subscription-duration retention requirement for
compliance; this is a product policy, not a verified statement of statutory law.

**How to apply:** Keep files private and retain submission/replacement history.
Do not invent a post-cancellation deletion deadline or claim retention alone
satisfies all jurisdiction-specific compliance obligations.

Review is manual through the restricted admin dashboard. After document
submission, the merchant should be able to continue store creation. If review
finds a discrepancy, notify the merchant to upload replacement evidence through
dashboard Settings. Suspension is a separate explicit platform decision.

**Why:** The user confirmed review and recovery, then replaced automatic blocking
with review after publication and separate discrepancy handling.

**How to apply:** Separate pending review from rejection; do not require manual
approval merely to continue store creation. Keep the authenticated document
replacement route available to a suspended merchant.

The user superseded the earlier "Allow building only; require approval before
going live" policy. Implement review after publication in stages: pending
manual review permits publishing after the required submission and security
checks; admins need private PDF viewing and approve/reject emails.

**Why:** The user wants brands to publish without waiting for manual tax-document
approval, with corrections or explicit suspension used for discrepancies.

**How to apply:** Do not treat pending review as financial/tax approval.
Retain GST, checkout and suspension safeguards. Rejection should request
corrections, not automatically take an otherwise live store offline.

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

Completed onboarding progress must not hide a newly required business-evidence
step for returning merchants. Keep required recovery reachable after saved-plan
and asynchronous verification restoration, then resume the merchant's previous
design position once submission permits building.

**Why:** The user reported that existing merchants briefly saw document upload
and then lost it when their saved Ann progress was restored.

**How to apply:** Treat verification recovery separately from normal completed
setup locks. Never label required unsubmitted documents as skipped, discard a
private upload form during chat refresh, or reset a saved design to recover access.

The user approved country-only contact updates for the two pre-existing legacy
accounts with empty phones. This exception must not extend to new registrations,
and must end once a valid phone is provided.

**Why:** The user explicitly chose to retain unknown legacy phone numbers rather
than invent contact details or block an approved country backfill.

**How to apply:** Preserve strict new-account contact validation. Do not grant
further legacy exceptions without explicit authorization.

Successful synthetic scans using the Replit secret do not prove that the
separately deployed Cloudflare Worker has the same secret value. Cloudflare
binding metadata confirms presence, not equality.

**Why:** Replit and Cloudflare manage secrets independently. Local scan success
does not establish a production credential mismatch or prove Worker runtime
compatibility.

**How to apply:** Use bounded synthetic probes rather than re-sending merchant
documents. Distinguish provider authentication, quota, network, timeout and
invalid-verdict failures without logging provider bodies, credentials or files.
