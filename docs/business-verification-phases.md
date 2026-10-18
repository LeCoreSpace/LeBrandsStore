# Registration and business verification rollout

Complete and confirm each phase before proceeding. Do not treat the roadmap
as already-enforced behaviour.

## Phase 1: Account contact details

Delivered in this phase:
- Required registration country and phone with visible calling code.
- Shared browser/server validation, field errors, password-policy parity and
  country-specific full telephone metadata. National and international input
  normalise to E.164; extensions and country mismatches are rejected.
- The existing case-insensitive email unique index remains authoritative.
  Duplicate registrations never overwrite an existing account and retain the
  same outward response as successful signup. No public email lookup.
- Existing `users.phone` is reused. New `users.country_code` is nullable for
  legacy accounts, with no assumed country or rewritten contact data.
- A new, restricted `register_user_with_contact` function supports the new
  form. The existing `register_user` function and its grants/identity remain
  compatible with already-published Workers.

### Database rollout

The migration is staged, not automatically applied. After reviewing the SQL,
apply it through the project's established administrative migration process:

    pnpm run db:migrate -- --staged-registration-contact

It requires the existing password-pepper migration and the regular foundational
schema. Apply it before deploying the registration code. Do not combine unrelated
staged migrations or change old migration checksums. This phase has not migrated
the external/live Supabase database.

### Security review

- New function uses SECURITY DEFINER with a fixed pg_catalog search path.
- PUBLIC has no execute grant; only the existing application role is granted
  execute. No direct user-table writes are newly granted.
- Existing RLS, password hashing, session handling and email uniqueness stay intact.
- Browser validation is advisory; the server repeats all checks before hashing
  and the database validates contact shape and password-record integrity.
- No secrets, contact details or passwords are logged.
- Phone format is validated, but ownership is **not** verified. No OTP claim.
- Account country is self-declared, not a verified business jurisdiction.
- Registration support does not enable non-Indian checkout, invoicing or taxes.
- Legacy account data stays untouched.

## Phase 2: Business details and private supporting documents

Implement the following schema in a separate reviewed migration, together with
its API and merchant UI, not as empty unprotected tables:

| Table | Responsibility |
|---|---|
| `store_business_verifications` | One current business-verification record per store: business country, legal name, registration type/number, review status and current submission reference |
| `business_document_requirements` | Reviewed country/registration-type requirements and accepted document types; versioned so old submissions retain their applicable rules |
| `store_business_documents` | Store-scoped private object key, document type, MIME type, size, checksum, submission version, upload/retention timestamps; never public media URLs |
| `store_business_verification_events` | Append-only submission and review history, actor, timestamp and safe merchant-facing change request; no document content in logs |

Use explicit store ownership checks and tenant RLS. Keep staff-only review
decisions separate from merchant-controlled fields. Define deletion/retention
and malware scanning before real documents are accepted; use private R2
storage with authorised, short-lived access.

India: retain provider GSTIN verification and registered-address confirmation;
then request GST registration certificate upload. Document submission must not
create or replace a provider-verification result.

Other countries: collect applicable tax/business registration details and
accepted local evidence. Include a not-registered/not-applicable assessment path.
Do not invent jurisdiction-specific legal requirements. Enable document
requirements country by country after review.

Distinguish account country, business country, phone ownership, tax-number
verification and document review. Do not infer one from another.

## Phase 3: Ann and editor access

- Show GSTIN prompts only for Indian businesses, using explicit business country.
- India: unlock editor after provider verification, address confirmation and
  required document submission.
- Other supported countries: unlock after required business details and evidence
  submission (or a defined exception decision).
- Design work remains available while manual document review is pending.
- Protect dashboard/Ann links, direct editor routes and editing APIs consistently.
- Define a safe path for legacy accounts without a country or submission; never
  assume India or silently lock every existing store.
- Leave existing financial and publication safeguards intact until their
  country-specific replacements have been deliberately implemented.

## Phase 4: Staff review and subscription eligibility (later)

The admin dashboard is deliberately deferred.

Build a staff-only review queue, protected document access, changes requested,
approval and audit history. States: not_submitted, pending_review,
changes_requested, approved. A new submission must retain the previous evidence
and review history.

Only activate manual approval as a subscription requirement once a working
staff review process exists. Until then, do not enforce a review gate that
nobody can clear. Business approval is separate from GST verification, Indian
invoice permissions, store publication and provider connection status.
