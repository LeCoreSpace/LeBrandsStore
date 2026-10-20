# Support ticketing: schema and implementation

## Implementation status

Released on 20 October 2026 following explicit approval. The operator-applied
migration `db/staged/0051_support_tickets.sql` committed to the shared Supabase
database and the update was published to the production Cloudflare Worker.
Admin notification delivery uses the approved `support@lebrands.store` inbox.

The dashboard placement update was also published on 20 October 2026. Brand
ticket lists, creation and conversations retain the dashboard shell at
`/stores/:storeId/support`. Existing account/email links redirect after access
checks; support before store creation remains available in the account context.
This placement release required no database migration.

Implemented: pre-store/account and store tickets, the three requested statuses,
brand conversations, platform-admin inbox, assignment, priority, internal notes,
public closing resolutions, reopening, and durable created/closed email intents
for the brand and configured support inbox. Account creation, the dashboard,
Ann and the theme editor link to support. Private attachment upload remains a
later phase; its metadata table is reserved but there is no upload UI or route.

The SQL migration is the source of truth for exact DDL. All eight new tables
have creation/update timestamps, forced RLS and no direct application/API-role
access. Narrow functions enforce current membership, admin authority, immutable
scope, idempotency and optimistic revisions. Existing email-job claiming keeps
its callable identity and existing verification/reset guards. The migration
fails closed if that existing function body differs from the reviewed baseline.

Verified with 58 scoped checks and an isolated synthetic browser lifecycle.
Production checks confirmed the recorded migration checksum, eight forced-RLS
tables, restricted function grants, protected support routes and all six
published support assets/dependencies. All 25 existing non-asset bindings,
including 14 encrypted secrets, and runtime compatibility were preserved.
No real ticket or test email was created; provider delivery has not been tested
with a live ticket.

---

Status: design only. No migration, application changes, emails or publication
are included in this document.

## 1. Scope and existing infrastructure

Signed-in brands can raise tickets before creating a store, during onboarding,
from the dashboard, Ann, the theme editor and every integration/settings area.
Do not require publication, an active subscription or an unsuspended store to
request support. Support access must not unlock restricted commerce actions.

Reuse:

- `users(id)` for brand and staff identities.
- `stores(store_id)` and `store_members` for current store membership.
- `platform_administrators(user_id)` and the existing authenticated platform
  administrator guard. Do not introduce a separate support login.
- `platform_email_jobs(id)`, the shared professional HTML/plain-text email
  design, delivery capabilities, retries and provider delivery reporting.
- Existing private Cloudflare storage infrastructure for attachments, subject
  to an approved support-file retention/scanning policy. Never use public
  product-media URLs for support files.

Eight new tables are proposed. All timestamps are `timestamptz` in UTC.
UUID primary keys use server-generated `gen_random_uuid()`. Unless explicitly
marked nullable, columns below are required. Text limits apply in both the API
and database. This is a relational design, not executable DDL.

## 2. Tables

### `support_categories`

Configurable topic catalogue, not a hardcoded PostgreSQL enum.

| Column | Type / rule |
| --- | --- |
| `code` | `text`, primary key, stable machine identifier |
| `parent_code` | Nullable `text`, FK to this table; optional subcategory |
| `name` | `text`, 1–100 characters, merchant-readable label |
| `description` | `text`, up to 500 characters |
| `sort_order` | `integer`, default 0 |
| `is_active` | `boolean`, default true |
| `created_at`, `updated_at` | `timestamptz` |

Prevent category cycles. Deactivate used categories instead of deleting them.
Existing tickets retain their topic even when it is no longer selectable.

Initial categories/subcategories:

- Account and access: registration, sign-in, password, staff permissions.
- Store setup: store creation, store limits, Ann onboarding, business verification.
- Store design: themes, theme editor, pages, sections, grids, text, images,
  mobile layout, saving and publishing.
- Catalogue: products, variants, collections, categories, pricing and stock.
- Orders and checkout: cart, checkout, COD, order status, cancellations,
  returns, refunds and customer accounts.
- Payments: Razorpay authorisation, payment availability and payment records.
- Domain: domain setup, DNS verification, SSL and storefront accessibility.
- Delivery: Shiprocket, delivery configuration, shipments, tracking and RTO.
- Marketing: Meta, Google Analytics, Google Ads and consent/event reporting.
- Plan and billing: subscription, Free access, renewal, invoices and charges.
- Business and tax: business documents, GST, invoice identity and numbering.
- Offers: discounts, offer eligibility and promotional codes.
- Reports: analytics, costs, margins, exports and reconciliation questions.
- Email and notifications: order emails, account messages and preferences.
- Website and SEO: storefront performance, search visibility and links.
- Security and privacy: suspicious access and data/privacy concerns.
- Feedback and other: feature requests, general questions and uncategorised issues.

### `support_tickets`

One row per case. This is the source of truth for its current status.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_number` | `bigint`, unique generated identity; display as `SUP-000123` |
| `requester_user_id` | `uuid`, FK `users(id)`; derived from authenticated session |
| `scope` | `text`, `account` or `store` |
| `store_id` | Nullable `uuid`, FK `stores(store_id)` |
| `category_code` | `text`, FK `support_categories(code)` |
| `subject` | `text`, 5–160 characters |
| `status` | `text`, exactly `created`, `pending`, `closed`; default `created` |
| `priority` | `text`, `low`, `normal`, `high`, `urgent`; default `normal`, support-controlled |
| `waiting_on` | Nullable `text`, `brand` or `support`; only set while pending |
| `assigned_admin_user_id` | Nullable `uuid`, FK `platform_administrators(user_id)` |
| `source` | `text`: `account`, `onboarding`, `dashboard`, `ann`, `theme_editor` |
| `last_message_number` | `bigint`, default 0; monotonic per-ticket message cursor |
| `last_activity_at` | `timestamptz`; updated by material ticket activity |
| `closed_at` | Nullable `timestamptz` |
| `closed_by_user_id` | Nullable `uuid`, FK `users(id)` |
| `resolution_message_id` | Nullable `uuid`; same-ticket FK to a public message |
| `revision` | `bigint`, default 1; increment on workflow changes |
| `idempotency_key` | `uuid`, client operation key checked against the payload |
| `creation_payload_hash` | `text`, immutable server-computed digest of the canonical original request |
| `created_at`, `updated_at` | `timestamptz` |

Constraints:

- Account scope requires `store_id IS NULL`; store scope requires a store.
- Scope, requester and store are immutable. Never turn a private account
  conversation into a team-visible store conversation automatically.
- Store deletion is restricted while historical tickets reference it;
  store archival must not silently convert tickets to account scope.
- Unique `(requester_user_id, idempotency_key)`. A repeated key with a different
  payload is rejected, not treated as a successful new request.
- Closed tickets require `closed_at`, `closed_by_user_id` and a resolution
  message. Nonclosed tickets have these fields cleared; prior closures remain
  in the event history.
- Composite resolution FK `(id, resolution_message_id)` references
  `support_ticket_messages(ticket_id, id)`. The closing function also verifies
  that the message is public, not an internal note.
- Do not use display numbers as authorisation or assume they are gapless.

### `support_ticket_participants`

Explicit collaborators, notification preferences and unread-message cursors.
Current authorisation must still be checked; a participant row never overrides
revoked store membership or platform-admin access.

| Column | Type / rule |
| --- | --- |
| `ticket_id` | `uuid`, FK tickets |
| `user_id` | `uuid`, FK users; composite PK `(ticket_id, user_id)` |
| `participant_role` | `text`: `requester`, `brand_owner`, `collaborator` |
| `added_by_user_id` | `uuid`, FK users |
| `notify_replies` | `boolean`, default true; optional reply emails only |
| `last_read_message_number` | `bigint`, default 0, nonnegative |
| `created_at` | `timestamptz` |
| `removed_at` | Nullable `timestamptz` |

Only the account requester participates in an account-scoped ticket initially.
Store collaborators must be current members explicitly authorised by the owner.
Read cursors are capped at an existing message number; internal-note content
and unread counts are never exposed to brands.
Keep global message numbers/cursors server-side in brand-facing responses:
accept a visible message ID for marking read, and calculate unread totals from
public messages only. Do not reveal internal activity through sequence gaps.

### `support_ticket_messages`

The initial description, brand/admin replies and private support notes.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_id` | `uuid`, FK tickets |
| `message_number` | `bigint`, positive, unique `(ticket_id, message_number)` |
| `author_user_id` | `uuid`, FK users |
| `author_role` | `text`: `brand`, `platform_admin`; server-derived |
| `visibility` | `text`: `public`, `internal`; default `public` |
| `body` | `text`, 1–20,000 characters; plain text or strictly sanitised Markdown |
| `client_message_key` | `uuid`; retry-safe unique `(ticket_id, author_user_id, client_message_key)` |
| `original_payload_hash` | `text`, immutable server-computed digest for safe retries after redaction |
| `created_at` | `timestamptz` |
| `redacted_at` | Nullable `timestamptz` |
| `redacted_by_user_id` | Nullable `uuid`, FK users |
| `redaction_reason` | Nullable bounded `text` |

Add unique `(ticket_id, id)` for composite child FKs. Allocate message numbers
while holding the ticket row lock. Only platform admins create internal notes.
Do not silently edit sent messages; corrections are new replies. Redaction is a
separate audited operation under an explicit retention/privacy policy.

### `support_ticket_attachments`

Private screenshots/documents belonging to a specific conversation message.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_id`, `message_id` | `uuid`; composite FK to messages `(ticket_id, id)` |
| `uploaded_by_user_id` | `uuid`, FK users |
| `object_key` | `text`, unique private storage key; never a public URL |
| `original_filename` | `text`, sanitised basename, up to 240 characters |
| `mime_type` | `text`, server-verified allowlist |
| `size_bytes` | `bigint`, positive, bounded |
| `sha256` | `text`, validated 64-character digest |
| `scan_status` | `text`: `pending`, `clean`, `rejected`, `failed` |
| `created_at` | `timestamptz` |
| `deleted_at` | Nullable `timestamptz` |

Recommended initial limits: five files per message, 10 MB per file, PNG/JPEG/
WebP screenshots and PDF. No SVG, HTML, executable or archive uploads.
Quarantine until approved scanning succeeds; fail closed if unavailable.
Authorise every download and use short-lived access, safe content disposition
and `nosniff`. Warn users never to include passwords, API secrets or payment
credentials. Files can still contain sensitive information, so scanning is not
a guarantee of privacy.

Create the ticket/message first, then upload against those IDs. An upload
failure must not recreate the ticket or pretend the file was attached.
Email contains a ticket link, not attachments or permanent download links.

### `support_ticket_links`

Safe feature context and references without duplicating live business records.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_id` | `uuid`, FK tickets |
| `link_type` | Bounded `text`, server-supported type registry |
| `resource_id` | Bounded `text`; opaque ID/key, not arbitrary SQL or URL |
| `resource_store_id` | Nullable `uuid`, FK stores |
| `label` | Bounded `text`, safe display label |
| `context` | `jsonb`, object, maximum 8 KB, explicit per-type key allowlist |
| `created_by_user_id` | `uuid`, FK users |
| `created_at` | `timestamptz` |

Types include store, theme, page, section, product, order, integration,
subscription and invoice. Use a partial unique index for applicable resource
identity `(ticket_id, link_type, resource_id)` to avoid duplicate links.

Context may contain theme key, page/section identifier, integration provider,
sanitised page pathname, app build identifier and a public error code.
Never capture URL query strings, tokens, cookies, full configuration JSON,
checkout/customer records, card information or credentials.

Resolve IDs server-side within authorised scope. Polymorphic IDs are not real
foreign keys: validate the referenced resource in the same controlled write
transaction and recheck permissions when opening it. A reference never grants
access to that resource or expands access to an account ticket.

### `support_ticket_events`

Append-only workflow history and the durable origin of notifications.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_id` | `uuid`, FK tickets |
| `event_type` | `text`: `created`, `status_changed`, `assigned`, `priority_changed`, `participant_changed`, `message_added`, `attachment_added`, `redacted` |
| `actor_user_id` | Nullable `uuid`, FK users; null only for system operations |
| `actor_role` | `text`: `brand`, `platform_admin`, `system` |
| `visibility` | `text`: `public`, `internal` |
| `old_status`, `new_status` | Nullable `text`, same three ticket status values |
| `message_id` | Nullable `uuid`, same-ticket FK |
| `metadata` | `jsonb`, bounded allowlisted change information, not raw records |
| `created_at` | `timestamptz` |

Unique `(ticket_id, id)` enables composite FKs. Validate status transitions
against the locked current ticket. Track every closure separately, including
when a reopened ticket is closed again. Brands receive only safe public events.
Application roles cannot update/delete audit events.

### `support_ticket_notifications`

Transactional notification intents, not a second email delivery service.

| Column | Type / rule |
| --- | --- |
| `id` | `uuid`, primary key |
| `ticket_id`, `event_id` | `uuid`; composite FK to events `(ticket_id, id)` |
| `notification_type` | `text`: `ticket_created`, `ticket_closed`, `ticket_reply` |
| `recipient_user_id` | Nullable `uuid`, FK users |
| `recipient_config_key` | Nullable bounded `text`, e.g. configured support inbox |
| `audience` | `text`: `brand`, `admin` |
| `recipient_fingerprint` | Nullable private server-derived HMAC of normalised email |
| `email_job_id` | Nullable unique `uuid`, FK `platform_email_jobs(id)` |
| `state` | `text`: `pending`, `enqueued`, `cancelled` |
| `attempts` | `integer`, nonnegative and bounded |
| `next_attempt_at` | `timestamptz` |
| `lease_until` | Nullable `timestamptz` |
| `last_error_code` | Nullable sanitised `text`; no raw provider response |
| `created_at`, `updated_at` | `timestamptz` |

Exactly one recipient target is required: user or approved configuration key.
Unique event/type/target prevents repeated intent insertion. Once recipients
are resolved, a partial unique `(event_id, recipient_fingerprint)` over active,
resolved intents prevents duplicate emails to the same address.

Under a row lock, resolve and re-authorise the recipient, create one existing
platform email job, and save `email_job_id` in one transaction. Existing email
jobs own actual sending/retries/provider IDs and sent/delivered/bounced/failed
status. Support intent state does not falsely claim delivery.

Extend the existing template/claim/dispatch/recovery functions explicitly for
support templates; do not bypass their private delivery-capability checks.

## 3. Status and role rules

| Action | Result |
| --- | --- |
| Brand submits ticket | Created |
| Admin starts work or requests information | Pending |
| Admin resolves case with a public resolution | Closed |
| Brand confirms their own issue is resolved | Closed with a recorded public resolution |
| Brand replies to a closed ticket or explicitly reopens it | Pending |

Created may move directly to Closed. Closing requires a resolution.
An internal admin note does not automatically reopen a case.
Use `waiting_on` to explain Pending without adding extra statuses.

Authorisation defaults:

- Account tickets: requester and authorised platform admins only.
- Store tickets: requester with current membership, current owner and explicitly
  authorised current-member collaborators. Do not automatically expose all
  tickets to all staff.
- Former staff lose store-ticket access despite historical authorship.
- Platform support access does not grant invoice, refund, business-document or
  merchant-configuration write privileges.
- Only platform admins assign tickets, set support priority and see internal notes.
- Filter internal messages/events/attachments in the database-backed API, never
  only with CSS or client-side hiding.

## 4. Atomic creation, closing and email

Ticket creation transaction:

1. Validate authenticated actor, category, scope and safe context.
2. Create ticket, first public message, participants and Created event.
3. Insert notification intents for the brand and configured admin recipient.
4. Commit. Send asynchronously through existing email infrastructure.

Closing transaction:

1. Lock ticket and validate expected revision and actor permissions.
2. Save a public resolution, update status/closure fields and append event.
3. Insert brand/admin closure notification intents for that exact event.
4. Commit, then deliver asynchronously.

Email recipients:

- Brand: requester; also the store owner when a staff member raised the case.
- Admin: configured support inbox; optionally the assigned active admin.
- Deduplicate normalised addresses. Resolve configured destinations server-side.
- Creation/closure emails are essential case-service messages, not marketing.
  Optional reply notifications may respect participant preferences.
- Revalidate recipient authority before dispatch. Email includes ticket number,
  status, safe subject and authenticated case link, not private internal notes,
  credentials, attachments or a full conversation.
- Email provider/queue failure must not lose or roll back an otherwise committed
  ticket. Retry through durable intents/jobs and show truthful delivery state to
  authorised admins. Never report “email delivered” from enqueue success.
- The first description and closure resolution do not produce extra reply
  emails on top of the creation/closure notification for the same operation.

## 5. Indexes, security and retention

Required indexes:

- Tickets: unique number and requester/idempotency key; requester/activity,
  store/activity, status/priority/activity, assignee/status/activity,
  category/activity.
- Messages: ticket/message number; ticket/ID; author/client-message key.
- Participants: user/ticket for “My tickets”.
- Events: ticket/time/ID and ticket/ID.
- Attachments and links: ticket/message and ticket/resource lookups.
- Notifications: due pending work, lease expiry, event/target deduplication,
  resolved recipient deduplication, unique linked email job.
- Start with indexed subject/ticket-number search. Add full-text message search
  only with the same visibility filtering and demonstrated need.

Enable and force RLS on ticket data. Revoke direct table access from PUBLIC,
anon, authenticated and the restricted Worker application role. Explicitly
revoke default PUBLIC/API-role execution on internal functions; grant only
reviewed session-checked member/admin operations to the Worker role.

Store-scope guards must permit support for inactive/expired/suspended stores
without relaxing their unrelated commerce restrictions. Account guards derive
identity from the existing session, not a posted user ID. Apply CSRF protection,
origin checks, size limits, abuse throttling and pagination.

Use explicit JSON read/write boundaries for Worker compatibility and bigint
number/revision values serialised as strings to avoid JavaScript precision loss.

Do not hard-delete support history through ordinary brand/admin UI. Define an
explicit retention/redaction policy, with shorter retention for attachments
and sanitised operational errors; do not claim a legal retention duration.
Give failed/abandoned quarantined files a cleanup process.

## 6. Screens and delivery order

Brand: Help & support -> My tickets -> New ticket -> Conversation.
Show ticket number, subject, topic, status, last update and unread replies.
Prefill safe page/theme/section/integration context, with a way to review it.
Keep ticket access available from the account header and onboarding, not only
the store sidebar. Use the existing flat ticket-style interface and in-app
confirmations.

Admin: Support inbox with status/category/store/assignee/priority filters,
unassigned and unread queues, conversation, private notes, assignment,
resolution and notification delivery status.

Suggested implementation sequence:

1. Reviewed migration, narrow access functions and durable notification/template
   integration, with tenant-isolation, retry and concurrency tests.
2. Brand/account/setup entry points plus admin inbox and conversation/closure
   flows. Ship creation/closure emails with this working ticket workflow.
3. Private attachments and richer theme/section context after upload policy and
   scanning checks; operational refinements based on actual support use.

Do not apply the schema or publish any phase without the required approval.
