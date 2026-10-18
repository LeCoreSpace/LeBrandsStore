# Managed business-document security screening

## Status and privacy approval

The user chose a managed private scanner rather than self-hosted ClamAV and
explicitly approved Cloudmersive's standard hosted endpoint, without an
India-only processing requirement.
Cloudmersive's Advanced Virus Scan API is implemented. The user supplied its
key securely, and real synthetic-file validation passed: a clean PDF and a
2,990,628-byte clean PDF were accepted, while an embedded EICAR signature was
detected and rejected. Processor activation is enabled in the prepared Worker
configurations. Live database migrations, the production Worker secret and
publication remain user-run steps; no real business document was used for testing.

Official references checked on 2026-10-18:

- [API contract](https://api.cloudmersive.com/docs/virus.asp):
  `POST https://api.cloudmersive.com/virus/scan/file/advanced`, `Apikey` header,
  multipart `inputFile`, JSON `CleanResult` and `FoundViruses`.
- [Security](https://www.cloudmersive.com/security): the provider says stateless
  APIs do not retain payload content after processing and offers DPAs.
- [Regions](https://cloudmersive.com/regions): customized/premium regional
  deployments include India. **The standard API endpoint is not proof of
  India-only residency.** Dedicated/private infrastructure is not implied by
  using this standard multi-tenant hosted API.

Standard hosted processing has been selected. Before activation, the platform
owner must complete applicable contractual/DPA setup and any required
privacy-notice updates. Confirm
the selected plan supports the advanced endpoint, 3 MB documents, API credits
per scan and hard account usage limits. Do not assume a free plan or enable
automatic paid overages. If India-only processing is required, obtain an approved
regional endpoint/plan and update the pinned endpoint after verifying it.
Do not introduce arbitrary endpoint URLs or follow redirects carrying the key.

New uploads are capped at **3,000,000 bytes (3 MB)** in the form, API and scanner,
leaving headroom below the advertised free-tier 3.5 MB maximum. Historical
evidence is not deleted, relabelled or made inaccessible by this lower upload
limit; the original database size constraint remains compatible with old records.
The account's actual billing plan was not inspected or changed. Free-tier
concurrency is limited by the provider; requests that exceed its limits fail
closed without automatic paid retries.

## Staged database changes

After the previously required business-document migrations, the user runs:

```sh
pnpm run db:migrate -- --staged-business-document-retention
pnpm run db:migrate -- --staged-business-document-scanning
```

0034 requires recorded 0033. It adds private durable attempt counters and a
tenant-checked, owner/admin-only reservation function. Initial limits are five
attempts/store/hour, thirty/store/month and five hundred platform-wide/month
using UTC windows. Raising these needs a reviewed database change based on the
provider plan. Limits count attempts, not API-credit or monetary amounts.
Reservations commit **before** paid HTTP requests, and remain spent after
timeouts, rejected files or later storage/database failures. There are no
automatic retries. Hourly/monthly rejection returns 429 without calling the
provider. Existing submission throttling remains independent.

## Credentials and explicit activation

1. Cloudmersive and its standard hosted endpoint are approved. Confirm the
   account plan/limits and complete applicable contractual setup before activation.
2. Add `CLOUDMERSIVE_API_KEY` using the workspace's secure Secrets flow, never in
   chat, source, a public variable or a screenshot.
3. For the published Cloudflare Worker, the user installs the key with the
   secure Wrangler prompt: `pnpm exec wrangler secret put CLOUDMERSIVE_API_KEY`.
   A Replit workspace secret does not by itself configure a published Worker.
4. The workspace key's **name only** is now included in the preview
   configuration's `secrets.required` list. The value is never stored in source.
5. Keep `BUSINESS_DOCUMENT_SCAN_PROVIDER` set to `cloudmersive`. Following
   explicit processor approval and successful synthetic validation,
   `BUSINESS_DOCUMENT_SCAN_PROCESSOR_APPROVED` is now `"true"`. A missing key,
   approval, migration or private storage keeps uploads disabled; the managed
   provider never silently falls back to a service binding.
6. To repeat the three real provider checks intentionally, use
   `node scripts/check-business-document-scanner.mjs --run-live`. This consumes
   three provider requests and spaces them for the free-tier rate. It uses only
   generated PDFs, checks actual EICAR signature detection (not just format
   rejection), never accesses business records/storage, and never prints the
   key or raw provider findings. Unit tests separately mock responses and verify
   request/storage boundaries. The user publishes through the established
   deployment process, not the agent.

## What crosses the processing boundary

Only file bytes and their validated MIME type, under a generic `document.pdf`,
`document.png` or `document.jpg` filename, are sent to Cloudmersive. No original
filename, GSTIN, business name, store identifier or document URL is added to the
request. The document content itself can contain those details, which is why
processor approval is required.

Advanced checks disallow embedded scripts, macros, executables, invalid formats,
encrypted/password-protected files, unsafe archives, external XML entities,
insecure deserialization, HTML, OLE objects and unwanted actions. Only verified
PDF/PNG/JPEG formats are allowed. A definite clean result is mandatory;
contradictory findings, malformed/oversized responses, redirects, provider
errors, quotas and timeouts fail closed, without returning raw findings/errors.

After a pass, the original bytes go into private `BUSINESS_DOCUMENTS` R2 storage.
Private object metadata records scan provider, engine, timestamp and SHA-256;
existing database metadata records the matching SHA-256 and clean state.
Only authenticated authorized downloads are exposed, never public object URLs.
Neither screening nor a clean verdict approves the business, activates billing,
changes GST/invoice verification, or replaces the later staff review workflow.
