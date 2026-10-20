# LeBrands.Store implementation journal

## 2026-10-20: Approved-document re-review activated in production

- With explicit owner approval, published compatible Worker version
  `96c64df1-6959-4712-af4d-5fdacac62edf`, confirmed 100% traffic and unchanged
  25 bindings/14 secrets/runtime compatibility, then applied only staged 0053.
- Migration committed successfully. Read-only verification confirms the recorded
  checksum matches the release, APP-only execute access, and the existing
  decision-email trigger and scheduler remain enabled.
- Live sign-in and review assets return 200; anonymous review requests remain
  protected/no-store. No real business documents, review decisions or email
  sends were used as release tests. Existing approval records are unchanged.

## 2026-10-20: Explicit re-review of approved documents, local

- Prepared staged migration `0053_business_review_reconsider.sql`, selected with
  `--staged-business-review-reconsider` and requiring recorded 0052. It adds an
  explicit approved-only, revision-checked reviewer function; the original
  decision function and prepared identity are unchanged.
- Admin approved-submission pages expose Review again only when the capability
  exists. Opening/cancelling performs no write. Recording requires a fresh
  decision, 10-1000-character note and manual examination confirmation.
- New decisions update reviewer/time, append immutable history marked as a
  re-review and reuse 0052's atomic email intent and existing delivery retries.
  Legacy approvals with absent reviewer metadata are supported without bulk
  resetting records. History now displays the saved decision notes.
- Seven focused checks passed, covering unchanged original guards, approved
  re-review, validation/origin restrictions, affiliated/non-reviewer denial,
  stale retries without duplicate mail, history, recipient intent and API-role
  grants. Actual private-review, publication and platform-login regression tests
  passed in isolated PGlite. Full-page synthetic re-review screenshot and managed
  Worker browser build succeeded.
- No shared migration, real document review, email delivery or publication.
  Awaiting explicit approval to publish compatible code then apply only 0053.

## 2026-10-20: Admin session recovery published

- With explicit owner approval, published version
  `ea196084-e792-4501-bdea-3ac6482ba20f` to the existing Cloudflare Worker;
  confirmed 100% traffic and unchanged 25 bindings, 14 secrets and compatibility.
- Live admin login serves the new brand/admin explanation. Anonymous admin,
  support and review routes remain protected and no-store. POST admin logout
  without a session clears the cookie and returns to admin sign-in;
  cross-origin logout remains HTTP 403. Admin CSS/JS return HTTP 200.
- No migration, credential reset, privilege grant or real-account session/data
  operation was performed during publication verification.

## 2026-10-20: Admin session recovery, local verification

- Diagnosed a brand session being rendered inside the admin support error frame.
  Read-only production checks confirmed the configured administrator is active
  and the relevant APP function grants exist; no credentials or grants changed.
- Unauthorized/expired admin requests now direct HTML visitors to explicit
  platform sign-in instead of showing a misleading signed-in admin shell.
  Support API requests retain authorization errors and tenant protection.
- Admin sign-out revokes the presented session before any admin-role check,
  allowing brand and revoked-admin sessions to leave the admin area. Missing
  sessions clear the cookie idempotently; CSRF and strict form checks remain.
  Business reviews now uses the same admin sign-out destination.
- Seventeen focused checks passed. A synthetic browser journey verified admin
  sign-in, populated overview and review queue, sign-out from both screens,
  cookie removal, protected-page return and the brand/admin explanation.
  Local Worker build and screenshot passed. Existing inline-style CSP warnings
  did not affect the journey; no policy was weakened.
- No production publication, schema/data writes, credential reset or permission
  elevation performed. This code-only fix awaits publication approval.

## 2026-10-20: Review-after-publication activated in production

- With explicit owner approval, published the compatible Cloudflare code before
  applying `0052_business_review_after_publication.sql` through its staged-only
  migration selection. The migration committed successfully to the existing
  shared Supabase database; its recorded SHA-256 matches the released source.
- Worker version `8b8f3200-f4e2-4c78-845d-2e1d5f7c83b0` serves 100% of traffic.
  Pre/post-release fingerprints confirm all 25 bindings, including 14 encrypted
  secrets, and runtime compatibility remain unchanged.
- Read-only schema checks confirm separate publication-readiness and approved
  authority functions, the active decision-email trigger, scheduler discovery
  and restrictive effective grants for public API roles.
- Thirty-two live admin/review/Ann/editor/dashboard assets and dependencies
  returned HTTP 200. Anonymous admin review and inline document requests redirect
  to login with `no-store`. No real business documents, store records, reviewer
  decisions, emails, orders or payment operations were used as release tests.
- Existing stores were not automatically published, resumed or approved.

## 2026-10-20: Staged review after publication and private admin viewer, local

- Prepared explicit staged migration `0052_business_review_after_publication.sql`
  and runner selection `--staged-business-review-after-publication`. It separates
  publication readiness from the existing approved-business financial authority.
  Pending, current security-screened submissions can publish; country, GST,
  correction, suspension and revocation controls remain independent.
- Preserved function identities and the first-publication Free clock; no legacy
  publication dates, subscriptions or store statuses are rewritten by migration.
- Added reviewer-only inline PDF/image responses with no-store, nosniff,
  same-origin framing and restrictive CSP, retaining attachment downloads.
  Admin UI offers collapsed document previews, approve/reject-and-correct
  decisions, required shared feedback and green confirmations.
- Approval/rejection now generates durable owner-email intents atomically with
  the decision. Existing queue retries/idempotency deliver professional escaped
  HTML/text messages. Recipient ownership/address are rechecked before sending.
  No real email, document or connected-account data was used in verification.
- Thirty focused checks passed across review, publication, Free subscriptions,
  onboarding recovery, Settings and transactional email. New SQL checks exercise
  pending publication, separate financial approval, correction without
  suspension, stale decisions without duplicate mail, tenant/API-role denial,
  recipient change and the unchanged 30-day clock. Browser builds and synthetic
  admin screenshots succeeded; no browser runtime errors.
- No shared database migration or publication performed. Existing production
  policy remains unchanged until separately approved activation. Suggested
  activation: publish compatible code first, then apply only this staged
  migration with the established runner, followed by read-only checks.

## 2026-10-20: Support ticket styling published

- Owner-approved version `4296fe19-25c4-4e17-91e5-f9b448250416` serves 100%
  of Cloudflare production traffic after `wrangler deploy --keep-vars`.
- All 25 bindings, including 14 encrypted secrets, and runtime compatibility
  settings match the pre-release snapshot.
- Six support assets/dependencies returned 200, including the new flat ticket
  CSS. Dashboard support/list-creation, account support and admin support retain
  sign-in protection; the API rejects anonymous access, all with no-store.
- No database migration, test emails or payment changes.

## 2026-10-20: Support ticket visual alignment, local

- Matched Help & support headers, list/filter/table surface, new-ticket form,
  conversation and side sections to the flat dashboard ticket treatment.
  Inner filters, tables, messages and replies do not add nested card boundaries.
- Preserved routes, forms, status workflow, email behavior and authorization.
- Four support-shell checks passed; browser asset build succeeded and the
  synthetic owner dashboard screenshot confirmed the ticket list appearance.
  The isolated fixture intentionally blocks dashboard store-data requests.
- Subsequently published with approval as recorded above; no migration needed.

## 2026-10-20: Adaptive Ann layout published

- User approved publication. Published `lebrands-store` using
  `wrangler deploy --keep-vars`; version
  `0462d949-825d-4e64-b0b6-1c8f32b6eeaa` serves 100% of production traffic.
- All 25 binding fingerprints, including 14 encrypted secrets, and runtime
  compatibility settings match the pre-publication snapshot.
- All 32 Ann entry assets and discovered dependencies returned HTTP 200;
  the live bundle includes the adaptive layout controller.
- Anonymous Ann access redirects to login with no-store; the support API
  continues to reject anonymous requests. No database migration or account,
  checkout, payment or email changes were performed.

## 2026-10-20: Ann adaptive conversation and preview split

- Added a layout-only controller: conversation focus uses an equal split and
  preview focus uses approximately 25/75, with a usable 320px conversation minimum.
  The desktop grid animates over 300ms and respects reduced motion.
- Added an accessible Lock layout toggle to the existing More menu. It preserves
  the current split and resumes the latest focused panel when unlocked. Phones
  retain their existing conversation/preview switch.
- Same-origin iframe document events are rebound after existing preview loads;
  stale listeners and pending gesture timers are cleaned up. Drag gestures defer
  resizing until completion. No iframe reload, draft mutation or forced focus.
- Existing fixed 1280px desktop preview fitting remains unchanged, preserving the
  selected viewport mode as workspace width changes.
- All 18 focused layout, toolbar, conversation and header checks passed.
  Refreshed stale conversation-test fixture bindings for existing plan/navigation
  helpers. The browser build and desktop/phone synthetic screenshots succeeded.
- No database migration. Subsequently published with approval as recorded above.

## 2026-10-20: Dashboard support placement published

- User explicitly approved publishing the dashboard integration.
- Published `lebrands-store` with `wrangler deploy --keep-vars`; version
  `1eacae8a-116b-4045-a81f-18a1a7dd08ab` is serving 100% of production traffic.
- Confirmed all 25 existing binding fingerprints, including 14 encrypted-secret
  bindings, and runtime compatibility are unchanged.
- Read-only live checks verified the new dashboard support/list-creation paths
  require sign-in, brand/admin legacy support routes retain sign-in protection,
  and the support API rejects anonymous access with 401 and no-store.
- All 14 dashboard/support entry assets and transitive bundle dependencies
  returned HTTP 200. Existing wildcard routes, queue and scheduled recovery
  remained configured.
- No database migration, real ticket creation, test email or merchant-setting
  change was performed for this publication.

## 2026-10-20: Help and support inside the brand dashboard

- Reused the existing dashboard shell for brand ticket lists, new tickets and
  conversations at `/stores/:storeId/support`. Sidebar and header remain visible,
  with Help & support selected and contextual list/new-ticket links.
- Existing `/support` links redirect to an authorized store dashboard after
  ticket-access checks. Brands without a store keep account-level support;
  platform-admin support remains in its existing admin frame.
- Store context comes from current session memberships. The support API,
  database functions, ticket permissions, notifications and schema are unchanged.
- Passed 14 isolated support checks, including dashboard rendering, legacy
  redirects, default store selection, anonymous access and membership denial.
  Dashboard/navigation and shell checks also passed; the mixed test command was
  interrupted by a tooling disconnect, so the support suite was rerun separately.
  Build and desktop synthetic screenshot verified. No real tickets/emails used.
- Preview-only dashboard store-API requests are explicitly blocked so synthetic
  support checks never fall through to shared merchant data.
- Local implementation complete. Cloudflare publication awaits approval; no
  database migration is required.

## 2026-10-20: Support ticketing production release

- User approved applying the support migration and publishing to Cloudflare,
  confirming `support@lebrands.store` as the admin support inbox.
- Applied only staged migration `0051_support_tickets.sql` through the existing
  manual Supabase runner. It committed successfully; the recorded checksum
  matches the source, all eight tables have forced RLS, 29 topics are seeded,
  effective API-role function access is denied and required APP execution grants
  are present. No tickets or notification intents existed at verification.
- Published with `pnpm exec wrangler deploy --keep-vars`. Production version:
  `c9f56bbc-161f-4b8a-ba49-f98e8058941c`, serving 100% of traffic.
- Compared production binding fingerprints before/after: all 25 unchanged,
  including 14 encrypted-secret bindings. Runtime compatibility, routes,
  scheduled recovery and queue configuration were retained.
- Live brand/admin support pages require their respective sign-in; unauthenticated
  APIs return 401 with no-store. Both support entry assets and all four current
  bundle dependencies return HTTP 200.
- No test ticket, real email, provider payment or merchant setting mutation was
  performed. Email recipient configuration and durable delivery are enabled;
  real provider delivery is not claimed without a live ticket.

## 2026-10-20: Support ticketing implementation

- Implemented account/pre-store and store-scoped support, with Created, Pending
  and Closed status, conversations, closing resolutions and reopening.
- Added the platform-admin inbox, assignment/priority/waiting controls and
  internal notes excluded from brand conversations and public activity.
- Added transactional creation/closure notification intents and private,
  recoverable preparation through the existing service-email queue. Recipient
  access is checked again before delivery; no real emails were sent.
- Prepared operator-applied migration `0051_support_tickets.sql`, including
  forced RLS, effective API-role revocation, private helpers, callable RPC
  allowlists and preserved email-claim function identity.
- Added flat ticket-style support screens and contextual entry points in
  account/store creation, dashboard, Ann and the theme editor. Attachments remain
  schema-only in this phase.
- Verification: 58 scoped support, admin, dashboard and email checks pass;
  browser creation/persistence, in-app draft protection, assignment, private
  notes, closing/reopening and phone layout were verified with synthetic data.
  Fixed the post-create busy guard, shared account-style CSP compatibility,
  a competing page-loader timeout and nullable metadata rendering.
- Browser tooling still emitted unmapped inline-style CSP warnings with empty
  source files. Raw ticket HTML contains only a nonce-protected style block,
  no inline style attributes and the self-hosted support module. No policy was
  weakened to silence those warnings. Application assets returned HTTP 200.
- The shared database migration and Cloudflare publication are pending explicit
  approval. No production data, deployment, secrets or provider settings changed.

## 20 October 2026: Merchant integration cleanup published

- Removed the receipt-inspection form, client request handler and technical
  result formatter from merchant settings. The protected read-only server
  endpoint and receiver logging remain available for assisted troubleshooting;
  their authentication, owner, origin, tenant and environment guards are unchanged.
- Added green success treatments shared by Ann and dashboard integrations.
  Pending checks retain amber styling and errors retain their error treatment.
  Replaced technical payment-state summaries with practical explanations,
  including whether customers can pay online. Successful activation no longer
  adds a redundant second Saved message.
- Updated connection, shipping, domain and save confirmations to explain the
  completed action in ordinary language. Payment controls now say online
  payments rather than online checkout; action IDs and server gates are unchanged.
- Twenty-five focused backend/privacy and merchant UI tests pass. Wrangler
  dry-run build passes. The managed API workflow restarted successfully and
  the native sign-in preview renders; proxy refusals in the drained frontend
  logs occurred during service restart before the successful requests.
- Published to Cloudflare after owner approval using keep-vars.
  Release: af00793f-444c-4bb9-b532-4af6106fd881.
  Live sign-in and merchant JavaScript return 200; the delivered JavaScript
  contains plain-language status messages and no receipt-inspection controls.
  Both CSS entry points import their current versioned bundles, which return
  200 and contain the green success styles.
- No credentials, database schema, account connections or actual payment
  settings were changed.

## 20 October 2026: Approved safe Razorpay diagnostics released

- Added owner-only, same-origin payment inspection to the existing Razorpay
  authorisation route. Receipt IDs are normalized and strictly validated.
  The handler uses SELECTs and one bounded provider GET only; no token rotation,
  financial operation, integration update or webhook verification write occurs.
- Responses explicitly whitelist payment status, amount, currency and time.
  Provider notes, customer contact details and credentials are omitted.
  Private responses use no-store caching. Expired or cross-environment grants
  fail closed without contacting the provider or refreshing authorisation.
- Added a compact disclosure in the existing ticket-style payment page rather
  than another boxed panel. Results remain expanded, receipt entry does not
  create unsaved settings, and the result explicitly distinguishes payment
  visibility from webhook delivery.
- Added fixed-stage receiver logging: signature/configuration failures,
  account routing, store processing and acknowledgement. No raw bodies,
  headers, signatures, account identifiers, SQL or exception messages are logged.
- Verification: seven diagnostic/security/privacy tests and fifteen dashboard
  UI tests pass; existing OAuth regression checks also pass. Wrangler dry-run
  build passes. Native Preview renders and managed services start cleanly.
- Deployed with keep-vars to lebrands-store. Final release:
  a2ebdd2f-ae6d-4bf7-8ab1-a9d949983c01.
  Production binding metadata and route patterns match the pre-release
  snapshot. No secret updates, migrations, checkout activation, charges,
  captures, refunds or synthetic matched-account events were performed.
- Live homepage/login return 200, unauthenticated inspection returns 401,
  and the delivered /assets/ann-launch-ui.js and bundled dependencies return
  200 with the new diagnostics. A deliberately unsigned agent-only probe
  returns 400 and produces the expected signature_check diagnostic; this
  does not demonstrate real Razorpay delivery.
- Current scoped store check still shows Live mode, webhook unverified and
  checkout off. The owner must run the private payment check in their existing
  production session before its receipt visibility can be established.

## 20 October 2026: Owner payment completed; partner delivery still unverified

- Owner supplied a receipt showing completion of the approved INR 1.00 Live
  Payment Link transaction. Did not create, charge, capture or refund anything
  through agent tools; instructed owner not to pay again.
- Scoped read-only production inspection found the current Stonescence grant
  connected/live, checkout disabled, webhook_verified=false and no accepted
  Razorpay event records. The resolver returns this store for its saved account
  and Live mode. APP has the needed event SELECT/INSERT, attempt SELECT and
  integration UPDATE privileges.
- Receipt business branding was not treated as proof of an account mismatch.
  Current reviewed partner documentation does not establish that a
  dashboard-created Payment Link necessarily generates this application's
  subscribed delivery; earlier instructions overstated that expectation.
- An exact-receipt GET inspection could not proceed because the local handoff
  context could not open the production credential envelope. No token or
  signing/encryption secret was printed, changed or requested. This is not
  evidence that the production grant is invalid.
- Historical edge-security lookup returned authz/unavailable. Started another
  bounded receiver retry watch; no historical request reconstruction claimed.
  No verified flag, checkout gate, migration or application code was changed.

## 20 October 2026: Corrected partner webhook log navigation

- Owner confirmed the merchant Developers/Webhooks list does not include the
  partner application webhook. Do not modify unrelated existing merchant hooks
  or create another webhook as a workaround.
- Read-only production Worker metadata showed no persistent Observability or
  Logpush configuration, so no historical collection was established.
- Started a bounded, transient Worker tail, emitting only time/method/status/
  outcome for the partner webhook path. A deliberate unsigned agent probe was
  rejected with HTTP 400 and observed by the live tail. This is not a
  Razorpay-sent event or a matched-account verification.
- JSON tail output omitted its normal connection banner, but the observed
  probe established capture. No application deployment, persistent logging
  configuration, migration, payment or checkout activation was performed.

## 20 October 2026: Approved Cloudflare UI release published

- Owner explicitly approved publishing the latest application code. Ran 42
  release-focused OAuth, Ann, navigation and browser delivery tests: all passed.
  Wrangler dry-run build passed. Comparing deployed/release server bundle
  sections found only `src/ui/dashboard.js` changed; database runtime modules
  were unchanged.
- Ran `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars`.
  Published main Worker version `655025e5-5a72-4e11-b9a8-52754abc207c`,
  with 14 new/modified static assets. Existing platform routes, queue and
  scheduled triggers were retained. No other product Worker was deployed.
- Post-release settings comparison found every existing binding unchanged,
  including all encrypted secrets and the five Live OAuth settings. Existing
  AI credential uses `OPENAI_API_KEY`, not the workspace handoff name.
  Production core auth, Turnstile, email, GST, scanner, billing and OAuth
  binding names were checked without exposing values.
- Homepage/login returned 200, empty callback 303, and five production Settings
  JavaScript dependencies loaded successfully with the flattened integration
  UI present. Invalid webhook signature returned 400; a signed synthetic
  unknown-account event returned 200. Separate Test receiver stayed healthy.
  Real merchant consent, matched Razorpay delivery and payments remain
  unverified. No checkout activation or merchant/order mutation.
- Read-only external Supabase metadata inspection found all 49 local migration
  filenames recorded, none pending, and both OAuth migration checksums correct.
  OAuth helper execution is granted to APP and denied to PUBLIC, anon,
  authenticated and service_role.
- Eight older local SQL files differ from their recorded checksums:
  `0012_aura_skeleton_sections.sql`, `0016_ann_foundation.sql`,
  `0020_catalogue_masters.sql`, `0022_catalogue_reviewed_references.sql`,
  `0023_d2c_variant_profiles.sql`, `0026_d2c_type_memberships.sql`,
  `0027_d2c_food_profile_corrections.sql`, `0028_d2c_descriptor_coverage.sql`.
  This is a history/source discrepancy, not evidence of pending migrations.
  Did not rerun migrations, rewrite checksums or claim complete SQL alignment.
  UI publication did not require a database runtime change.
- Cloudflare management token/zone provisioning settings are not configured
  in the Worker; custom-domain provisioning remains separately gated. Did not
  copy administrative database URLs, operator passwords or broad deployment
  credentials into runtime.
- Preview login screenshot showed the ticket layout. It reported a generic
  socket resource error; independent production page/module checks above
  passed. No authenticated browser journey was run for this code-only UI
  release.

## 20 October 2026: Live webhook binding completed with owner-approved shared value

- Owner explicitly confirmed that using the same signing value for Test and
  Live is intentional. Applied the Live-only secure entry to the main Worker's
  encrypted partner webhook binding, without changing the Test receiver.
- Before/after comparisons confirmed unchanged application code-module hashes,
  all unrelated bindings and runtime compatibility settings. No workspace
  application source was uploaded.
- External production checks: missing signature 400, incorrect signature 400,
  correctly signed synthetic unknown-account event 200/received=true, and
  tampered signed body 400. The unknown-account resolver path is read-only;
  no matched merchant or financial event was processed.
- Separate Test receiver health remained 200/configured/test. No checkout
  activation, merchant authorisation or customer/order mutation was performed.
- Configuration is complete; actual Live owner consent and Razorpay-sent,
  matched-account delivery remain unverified. A shared signing value is not
  cryptographic Test/Live separation; verify replay isolation before activation.

## 20 October 2026: Live client configuration applied; webhook remains pending

- After the secure replacement confirmation and runtime refresh, the Live
  webhook entry still compared equal to Test. Left that binding unwritten;
  the user's existing Razorpay webhook does not need recreation.
- Independently completed the approved client configuration: bound the Live
  client pair, live mode and production callback on the main Worker through
  individual Secret PUT operations. All four bindings are encrypted. Test
  values and the separate Test receiver were not changed.
- An earlier settings-only multipart PATCH using inherited bindings was
  rejected by Cloudflare with code 10057. No settings from that request were
  applied. Switched to the supported per-binding Secret API, without uploading
  workspace application code.
- Verified production code-module hashes and every unrelated binding remained
  unchanged. Full metadata equality differed because version annotations
  changed; compatibility date, flags and usage model were checked against the
  deployment before the four Secret updates and remained unchanged.
- Production login returned 200 and callback redirected to sign-in. The
  webhook receiver returns 503 while its signing secret is absent. The separate
  Test receiver remains configured in test mode and returns 200.
- No merchant data write, real OAuth consent, provider-sent event or checkout
  activation was performed. Live account consent and signing-secret resolution
  are still required; this is not end-to-end Live payment verification.

## 20 October 2026: Approved Live OAuth configuration blocked at preflight

- User approved configuration-only production changes with checkout kept off
  and confirmed the production webhook already exists with six selected events.
- Read-only Cloudflare inspection found the three OAuth credentials and mode
  absent on the main production Worker; its existing encryption binding was
  present. The deployment had one active version receiving all traffic.
- Separate Live entries were saved in the secure workspace secret flow.
  Boolean-only preflight confirmed the client pair differs from Test, but the
  Live webhook signing secret equals Test. A managed runtime refresh confirmed
  the finding.
- The operation stopped before any Cloudflare write, source upload, database
  change or payment activation. Request only a distinct Live webhook signing
  secret and update the existing Razorpay Live webhook, not the Test setup.
  Production configuration remains pending.

## 20 October 2026: Removed nested integration Settings card frames

- Corrected the layered boxes highlighted by the user: shared Settings
  rendering now omits the onboarding step frame and provider card frame.
  Each integration uses its existing single outer ticket surface, with a
  simple status row, spacing and divider inside.
- Removed repeated Razorpay headings from the account controls. Preserved
  provider data attributes, accessible group labels and all action handlers.
  Ann onboarding keeps its existing step presentation.
- All 23 focused launch/OAuth/navigation checks passed, including flat
  Settings rendering in disconnected, OAuth and legacy account states.
- Rebuilt assets through one managed API restart and visually confirmed the
  flattened Razorpay page using read-only synthetic data. No merchant data,
  authentication, payment state or production deployment changed.

## 20 October 2026: Razorpay integration Settings cleanup

- Applied the user-approved UI-only cleanup to the dedicated Razorpay Settings
  page: removed manual API-key setup, COD/Razorpay choice cards, Save choices
  and the repeated COD instruction. Checkout settings remains linked.
- Kept Connect/Reconnect, Refresh, Disconnect, account/readiness information and
  guarded online-payment activation. Existing verified legacy connections keep
  their controls and a preservation notice. No credentials or historical
  payment/refund handling were removed.
- Updated the ticket summary and sidebar instructions to match the focused
  account/readiness/activation workflow. Ann onboarding payment choices and
  other integration menus were left unchanged.
- All 23 focused client/navigation checks passed, covering disconnected,
  OAuth-connected and legacy-connected states. Rebuilt browser assets through
  the managed API restart and visually checked the read-only synthetic page.
- No merchant records, COD settings, real account authorisation, webhook state
  or production deployment were changed. Provider-sent Test delivery and Live
  readiness remain separate verification work.

## 20 October 2026: Native Preview routing and OAuth availability fixed

- The user's screenshots showed the Test redirect/webhook URLs configured,
  OAuth unavailable on the live dashboard, and a native Preview routing error.
  Kept Production OAuth configuration separate from the Test environment.
- Removed a legacy partial external-port mapping through schema validation and
  renamed the internal API artifact to distinguish it from the web preview.
  Managed service paths and ports were preserved.
- Found that the native Node account adapter had a separate environment
  allowlist without the OAuth settings. Added only the required OAuth/encryption
  bindings, preserving exclusion of administrative and platform billing secrets.
  Reused account-path classification so callback/session processing stays on
  the same native database path as login and authorisation start.
- Added synthetic regressions for configuration propagation and callback routing;
  seven focused checks passed. Restarted the web workflow to refresh its actual
  runtime and checked clean startup logs.
- External checks confirmed root/login HTTP 200 and dashboard/callback redirects
  to sign-in. The actual native readiness endpoint confirmed the restricted
  application role, database connectivity and OAuth availability. Verification
  queried system/schema metadata only, not merchant records.
- Captured the real login page in native Preview. No real OAuth consent,
  provider-sent delivery, live payment activation or main Worker deployment
  occurred. Owner consent remains the next step.

## 20 October 2026: Development pair refreshed, consent still required

- The user supplied the Development client pair again. Restarted the API
  service to refresh its environment and securely updated only the two OAuth
  credential bindings on the isolated Test receiver. Its Test signing secret,
  the main Worker, live routes and payment settings were unchanged.
- Copy-format checks found no outer whitespace, wrapping quotes or merchant-key
  prefix in place of an application ID. A sessionless authorisation-page
  request returned HTTP 200.
- The deliberately invalid-code token probe still returned HTTP 401. Correction
  to the earlier interpretation: this diagnostic is not conclusive evidence of
  an incorrect credential pair. Do not repeatedly request replacements based
  only on that probe; a real owner-consented code and exact registered callback
  are needed to finish verification.
- Verified the request format against Razorpay's published integration example.
  No real authorisation grant, token refresh, owner disconnect or provider-sent
  Test webhook has been verified yet. The next step is owner consent through
  a top-level preview tab and registration of the Test receiver.

## 20 October 2026: Test receiver deployed, provider credentials rejected

- Restarting the managed API service after the user's secret update refreshed
  the environment; the signing-secret length check then passed. Earlier failed
  checks had still seen an old runtime value, not necessarily the newly saved
  value. No secret values were inspected or printed.
- Deployed only the isolated Test webhook receiver on its Cloudflare workers.dev
  address and bound its required Test/encryption secrets securely through stdin.
  The main Worker and its routes were not deployed or changed.
- Eight external HTTP checks passed: configured Test health, unrelated-route
  rejection, method restriction, missing/wrong signature rejection, signed
  synthetic unknown-account acknowledgement, payload-tampering rejection and
  duplicate synthetic acknowledgement. Signed probes exercised the restricted
  Hyperdrive resolver without returning any merchant records.
- One real Razorpay token-endpoint request with a deliberately invalid consent
  code returned HTTP 401 indicating rejected client credentials. No grant was
  issued. This is not a completed merchant authorisation.
- An unauthenticated Development callback probe exposed a preview account-route
  omission. Fixed the preview classifier, added a regression check and confirmed
  the callback now redirects to account sign-in rather than returning 404.
  Seven focused preview/receiver checks passed; the API service restarted cleanly.
- Awaiting a matching Development client pair, owner consent and a provider-sent
  Test webhook. No live connection, order, payment or subscription was changed.

## 20 October 2026: Isolated OAuth Test receiver, external test blocked

- The user asked to proceed with real Test verification. Prepared a separate
  Cloudflare Test-only webhook entry and configuration, without storefront
  routes, assets, queues or scheduled jobs. It rejects Live mode, unrelated
  paths and invalid signatures before database client construction.
- Both receiver checks passed and Wrangler dry-run bundled successfully.
- A deployment preflight checked only credential presence and minimum-length
  booleans. The saved Test signing secret did not meet the receiver's minimum.
  The guard stopped before any Cloudflare deployment or secret upload.
- No live store connection, merchant data, production route or payment setting
  was changed. Actual provider consent and provider-sent webhook delivery remain
  unverified pending a valid Test signing secret and the owner's consent.

## 20 October 2026: Approved OAuth database migration

- With the user's explicit approval, applied the OAuth routing/refresh migration
  to the project's shared Supabase database using the existing administrative
  migration runner.
- Effective-permission verification exposed Supabase's direct default grants
  to API roles despite PUBLIC access being revoked. Kept the applied migration
  immutable and applied a targeted follow-on permissions migration for the same
  two internal functions. No global default privileges were changed.
- Verified both recorded migration checksums, fixed function search paths,
  SECURITY DEFINER status, application-role execution and denied execution for
  PUBLIC, anon, authenticated and service_role.
- Added a synthetic fixture reproducing Supabase's default function grants;
  the OAuth and migration-selection check run passed all 11 checks.
- Queried only migration/system metadata for verification. No merchant records
  were read or changed. No Worker deployment, Razorpay webhook creation,
  provider authorisation or payment activation was performed.

## 20 October 2026: Razorpay merchant OAuth implementation

- After the user confirmed correcting the test signing secret, included its
  name in the development Worker allowlist. No secret value was inspected and
  no external webhook, production configuration or migration was changed.

- Added owner-only authorisation, session/store-bound one-use state, encrypted
  tokens, explicit replacement confirmation, cancellation/replay protection and
  the existing separate Razorpay integration menu's Connect control.
- Preserved merchant API-key connections and platform billing keys. OAuth
  authorisation is not payment activation; test mode cannot accept customer
  payments. Checkout uses OAuth public tokens, Bearer API calls and the
  application-secret signature contract.
- Added committed refresh leases and token rotation outside financial
  transactions, local-first disconnect with explicit remote-revocation retry,
  and signed account/mode-isolated partner webhook routing.
- Staged the restricted read-only routing/refresh migration and documented
  development/Cloudflare secrets and webhook release steps in
  `docs/RAZORPAY_OAUTH.md`. This is source implementation, not a production
  migration, deployment or real provider authorisation.
- The isolated browser check covered Connect, test-mode activation denial,
  refresh, OAuth disconnect, read-only controls and mobile width. It found a
  stale callback-success notice after disconnect; the notice is now reconciled
  with actual grant state and has a focused regression test.
- Real consent, public webhook delivery and production release remain separate
  operations requiring configuration and approval.

## 20 October 2026: Section library, phase 4

- Implemented typed grid settings for ten reusable grid families: product and
  collection grids, related items, galleries, customer photos, logos, product
  sets, genuine reviews and fixed two-image comparisons.
- Added selected-block settings in the shared compact ticket-style Ann/theme
  workspace: four arrangements, responsive column counts, spacing, ratio,
  fit/focus, alignment, card treatment and displayed item count.
- Image cells support caption/body/link/alt editing, existing owned-media picker,
  add/duplicate/delete, direct pointer/touch/keyboard ordering and Undo. Catalogue
  and review cells select real store records; their prices, stock and review
  text are not freeform content. Product sets remain individually purchased,
  not a new bundle discount authority.
- Separated stable cell slots from array order, retaining the existing validated
  copy/media namespaces. Legacy grid overrides are mapped on first mutation;
  opening settings alone does not update a saved draft. Hidden image cells are
  retained when reducing the number shown.
- Added meaningful defaults for new grid text and formerly empty description/
  policy fields. Reserved fallback keys avoid shifting later legacy text edits.
  Explicit empty text overrides remain empty; save no longer refills cleared
  copy with neutral defaults.
- Added tenant checks for cell record references, bounded settings/items,
  validated links and fixed comparison count. No database migration required.
- Scope: controls apply to independently added reusable sections. Native theme
  fragments retain their existing structures; native-block adapters and other
  repeatable editors remain separate work, not claimed as complete here.
- Verification so far: 91 scoped checks passed, including actual Worker assets,
  both editor controllers, cell identity/media/formatting preservation, legacy
  mapping, malformed/cross-store references, real PGlite save/reload and stale
  revision rejection. After the final default/hidden-cell edge fixes, 33 affected
  checks were rerun and passed.
- One isolated browser journey passed: create gallery, configure four cells,
  edit caption, clear body intentionally, move/Undo/move, PATCH 200, reload and
  verify the same cell identity/text/image key/settings. The saved design was
  also checked in Ann. At 390px the dialog/controls were usable with no
  horizontal document overflow. Optional duplicate/delete/Undo was checked
  without publishing or saving that optional extra cell.
- Final screenshot confirmed the synthetic editor still renders after restart.
- No live merchant data access, external-service mutation or deployment.

## 20 October 2026: Section library, phase 3

- Added eight theme-inspired section arrangements plus Original, available for
  all 37 reusable content families. These are rendered adaptations of the
  trusted content model, not claims that legacy theme fragments were extracted.
- Library details now render a real sandboxed section preview using current
  store data and saved edits. One selected preview is rendered at a time.
  Source-theme browsing and the original neutral browse illustrations remain.
- Added a compact Layout action on independently added sections in the shared
  Ann/theme-editor workspace. Previewing or cancelling does not mutate drafts.
  Applying changes only the chosen instance's optional, allowlisted layout.
  IDs, text/media/formatting fields, source bindings, order and hiding remain
  unchanged; duplication retains the layout and session Undo can reverse it.
- Kept the original nested instance version compatible with existing drafts.
  Unknown layouts are rejected by the same server-side design validation.
  Cart/checkout and protected native cores are not made editable by this work.
- Added responsive scoped layout CSS and a script-free preview document using
  the same section renderer. Current page product/collection context is passed
  explicitly rather than always previewing the first record.
- Kept browser imports static under the existing cross-deployment bundle
  strategy. Initial optional-module imports exceeded the bounded graph check;
  static imports restored Ann to 11 versioned requests. Preview DOM creation
  remains deferred until a section detail opens.
- Verification: 80 scoped model/UI/rendering/persistence regressions passed,
  plus the actual Worker browser-graph test. One isolated browser journey passed
  real preview, cancellation, apply, Undo, save/reload and Ann/editor continuity;
  the 390px chooser had no horizontal overflow. Made Layout an accessible icon
  to avoid wrapping row labels. Browser evidence caught opaque-frame font CORS;
  corrected anonymous CORS on the three already-public, allowlisted font files
  without weakening iframe sandbox permissions or changing private responses.
  A focused Worker regression verifies the font-only boundary.
- No live merchant data, external-service mutations, database migrations or
  production deployment were performed.

## 20 October 2026: Section library, phase 2

- Added independent, bounded content-section instances inside the existing
  saved design JSON. Existing native section IDs, order, content and hidden
  settings remain compatible; no database migration is required.
- Shared Ann and standalone theme-editor library now inserts all 37 content
  families on Home, Collection, Product, About and Contact. Product/collection
  sections bind to actual store records or explicit current-page context.
  Header/footer remain global; transaction pages are not content canvases.
- Added between-section insertion controls, independent duplicate/delete,
  direct content editing and session Undo in both editors. Draft writes still
  happen only through Save draft and existing optimistic-concurrency guards.
- Implemented handle-only pointer/touch sorting, drag ghost, insertion marker,
  edge scrolling, drop animation, keyboard grab/move/drop and cancellation.
  Protected product/contact core sections stay first and cannot be hidden.
- Preview and storefront rendering use the same trusted instance renderer.
  Product prices/cards remain catalogue-owned rather than free text. Explicit
  bindings are checked against the tenant's draft catalogue on the server.
- Added isolated preview setup through the real synthetic evidence/design
  handlers, plus model, renderer, ownership, persistence and controller tests.
  Updated legacy test doubles to the current shared-workspace architecture.
- Verification: all 70 scoped automated checks passed, including restricted-role
  save/reload, stale-write, ownership and actual Worker browser-asset checks.
  One isolated browser journey passed insertion, independent text edits,
  keyboard/pointer reordering, Escape, delete/Undo, save/reload and continuation
  in Ann. Mobile touch start/cancel and width checks passed; protected cores
  and transaction-page exclusions were confirmed. No live order was placed.
- Browser evidence included desktop Ann and a 390px mobile editor. Expected
  sandboxed-srcdoc script warnings remained; no blocked module asset was
  observed. The tester noted intermittent blank/washed preview captures, with
  accessible content present and the final Ann desktop preview rendering.
- No live merchant data, migration, production publication or external service
  mutations were performed. Existing theme-specific layout variants remain a
  separate phase; the library illustrations are explicitly labelled diagrams.

## 20 October 2026: Section library, phase 1

- Added a presentation-only catalogue of 39 universal section families, eight
  content categories and a separate Store Layout category. Legacy aliases
  resolve to the new display names without changing saved section IDs or data.
- Shared Ann/theme-editor workspace now has a searchable library with category
  and theme filters, labelled neutral illustrations, source-layout lists and
  accurate current-page availability. Header/footer and unsupported insertions
  are view-only. Browsing never changes the store theme.
- Existing optional additions/removals use the established draft-plan path,
  require current-page edit access, and restore previously hidden optional
  sections when adding them. Failed changes do not display success.
- Dialog portals outside the workspace, preserves keyboard focus and search
  selection, supports Escape and mobile layout, and locks background scrolling.
- Added browser modules to the actual Worker asset gate and a development-only,
  read-only preview before database initialization. No merchant data used.
- Verification: 31 distinct focused checks pass across catalogue, event/state,
  section content, all-eight-theme rendering, workspace and Worker browser
  bundle delivery. Updated rendering-name expectations and a stale workspace
  assertion to the existing stronger access guard. Desktop 1280x850 and mobile
  390x844 screenshots passed. No authenticated save/reload browser journey
  claimed; callback checks use an in-process DOM boundary.
- Remaining phases: cross-page section instances and content binding, followed
  by real theme-layout previews and layout reuse. Diagrams are illustrations,
  not store screenshots or interactive layout selectors.
- No live database access, migration, publishing or production deployment.

**Created:** 19 October 2026  
**Date convention:** Africa/Cairo local dates  
**Historical coverage:** 11 September to 18 October 2026, covering 272 recorded commits  
**Ongoing record:** maintained as part of completed implementation work

**Command reference:** [integrations, deployment, migrations and operational commands](journal/COMMAND_REGISTER.md). Commands are labelled as observed, documented or supported references; a reference is not proof of execution.

## How to read this journal

This is a retrospective reconstruction followed by an ongoing journal. It was
assembled from Git history, the files changed at each checkpoint, existing phase
documents, and the work directly observed in this conversation.

- **Day numbers count recorded activity days**, not consecutive calendar days.
  Day 1 is the earliest recorded project scaffold, not proof that a functioning
  application existed then. Application-specific implementation first appears
  on 4 October.
- A gap means **no commits were found for those dates**. It does not prove that
  no discussions, research, deployments or external work occurred.
- **Recorded** means an implementation or change exists in a historical
  checkpoint. It does not by itself prove successful testing, migration or
  production deployment.
- **Verified** is used only where an actual verification result is available.
  A test file appearing in a commit is not a passing test result.
- Historical descriptions state the outcome **at that checkpoint**. Later
  entries can replace an earlier design or rule; earlier entries remain intact.
- Individual fixes, supporting assets, configuration changes and documentation
  updates are retained in the [complete checkpoint register](journal/COMMIT_REGISTER.md).
  Related changes are grouped below to keep the daily journal readable.
- This is an implementation journal, not a copy of private conversations,
  customer data, secrets, uploaded business documents or production logs.

## Timeline

| Day | Cairo date | Recorded commits | Main work |
| --- | --- | --- | --- |
| 1 | 11 September 2026 | 1 | Initial workspace scaffold |
| 2 | 4 October 2026 | 7 | Worker foundation, shared database and tenant isolation |
| 3 | 5 October 2026 | 3 | Accounts, password security and store setup |
| 4 | 6 October 2026 | 7 | Setup-save fixes, COD checkout, dashboard and invoices |
| 5 | 7 October 2026 | 1 | GSTIN and financial isolation refinements |
| 6 | 9 October 2026 | 2 | GSTIN provider requirements and reference assets |
| 7 | 11 October 2026 | 20 | GSTIN integration, approval boundaries and visual redesign |
| 8 | 12 October 2026 | 41 | Real preview, homepage, SEO, pricing and Aura page editor |
| 9 | 13 October 2026 | 23 | Aura content editing and bounded AI-builder infrastructure |
| 10 | 14 October 2026 | 16 | Starter-content library and reviewed visual assets |
| 11 | 15 October 2026 | 25 | Ann stages, guided setup, styles and design adoption |
| 12 | 16 October 2026 | 34 | Ann onboarding, provider setup and theme-editor continuity |
| 13 | 17 October 2026 | 48 | Languages, comparison page, five catalogue masters, SKUs and performance |
| 14 | 18 October 2026 | 44 | Business verification, billing, product media and form corrections |
| 15 | 19 October 2026 | Journal work in this update | Historical journal and maintenance instructions |

## Day 1: 11 September 2026

**Checkpoint count:** 1. **Classification:** initial scaffold.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Initial Replit workspace | Added the workspace packages, artifact scaffolds and development helpers. | Recorded. A starting environment existed; application-specific commerce implementation is not established by this commit. | [0c05d76](journal/COMMIT_REGISTER.md#commit-0c05d76) |

**Verification:** no historical execution result established from the commit alone.  
**Deployment:** not established.

## Day 2: 4 October 2026

**Checkpoint count:** 7. **Classification:** first recorded application-specific implementation.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Product requirements and Worker entry point | Recorded the product requirements, routing entry point, reserved names and dependency configuration. | Recorded. The application foundation and scope were defined. | [472b64c](journal/COMMIT_REGISTER.md#commit-472b64c), [d7dc4f2](journal/COMMIT_REGISTER.md#commit-d7dc4f2) |
| Shared PostgreSQL foundation | Authored initial schema, tenant-isolation policies, migration and seed scripts. | Recorded. Database setup was supplied as code, not evidence of a particular production migration. | [4adf1ab](journal/COMMIT_REGISTER.md#commit-4adf1ab) |
| Correct database connection boundaries | Removed the template database library and consolidated connection handling around the chosen Supabase Postgres setup. | Recorded. The project moved away from template database assumptions. | [782c967](journal/COMMIT_REGISTER.md#commit-782c967), [1a0c2b7](journal/COMMIT_REGISTER.md#commit-1a0c2b7) |
| Tenant-isolation test infrastructure | Added marked fixtures and restricted-role probes instead of testing against arbitrary merchant records. | Recorded. Repeatable isolation checks were authored. | [71f01f7](journal/COMMIT_REGISTER.md#commit-71f01f7) |

**Verification:** connection and database test files were recorded; their historical execution is not inferred.  
**Deployment:** not established.

## Day 3: 5 October 2026

**Checkpoint count:** 3.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Brand accounts | Added registration, login, sessions, account persistence and account isolation probes. | Recorded. Account flows and supporting schema were implemented. | [f38ccc4](journal/COMMIT_REGISTER.md#commit-f38ccc4) |
| Password and reset security | Added pepper-aware password handling and administrator reset support, with matching schema and documentation. | Recorded. Password storage and reset behaviour were hardened. Later runtime-specific guidance supersedes earlier assumptions. | [c7b504e](journal/COMMIT_REGISTER.md#commit-c7b504e) |
| Guided store setup | Added the setup UI, input validation, store repository, media handling, policies and draft/live boundaries. | Recorded. Merchant store-creation and publishing foundations were implemented. | [34ba63c](journal/COMMIT_REGISTER.md#commit-34ba63c) |

**Verification:** account, wizard and database checks are represented in the source. Existing phase documents also describe verification limits; production persistence is not inferred from a local preview.  
**Deployment:** not established.

## Day 4: 6 October 2026

**Checkpoint count:** 7.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Setup-save diagnosis and correction | Added structured diagnostics, field validation and safer wizard save handling. | Recorded. The reported setup-save failure received a targeted implementation and regression tests. | [efffeea](journal/COMMIT_REGISTER.md#commit-efffeea) |
| Cart and COD checkout | Added checkout routes, order persistence, totals/GST rules, stock handling and Turnstile integration. | Recorded. A COD ordering flow was implemented. | [47085d8](journal/COMMIT_REGISTER.md#commit-47085d8) |
| Merchant dashboard | Added dashboard routes, repository queries, product/order views, invoice rendering and merchant controls. | Recorded. Brands received an operational dashboard foundation. | [b91e6ef](journal/COMMIT_REGISTER.md#commit-b91e6ef) |
| Invoice write restrictions | Added tenant-checked financial operations and restricted invoice-write access. | Recorded. Invoice creation and mutation were separated from unrestricted application writes. | [8da10b8](journal/COMMIT_REGISTER.md#commit-8da10b8) |
| GSTIN and commerce validation | Added GSTIN checks, dashboard commerce rules and related schema/test changes. | Recorded. Tax-registration and invoice requirements were tightened. | [43dd165](journal/COMMIT_REGISTER.md#commit-43dd165) |
| Runtime configuration and investigation evidence | Updated Wrangler configuration and retained debugging references. | Recorded as configuration/support work, not an additional customer feature. | [53445ee](journal/COMMIT_REGISTER.md#commit-53445ee), [7d70be3](journal/COMMIT_REGISTER.md#commit-7d70be3) |

**Verification:** checkout, dashboard, setup-save, GSTIN and invoice-isolation tests were added or changed. Their presence is not treated as proof that every external service was exercised.  
**Deployment:** not established.

## Day 5: 7 October 2026

**Checkpoint count:** 1.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Mandatory GSTIN and isolation refinements | Refined the GSTIN migration, dashboard isolation fixtures and invoice security review. | Recorded. Registration requirements and tenant-bound financial operations were further aligned. | [ddac1b4](journal/COMMIT_REGISTER.md#commit-ddac1b4) |

**Verification:** supporting isolation/test changes are recorded; no new production execution result is established here.  
**Deployment:** not established.

## Day 6: 9 October 2026

**Checkpoint count:** 2. **Classification:** requirements and supporting evidence.

| Work | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| GSTIN provider requirements | Added reference material and visual evidence for the verification-provider work. | Requirements recorded. These asset-only commits do not establish a working provider integration. | [78b47f2](journal/COMMIT_REGISTER.md#commit-78b47f2), [da38d9b](journal/COMMIT_REGISTER.md#commit-da38d9b) |

**Verification:** no implementation test outcome established.  
**Deployment:** not established.

## Day 7: 11 October 2026

**Checkpoint count:** 20.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| GSTIN provider integration | Mapped provider responses into the application’s verification contract and added parser tests. | Recorded. Provider-specific registration data could be handled through a defined adapter. | [079f870](journal/COMMIT_REGISTER.md#commit-079f870), [ba52ae7](journal/COMMIT_REGISTER.md#commit-ba52ae7) |
| Initial store-approval controls | Added approval inputs, administrator utilities and staged database support. | Recorded. An earlier approval design was introduced; later business-document review work changes its scope. | [bbc1973](journal/COMMIT_REGISTER.md#commit-bbc1973) |
| GSTIN migration hardening | Refined mandatory GSTIN validation and migration behaviour. | Recorded. Migration and registration rules received additional safeguards. | [884d693](journal/COMMIT_REGISTER.md#commit-884d693), [df246c9](journal/COMMIT_REGISTER.md#commit-df246c9) |
| Invoice numbering and prefix isolation | Audited and tightened prefix updates and their financial-document boundaries. | Recorded. Numbering controls were reinforced without treating historical documents as editable drafts. | [aa74163](journal/COMMIT_REGISTER.md#commit-aa74163) |
| Dashboard redesign | Reworked dashboard presentation, local fixtures, navigation-related views and brand styling. | Recorded. A more professional commerce-admin presentation replaced earlier styling. | [d58aea5](journal/COMMIT_REGISTER.md#commit-d58aea5), [b0a7ce1](journal/COMMIT_REGISTER.md#commit-b0a7ce1), [0801b7e](journal/COMMIT_REGISTER.md#commit-0801b7e) |
| Homepage rebuild and motion | Added marketing layouts, showcase assets, typography, preview interactions and successive motion/style refinements. | Recorded. The marketing homepage and its visual demonstrations were rebuilt iteratively. | [aa652c5](journal/COMMIT_REGISTER.md#commit-aa652c5), [8b30510](journal/COMMIT_REGISTER.md#commit-8b30510), [228a48b](journal/COMMIT_REGISTER.md#commit-228a48b), [a79fb43](journal/COMMIT_REGISTER.md#commit-a79fb43) |

**Verification:** provider, marketing and related regression tests are recorded. Asset uploads and design briefs are separately listed in the register.  
**Deployment:** not established for individual changes.

## Day 8: 12 October 2026

**Checkpoint count:** 41.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Real application in Replit Preview | Added the local application preview and registered the web artifact with appropriate development routing. | Recorded. Preview was connected to the actual product rather than only a sample gallery. | [8de1e61](journal/COMMIT_REGISTER.md#commit-8de1e61), [9b9e4d9](journal/COMMIT_REGISTER.md#commit-9b9e4d9) |
| Homepage showcase refinement | Reworked showcase composition, responsive media, carousel/flow elements and dashboard visuals. | Recorded. Multiple iterations improved the marketing demonstrations. | [183cb69](journal/COMMIT_REGISTER.md#commit-183cb69), [13a1c0c](journal/COMMIT_REGISTER.md#commit-13a1c0c), [5a0bc88](journal/COMMIT_REGISTER.md#commit-5a0bc88), [d934f1c](journal/COMMIT_REGISTER.md#commit-d934f1c) |
| Platform branding and favicon | Updated logo delivery and light/dark favicon handling with branding tests. | Recorded. Platform identity received consistent asset handling. Search-engine cache refresh is not inferred. | [295d34c](journal/COMMIT_REGISTER.md#commit-295d34c), [78d7f17](journal/COMMIT_REGISTER.md#commit-78d7f17) |
| Platform information and public SEO | Added platform information/legal presentation, metadata, crawler files, sitemap and AI-facing public information. | Recorded. Public discovery and information surfaces were authored with private-route boundaries. | [ce3f365](journal/COMMIT_REGISTER.md#commit-ce3f365), [e7b45d4](journal/COMMIT_REGISTER.md#commit-e7b45d4) |
| Aura pages and theme editor | Added page/section schemas, media-aware editing, staged approval coordination and persistent page support. | Recorded. A structured storefront page editor and schema foundation were implemented. | [e45556a](journal/COMMIT_REGISTER.md#commit-e45556a), [d50e130](journal/COMMIT_REGISTER.md#commit-d50e130), [bd9599b](journal/COMMIT_REGISTER.md#commit-bd9599b) |
| Rollback support for page schema | Authored down-migration support and rollback fixtures/tests. | Recorded. A rollback implementation was supplied; no actual production rollback is asserted. | [e21767b](journal/COMMIT_REGISTER.md#commit-e21767b) |
| Live preview | Added development preview plumbing and editor-state handling. | Recorded. Editor changes gained a live-preview path. | [d573a38](journal/COMMIT_REGISTER.md#commit-d573a38) |
| Account and commerce polish | Aligned account entry, storefront commerce components and editor/wizard presentation. | Recorded. Shared UI surfaces were refined together. | [e88048d](journal/COMMIT_REGISTER.md#commit-e88048d), [e05f713](journal/COMMIT_REGISTER.md#commit-e05f713) |
| Pricing page and platform surfaces | Added pricing cards/limits presentation and revised platform backgrounds and theme styling. | Recorded. Commercial information gained a dedicated public presentation, not payment authority. | [4b8ee10](journal/COMMIT_REGISTER.md#commit-4b8ee10), [3f9af21](journal/COMMIT_REGISTER.md#commit-3f9af21), [722865a](journal/COMMIT_REGISTER.md#commit-722865a) |
| AI-builder boundaries | Recorded bounded build usage and image-generation expectations. | Decision/documentation recorded. This is not evidence that every proposed capability was enabled. | [3e25c71](journal/COMMIT_REGISTER.md#commit-3e25c71), [1eb4ebb](journal/COMMIT_REGISTER.md#commit-1eb4ebb) |
| Native commerce section library | Added Aura skeleton sections and supporting schema for richer product and collection pages. | Recorded. Additional native storefront building blocks became part of the editor implementation. | [4688957](journal/COMMIT_REGISTER.md#commit-4688957) |

**Verification:** numerous preview, branding, SEO, editor, database, pricing and layout tests were authored or updated. No blanket historical pass claim is made.  
**Deployment:** not established per feature.

## Day 9: 13 October 2026

**Checkpoint count:** 23.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Aura section completion and defaults | Added collection controls/pagination-related sections and corrected starter/editor defaults. | Recorded. The page skeleton and default design handling were extended. | [01542f5](journal/COMMIT_REGISTER.md#commit-01542f5), [4c35b11](journal/COMMIT_REGISTER.md#commit-4c35b11) |
| Product and collection content editing | Connected content models, dashboard/editor forms, store rendering and migration selection. | Recorded. Structured catalogue-page content gained an editing and rendering path. | [ed1faaa](journal/COMMIT_REGISTER.md#commit-ed1faaa) |
| Bounded AI-builder contract | Defined what the builder may generate and which application controls remain server-owned. | Decision and implementation contract recorded. Generation was not allowed to redefine business/security controls. | [ed187c5](journal/COMMIT_REGISTER.md#commit-ed187c5), [1ab4f7b](journal/COMMIT_REGISTER.md#commit-1ab4f7b) |
| AI build infrastructure | Added staged schema, permissions/entry routes and build-processing implementation. | Recorded. AI building gained a controlled application service foundation. | [e4f2c97](journal/COMMIT_REGISTER.md#commit-e4f2c97) |
| Transactional email infrastructure | Added staged email schema, templates, token handling, worker/service delivery, account/staff routes and webhook processing. | Recorded. Transactional messaging gained an application delivery foundation; provider delivery is not inferred from committed code. | [e4f2c97](journal/COMMIT_REGISTER.md#commit-e4f2c97) |
| AI output validation and draft flow | Refined planning, completion, batching, prefill and bounded output handling. | Recorded. Repeated generation and draft-assembly issues received targeted changes. | [48f9876](journal/COMMIT_REGISTER.md#commit-48f9876), [6da9f41](journal/COMMIT_REGISTER.md#commit-6da9f41), [5313fb9](journal/COMMIT_REGISTER.md#commit-5313fb9), [08726a7](journal/COMMIT_REGISTER.md#commit-08726a7) |
| Supporting design references | Added visual references throughout the day. | Assets recorded; no runtime outcome is inferred from an attachment alone. | See the full register for this date. |

**Verification:** Aura/content and AI-output regression test changes are recorded. External-model availability and real production generation results are not established by commit subjects alone.  
**Deployment:** not established.

## Day 10: 14 October 2026

**Checkpoint count:** 16.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Starter-library draft | Added an initial SQL design and reviewed content/asset inputs. | Draft recorded before integration; draft SQL is not treated as applied schema. | [4e0abfe](journal/COMMIT_REGISTER.md#commit-4e0abfe) |
| Aura starter-content library | Added a staged migration, library-building script, editor/wizard integration and starter-library documentation. | Recorded. A prefilled library became available through application code. | [e2ff1c5](journal/COMMIT_REGISTER.md#commit-e2ff1c5) |
| Starter preview and editing | Refined image-aware previews, content selection and editor handling. | Recorded. Starter content was connected more closely to the editing experience. | [a87466e](journal/COMMIT_REGISTER.md#commit-a87466e), [7544ae3](journal/COMMIT_REGISTER.md#commit-7544ae3) |
| Asset review and correction | Added and revised content briefs, collages and visual bundles. | Supporting assets recorded. Imported data files are not copied into this journal. | See the full register for this date. |

**Verification:** starter-library test changes are recorded. The journal does not reproduce uploaded database exports or infer their production state.  
**Deployment:** not established.

## Day 11: 15 October 2026

**Checkpoint count:** 25.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Ann entry and early stages | Added builder routing, initial stage documentation, style-studio entry and validation. | Recorded. The Ann-led store-building direction entered the application. | [7d9413f](journal/COMMIT_REGISTER.md#commit-7d9413f), [7cc57bd](journal/COMMIT_REGISTER.md#commit-7cc57bd), [293836b](journal/COMMIT_REGISTER.md#commit-293836b) |
| Ann database foundation | Added reference seeds, staged foundation schema and migration corrections. | Recorded. Ann’s persistent reference foundation was authored. | [5cac4b5](journal/COMMIT_REGISTER.md#commit-5cac4b5), [aba0b6c](journal/COMMIT_REGISTER.md#commit-aba0b6c) |
| Guided conversation and planning | Added stage-four/five builder logic, preview fixtures and readiness progression. | Recorded. Merchant answers could drive a guided planning and preview experience. | [6eff796](journal/COMMIT_REGISTER.md#commit-6eff796), [9f9e570](journal/COMMIT_REGISTER.md#commit-9f9e570) |
| Product completion and launch readiness | Added stage-six UI and subsequent readiness/product-entry refinements. | Recorded. Ann advanced beyond visual selection toward store setup completion. | [74f2fcc](journal/COMMIT_REGISTER.md#commit-74f2fcc), [347bf53](journal/COMMIT_REGISTER.md#commit-347bf53), [08f9032](journal/COMMIT_REGISTER.md#commit-08f9032) |
| Style showcases and category-aware copy | Added themed assets, style profiles, interactions and category-specific demonstration content. | Recorded. Style previews became richer and more relevant to the merchant’s product category. | [1a56018](journal/COMMIT_REGISTER.md#commit-1a56018), [600a140](journal/COMMIT_REGISTER.md#commit-600a140), [bfc6e46](journal/COMMIT_REGISTER.md#commit-bfc6e46) |
| Design adoption and editing | Connected Ann design choices to persistent design application and editor controls. | Recorded. Chosen designs gained a route into the saved draft/editor. | [0569ca4](journal/COMMIT_REGISTER.md#commit-0569ca4) |
| Additional product-first styles | Extended style composition and the associated copy/validation rules. | Recorded. The style system was expanded beyond its original presentations. | [4f48030](journal/COMMIT_REGISTER.md#commit-4f48030) |
| Worker array serialization | Added explicit serialization at Ann’s database/runtime boundary. | Recorded. An environment-specific persistence boundary received a focused fix and test. | [9a46d8d](journal/COMMIT_REGISTER.md#commit-9a46d8d) |

**Verification:** foundation, category-copy, showcase, design and serialization test changes are recorded.  
**Deployment:** not established per stage.

## Day 12: 16 October 2026

**Checkpoint count:** 34.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Ann layout and current-flow refinements | Updated builder layout, starter selection and the documented onboarding sequence. | Recorded. The conversation and preview arrangement was refined. | [500a2e5](journal/COMMIT_REGISTER.md#commit-500a2e5), [af70be5](journal/COMMIT_REGISTER.md#commit-af70be5) |
| Launch setup and commerce runtime | Added staged launch/runtime support and payment, delivery and custom-domain setup coordination. | Recorded. Merchant-owned provider setup gained implementation support; live provider configuration is not assumed. | [08799ef](journal/COMMIT_REGISTER.md#commit-08799ef), [a720592](journal/COMMIT_REGISTER.md#commit-a720592) |
| Browser preview and brand controls | Added a dedicated browser-preview surface and logo/branding controls. | Recorded. Merchants gained more direct preview and brand-identity tools. | [25eeceb](journal/COMMIT_REGISTER.md#commit-25eeceb), [c8fbb9c](journal/COMMIT_REGISTER.md#commit-c8fbb9c) |
| Ann-led application and GSTIN onboarding | Reworked application, registered-business lookup and reply/launch controls. | Recorded. Business setup was moved further into the guided flow. | [c505d22](journal/COMMIT_REGISTER.md#commit-c505d22), [e7504ab](journal/COMMIT_REGISTER.md#commit-e7504ab), [47fcad3](journal/COMMIT_REGISTER.md#commit-47fcad3), [d0b4f17](journal/COMMIT_REGISTER.md#commit-d0b4f17) |
| GSTIN response persistence | Corrected serialization/handling of verified-registration results. | Recorded. Registered-business information received a runtime-boundary regression fix. | [ceaf1a2](journal/COMMIT_REGISTER.md#commit-ceaf1a2) |
| Homepage and pricing iterations | Refined homepage demonstrations, media, marketing scripts and pricing presentation. | Recorded. Public-facing presentation continued to track the Ann product experience. | [3c9ecaf](journal/COMMIT_REGISTER.md#commit-3c9ecaf), [972549c](journal/COMMIT_REGISTER.md#commit-972549c), [a7b9c3f](journal/COMMIT_REGISTER.md#commit-a7b9c3f), [498826d](journal/COMMIT_REGISTER.md#commit-498826d) |
| Theme-editor draft continuity | Added dedicated draft storage and connected the Ann design to the theme editor. | Recorded. Saved designs and subsequent editor work received a common persistence path. | [114d171](journal/COMMIT_REGISTER.md#commit-114d171) |
| Editor content, sections and consent | Refined design editing, section layout/content, preview state and consent handling. | Recorded. The editor’s controls and saved design were progressively aligned. | [0d549e0](journal/COMMIT_REGISTER.md#commit-0d549e0), [f4a4cf8](journal/COMMIT_REGISTER.md#commit-f4a4cf8), [10d581f](journal/COMMIT_REGISTER.md#commit-10d581f), [d65bf74](journal/COMMIT_REGISTER.md#commit-d65bf74), [1466f49](journal/COMMIT_REGISTER.md#commit-1466f49) |
| Further registration and input fixes | Refined GSTIN/onboarding responses and input validation. | Recorded. Follow-up registration and validation issues were addressed in code. | [193d18d](journal/COMMIT_REGISTER.md#commit-193d18d), [16033c5](journal/COMMIT_REGISTER.md#commit-16033c5) |

**Verification:** layout, onboarding, design/editor and input regression coverage is recorded. Reference-only updates are included in the register.  
**Deployment:** not established per feature.

## Day 13: 17 October 2026

**Checkpoint count:** 48.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Dashboard navigation and Ann entry | Reworked navigation, dashboard routes and builder entry/controls. | Recorded. Dashboard-to-builder navigation and the admin layout were refined. | [f7e3c93](journal/COMMIT_REGISTER.md#commit-f7e3c93), [165f19d](journal/COMMIT_REGISTER.md#commit-165f19d), [c1786a8](journal/COMMIT_REGISTER.md#commit-c1786a8) |
| Embedded product and collection forms | Connected catalogue forms to Ann, including frame headers, reference loading and modal handling. | Recorded. Merchants could manage catalogue records without abandoning the guided flow. | [46b14ae](journal/COMMIT_REGISTER.md#commit-46b14ae), [283cc9b](journal/COMMIT_REGISTER.md#commit-283cc9b), [2bcc0f0](journal/COMMIT_REGISTER.md#commit-2bcc0f0), [f922e50](journal/COMMIT_REGISTER.md#commit-f922e50) |
| Ann’s five-language support | Added language modules, regional translations and associated UI/test changes. | Recorded. Conversation translation support was implemented; later entries address missed conditional strings. | [a1fd343](journal/COMMIT_REGISTER.md#commit-a1fd343), [c1a8993](journal/COMMIT_REGISTER.md#commit-c1a8993) |
| Platform comparison page | Added comparison data, calculation/presentation logic, regional/source corrections and successive cleanup. | Recorded. A public competitor-comparison surface was implemented and revised, including removal of redundant UI. | [12fa5b6](journal/COMMIT_REGISTER.md#commit-12fa5b6), [222fb6e](journal/COMMIT_REGISTER.md#commit-222fb6e), [b7ef413](journal/COMMIT_REGISTER.md#commit-b7ef413), [a4237e4](journal/COMMIT_REGISTER.md#commit-a4237e4), [75e70f0](journal/COMMIT_REGISTER.md#commit-75e70f0) |
| Homepage typography and Ann demonstration | Updated marketing typography and the showcase presentation. | Recorded. The homepage’s type and guided-build demonstration were revised. | [effb9fa](journal/COMMIT_REGISTER.md#commit-effb9fa), [4715a17](journal/COMMIT_REGISTER.md#commit-4715a17) |
| Five catalogue masters: audit | Audited source lists and documented category, subcategory, product type, variants and descriptors. | Audit/proposal recorded. Unreviewed source mappings were not treated as approved truth. | [bbfdb9c](journal/COMMIT_REGISTER.md#commit-bbfdb9c) |
| Five catalogue masters: schema and forms | Added master seed/migration support, catalogue-prefixed references and product-form/API bindings. | Recorded. The classification hierarchy became available through persistent references and forms. | [a13ec4e](journal/COMMIT_REGISTER.md#commit-a13ec4e), [e43b53f](journal/COMMIT_REGISTER.md#commit-e43b53f) |
| Reviewed catalogue population | Added reviewed reference seeds and population reporting. | Recorded. Approved mappings gained a controlled import path. | [a82c738](journal/COMMIT_REGISTER.md#commit-a82c738) |
| D2C variant coverage | Added variant profiles, values and audit logic. | Recorded. Product-type variant coverage was expanded; no current live row count is inferred here. | [2254833](journal/COMMIT_REGISTER.md#commit-2254833) |
| Product-type memberships and descriptors | Added missing type-membership mappings, descriptor profiles/values and auditing. | Recorded. Product-type-specific options and descriptive details gained broader coverage. | [438379b](journal/COMMIT_REGISTER.md#commit-438379b), [002ded3](journal/COMMIT_REGISTER.md#commit-002ded3) |
| Storefront product details | Connected saved descriptors and catalogue details to product rendering across styles. | Recorded. Merchant product details gained a public rendering path. | [570bba4](journal/COMMIT_REGISTER.md#commit-570bba4) |
| SKU-aware checkout | Added variant-aware checkout/inventory coordination and schema support. | Recorded. SKU identity, pricing and stock received distinct operational handling. | [e313513](journal/COMMIT_REGISTER.md#commit-e313513) |
| SKU inventory dashboard | Added inventory views, maintenance controls and stock summaries. | Recorded. Variant stock gained operational dashboard visibility and controls. | [6a57afd](journal/COMMIT_REGISTER.md#commit-6a57afd), [3ebb4b4](journal/COMMIT_REGISTER.md#commit-3ebb4b4) |
| Product-form interaction corrections | Refined classification controls, reference loading, variant generation and in-app confirmations. | Recorded. Repeated form and modal interaction issues received targeted corrections. | [403c019](journal/COMMIT_REGISTER.md#commit-403c019), [1eb993a](journal/COMMIT_REGISTER.md#commit-1eb993a) |
| Navigation loading and browser delivery | Added navigation feedback, corrected module delivery and introduced bundled/versioned browser assets. | Recorded. Navigation gained loading feedback and a more efficient module-delivery path. | [48e35d6](journal/COMMIT_REGISTER.md#commit-48e35d6), [eb12199](journal/COMMIT_REGISTER.md#commit-eb12199), [25e8f67](journal/COMMIT_REGISTER.md#commit-25e8f67), [e56b871](journal/COMMIT_REGISTER.md#commit-e56b871) |
| White hero and builder toolbar | Revised hero styling and reorganised Ann’s style/page-preview controls. | Recorded. The visual trial and builder-control rearrangement were implemented. | [9378f93](journal/COMMIT_REGISTER.md#commit-9378f93), [4ec5fde](journal/COMMIT_REGISTER.md#commit-4ec5fde) |
| Self-service FAQ and approval wording | Updated public metadata/FAQ wording about merchant setup and the earlier approval model. | Recorded. Public claims were revised; this does not cancel the later business-document review requirement. | [b7dee9a](journal/COMMIT_REGISTER.md#commit-b7dee9a), [d77d8f3](journal/COMMIT_REGISTER.md#commit-d77d8f3) |

**Verification:** extensive catalogue, SKU, language, rendering and navigation regression changes are recorded. Historical database counts and applied migration state are not reconstructed from code alone.  
**Deployment:** not established per feature.

## Day 14: 18 October 2026

**Checkpoint count:** 44.

| Implementation | How, briefly | Outcome at checkpoint | Evidence |
| --- | --- | --- | --- |
| Smooth storefront-preview transitions | Refined motion and showcase interactions with dedicated regression coverage. | Recorded. Shared preview transitions were adjusted to provide smoother theme/section movement. | [1e7c9f7](journal/COMMIT_REGISTER.md#commit-1e7c9f7) |
| Country-aware registration | Added country/phone schema, registration validation and account UI changes. | Recorded. Country, calling-code and phone-format requirements became part of account registration. | [6a69779](journal/COMMIT_REGISTER.md#commit-6a69779) |
| Private business-document submission | Added staged document schema, storage/policy boundaries and country-aware evidence handling. | Recorded. Businesses gained a private evidence-submission path. | [6d0068f](journal/COMMIT_REGISTER.md#commit-6d0068f) |
| Ann and editor access gates | Added staged editor-access support and gated builder/editor entry around business-verification progress. | Recorded. Access was coordinated with the onboarding evidence steps. | [41dae87](journal/COMMIT_REGISTER.md#commit-41dae87) |
| Document retention policy | Added retention policy/version support and submission UI explanations. | Recorded. The agreed onboarding/subscription retention direction became explicit. Post-cancellation retention remains a separate policy decision. | [27f7c0f](journal/COMMIT_REGISTER.md#commit-27f7c0f) |
| Managed private scanning | Added Cloudmersive screening, readiness checks, file limits and scanner diagnostics. | Recorded. Security screening was introduced separately from manual business approval and remains fail-closed. | [f6f672e](journal/COMMIT_REGISTER.md#commit-f6f672e), [1fbc2b4](journal/COMMIT_REGISTER.md#commit-1fbc2b4) |
| Restricted administrator review | Added reviewer administration, staged review schema, review routes and review controls. | Recorded. Manual document decisions gained a restricted review surface; a broad administrator dashboard was not implied. | [ec9b513](journal/COMMIT_REGISTER.md#commit-ec9b513) |
| Submission and go-live progression | Refined document entry and the Ann business gate. | Recorded. Submitted evidence could permit continued building, while approval remained required before going live. | [0299faf](journal/COMMIT_REGISTER.md#commit-0299faf), [765ea93](journal/COMMIT_REGISTER.md#commit-765ea93) |
| Legacy account country | Added a controlled legacy-country migration and verification tests. | Recorded. Existing-account country corrections had an explicit migration path without inventing missing phone numbers. | [ee81cd2](journal/COMMIT_REGISTER.md#commit-ee81cd2) |
| Worker scanner compatibility fixes | Revised scanner request/redirect handling and error responses. | Recorded. Worker-specific provider connectivity issues received targeted corrections. Successful live screening is not inferred from code changes. | [379d471](journal/COMMIT_REGISTER.md#commit-379d471), [8318137](journal/COMMIT_REGISTER.md#commit-8318137) |
| Subscription commercial configuration | Documented country-price/feature proposals and commercial rules, with validation coverage. | Proposal/decision recorded. Not every proposed country, price or allowance is treated as approved or charge-enabled. | [1a9fe70](journal/COMMIT_REGISTER.md#commit-1a9fe70), [5cf9574](journal/COMMIT_REGISTER.md#commit-5cf9574), [9ad4035](journal/COMMIT_REGISTER.md#commit-9ad4035), [a1e2348](journal/COMMIT_REGISTER.md#commit-a1e2348) |
| Platform billing schema | Added staged plan, price, feature, subscription and payment infrastructure. | Recorded. Platform billing gained its own data foundation. | [0141f70](journal/COMMIT_REGISTER.md#commit-0141f70) |
| Free subscription service | Added the Free-plan service and database operations. | Recorded. The agreed offer preserved 100 published products, 1,000 published SKUs, 30 live days from first successful publication, and no LeBrands.Space placement. | [d7f4602](journal/COMMIT_REGISTER.md#commit-d7f4602) |
| Ann plan-selection modal | Added selection/access coordination after store-name selection and refined the conversation entry point. | Recorded. Plan selection became part of Ann rather than only a dashboard destination. | [b13ecd6](journal/COMMIT_REGISTER.md#commit-b13ecd6), [752c822](journal/COMMIT_REGISTER.md#commit-752c822) |
| Pricing and dashboard billing access | Added authenticated billing entry and the dashboard’s Plan & billing surface. | Recorded. Brands gained pricing-page and dashboard paths to plan management. | [84e286b](journal/COMMIT_REGISTER.md#commit-84e286b) |
| Razorpay sandbox checkout | Added test-checkout schema/configuration and sandbox checkout handling. | Recorded. Test payments are evidence only: they do not grant a live paid subscription or issue a tax invoice. Recurring payments remain deferred. | [5926e59](journal/COMMIT_REGISTER.md#commit-5926e59), [c39e2a3](journal/COMMIT_REGISTER.md#commit-c39e2a3) |
| Plan-card presentation | Replaced dense billing presentation with plan cards and monthly/yearly selection. | Recorded. Plan comparisons and selection actions gained a clearer UI. | [de522ca](journal/COMMIT_REGISTER.md#commit-de522ca) |
| Brand-logo controls and translation coverage | Restored/refined Ann branding controls and translated conditional onboarding prompts and system replies. | Recorded. Missing logo and language paths received focused fixes. | [a5497cf](journal/COMMIT_REGISTER.md#commit-a5497cf), [3a444db](journal/COMMIT_REGISTER.md#commit-3a444db) |
| Professional product-media uploader | Added shared dashboard/Ann upload, 4:5 crop/fit preview, WebP optimisation, video support, replacement, ordering, retry and database associations using existing Cloudflare R2. | **Verified in this conversation:** save/reload, conversion with an audio stream, replacement, retry, cover rules and mobile layout passed in an isolated fixture. | [17af616](journal/COMMIT_REGISTER.md#commit-17af616) |
| Product-form dropdowns and stock clarity | Added Draft/Active, vendor/maker and origin-country dropdowns; made valid variant stock display as a calculated total. | **Verified in this conversation:** 17 targeted tests, build/type checks and a rendered-form check passed. Base and per-variant stock persisted through reload. | [9adc763](journal/COMMIT_REGISTER.md#commit-9adc763) |

### Directly observed verification and boundaries

- Product-media browser checks used an isolated local fixture, not real merchant
  records. They covered crop cancellation/pan/zoom, WebP output, an honest original
  MP4 fallback, supported WebM conversion with an Opus audio stream, cover guards,
  in-place replacement, failed-upload retry, draft save/reload and mobile layout.
- The uploader supports up to eight items at 10 MB each. The first item is an
  image. Browser conversion is capability-dependent; background universal video
  optimisation was not implemented.
- Product-form persistence checks covered status, vendor, base stock, variant
  stock totals and preventing restoration of an archived record through the
  ordinary edit form.
- An earlier broader test run during media work found a publication-test HTTP
  expectation mismatch, 409 versus 400. That was reported separately and was not
  resolved or rerun as part of creating this journal.
- AI image credits, recharge wallets and in-app agent image generation were not
  enabled by the media work. No new OpenAI generation integration was added.
- Production deployment of the final media/form changes was **not performed by
  the assistant** in the observed work. The supplied next action was the existing
  manual Cloudflare Worker deployment. No new migration was required for those
  two changes.

**Other historical verification:** older billing, review, registration and motion
test files are recorded, but their execution is not inferred from their presence.  
**Deployment:** not established per earlier feature. Prior deployment activity
mentioned in conversation is not enough to map a production release to every
checkpoint; live database state and production services were not queried for
this reconstruction.

## Day 15: 19 October 2026

**Classification:** directly performed documentation work.

**Checkpoint status at creation:** this documentation update was not yet part of
the captured historical register. Add its reference during a subsequent update
when a checkpoint is available.

| Implementation | How, briefly | Outcome | Verification |
| --- | --- | --- | --- |
| Historical implementation journal | Reviewed all 272 recorded commits, their file scopes, phase documents and directly observed recent results. Grouped related work by Cairo date. | Created this daily journal with brief implementation, approach and outcome entries. | Coverage and source-reference checks; no historical test result invented. |
| Complete checkpoint register | Retained every recorded commit with its original subject, local timestamp, affected scope and evidence limits. | Smaller fixes, asset changes and configuration work remain traceable. | Register checked against the captured Git history. |
| Ongoing maintenance rule | Added a project instruction to update the journal during completed implementation/fix work. | Future agents have an explicit maintenance requirement. This is not an unattended background service. | Documentation-only change; no app restart, database migration or production deployment needed. |

### Update: commands and inline-editor assessment

- The original journal work now has checkpoint
  [19919a1](journal/COMMIT_REGISTER.md#commit-19919a1), recorded on 19 October.
  The initial 272-commit backfill remains historical; the register now also
  includes this subsequent documentation checkpoint.
- Added the [command register](journal/COMMAND_REGISTER.md), covering local
  checks, Cloudflare publishing, resource/secret configuration, supported staged
  migrations, scanner diagnostics, reviewer roles and billing-test switches.
  The commands were documented and checked against their sources; **no deployment,
  integration mutation, credential upload, migration or billing-switch operation
  was executed** to prepare the register.
- Reviewed inline editing: Ann's contextual editor currently uses plain text
  controls, while other content helpers support only a small HTML subset.
  Recommended a shared, validated rich-text editor for Ann and the theme editor,
  with text formatting, typography and colour controls. This is a **recommendation
  awaiting implementation approval**, not a delivered editor feature.
- The command-register additions and editor assessment are not yet part of a
  captured checkpoint at the time of this update. No application code, database
  settings or production deployment was changed for this documentation work.

### Update: shared text-formatting editor implemented

The user subsequently approved implementation of the shared editor.

| Implementation | How it was done | Outcome |
| --- | --- | --- |
| Shared Ann/theme-editor toolbar | Replaced the shared contextual plain-text control with a structured editor: fonts, numeric sizes, presets, emphasis, text/highlight colours, alignment, line/letter spacing, lists, links, undo/redo and clearing. | Implemented in the existing shared editing surface. Lists/links are withheld for headings, buttons and text inside links. |
| Safe formatting storage | Kept plain copy and a separate bounded JSON formatting document. Validated fields, fonts, colour values, numeric bounds and link protocols on the server. | Real restricted-role save/reload checks passed; stale requests and unauthorised roles remain rejected. No schema migration required. |
| Consistent rendering | Applied validated formatting after trusted section-field indexing, in sample previews and the saved storefront renderer. Preserved heading/button/link semantics and protected commerce/form content. | Rendering checks passed across all supported styles; old unformatted designs remain supported. No production publication was performed. |
| Selection and typing correctness | Preserved Unicode caret offsets and explicit normal-weight flags; retained selected formatting when replacing text, including browser-generated plain-text input. | The browser check found colour loss when styled text was replaced. The input handling was corrected and replacement/reopen regression checks passed. |
| Browser module delivery | Registered both new modules at the real Worker asset gate and rebuilt the browser graphs. | Module-delivery regression passed; no missing-import fallback or new credentials were introduced. |

**Verification actually observed**

- Final targeted run: **14 tests passed** across rich-text model/rendering,
  restricted-role draft persistence, editor helpers and real Worker module
  delivery.
- Workspace type checks and JavaScript syntax checks passed.
- An earlier broader Ann selection had 34 passing tests and two failures on
  outdated source/notice assertions in `tests/ann-design-workspace.test.js` and
  `tests/ann-editor-handoff.test.js`. Those unrelated assertions were not
  changed or represented as passing.
- Partial browser verification in the isolated fixture confirmed theme-editor
  typing/live preview, save/reload of text/font/size, selection formatting,
  links/lists, undo/redo, clear formatting, protected-field controls and safe
  plain-text paste. The check was intentionally skipped before Ann-side
  cross-editor and mobile verification completed. No further browser test was
  run after that pause. The colour-replacement correction was checked with
  focused regression tests, not a repeated browser run.
- Only synthetic in-memory fixture data and a clearly labelled test document
  were used for setup. No live merchant data, external scanner calls, production
  migrations, real payments or production deployment were used.

**Release:** the existing manual Cloudflare `pnpm run deploy` operation is still
required to publish these changes. No new migration or secret is required.

**Checkpoint status:** implementation changes are not yet part of a captured
checkpoint at the time of this entry. The earlier command-register update is now
recorded in checkpoint [ee31045](journal/COMMIT_REGISTER.md#commit-ee31045).

### Update: text-toolbar readability and analytics report review

- **Changed:** reduced dropdown and option text to 11px, added persistent
  Style/Font/Size and spacing labels, separated those controls into fitting grid
  rows, constrained colour-picker widths, and labelled Undo/Redo/Clear/Reset.
  Scoped selectors override surrounding form padding and widths that clipped
  the previous controls. Editing and formatting-storage behaviour is unchanged.
- **Analytics review only:** reviewed the supplied downloadable-report list.
  Recommended commerce reports first, then India-specific tax/reconciliation
  exports, then tracking/cohorts, and finally profitability/cash-flow reports
  requiring complete costs, expenses, settlement and accounting inputs. No
  analytics menu, reports, tracking or tax-filing capability was implemented.
  Existing product cost fields are not proof of complete historical SKU costs.
- **Scope:** no database migration, secrets change or production deployment.
  The user has not yet approved an analytics implementation phase.
- **Verification observed:** nine focused editor/module-delivery tests passed,
  including a scoped-control CSS regression guard; JavaScript syntax and diff
  checks passed. This is not a completed interactive toolbar/browser test.
- **Checkpoint update:** the shared text editor is now captured in
  [49d77ce](journal/COMMIT_REGISTER.md#commit-49d77ce). This readability update is
  not yet captured at the time of writing.

## Current handover boundaries

These are the boundaries recorded by the observed work, not a fresh production
audit:

- Hosting remains Cloudflare; the database remains the existing Supabase
  PostgreSQL database. This journal does not move or migrate either.
- Catalogue masters and merchant selections, SKU stock, published metadata and
  historical order selections have separate responsibilities.
- Submitted business documents permit continued building under the agreed flow;
  required approval before go-live remains distinct from tax verification,
  subscription selection and security scanning.
- Razorpay checkout covered here is sandbox/test mode. A successful sandbox
  payment is not a live subscription entitlement or tax invoice.
- Product media uses the existing Cloudflare R2 setup. Product-media work does
  not change private business-document retention.
- Later subscription capabilities, recurring billing, broader administrator
  tooling and AI credits must be recorded as implemented only when actually
  delivered and verified.

## Maintenance procedure

At the end of each meaningful implementation, correction or agreed product
decision:

1. Use the current **Africa/Cairo** date. Append to that day or start the next
   recorded activity day. Do not create fictitious work for gaps.
2. Briefly record **what changed**, **how**, and **the actual outcome**. Include
   unresolved issues and scope intentionally left for later.
3. Record tests actually run and their results. Distinguish authored tests,
   historical reports, local checks, external-service checks and production
   checks.
4. Record migration and deployment separately: not required, not run, attempted,
   failed, or confirmed. Identify the release only when evidence is available.
5. Add an available checkpoint reference and update the register for newly
   recorded commits. If the work is not committed yet, say so; add its reference
   during the next update. Do not create commits merely to maintain the journal.
   Record relevant integration, deployment, migration and operational commands
   in the command register, including working directory, effect, prerequisites
   and whether they were actually executed or only suggested.
6. Preserve old entries. Add a dated correction or superseding decision rather
   than rewriting an earlier outcome as if it had always been true.
7. Do not include secrets, customer/account identifiers, raw database exports,
   private document contents or sensitive production logs.

### 19 October 2026: Stage 1 catalogue COGS

- **Requested:** build analytics and COGS in stages, with COGS inside Catalogue
  and optional costs in Ann and dashboard product forms.
- **Implemented:** owner/admin-only COGS listing, search, missing-cost filtering,
  product defaults, SKU overrides, atomic saves, revision conflicts, updated
  dates and cost history. Shared product forms include optional cost entry.
- **How:** reuse the existing product cost field; add private current-cost,
  history and immutable order-cost capture tables behind tenant/session-checked
  PostgreSQL functions. Existing order costs remain unknown rather than being
  backfilled with today's costs. Cost edits do not republish prices or stock.
- **Verification:** 47 focused checks cover the new cost path and catalogue,
  inventory, modal, navigation and browser-bundle regressions. One old
  publication assertion was corrected to the existing SKU rollout guard's 409
  status and database-update message; no publication guard was relaxed.
  Workspace type checks and diff/syntax checks passed.
- **Browser outcome:** isolated desktop checks confirmed base and SKU cost
  persistence, explicit zero, inheritance, history, atomic stale-write rejection
  with retained edits, and custom discard/reload confirmation. Dashboard product
  form saved/reloaded 24.68; the same form inside an Ann frame saved/reloaded
  31.25. Search and missing-cost filters matched stored records.
- **Responsive correction:** the browser found inherited table minimum sizing
  pushed mobile save controls off-screen. Scoped grid/table/filter sizing and
  action wrapping were corrected; a fresh 402 × 874 screenshot showed the
  responsive layout fitting the viewport. This visual confirmation was not a
  second full functional browser pass.
- **Test limitations:** the Ann check used the shared form in a synthetic frame,
  not a new real merchant onboarding. A fixture thumbnail/resource 404 remained
  during the browser pass; it did not block saves, and media-upload behaviour
  was not part of this COGS verification. No merchant data was queried.
- **Release:** `--staged-catalogue-cogs` is prepared. No live database migration,
  production deployment or paid feature activation was performed.
- **Next:** first sales/order analytics and downloadable reports, with explicit
  missing-cost coverage. Analytics itself is not yet implemented by this stage.
- [Scope, data boundaries and release steps](catalogue-costs-and-analytics.md).
- The earlier navigation-only confirmation is now recorded in checkpoint
  [3d1ee10](journal/COMMIT_REGISTER.md#commit-3d1ee10). Current COGS changes were
  not yet checkpointed at the time of this entry.

### 19 October 2026: Stage 2 commerce analytics

- **Requested:** continue the staged analytics work after the private COGS
  foundation.
- **Implemented:** owner/admin-only **Business pulse → Analytics**, with daily
  sales, a line-level order register and product/SKU performance. All reports
  share month, quarter, April-to-March financial-year, 30-day and custom dates,
  timezone/currency filters, pagination and refresh. CSV and genuine Excel
  downloads cover the complete selected report; the browser's Print / Save PDF
  option produces an aggregate summary.
- **How:** a staged, tenant/session-checked PostgreSQL read function calculates
  the reports from saved orders, order lines and immutable private cost
  snapshots. Date boundaries are local and inclusive. Daily aggregation avoids
  repeated scans of every order line for every day. The HTML's initial result
  is reused instead of immediately querying it a second time.
- **Financial limits:** booked value is not collected cash or recognised income.
  Return/refund reversals are current-status estimates on the order-date cohort,
  not confirmed refund transactions. Currencies are separate. Margins cover only
  known-cost, tax-reconciled units without unallocated order discounts. Unknown
  historical costs remain unknown; changing catalogue costs does not rewrite
  prior margins. Definitions are recorded in
  [the staged delivery document](catalogue-costs-and-analytics.md).
- **Download safeguards:** authenticated owner/admin access, no-store responses,
  safe spreadsheet strings, exact decimal amounts, store/period metadata,
  genuine XLSX report and definition sheets, and explicit refusal above
  10,000 rows or 24 MiB. Repeated whole-order amounts are labelled not to sum
  across lines. No invoice, tax, subscription or payment authority changes.
- **Verification:** the relevant analytics, COGS, navigation and Worker browser
  graph suite covered 29 checks. A brittle HTML JSON key-order assertion was
  corrected to parse the embedded data; the analytics file then passed all
  13 checks, with the other 16 checks already passing. Type checks and syntax
  checks passed. Real isolated checkout creation exercised known zero,
  historical unknown, changed current costs, invalid tax reconciliation,
  currency separation, local midnight boundaries, owner/editor denials and
  exports. Python verified XLSX ZIP checksums and parsed every XML part.
  Native-preview desktop and 402-pixel mobile screenshots showed the real
  dashboard with synthetic data. No real merchant database was queried.
- **Release:** `0042_commerce_analytics.sql` and its staged selector are prepared,
  requiring recorded `0041_catalogue_cogs.sql`. Neither live migration nor
  production deployment was performed. Manual commands are in the
  [command register](journal/COMMAND_REGISTER.md).
- **Deferred:** invoice/GST reconciliation and tax packs, verified refund/
  settlement ledgers, cohorts/traffic, contribution margin and net profit.
  COGS CSV import/export remains separate from these analytics reports.
- **Checkpoint:** Stage 1 is captured in
  [1a3bfd4](journal/COMMIT_REGISTER.md#commit-1a3bfd4); current Stage 2 work is
  uncommitted at this journal update.

### 19 October 2026: publication review clarity and in-app confirmations

- **What:** Replaced native confirmations in setup/publication review with the
  existing accessible in-app dialog. Ann's final-review readiness panel now opens
  by default and exposes the existing business, policy-generation and policy-review
  controls without requiring the merchant to discover a collapsed section.
- **How:** Show every shared business-validation error in Ann and publication
  review, including missing support contacts, rather than a generic incomplete
  business message. Policy-generation API errors also explain the missing fields.
  Link directly to Settings → Business documents for current review status and
  reviewer feedback. Manual document approval and GST verification remain separate.
- **GSTIN investigation:** Confirmed GSTIN confirmation saves the store supplier
  identity in store setup and verification evidence, not the shared brands
  registry. Brands may belong to multiple stores; no inferred registry backfill
  or change to historical/published invoice identity was performed.
- **Preview:** Replaced misleading “Shopping unavailable” copy in read-only
  product previews with explicit preview-only checkout wording. Actual storefront
  availability, stock, checkout configuration and publication checks are unchanged.
- **Verification:** 24 focused wizard/readiness/media checks passed, including
  genuine policy generation against isolated foundational DDL, consent/staleness
  guards and preview/live copy separation. Type checks and diff whitespace checks
  passed. Browser asset graph/gate check also passed in the earlier bounded run.
  An older upload test mock initially rejected the existing staged-billing schema
  probe; its fixture now explicitly represents an unmigrated billing schema.
  Both workflows restarted successfully. The isolated native-preview publication
  screen rendered with the explicit missing-details list; no real merchant records
  were read to establish current approval status.
- **Release:** Uncommitted at this update. No database migration is required for
  this change. No production deployment, approval, policy replacement, GSTIN
  update or publication was performed. Deploy manually with `pnpm run deploy`.

## 19 October 2026: Shared signature commerce design

- **Request:** Replace the basic, theme-dominated product, bag, checkout and
  post-order screens with a recognisable LeBrands.Store purchase experience.
- **Implementation:** Added a dedicated shared commerce shell and stylesheet:
  merchant-branded header, photographic product gallery, accessible SKU pills,
  independent bag drawer, numbered checkout sections, progress trail and
  ticket-style order summaries. Merchant-configured product sections and their
  editor hooks remain available. Real catalogue content, not design copy, owns
  product titles, descriptions, prices and variants.
- **Browser icons:** Versioned same-origin icon links use public merchant logos,
  small Cloudflare-generated PNGs where available, and a legible initials
  fallback. The public media gate is reused; there is no arbitrary image proxy.
- **Verification:** Focused renderer, editor/rich-text, browser-bundle and
  real-schema SKU checks passed. One isolated browser journey verified SKU
  selection, photo swapping, cart quantity changes, drawer focus/scroll
  behaviour, address validation and a single COD order with exactly one stock
  deduction. Twenty-four narrow-screen routes covered all eight saved styles.
- **Findings addressed:** The browser pass exposed stale product availability
  and a clipped mobile navigation label. Availability now reads current,
  tenant-scoped stock without replacing published SKU metadata; restricted-role
  database tests cover this boundary. Final desktop/mobile screenshots confirmed
  the updated variant controls and fully visible navigation. The synthetic
  fixture also preserves the selected style across checkout navigation.
- **Safety:** Sample photography is presentation-only, never inserted as owned
  production media. No live customer records, online charges or emails were
  used. No production deployment or database migration was performed.
- **Commands:** Recorded in the command register. Current source requires the
  normal Cloudflare deployment to appear on published stores; this redesign
  introduces no new database migration.

## 19 October 2026: Storefront availability query correction

- Investigated the reported live “Store temporarily unavailable” page.
  A public GET returned HTTP 503; a short Cloudflare Worker tail confirmed
  `Store lookup failed` with SQLSTATE `22023`.
- The new availability query passed an already serialized product-ID list
  directly to a JSONB parameter. The production postgres.js driver encoded
  that string again. Added the explicit text-to-JSONB boundary, preserving
  tenant checks and published metadata authority.
- Added a regression check using the installed driver's parameter serializers
  on first and repeated availability reads under the synthetic tenant role.
  SKU checkout and storefront-shell suites passed all 20 tests.
- No database migration, production data write or Worker deployment performed.
  The production site requires the corrected Worker to be deployed.

## 19 October 2026: Theme framing around the approved commerce body

- **Request:** Keep the approved shared product, cart, checkout and confirmation
  body design unchanged, but restore each selected theme's header and footer.
- **Implementation:** Reused the actual theme header/footer, including saved
  typography, colours, menus, announcement treatment and policy links. Theme
  styling is scoped to framing wrappers, outside the shared commerce content.
  Fixed bottom shortcut bars are hidden on these pages to avoid covering
  purchase controls; the themed header navigation remains available.
- **Verification:** All 13 targeted storefront, Ann preview and browser-bundle
  tests passed, including framing and menu/search/cart hooks across all eight
  themes. Desktop Architectural product and mobile Boutique receipt screenshots
  confirmed themed headers around the unchanged commerce bodies. Workflow
  restarted successfully; no checkout logic or production data changed.
- **Release:** No migration required. Cloudflare deployment remains manual.

## 19 October 2026: Store offers and dashboard ticket design

- **Request:** Separate offers from Catalogue; implement initial offer types,
  prepare future promotion/bundle storage, and extend the ticket design across
  dashboard summaries without copying Shopify.
- **Merchant UI:** Added a separate owner/admin Offers & codes destination,
  offer tickets, an operational table and a live preview editor. Merchants can
  create/edit percentage or fixed discounts, choose automatic/code application,
  target products/collections/orders, set conditions and UTC schedules, and
  pause/resume offers. Dashboard cards, billing and analytics summaries share
  the perforated divider/notch treatment; forms and tables remain conventional.
- **Schema:** Added a manual staged migration with tenant-scoped offer/code/
  target records, versioned rule metadata, dormant bundle composition,
  redemptions and immutable historical order allocations. Unsupported future
  offer kinds cannot be activated. Existing rows are not repriced.
- **Checkout:** Best-single-offer evaluation uses published SKU prices and
  collection membership, integer rounding/allocation and discounted tax.
  Saved savings appear in cart, checkout, receipt, invoice presentation and
  utility email totals. Store-locked order creation handles usage caps,
  idempotency and atomic stock writes; payment status transitions recover held
  uses. Committed uses remain consumed after refunds/cancellations.
- **Verification:** Targeted schema, SKU, navigation, invoice, email, renderer
  and browser asset tests passed after correcting two test expectations: the
  navigation now has eight groups, and the existing non-admin role is `editor`,
  not an invented `staff` role. A read-only configuration row-lock attempt
  initially needed UPDATE privilege; the redundant lock was removed rather
  than granting broad configuration writes.
- **Browser outcome:** One synthetic merchant created/edited/paused/resumed an
  offer, then one shopper applied its 10% code and placed one COD order.
  Subtotal ₹120, saving ₹12, total ₹108; the selected SKU fell from stock 3 to 2
  exactly once, and usage became 1 of 1. Reload preserved the receipt.
  Desktop/mobile tickets, editor and checkout were checked. The wide offers
  table scrolls within its own container, not the page. A fixture-only account
  resource returned 401 without blocking the journey; the intentional invalid
  code returned 400 and recovered correctly.
- **Final edge checks:** A discount can bring an order under the COD limit, and
  an automatic discount must not increase the final payable total by losing
  free delivery. Driver-compatible JSON text boundaries are explicit.
- **Release:** No live migration, Worker deployment, customer data changes,
  email sends or online payments occurred. Apply
  `pnpm run db:migrate -- --staged-store-offers`, then `pnpm run deploy`.
  See `docs/store-offers.md` for rules, safety and deferred capabilities.

## 19 October 2026: Code rejection must not hide cart contents

- **Reported:** Applying `SAVE100` replaced the bag's lines and totals with
  duplicated generic code errors.
- **Diagnosis:** Read-only inspection found the promotion was active but used
  automatic application; `SAVE100` was its title, with no customer code record.
  No live promotion was changed. Managed deployment logs had no matching
  entries available for this externally deployed Worker.
- **Fix:** Expected offer failures are separate cart feedback, not cart-fetch
  failures. Items, quantities and authoritative totals remain visible.
  Scheduled, expired, inactive and exhausted offers have clearer messages.
  Removing/replacing the code recovers normally. Checkout stays blocked for a
  rejected code, and actual order placement retains strict validation.
- **Checks:** Real-schema SKU/checkout regression cases passed. New tests cover
  unknown and malformed codes returning a complete quote with offer feedback;
  strict quote validation still rejects an invalid code. Browser-bundle gate
  and whitespace checks passed. An isolated mobile browser pass covers the
  visual recovery flow without placing orders or touching merchant data.
- **Release:** Worker update only, no new migration. Not deployed automatically.

## 19 October 2026: Verified shopper email and PIN-assisted checkout

### Follow-up: PIN lookup status colours

- Successful PIN lookup had inherited the theme accent, which looked like an
  error in orange/red themes. Added explicit neutral loading, green success and
  red error states for postal feedback, independent of theme accent.
- Editing the PIN clears its stale feedback; failed responses for an older PIN
  no longer replace the current status. Lookup, editable city/state and manual
  fallback rules are unchanged. No database migration is needed.

- **Request:** Explain disabled ordering, improve contact/address arrangement,
  fill city/state from PIN and require email authentication for transaction emails.
- **UI:** First name plus optional last name, required mobile/email, inline send
  and verify-code controls, editable city/state lookup and country display.
  The disabled Place order action now states its blocking reason. Theme header/
  footer and the shared commerce body remain intact.
- **Identity:** Added a manual tenant-isolated challenge-table migration. OTP
  codes expire after ten minutes, are single-use and stored only as keyed hashes;
  failed guesses commit their bounded attempt count. CAPTCHA, IP limits,
  resend cooldown and store/email quotas guard requests. Successful verification
  issues a store/email-bound signed capability lasting 30 minutes. New HTTP
  orders require it; idempotent recovery of an existing order stays available.
  This is shopper checkout identity, not a merchant-account migration.
- **Email:** Extended the existing professional utility template with checkout
  verification and the essential-email preferences notice. Reused Resend with
  explicit delivery failures; no marketing consent is inferred. Worker secret
  names were checked and the existing email/security keys are present.
- **PIN:** The server queries public postal data using only the six-digit PIN,
  prefers the head office for the town name and maps its state to the existing
  state code. Failed lookup permits manual entry, rather than blocking checkout.
- **Verification:** Real-schema authentication tests passed for bad/expired/
  consumed codes, guess limits, resend cooldown, token tampering, cross-store/
  changed-email rejection and order retries. SKU, offers, tax, email, renderer
  and asset checks passed. Older isolated checkout mocks needed the already
  introduced offer-schema query and discount-column positions; fixture inputs
  now use email and signed synthetic identities, with no production bypass.
- **Browser outcome:** One synthetic shopper tested missing/rejected codes,
  invalid PIN/manual recovery, PIN 629001 autofill, wrong OTP then successful
  email verification, mobile enabled-order state and one successful ₹120 COD
  order. Stock fell from 3 to 2 once and the receipt held the combined name.
  Email verification survived reload. The test inbox and postal fixtures exist
  only in the Node preview, not the production Worker. No real email/payment
  was sent or merchant data changed.
- **Release:** Run `pnpm run db:migrate -- --staged-checkout-email-auth` before
  `pnpm run deploy`. Neither production command was executed automatically.
  See `docs/checkout-customer-identity.md`.

## 19 October 2026: Public platform blog and discovery files

- Added `/blog` and ten original, structured editorial articles on launching,
  catalogue pages and media, checkout, COD/RTO, GST invoices, offers, costs,
  ecommerce SEO and the payment/logistics roadmap.
- Reused the public platform header/footer and typography, with desktop and
  mobile article layouts, summaries, takeaways, linked contents, FAQs, author,
  publication date, calculated reading time and related guides. All essential
  content is in server-rendered HTML, without a crawler needing JavaScript.
- Created ten original topic-specific SVG illustrations and PNG derivatives
  for social previews. Added only those known assets to the Worker image gate.
  No external image hosting, stock-image licences or AI-image API is required.
- Added canonical and social metadata, Blog/BlogPosting, breadcrumb and
  matching visible FAQ structured data. Updated `sitemap.xml` and `llms.txt`
  with the blog index and ten article URLs, retaining private-route exclusions.
- Public copy records Razorpay website approval as complete and partner OAuth
  and a logistics connection as upcoming. Corrected the machine-readable
  LeBrands.Space description so the Free plan does not promise placement.
- Verification: eleven blog/SEO tests passed, including all article routes,
  HEAD responses, schema/content alignment, original and social image serving,
  unknown-article 404, script escaping and crawler-file consistency.
- Existing Cloudflare release remains manual: `pnpm run deploy`. No database
  migration, live payment enablement, OAuth connection or logistics setup was
  performed by this editorial change.

## 19 October 2026: Public wording correction

- Removed the user's prohibited roadmap words from blog prose and metadata,
  Pricing, Compare, dashboard navigation and billing labels, plus Ann's related
  product-idea copy. Aligned `llms.txt` with the same language.
- Used direct availability/setup descriptions rather than implying unavailable
  services are live. Preserved all existing permissions and activation gates.
- Added regression assertions for blog records, machine-facing copy and
  rendered Compare/dashboard text.
- No migration is required. The Worker release remains manual.

## 19 October 2026: Expanded editorial library and smaller blog headings

- Reduced article titles from a 58 px desktop maximum to 40 px, and reduced
  the index headline, featured article heading, section titles and related
  articles heading with responsive sizing preserved.
- Added five practical D2C guides on size information, merchandising,
  replenishment, order emails and shipping/returns policies.
- Added five detailed platform guides about Ann, catalogue/variants/media,
  the buying journey, offers/COGS and verification/publication. Descriptions
  reflect existing product behaviour rather than invented provider capabilities.
- Added ten original SVG illustrations and PNG social-sharing versions.
  Expanded the sitemap and machine-readable guide to all twenty articles.
- Rewrote the existing payments/delivery article around merchant operations,
  removing internal integration-release commentary in response to the user's
  explicit public-copy instruction. Kept its established URL for continuity.
- All eleven editorial and public SEO tests passed, including all forty
  illustration/social-image requests through the actual Worker asset gate,
  twenty server-rendered articles, related links and machine-readable metadata.
- No migration or automatic production deployment. Release remains manual.

## 19 October 2026: Two detailed Ann guides

- Added guides on theme styles and inline editing, and multilingual guidance
  with automatic GST verification. The library now contains twenty-two articles.
- Described the actual style choices, shared text-formatting controls and five
  conversation languages. Kept legal records distinct from translated guidance,
  and GST verification distinct from identity confirmation and document approval.
- Added two original illustrations with PNG sharing derivatives, related links,
  sitemap entries and machine-readable guide links. The blog's description now
  derives its article count from the content rather than a hard-coded number.
- Verification covers article structure, routes, images, metadata, discovery
  files and the specific Ann feature descriptions. No migration or deployment.

## 19 October 2026: Full public discovery inventory

- Audited sitemap and AI-facing guide against the actual public route list.
  All twenty-two articles, the blog index, home, Pricing, Compare, Terms,
  Privacy, Contact and Support are covered: thirty canonical public pages.
- Added direct Features and FAQ section links in `llms.txt`; their sitemap
  destination remains the canonical homepage rather than duplicate fragments.
- Grouped sitemap entries for readability and added a parity check proving the
  AI-facing links and sitemap cover the same public page inventory.
- Preserved exclusions for private account, merchant, dashboard and preview
  routes and the non-indexable incomplete refund-policy page.
- No database migration or automatic production release.

### 2026-10-19: Separate platform operations dashboard

- **Implementation:** Added a dedicated username/password admin entry point,
  platform-wide store search and status filters, order/product counts, business
  and GST verification, domains, integrations, subscription/payment modes and
  store-level suspension history. Kept the console private, unindexed and free
  of analytics.
- **How:** Narrow database functions check an active administrator and live
  session on every request. A separate operator-only credential provisioning
  script uses Secrets and the existing peppered password hashing. Suspension
  requires an exact store-address confirmation, reason and revision check.
  Restoration returns a store to draft and retains its records and approval
  boundaries. Private document review reuses its established safeguards.
- **Verification:** The isolated real-DDL database tests passed sign-in, role
  isolation, sanitised responses, protected assets, suspension, stale decision
  rejection, audit records, restoration and access revocation. The browser
  final regression run passed all three admin/business-review tests. Browser
  verification passed login, search, review navigation and mobile detail.
  After a preview reload invalidated its first synthetic session, a fresh
  session passed suspension, both audit entries, restoration to draft, logout
  and rejection of unauthenticated access. Non-blocking inline
  style CSP warnings were observed; application assets loaded successfully.
- **Activation:** With explicit user approval, applied the staged platform-admin
  migration to the live Supabase database and provisioned the dedicated account
  from Secrets. A read-only check confirmed the recorded migration, active
  administrator, matching password hash, document-review access and absence of
  merchant membership. Credentials and password hashes were not printed.
- **Release:** Database activation is complete. No live store was suspended or
  otherwise changed, no private merchant data was inspected, and no Worker
  publication was performed. Publishing the dashboard code remains manual.
- **Operations:** See [platform admin setup](platform-admin.md) and the
  [command register](journal/COMMAND_REGISTER.md).

### 2026-10-19: Unified admin navigation and right-hand workspace

- **What:** Added separate sidebar menus for integrations, custom domains, GST,
  subscriptions, payments and store suspension alongside Stores and Business
  reviews. Business-review queue and detail now stay in the same right-hand
  workspace rather than using the merchant account header and footer.
- **How:** Shared the existing admin shell, preserved review forms and private
  download routes, and reused the guarded store-overview function for real
  category-specific records. Search, store-status filters and pagination retain
  the selected menu. Suspension keeps its existing confirmation and audit flow.
  Payment pages show the latest payment/checkout evidence per store.
- **Verification:** All three isolated platform-admin/business-review tests
  passed, including six new protected section routes, active navigation,
  route-specific search forms, shared review layout and existing permission,
  review and suspension regression checks. Both workflows restarted and served
  requests. The screenshot browser was not signed in and displayed a sign-in
  page; authenticated visual layout was not browser-verified in this change.
- **Release:** No database migration, live merchant mutation or production
  publication. Publish the updated Worker manually.

### 2026-10-19: Shared sans-serif typography across platform and stores

- **What:** Replaced serif presentation defaults with locally hosted Instrument
  Sans across account forms, platform pages, dashboard/Ann, theme previews and
  merchant storefronts, including product, cart, checkout and confirmation.
- **How:** Added one shared typography stylesheet and allowed it through the
  Worker asset gate. It overrides older literal serif styles and theme font
  tokens without changing sizes, weights, layouts or saved merchant records.
  Explicit inline rich-text font selections and code-style text remain intact.
- **Verification:** All 27 shared-typography, homepage, Aura layout and commerce
  shell checks passed. Coverage includes each store style and the shared CSS/font
  Worker responses. The sign-in screenshot visibly confirms sans-serif headings
  and form content; local logs confirm both assets return HTTP 200.
- **Release:** No database changes or production publication. Publish the updated
  Worker manually to update live stores.

### 2026-10-19: Two owned stores, one live and historical Free migration

- **What:** Implemented two ownership slots with one live store maximum. Creation
  becomes “Create a draft store” after the first owned store and disappears at
  two. Existing multiple-live owners get an explicit retained-store selection
  with confirmation that their other live stores will become drafts.
- **How:** Database ownership/status guards lock account rows and reject direct
  bypasses. An owner-session-checked function records the selection and retains
  all store data. The operator Free transition preserves paid subscriptions and
  existing Free clocks, copies approved entitlements, and records platform
  assignment separately from merchant consent. No recurring charge is enabled.
- **Verification:** All 21 account-limit, Ann-plan and Free-subscription tests
  passed. A subsequent focused two-test pass also verified live paid-subscription
  preservation. Historical timestamps retain microseconds, duplicate transition
  cannot reset them, unauthorized staff cannot select stores, third ownership
  fails, and staff memberships do not consume slots.
- **Live operations:** With the user's explicit selection, applied the additive
  migration, changed FunStyle to draft and retained its owner's Stonescence live
  store. Assigned FunStyle Free from its recorded original publication evidence;
  preserved the live store's existing Free subscription. Read-only verification
  found no account owning multiple live stores.
- **Historical date completion:** The user subsequently approved the older
  Stonescence store's recorded 6 October 2026 publication timestamp. Applied its
  Free assignment using that timestamp; read-only verification confirmed expiry
  on 5 November 2026 and that it remains live with enrolment enforcement enabled.
  The other two Free subscriptions and draft/live statuses were preserved.
  Ownerless historical fixture stores were not altered. No live paid plan was
  downgraded, no existing Free timer reset, and no store data deleted.
- **Release:** Both local workflows are running. The screenshot browser showed
  the public platform, not an authenticated account, so no signed-in browser
  verification is claimed. Updated account UI/error messages require manual
  publication; the database guard is already active. Scheduled Free expiry and
  product/SKU allowance enforcement are separate scope.

### 2026-10-19: Dashboard navigation and merchant integrations

- **What:** Changed the dashboard so only Settings expands on each page load;
  former sidebar preferences no longer reopen other menus. Renamed the three
  settings destinations Custom domain integration, Razorpay integration and
  Shiprocket integration.
- **How:** Kept the existing tenant-scoped, encrypted provider verification and
  activation gates. Made Razorpay and Shiprocket credential forms visible in
  their Settings screens before the merchant changes checkout or delivery
  preferences. Shiprocket uses a separate API-user email/password, not API
  keys. Razorpay needs merchant key ID, key secret and webhook secret; saving
  credentials does not switch on checkout or shipping.
- **Domain setup:** A merchant can save a pending domain and see the platform
  CNAME name/value even before Cloudflare hostname provisioning is available.
  After platform provisioning, ownership and SSL TXT records also appear.
  A read-only public DNS CNAME check can run while platform provisioning is
  unavailable; it does not claim ownership or SSL verification. Once platform
  provisioning is ready, full merchant verification rechecks DNS, ownership,
  routing and SSL server-side;
  there is no activation without passing platform checks. Replaced redirect
  rejection with fail-closed manual redirect handling for provider requests.
- **Why the extra store button appeared:** The database already rejects a
  third owned store. The screenshot was of the published account page while
  the previous dashboard UI change still awaited manual Worker deployment.
  No new quota migration or new merchant store was created in this change.
- **Verification:** Isolated account-limit coverage passed along with 23
  focused integration and dashboard checks. Pending DNS evidence, existing
  provider credential isolation, settings access before preferences, active
  domain guards and initial collapsed navigation passed. No merchant
  credentials were accessed; no live provider or domain was activated.
- **Release:** Both preview workflows were restarted and the public sign-in
  screen loaded without runtime errors. Signed-in integration screens were
  checked through isolated render/route tests, not a live merchant session.
  Manual Cloudflare Worker publication is still required for the published
  account button and these new integration screens. Cloudflare for SaaS and
  its platform configuration remain necessary before custom-domain
  verification and live routing.

### 2026-10-19: Separate ticket-style integration pages

- **What:** Removed the cross-provider tab bar. Custom domain, Razorpay and
  Shiprocket now each have their own content page reached from their existing
  Settings sidebar item.
- **How:** Added provider-specific ticket headers, setup instructions, related
  links and responsive form styling. Credential panels stay visible in Settings
  instead of opening in accordions. Provider status uses the existing saved
  verification and activation state. Ann's conversational controls and the
  underlying integration APIs, encryption and permission gates remain intact.
- **Verification:** 24 isolated navigation, integration UI and preview checks
  passed. Desktop Razorpay and mobile custom-domain screenshots showed the
  complete live-rendered forms inside the new layout using read-only synthetic
  preview data. That fixture rejects writes and does not access merchant data.
  Both preview services restarted successfully; no runtime errors were observed.
- **Outcome:** Each integration has independent menu content without tabs.
  No database migration, merchant credential change or provider activation was
  performed. Production publication remains the manual Cloudflare deploy step.

### 2026-10-19: Ticket styling across the merchant workspace

- **What:** Extended the approved ticket treatment through implemented dashboard
  destinations in sidebar order: Today, Catalogue and product/collection forms,
  Stock, COGS, Offers, Order desk/customer details, invoices, Analytics, Settings,
  integrations, business documents, checkout preferences, team and billing.
  Disabled destinations remain disabled.
- **Editors:** Applied the same visual language to Ann conversation and design
  panels, inline text-editor containers, catalogue/plan/document dialogs, the
  saved Ann theme-editor shell and the section-based editor. Storefront CSS,
  merchant theme presets, iframe documents and saved design data were untouched.
- **How:** Scoped accents, card edges, perforated dividers, controls and tables
  through existing workspace stylesheets; standalone checkout preferences get
  equivalent local styles. Kept selected controls high-contrast and supplied
  workspace colour tokens to standalone dialogs and editor shells. No backend,
  field contracts, permissions, save/publish logic or migrations changed.
- **Verification:** Targeted suites produced 64 passing checks. Three unchanged
  legacy Ann checks still fail: two editor-panel tests omit the current shared
  workspace mock, and one workspace assertion expects an obsolete source
  expression. Browser-preview tests pass with Node's required
  `--experimental-test-module-mocks` flag. New ticket coverage passes.
- **Visual checks:** Read-only dashboard and Ann screenshots showed the new
  cards and readable selected controls. The standalone Ann editor fixture
  returned its existing saved-design prerequisite; the section-editor mobile
  fixture showed an empty preview with a resource 404. Those fixtures did not
  establish visual verification of either full theme editor. Render checks
  preserve both editor shells and iframe restrictions.
- **Outcome:** Workspace styling is implemented; existing Ann checks and
  standalone editor preview fixtures need separate maintenance. Preview
  workflows restarted and assets rebuilt successfully. No production
  publication or live merchant edits were performed.

### 2026-10-19: Ticket-style login, registration and account home

- **What:** Extended the approved ticket treatment to login, registration and
  the signed-in Your stores screen. Shared account shells also carry the same
  treatment for password changes, recovery and store creation.
- **How:** Load one scoped account stylesheet across account views, preserving
  registration's existing validation script and styles. Added plum ticket rails,
  perforated dividers and edge notches, matching store-card actions, accessible
  focus states and mobile layouts. Registered the existing account stylesheet
  in the fingerprinted browser build so updated styling is delivered safely.
- **Safety:** Existing form contracts, validation, password handling, ownership
  limits, live/draft statuses, empty states, mandatory password-reset gating
  and the legacy live-store selection remain unchanged. Marketing and merchant
  storefront styles were not changed.
- **Verification:** All 22 targeted account styling, authentication,
  registration and browser-bundle checks passed. Screenshots verified desktop
  login, the complete mobile registration page and the synthetic read-only
  account store list. Both workflows restarted; stylesheet and registration
  modules loaded successfully without runtime errors.
- **Outcome:** Account entry and account home now match the merchant ticket
  language. No live account/store changes, database migrations or production
  publication were performed.

### 2026-10-19: Public ticket styling, flat tables and analytics charts

- **What:** Added consistent light ticket accents to Pricing, Compare, Blog
  index/article layouts and shared public information/legal content. Removed
  duplicate table boundaries inside dashboard panels, including Daily sales.
  Each report now has one ticket surface rather than a ticket inside a ticket.
- **Analytics:** Added selectable line, area, ordinary/grouped/stacked columns
  and calendar heatmaps, plus merchandise waterfalls, captured-cost coverage
  donuts and comparable-economics bars. Product reports include metric-selectable
  rankings and units/value scatterplots; order reports include deduplicated
  status and payment-method mixes. Daily AOV is derived from booked value per
  accepted order, with zero-order days remaining unknown.
- **How:** Lightweight native SVG projections use existing filtered daily,
  summary, captured-cost and paginated report data. Whole-period charts and
  current-page breakdowns are explicitly distinguished. Repeated order lines
  never multiply whole-order counts or amounts. Unknown costs are not zero;
  estimated product margin is not net profit. Each chart has exact-value table
  disclosure, while the existing paginated report and CSV/XLSX/PDF paths remain.
  A direct link jumps from charts to the report table.
- **Safety:** No production schema, transaction, entitlement, private-data
  cache or financial calculation changes. Added only the two named chart
  modules to the Worker asset allowlist and validated both raw and bundled
  delivery. Repaired a synthetic analytics fixture's obsolete empty email so
  it follows the current mandatory-email input contract. No real account,
  customer, order or cost record was modified.
- **Verification:** Final chart and Worker bundle checks: nine passed. Existing
  analytics/database, public comparison/blog/information and white-background
  suites passed. The broader public suite had 38 passing checks and four
  unchanged pricing-copy assertions that expect old proposal-era wording,
  support-email purchase links and disabled automated billing. These failures
  were recorded rather than changing current pricing content to satisfy them.
  Screenshots verified Pricing, Compare, Blog, synthetic desktop analytics,
  mobile calendar/volume charts and the single-boundary Daily sales table.
  Preview services rebuilt and served chart assets successfully.
- **Outcome:** Implemented in the working tree, not yet recorded as a committed
  checkpoint. No production publication or live migration was performed.
  Charts are limited to the reporting data actually available; no fabricated
  traffic funnels, forecasts, cohorts or net-profit figures were added.

### 2026-10-19: Checkout settings menu and compact Ann actions

- **What:** Checkout settings now uses the existing merchant dashboard shell,
  with an explicitly named Settings menu item and active-page marker. The old
  detached account header and return-to-stores layout no longer wrap this form.
  Non-owners see its existing owner-only restriction rather than a broken link.
  Delivery, COD and GST fields, settings API and owner guard are unchanged.
  Hidden delivery-mode fields remain hidden despite their grid styling.
- **Ann:** Removed the repeated design summary/action card. Save draft, Publish
  store and truthful Saved/Unsaved/Saving/error/conflict status now live in the
  existing top header when editing the saved store design. The editing toggle,
  contextual text/media editing, header Theme editor access and unsaved-change
  protections remain. Publish store still saves and opens publication review,
  not immediate publication. The theme editor keeps its own existing actions.
- **Verification:** The focused checkout, navigation, Ann design/stage and
  raw/versioned browser-asset checks passed. Two navigation assertions were
  updated for the requested label change, then all 12 layout/navigation checks
  passed on the targeted rerun. A separate older Ann handoff wording test
  fails both with and without these changes, as reported by the design helper.
  A screenshot verified the checkout sidebar, selected menu item, single
  ticket form and correctly hidden delivery fields using a read-only local
  synthetic preview. The browser tester stopped at the Ann synthetic fixture's
  business-document gate; it could not verify relocated controls, saving,
  reload persistence or review navigation interactively. No guard was bypassed.
  Both managed preview workflows restarted and rebuilt assets. Local Workerd
  logged disconnected-request errors while serving subsequent assets normally.
- **Outcome:** Working-tree implementation, not yet a committed checkpoint.
  No production database, migration, credentials or publication was changed.

### 2026-10-20: Single compact ticket toolbar for Ann

- **What:** Consolidated the persistent step list, language row, style choices
  and preview controls into one compact ticket-style desktop toolbar spanning
  the conversation and preview panels. Step and style lists open on demand;
  current step/count, language, selected style/content, device icons, browser
  preview and More remain accessible. Removed the ordinary Store plan banner.
  More contains workspace, editing, logo and plan actions. Mobile keeps step,
  browser preview and More visible and moves the same secondary controls into
  More rather than duplicating them.
- **How:** Reused the existing DOM controls and action attributes, preserving
  step/style/device/preview handlers. Added outside-click and Escape dismissal
  with focus return. Kept plan-action name-confirmation updates and moved
  preview-specific inert boundaries with the toolbar; step navigation and
  language remain usable during plan gating. Updated conversation-language
  observation for the relocated step list. Saved/Save draft/Publish store
  remain single top-header actions; merchant theme contents are untouched.
  Required business and subscription notices remain visible when applicable.
- **Verification:** The focused run completed 53 checks: 47 passed, including
  compact-toolbar structure, subscription ordering and locks, five-language
  conversation coverage, real restricted-role draft persistence/isolation and
  raw/versioned Worker asset delivery. Six pre-existing test issues remain:
  five conversation VM checks omit existing navigation/plan helper dependencies,
  and one workspace source assertion expects an obsolete less-restrictive
  canEdit expression. The design helper also observed these failures against
  unchanged source. Follow-up suggestions cover repairing that harness and
  the isolated business-document-gated browser fixture, not relaxing guards.
  Desktop (1440px) and mobile (390px) screenshots confirmed the one-row ticket
  toolbar and mobile condensation using synthetic data. No interactive
  persistence browser pass was attempted for this layout-only request.
  Both managed preview services restarted; `git diff --check` passed.
- **Outcome:** Working-tree implementation, not a committed checkpoint.
  No production records, migrations, credentials or publication were changed.

### 2026-10-20: Remove the empty Ann design-tools gap

- **What/why:** Moving design actions into the compact toolbar left an empty
  padded design card above the page tabs for an active own-catalogue design.
  The renderer now omits whitespace-only tool cards and hides an entirely empty
  design host, removing its spacing as well. Required notices, errors, sample
  warnings, selected-content editors and theme-editor status remain visible.
- **Verification:** Five focused header/tool-card, toolbar and Worker bundle
  checks passed; `git diff --check` passed. The API preview rebuilt successfully.
  The empty-state regression exercises the actual markup function, including
  whitespace-only content and preservation of real notices/controls.
- **Outcome:** Working-tree fix, not yet a committed checkpoint. No database,
  publication or save behavior changed; no production deployment was run.

### 2026-10-20: Remove redundant Ann header links

- **What:** Removed Business documents and Store connections from Ann's header.
  Back to dashboard is the sole header navigation link; Theme editor now lives
  in More. Existing editor-access guards still apply to the relocated link.
  Contextual document recovery, onboarding, dashboard management and top-header
  save/publication actions are unchanged. Ticket styling is preserved.
- **Verification:** Six focused toolbar/header/Worker bundle checks passed,
  `git diff --check` passed, and a synthetic preview screenshot confirmed the
  simplified header with contextual business recovery still visible.
  Both managed preview services restarted successfully.
- **Outcome:** Working-tree change, not yet a committed checkpoint. No database
  changes, migration or production deployment.

### 2026-10-20: Remove Ann's startup loading placeholder

- **Cause/change:** The earlier empty-card fix covered the ready state, but
  the design loader still rendered a large skeleton card before its GET
  completed. It now returns no inline tools markup while initially loading,
  so the existing empty-host rule also removes that transient space above
  the page tabs. The data request, loaded tools, error and retry behavior remain.
- **Verification:** Seven focused header/loading/toolbar/Worker bundle checks
  passed, including initial pending, loaded and failed-request branches.
  `git diff --check` passed and the API preview rebuilt successfully.
  No timing-sensitive browser verification is claimed for this small fix.
- **Outcome:** Working-tree change, not yet committed or deployed. No database,
  migration, publication or draft-save behavior changes.

## Evidence and limitations
### 19 October 2026: Order receipts, shared utility emails and unsubscribe

- **What:** Redesigned the order confirmation/summary with clearer status,
  payment details, item/SKU quantities, totals, included GST, delivery address
  and tracking/invoice actions. COD is distinguished from paid, pending,
  cancelled and refunded states.
- **How:** One responsive receipt layout works inside saved merchant themes.
  All nine existing email types now use one table-based, merchant-aware HTML
  shell, hidden preheader, consistent actions/footer and plain-text equivalent.
  Customer confirmations continue through the existing idempotent Resend queue.
  HTML/plain text include itemised amounts, stored variant selections and
  delivery information. No confirmation or paid claim is made for pending or
  inactive orders.
- **Unsubscribe:** Added recipient/store-scoped persisted preferences and signed
  private links in all utility emails. GET/HEAD do not change preferences.
  Form POST and supported one-click POST disable optional shipping/delivery
  updates; the worker checks preferences even for already-rendered queued jobs.
  Essential confirmation, payment/refund and security emails remain enabled.
  No marketing consent is created. Preference storage retains a recipient hash,
  not an email address, and direct application-role table access is revoked.
- **Verification:** A 25-check focused suite passed, covering real-schema SKU
  receipts, email delivery/idempotency, signed links, actual isolated preference
  persistence/tenant isolation, all-theme rendering and browser bundle delivery.
  After final email-state/payment-evidence adjustments, nine email/preference
  checks passed. Syntax/whitespace checks passed. Mobile receipt and confirmed
  email were visually checked in synthetic fixtures. No live email, live order,
  production database write or production release was performed.
- **Schema lesson:** A proposed receipt projection assumed a product snapshot
  column that the real order schema does not contain. The existing schema tests
  rejected it; the final query reads stored option selections without inventing
  historical product data.
- **Release:** Review/apply `0043_email_preferences.sql` using
  `pnpm run db:migrate -- --staged-email-preferences`, then release the Worker.
  It requires the existing transactional-email migration. New preferences fail
  explicitly as unavailable until this migration is applied. Delivery still
  requires the configured Resend secret and verified sending domain. Checkout
  email remains optional; no confirmation can be emailed without an address.

### 19 October 2026: Shared storefront commerce and publication defects

- **What:** Added a shared product/cart/checkout presentation across all eight
  saved Ann styles, preserving merchant branding. Fixed transparent/overlapping
  cart drawers, title-slug navigation and merchant favicons. Cart and checkout
  now use saved-theme framing rather than falling back to an unrelated theme.
- **How:** Live product layouts share gallery/details/purchase structure,
  including conversion styles. Commerce CSS supplies opaque drawer surfaces,
  reliable layering, responsive form tracks and readable controls. Drawer focus
  is trapped, background content becomes inert while open, and close restores
  interaction. Transaction pages suppress fixed theme shortcut navigation so it
  cannot cover customer fields. Mobile submit remains in normal form flow.
  Public links use published slugs; legacy ID links permanently redirect while
  retaining query parameters. Existing saved slugs stay stable on title edits.
  Favicon markup uses the uploaded or selected Ann logo, with a safe monogram
  fallback and tenant-aware icon routes. No catalogue or order identity changed.
- **Verification:** An initial 50-check suite passed, including isolated real
  schema checkout, payment recovery, SKU pricing/stock and preview boundaries.
  A final 17-check renderer/bundle suite passed, followed by four focused
  slug/favicon/theme tests after the last icon fallback adjustment. Workspace
  type checks and whitespace checks passed. All eight themes render one shared
  live product picker and preserve their theme framing in transaction HTML.
- **Browser outcome:** In the isolated synthetic store, selection, drawer
  layering/opacity, keyboard focus/close, quantity changes, totals and phone
  validation passed. One COD purchase completed using the selected S/White
  override-priced SKU and deducted only that SKU's stock. No live payment,
  merchant data or production database was touched. The initial mobile check
  found grid overflow and a submit overlapping fields; the focused follow-up
  confirmed the Architectural checkout, product and cart fit at 390px after
  correction. It then exposed Boutique's fixed quick navigation covering a
  phone field; shortcut bars were suppressed on all transaction surfaces and
  cart button text contrast was strengthened. The remaining five mobile styles
  were not completed in that browser sweep; do not claim a full mobile browser
  pass from renderer tests. A final native 390px Boutique capture confirmed the
  shortcut bar is absent and contact/address/payment fields and submit render
  in normal flow without the reported occlusion.
- **Release:** Working changes are uncommitted at this update. No database
  migration or production deployment was performed. Cloudflare release is
  manual; current merchant policies and publication snapshots were not rewritten.

### 19 October 2026: Professional D2C policy draft content

- **What:** Replaced short setup-oriented text with full customer-facing Privacy,
  Terms, Shipping, Cancellation & Refund, Contact and Pricing policy drafts.
  Each page has structured sections and the saved seller identity and contacts.
- **How:** Shared deterministic templates are used by Ann and the publication
  review. Explicit regeneration reads saved checkout delivery charges and COD
  limits in the tenant transaction. Missing checkout configuration does not
  become an invented free-delivery promise. Unknown return windows, delivery
  estimates, refund deadlines, opening hours and payment partners are not made
  up. Content no longer says checkout is unavailable or instructs the business
  to complete setup inside a customer-facing policy.
- **Outcome:** 31 focused policy, Ann readiness, wizard and approval checks
  passed, including real isolated-database regeneration with saved delivery
  charges and COD limits. Existing merchant edits remain intact until explicit
  regeneration, which resets review. A first test run exposed a test-sequence
  mismatch: its preservation assertion had been placed after intentional
  regeneration; the assertion was moved before regeneration and the suite passed.
- **Boundaries:** Templates are drafts, not legal advice or certification.
  Merchant review is still required. Exact commercial return/refund timelines
  and versioned order-time policy acceptance are separate future work.
  No production policy content, migration or deployment was changed. Existing
  stores must explicitly regenerate after deployment to adopt the new wording.

### 19 October 2026: Ann policy drafts and merchant contact entry

- **What:** Added a direct support email/phone form to dashboard Settings and
  inline contact editing in Ann readiness and publication review. The Ann
  readiness button saves changed business/contact details and generates six
  policy drafts without sending the merchant to Settings; each draft can be
  edited and reviewed within Ann or the publication review.
- **How:** The existing tenant-protected setup/Ann endpoints save only changed
  values, preserve verified supplier locks, and refresh the revision before
  generating. Policy drafts require valid supplier identity and support
  contacts, not completed design metadata, a logo or a brand description.
  Regeneration uses an in-app confirmation when it replaces existing drafts.
  Full go-live validation still requires logo, description, product and policy
  review. Contact changes invalidate policy review, not published live content.
- **Verification:** 27 focused Ann, wizard and dashboard tests passed. One
  test uses an isolated database to save changed contacts, generate drafts
  without a logo/description and confirm the resulting policy contact text.
  Type checks and whitespace checks passed. An isolated browser check confirmed
  dashboard contact save, HTTP 200 and persistence across reload with phone
  normalisation. The browser could not enter Ann's final Review step because
  its isolated fixture lacked required business-document evidence. Do not treat
  that attempt as an Ann end-to-end pass or infer any live store approval state.
  The native dashboard preview visibly renders the contact form.
- **Release:** Uncommitted at this update. No migration, live merchant write
  or production deployment was performed. Cloudflare deployment remains manual.

### 19 October 2026: Google Analytics public platform tag

- **What:** Added the supplied GA4 measurement tag to public LeBrands.Store
  platform responses only, including homepage, pricing, comparison and information
  pages. It is not added to account, dashboard, Ann, editor or merchant pages.
- **How:** One response-level injection shared by both public HTML layouts;
  asynchronous loading, production-browser hostname checks, GPC/DNT opt-out,
  query/fragment removal in configured page addresses and referrers, advertising
  signals disabled. Added Google endpoints only to public-page CSP, preserving
  the shared private security policy. Added a privacy disclosure.
- **Verification:** Eight Google-tag/crawler/SEO checks passed. Checks cover tag
  count, actual Worker responses and CSP, hostname isolation, privacy preferences,
  safe configured URLs and existing SEO behavior. Both workflows restarted.
  No real Google Analytics receipt or production traffic was verified locally.
- **Release:** Uncommitted at this update. No migration required. Production
  deployment has not been run. Jurisdiction-specific cookie consent and legal
  review remain separate; this implementation is not a consent-compliance claim.


### 19 October 2026: COGS navigation confirmed

- The user confirmed **Catalogue → COGS**, rather than a separate top-level menu.
- This records the agreed placement only. No COGS screen, product-cost field,
  cost history or analytics report was implemented in this confirmation.
- The earlier toolbar-readability work is now captured in checkpoint
  [4b7d3c4](journal/COMMIT_REGISTER.md#commit-4b7d3c4). This documentation-only
  confirmation is not yet captured at the time of writing.

- [Complete checkpoint register](journal/COMMIT_REGISTER.md): all 272 commits
  captured for the initial reconstruction, ending at `9adc763`, plus subsequent
  available checkpoints recorded during ongoing maintenance.
- [Command register](journal/COMMAND_REGISTER.md): operational commands and their
  evidence/safety classifications.
- Existing phase documents under `docs/`: supporting descriptions and release
  limitations, not automatically dated proof of test execution.
- Recent conversation: direct evidence for the media and product-form results
  explicitly marked above.
- Replit’s Agent history/checkpoints remain a separate place to inspect the
  available conversation and checkpoint timeline. This file is not a full export
  of that history.
- No claim is made about work before the earliest surviving commit, unrecorded
  external changes, deleted history or the current state of production.

## 2026-10-20: Merchant marketing integrations, prepared locally

- Added store-specific Meta/GA4 settings and optional Advanced configuration.
- Added consent-gated published-storefront events and confirmed-order Meta
  delivery with durable retry/deduplication, without changing checkout methods.
- Prepared additive migration `db/staged/0050_marketing_integrations.sql`.
  No shared/production migration or publication was performed for this feature.
- Database/security and checkout regression checks pass in disposable PostgreSQL.
  Browser verification uses isolated fixtures and stubbed SDKs, not live brands.
- Final verification: 26 automated checks passed; focused browser checks passed
  consent/refusal/withdrawal, validated cart and checkout events, unpaid receipt
  rejection, confirmed receipt values/deduplication, read-only roles and mobile.
  Cloudflare production-build dry run passed without publishing.
- Setup, privacy boundaries and rollout guidance: `docs/marketing-integrations.md`.

## 2026-10-20: Approved marketing production release

- Applied only `0050_marketing_integrations.sql` through the manual migration
  runner, then verified its ledger checksum, forced tenant RLS and effective
  restricted application/API-role privileges.
- Confirmed zero marketing configurations/jobs after migration and an unchanged
  fingerprint of the existing Razorpay integration records.
- Published the updated Cloudflare Worker with `--keep-vars`. Confirmed every
  non-asset binding, secret name, variable and runtime compatibility setting was
  preserved. The regular domain routes and five-minute schedule remain.
- Verified live account login, new asset stubs and their versioned bundles,
  plus rejection of unauthenticated marketing-settings access.
- Release verification included 27 passing automated checks. Prior isolated
  browser results remain valid; no merchant provider event or payment was sent.

## 2026-10-20: Merchant in-app dialogs

- Audited dashboard, Ann, theme editor and settings scripts for native
  alert/confirm/prompt calls and blocking unload handlers. Replaced application
  decisions with accessible ticket-style dialogs, including destructive store,
  catalogue and order actions, stock discard/reload, grid-source replacement,
  integration replacement and COD collection date/time entry.
- Added a shared navigation guard for unsaved merchant work. Cancelling keeps
  edits; accepted navigation is not prompted twice. AJAX saves, new tabs,
  downloads and same-page navigation remain separate. Navigation API protection
  is feature-detected; closing/refreshing a browser tab cannot reliably display
  a custom dialog. Existing explicit saves/autosaves remain, with no credential
  draft persistence.
- Replaced the navigation loader's unload listener with nonblocking lifecycle
  feedback. Catalogue popups retain their form and no longer permit native
  modal dialogs in the sandbox.
- Browser assets rebuilt and both managed application services restarted.
  Offline verification covered 80 targeted tests across the main run and
  focused reruns. One obsolete cost-checkout fixture needed its now-required
  synthetic customer email; its focused checkout check then passed.
- This change is development-only pending publication approval. No database
  migration, production deployment, live order or provider configuration change
  was performed.
- Isolated browser checks passed on desktop and 390px mobile: exactly one
  custom leave dialog, cancellation/Escape retaining text and restoring focus,
  confirmed navigation once, clean navigation without warnings, and accessible
  date/time entry with inline blank-input validation. Zero native dialogs or
  JavaScript exceptions were observed. No settings save or payment was made.

## 2026-10-20: Approved in-app dialog production release

- Published the approved UI changes to Cloudflare with the production config
  and `--keep-vars`. Worker version:
  `8dbe9afe-691e-4329-9581-e65d846773f5`.
- Compared production metadata before/after publication: all 24 non-asset
  bindings, including 14 encrypted secrets, and runtime settings were preserved.
  Existing domain routes, queue producer/consumer and five-minute schedule
  remain configured.
- The public account page returned HTTP 200. Live entry scripts and their
  imported modules matched the approved local assets; the current graph has
  no native dialog calls or unload hooks. Verified the shared ticket dialog,
  navigation guard and date/time prompt are served in production.
- No migration, production database write, provider event or checkout
  activation change was performed. Existing tabs require a refresh after
  saving any open work.

## 2026-10-20: Support ticket schema proposal

- Documented the proposed support system in
  `docs/support-ticketing-schema.md`: eight support-specific tables, existing
  merchant/store/admin identities, exact Created/Pending/Closed ticket statuses,
  account-scoped tickets before store creation, private conversation/context
  controls and durable creation/closure emails to brand and admin.
- Reuses the existing platform email jobs rather than a second delivery
  service. Defines atomic notification intents, retries, recipient deduplication
  and truthful delivery state, plus an optional private attachment stage.
- Design/documentation only. No application behavior, database schema, provider
  settings or production deployment was changed; no emails were sent.
