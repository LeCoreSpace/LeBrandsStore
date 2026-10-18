# Registration and business verification rollout

## Current retention update: subscription duration

The user's revised policy supersedes the former fixed-days setting:
retain documents during onboarding and throughout the brand's subscription,
including earlier submissions. Post-cancellation retention and legal holds are
not yet decided. This update introduces **no automatic deletion** and does not
implement a billing/subscription lifecycle that does not yet exist.

Prepared `0033_business_document_retention.sql`, requiring 0031:

    pnpm run db:migrate -- --staged-business-document-retention

The user runs this personally; it has not been applied to live data by the agent.
The migration adds a named retention policy to existing/new file records,
preserves all evidence and legacy review dates as history, and removes the
fixed-date requirement for new files. It replaces the submit function in place
without changing its callable identity or grants. Old prepared callers remain
compatible, but their old day argument no longer establishes a deadline.

`BUSINESS_DOCUMENT_RETENTION_DAYS` is no longer required or used by the new
application code. The form displays subscription-duration retention and reports
a missing migration separately from missing private storage or security screening.
Do not configure R2 lifecycle expiration for the business-evidence prefix; a
database retention label cannot prevent an independent bucket-expiration rule.
No scheduled cleanup may use the preserved legacy review dates as deletion dates.

**Managed scanning validated; live setup is user-run:** the user chose managed private
scanning. The Cloudmersive advanced adapter and durable scan-attempt budgets are
implemented; see [managed-scanning setup](business-document-scanning.md).
The user approved Cloudmersive's standard hosted endpoint and supplied a key.
Synthetic clean PDF, near-3 MB and EICAR checks passed against the real service.
New uploads are limited to 3 MB. Staged migrations and the production Worker
secret still require the user to apply them. No real documents have been
sent to the processor; the preview mock remains isolated. Do not use public/
shared malware-submission services for tax documents.

This is the first part of the revised workflow, not completion of all phases.
The merchant Settings recovery flow, admin document decisions, manual approval
before publishing, suspension and notifications remain later work. Pending
review must allow draft creation, while final go-live requires manual approval.
Do not activate a new manual-approval publishing gate without a working staff
review path.

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

Implemented as a separately staged migration, API and Ann merchant dialog.
Open **Business documents** from Ann's top navigation. Nothing has been
migrated or provisioned against the external/live environment.

| Table | Responsibility |
|---|---|
| `store_business_verifications` | One current business-verification record per store: business country, legal name, registration type/number, review status and current submission reference |
| `business_document_requirements` | Reviewed country/registration-type requirements and accepted document types; versioned so old submissions retain their applicable rules |
| `store_business_documents` | Store-scoped private object key, document type, MIME type, size, checksum, submission version, upload/retention timestamps; never public media URLs |
| `store_business_verification_events` | Append-only submission history, actor and private submitted-details snapshot; reviewer actions remain deferred; no document content in logs |

Only owner/admin memberships with an active session can use the private API.
All three merchant tables have RLS with no direct APP/API-role table grants;
new fixed-search-path functions check the session and tenant themselves.
Merchants can submit/resubmit only as pending review, never approve a record.
Revision checks prevent overwriting another tab's work, and earlier evidence
and submitted-details snapshots are retained.

Uploads use a **separate private R2 bucket**, not public product media. Download
requests recheck membership and current submission on every GET/HEAD, stream
attachments with no-store/nosniff/sandbox headers, and never return object keys.
There are no permanent public or signed download links.

Accepted files: one PDF, JPEG or PNG up to 5 MiB. Both bounded multipart reads
and content signatures are checked. These are not an antivirus scanner:
real uploads fail closed until the private scanner binding is configured.
Failed scans never enter R2. If a database commit fails after upload, the
new object is deleted, not the merchant's earlier evidence. Cleanup failures
log a generic code only and require an operator to investigate private orphans.

India: retain provider GSTIN verification and registered-address confirmation;
then request GST registration certificate upload. Document submission must not
create or replace a provider-verification result.

Other countries: collect applicable tax/business registration details and
accepted local evidence. Include a not-registered/not-applicable assessment path.
Do not invent jurisdiction-specific legal requirements. Enable document
requirements country by country after review.

Distinguish account country, business country, phone ownership, tax-number
verification and document review. Do not infer one from another.

### Database rollout

After reviewing `db/staged/0031_business_documents.sql`, run personally:

    pnpm run db:migrate -- --staged-business-documents

Prerequisites: the regular foundation through 0010, GST migration 0011, Ann
launch migration 0017 and registration-contact migration 0030 must already be
recorded in `schema_migrations`. Use the existing administrative/BYPASSRLS
migration connection. This command applies only the selected new migration.
Old migrations, prepared-function identities, GST evidence and invoice rules
are unchanged.

### Production enablement: deliberately not performed automatically

1. Provision `lebrands-business-documents` in the intended Cloudflare account,
   for example using `pnpm exec wrangler r2 bucket create lebrands-business-documents`.
   The `BUSINESS_DOCUMENTS` binding is prepared in production/preview configuration.
   Keep public access, r2.dev, custom public domains and public CORS disabled.
   Do not point this binding at the existing public media bucket.
2. Follow [managed-scanning setup](business-document-scanning.md) for the chosen
   managed approach. This uses server-side HTTPS, not a separate scanner Worker.
   The older `BUSINESS_DOCUMENT_SCANNER` service-binding contract is supported
   only for an explicitly selected, approved private scanner; do not add an echo
   service or use the isolated fixture mock in production.
3. Apply the subscription-duration retention update described above after 0031.
   It replaces the original fixed-days setting. Retain evidence during onboarding
   and throughout the subscription; do not enable automatic deletion. Historical
   review dates remain history only, not cleanup instructions.
4. Apply the staged migration, then deploy the Worker through the established
   process. Validate the private bucket and actual scanner with a synthetic file
   before accepting business documents.

Missing configuration is shown explicitly in the dialog. Even when scanning or
storage is paused, the not-registered manual-assessment path can submit without
a file once the retention review policy is configured. Countries other than
India use an explicitly labelled generic manual assessment, not invented local
legal requirements. Country-by-country reviewed policies remain future work.

### Verification

`tests/business-documents.test.js` applies the real foundational and staged DDL
in disposable PGlite and tests submission/resubmission, revision conflicts and
orphan cleanup, file checks, scan failure, private downloads, role denials,
non-registered exceptions and no object-key exposure. The isolated
`/__ann-builder-preview` uses fictional data, in-memory private storage and a
mock scanner only; it does not access live tax evidence or provide a production
scanner bypass. Submitted documents do not grant editor, publication,
subscription or invoice privileges.

## Phase 3: Ann and editor access

Implemented with staged `0032_business_editor_access.sql`:

- **At the user's explicit request, every store existing when this migration
  runs is assigned business country India.** This is not a user-account country
  update or verification decision. Old documents, account contacts, saved
  designs, GST evidence and invoices are not relabelled or rewritten.
- Newly created stores get an empty business country through a trigger. Ann
  asks the merchant to explicitly confirm the business jurisdiction; no country
  is inferred from the account or phone.
- India shows GSTIN verification and registered-address confirmation before
  private GST certificate submission. Other countries skip Ann's GST prompt.
- Standard clean evidence in pending review or approved state enables design
  editing. Changes requested locks it until resubmission. A not-registered
  exception requires an approved exception decision; the staff interface is
  still deferred, so this path explicitly tells the merchant it needs review.
- Country changes are locked once documents or a confirmed invoice identity
  exist. A previous non-Indian submission on a store newly assigned India is
  retained as history, not silently converted to Indian evidence; new matching
  Indian evidence is needed.
- Dashboard/Ann theme links, direct editor/style routes, Ann design mutations,
  page layout APIs, theme fields in setup and legacy AI design mutations use
  the same access calculation. Product/collection forms and ordinary business
  details remain available. Read-only members never gain writing privileges.
- All existing financial, checkout, GST invoice and publication protections
  remain unchanged. Non-Indian design access is not international commerce or
  country-specific tax support.

### Migration and activation order

**Do not apply this gate migration until Phase 2's real private storage, scanner
and retention policy are operational.** It intentionally applies the rules to
existing stores too; missing evidence will lock theme editing. A missing scanner
must not leave merchants unable to complete a newly enforced requirement.

Review the migration and run personally:

    pnpm run db:migrate -- --staged-business-editor-access

It requires 0031 already recorded. Prepare/provision Phase 2 dependencies and
deploy this code in a coordinated rollout. Until 0032 is applied, the code
reports `rollout_pending` and retains pre-existing editor rules; that is explicit
staged compatibility, not a fallback after database or permission failures.
Once applied, a missing access record fails closed. No live migration or
deployment is performed automatically.

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
