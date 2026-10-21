# Integration, migration and deployment command register

## 21 October 2026: Responsive collection filters

- `node --test --test-concurrency=1 tests/collection-filter-controls.test.js tests/collection-filters.test.js tests/aura-collections.test.js tests/storefront-product-details.test.js tests/storefront-commerce-shell.test.js tests/aura-layout.test.js tests/browser-module-delivery.test.js`: 54 checks passed.
- `node scripts/build-browser-assets.mjs`: built 31 versioned entries and 42 files.
- Restarted the existing web/API preview workflows once after the UI batch. Desktop 1280px and mobile 390px screenshots of the isolated collection fixture confirmed sidebar/filter-bar placement and successful module delivery.
- `git diff --check`: clean. No production deployment or database migration.

## 21 October 2026: Collection filters and Ann copy, local verification

- `node --test --test-concurrency=1 tests/collection-filter-controls.test.js tests/collection-filters.test.js tests/aura-collections.test.js tests/storefront-product-details.test.js tests/storefront-commerce-shell.test.js tests/aura-layout.test.js`: focused controller, facet, publication-boundary and theme regression coverage.
- `node scripts/build-browser-assets.mjs`: versioned browser assets build successfully.
- Focused suite: 52 checks passed; `node --test tests/browser-module-delivery.test.js` verifies transitive module delivery through the Worker, including the new filter dependencies.
- Restarted the existing preview workflows; inspected the isolated collection fixture and corrected the explicit Worker module allowlist after the visual check exposed a blocked dependency.
- No migration or Cloudflare deployment command was run.

## 21 October 2026: Approved quota migration and Cloudflare release

- Read-only production preflight confirmed prerequisite migration records, administrative role and offered Free allowances without printing credentials.
- `node --test --test-concurrency=1 tests/plan-capacity.test.js`: 14 checks passed, including the manual selector and preservation of existing callable identities.
- `node db/migrate.js --staged-plan-capacity`: committed the new schema and checksum together. Historical migration checksums were not rewritten.
- `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars`: published version `001abcf6-826b-4a78-a026-5ac9c9df6a64`.
- Post-release Cloudflare API comparison: 100% traffic to the new version; 28 bindings, 17 encrypted secrets and runtime settings unchanged. Read-only APP-capacity probe and live pricing/login/dashboard-bundle checks passed.

## 21 October 2026: Draft-inclusive capacity verification

- Local-only: `node --test --test-concurrency=1 tests/plan-capacity.test.js tests/platform-billing-usage.test.js tests/platform-billing-usage-sql.test.js tests/platform-billing-cards.test.js`.
- SQL tests use one sequential disposable PGlite instance with real foundational/table DDL. No production database queries or mutations and no real R2 uploads.
- Staged `db/staged/0055_plan_capacity.sql` requires explicit manual migration approval before activation. Production deployment remains unapproved for this request.

## 21 October 2026: Approved checkout-security production rollout

- `node db/migrate.js --staged-checkout-security`: applied and committed only
  0054; no historical migration changes.
- Tenant-scoped provisioning checked real domain readiness and provider widget
  read-back, then saved encrypted private credentials. Dedicated checkout-only
  Worker encryption was installed without exposing values or changing existing
  authentication/payment keys.
- The checkout-security regression suite and existing custom-domain integration
  test passed after the key boundary fix. New lightweight key-isolation and
  early-failure regressions cover the cause.
- `pnpm exec wrangler deploy --keep-vars`: final active version
  `1bcf1b26-865c-4326-bf60-e569383fc320`, 100%.
- Compared existing binding fingerprints, routes and compatibility before/after;
  only the dedicated encrypted checkout binding was added. Live checkout,
  homepage, login and unauthenticated-admin checks passed, without emails/orders.

## 21 October 2026: Automatic checkout security, local verification

- Executed focused backend, migration, isolation, provider-failure and UI
  tests, browser asset build and syntax/diff checks.
- Restarted the existing API and web workflows as a batch; both are serving.
- Production commands are staged, NOT RUN:
  `node db/migrate.js --staged-checkout-security`, then the established
  Cloudflare publish procedure with binding and route preservation.
- Existing token needs account-level Turnstile Edit before live provisioning.
  No credentials are requested in chat or logged.

## 21 October 2026: Checkout security hostname diagnosis

Read-only public checkout/CSP and Turnstile widget inspection identified missing
merchant hostname authorization. Targeted widget PUT was rejected with 403;
read-back confirmed no change. Token values and widget secrets were not logged.
No app publish, database writes, checkout orders or email sends.

## 21 October 2026: Approved store link and forwarding instructions release

```sh
pnpm exec wrangler deploy --keep-vars
```

Released `07f14c77-2d80-4ed4-840b-d5309b2b052f` at 100%. Live module and
versioned stylesheet/module delivery verified, including SSL indicator and
forwarding text. Configuration fingerprints/routes unchanged, fallback active;
public/account/connected-www responses and protected admin redirect passed.
No DB, DNS, forwarding or payment writes.

## 21 October 2026: Store link and forwarding guidance, local verification

```sh
node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js tests/dashboard-navigation.test.js
git diff --check
```

34 checks passed, including exact safe HTTPS links, inactive/invalid hostname
suppression, www-only forwarding instructions and SSL state classification.
Managed API restarted, pending-state screenshot inspected, no browser errors.
Read-only public/domain inspection confirmed SSL active and the www address
responding successfully. No registrar/merchant writes or publication yet.

## 21 October 2026: Below-button connection results

```sh
node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js
git diff --check
pnpm exec wrangler deploy --keep-vars
```

23 checks passed. Fixture screenshot verified after managed API restart.
Released `19bb4a60-14ed-48c1-8e63-97aba578f987`, verified live asset and
configuration preservation. Read-only certificate metadata/public TXT check:
matching challenge, pending validation, no reported errors. No DNS or
certificate writes and no merchant activation.

## 21 October 2026: Guided domain flow verification and release

```sh
node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js tests/dashboard-navigation.test.js
git diff --check
pnpm exec wrangler deploy --keep-vars
```

32 tests passed; desktop and mobile screenshots inspected after restarting
the managed API. Released `80efbc45-e136-4e13-aafd-c94d4ee542c8` at 100%.
Pre/post-release configuration fingerprints matched. Fallback active.
Live assets verified through versioned stylesheet/module entries, and public
site, login and protected admin redirect responses passed. No DB operations
or merchant domain/payment mutations.

## 21 October 2026: Approved domain guidance release

```sh
pnpm exec wrangler deploy --keep-vars
```

Published `16d60e6d-f434-4840-96cc-300b648f954f` at 100% traffic. Compared
pre/post-release binding hashes, compatibility and routes; all unchanged.
Fallback active. Verified updated domain guidance in live public module and
successful root/sign-in/protected-route responses. No database operations,
merchant domain activations or payment mutations.

## 21 October 2026: Domain instructions and payment explanation, local

```sh
node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js tests/dashboard-navigation.test.js tests/razorpay-oauth-ui.test.js
node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js
git diff --check
```

33 checks passed; the 22 affected launch/UI/provider checks passed after final
error-copy changes. Restarted managed API workflow once, confirmed readiness
and successful requests, and inspected the synthetic
`/__step4-preview?view=settings&connection=domain` screenshot. No production
deployment, migration, merchant domain or payment mutations.

## 21 October 2026: Custom-domain infrastructure setup

```sh
node scripts/configure-custom-domains.mjs
node scripts/configure-custom-domains.mjs --apply
node --test --test-name-pattern='Cloudflare operator' tests/commerce-runtime.test.js
```

Owner-approved infrastructure changes only. The operator helper reused matching
DNS records and added the missing SaaS Worker route. A guarded in-memory Node
wrapper used targeted Cloudflare Worker Secret PUTs for the token and zone ID,
and resubmitted the same fallback origin to refresh its validation. No secret
arguments, plaintext credential files, DNS deletion or app-code deploy.

Read-only verification: code-module hashes and previous binding fingerprints
unchanged; original routes preserved; non-fallback DNS hashes unchanged;
fallback active and all four readiness indicators complete. Cloudflare marked
the fallback DNS record in metadata on activation. Public sign-in/root responses
and private admin redirect passed. Focused operator test and the three-route
config assertion passed. Configuration version:
`e02d943b-bd47-4dcc-a980-1721fea4dc67`, 100%. No merchant activation.

## 20 October 2026: Approved re-review activation

```sh
pnpm exec wrangler deploy --keep-vars
node db/migrate.js --staged-business-review-reconsider
```

Owner-approved compatible code published first; version
`96c64df1-6959-4712-af4d-5fdacac62edf` serves all traffic. Binding/compatibility
fingerprints are unchanged. Staged 0053 committed to existing shared Supabase;
checksum, effective grants, email trigger/scheduler and live protected-route
and asset responses verified read-only. No document/decision/email test writes.

## 20 October 2026: Local approved-document re-review verification

```sh
node --test --test-concurrency=1 tests/business-review-reconsider.test.js tests/business-review-after-publication.test.js tests/business-review.test.js tests/platform-admin.test.js
git diff --check
```

Seven focused checks passed. Managed Worker restarted once and built cleanly;
isolated approved-document re-review screenshot verified the new form and
retained Approved state. Flag `--staged-business-review-reconsider` is registered
but has not been run against the shared database. No production changes.

## 20 October 2026: Approved admin session recovery publication

```sh
pnpm exec wrangler deploy --keep-vars
```

Version `ea196084-e792-4501-bdea-3ac6482ba20f` serves 100% traffic.
Read-only Cloudflare fingerprints confirm unchanged bindings, encrypted
secrets and compatibility. Live login copy, no-session cookie clearing,
cross-origin sign-out rejection, anonymous route protection and admin assets
verified without a real-account login. No SQL or credential operation.

## 20 October 2026: Local admin session recovery verification

```sh
node --test --test-concurrency=1 tests/platform-admin.test.js tests/support-tickets.test.js tests/business-review.test.js
git diff --check
```

Seventeen checks passed, followed by one successful browser journey using only
the isolated platform-admin PGlite preview. A read-only production metadata
audit confirmed the configured administrator is present/active and APP grants
exist. No production sessions created or credentials changed. Managed Worker
restarted once and built cleanly. Code-only release awaits approval; no
migration is required.

## 20 October 2026: Approved review-after-publication activation

Working directory: repository root. Targets: existing Cloudflare Worker and
shared external Supabase database. Explicit owner approval covered both.

```sh
pnpm exec wrangler deploy --keep-vars
node db/migrate.js --staged-business-review-after-publication
```

Published compatible code first; verified unchanged binding/compatibility
fingerprints and 100% traffic before applying the staged migration.
Version `8b8f3200-f4e2-4c78-845d-2e1d5f7c83b0` is active. Migration committed;
read-only verification confirms matching checksum, readiness/approval
separation, decision-email trigger, scheduler and restricted role grants.
Thirty-two live assets/dependencies returned 200 and anonymous review/document
requests redirect to login with no-store. No production business data or
documents were read and no real review/email/payment was initiated for testing.

## 20 October 2026: Review-after-publication local verification

Working directory: repository root. Target: isolated PGlite fixtures and local
managed preview, not the shared database.

```sh
node --test --test-concurrency=1 tests/business-review-after-publication.test.js tests/business-review.test.js tests/free-subscriptions.test.js tests/ann-business-gate.test.js tests/settings-business-documents.test.js
node --test --test-concurrency=1 tests/email.test.js tests/email-preferences.test.js
node --test --test-concurrency=1 tests/business-review-after-publication.test.js
git diff --check
```

Thirty focused checks passed; the new staged-policy checks passed again after
the final editor/recipient refinements. Synthetic admin review screenshots and
the managed Worker browser build succeeded. Migration switch
`--staged-business-review-after-publication` is registered but not executed
against the shared database. No deployment or real emails.

## 20 October 2026: Approved Help & support styling publication

Working directory: repository root. Target: existing Cloudflare production
Worker. Prerequisites: explicit owner approval, four passing support-shell
checks and verified synthetic dashboard screenshot.

```sh
pnpm exec wrangler deploy --keep-vars
```

Version `4296fe19-25c4-4e17-91e5-f9b448250416` serves 100% of traffic.
Read-only API comparisons confirmed 25 unchanged bindings, including 14 secrets,
and unchanged runtime compatibility. Six live support assets/dependencies
returned 200; new styling and anonymous access protection verified.
No SQL or payment operation was executed.

## 20 October 2026: Approved adaptive Ann publication

Working directory: repository root. Target: existing Cloudflare production
Worker. Prerequisites: explicit owner approval and the completed 18 focused
checks, browser build and desktop/phone layout screenshots.

```sh
pnpm exec wrangler deploy --keep-vars
```

Observed version: `0462d949-825d-4e64-b0b6-1c8f32b6eeaa`, 100% traffic.
Read-only Cloudflare API comparisons confirmed all 25 bindings, including 14
encrypted secrets, and compatibility settings unchanged. HTTPS checks verified
32 Ann assets/dependencies, the adaptive controller in the live bundle and
anonymous access protection. No SQL or payment operation was executed.

## 20 October 2026: Approved dashboard support publication

Working directory: repository root. Target: existing Cloudflare production
Worker, with explicit user approval.

```sh
pnpm exec wrangler deploy --keep-vars
```

Observed production version: `1eacae8a-116b-4045-a81f-18a1a7dd08ab`, 100%
traffic. Snapshot comparison showed all 25 bindings unchanged, including 14
encrypted secrets, with unchanged compatibility settings. Read-only HTTPS checks
confirmed protected dashboard support routes and 14 successful dashboard/support
asset-dependency responses. No SQL migration or test email was executed.

## 20 October 2026: Dashboard support placement, local verification

Repository root, isolated fixtures:

```sh
node --test --test-concurrency=1 tests/support-shell.test.js tests/support-tickets.test.js tests/dashboard-navigation.test.js tests/dashboard.test.js
node --test --test-concurrency=1 tests/support-tickets.test.js
git diff --check
```

The mixed run completed dashboard/navigation and shell checks, then was
interrupted by a tool disconnect while starting the SQL fixture. The separate
support run passed all 14 checks. Whitespace validation passed. Restarted the
existing managed API/web workflows; the normal browser-assets build succeeded.
An isolated owner preview verified dashboard chrome and support content together.
No shared migration, production deployment or real emails performed for this
placement change.

## 20 October 2026: Approved support production release

Working directory: repository root. Target: existing shared Supabase database
and Cloudflare `lebrands-store`. Explicit user migration/publication approval;
existing administrative database and Cloudflare secrets were used without
printing their values.

```sh
node db/migrate.js --staged-support-tickets
pnpm exec wrangler deploy --keep-vars
```

Observed: migration committed and its checksum matched; eight tables have
forced RLS, no effective anon/authenticated execution grants on support helpers,
and no required APP function grant was missing. Published Worker version
`c9f56bbc-161f-4b8a-ba49-f98e8058941c` is at 100%. Production binding
fingerprints and compatibility were unchanged. Read-only HTTPS checks verified
sign-in redirects, API 401 responses and six support asset/dependency HTTP 200s.
No test ticket or real test email was sent.

## 20 October 2026: Local support ticket implementation

Executed against local/synthetic fixtures only:

```sh
node --test --test-concurrency=1 tests/support-shell.test.js tests/support-tickets.test.js tests/platform-admin.test.js tests/dashboard-navigation.test.js tests/dashboard.test.js tests/email.test.js tests/email-preferences.test.js
git diff --check
```

Result: 58 passing checks. Managed web/API workflows were restarted; subsequent
source changes rebuilt automatically. The API's existing custom build,
`node scripts/build-browser-assets.mjs`, completed with 31 versioned entries.
Synthetic browser checks covered the ticket lifecycle and phone layout; the
preview-only fixture has no real email queue.

Prepared, **not executed**: the staged support migration and Cloudflare
publication. No live provider calls, email sends, secret changes or shared
database writes were performed.

## 20 October 2026: Transient partner receiver diagnostics

- Read-only Worker settings query: persistent Observability/Logpush not enabled.
- Started a five-minute `wrangler tail` session in JSON mode for POST requests,
  with a local strict partner-path filter and safe field-only output. Raw
  headers, signatures and payloads were not printed or written to output files.
- Sent a deliberate unsigned agent connectivity probe to the partner path:
  HTTP 400, subsequently observed in the live stream. Not a provider delivery.
- No stored-history claim, application/configuration release, database write,
  checkout activation or real financial operation.

## 20 October 2026: Approved UI release and read-only production audit

- Names-only Cloudflare settings audit plus read-only external Supabase
  `schema_migrations`/function ACL inspection: 49 migration records, no pending
  local filenames, matching OAuth checksums and correct restricted helper
  grants. Eight historical source/checksum mismatches were reported, not
  repaired. No financial or merchant records queried.
- Ran the eight release-focused Node test files serially: 42 tests passed.
  Wrangler dry-run compiled browser assets successfully. Before publication,
  compared source-module sections of deployed and release Worker bundles:
  only dashboard server UI changed.
- Executed owner-approved
  `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars`.
  Main Worker version: `655025e5-5a72-4e11-b9a8-52754abc207c`.
  No migration command or independent Test/other-product deploy was run.
- Post-release metadata verified all previous binding fingerprints and route
  patterns unchanged. Homepage/login 200; callback 303; Settings entry and four
  transitive JS modules 200; invalid webhook signature 400; signed synthetic
  unknown-account event 200; separate Test health configured/test/200.

No checkout activation, real payment/refund, matched merchant webhook mutation,
source-secret exposure or administrative credential copy.

## 20 October 2026: Live partner webhook binding and endpoint checks

- With explicit confirmation of intentional Test/Live secret reuse, used one
  targeted Secret PUT to bind the saved Live entry on the main Worker.
  No values were printed or placed in files/arguments.
- Verified encrypted binding presence, unchanged unrelated bindings, unchanged
  code-module hashes and retained compatibility date/flags/usage model.
- External POST probes to the production partner endpoint: no signature 400,
  incorrect signature 400, signed synthetic unknown account 200/received=true,
  signed-but-tampered body 400. These were agent-generated probes, not
  Razorpay-sent events. The valid probe exercised only read-only unknown-account
  routing and did not verify real merchant processing.
- Separate Test receiver health remained HTTP 200, configured and in test mode.
- Did not activate checkout, authorise a merchant, upload source, create an
  order or process a real payment/refund.

## 20 October 2026: Production Live client bindings applied without code upload

- Refreshed the managed API after the secure secret confirmation. Boolean-only
  preflight still found matching Live/Test signing secrets; did not write a
  production webhook secret.
- Settings-only multipart PATCH with inherited bindings returned HTTP 400,
  code 10057. Existing settings remained unchanged.
- Used four targeted Cloudflare Worker Secret PUT requests for the Live client
  pair, `RAZORPAY_OAUTH_MODE=live` and the registered production callback.
  Credentials came directly from runtime Live-only secret entries, never files,
  arguments or printed values. Non-sensitive mode/callback are encrypted too.
- Before/after comparisons confirmed unchanged production code module hashes
  and unchanged unrelated bindings. Cloudflare version annotations changed;
  read-only deployment-history comparison confirmed the previous compatibility
  date, flags and usage model were retained.
- External checks: production login 200, callback 303, unsigned partner webhook
  503 because its secret remains absent; isolated Test receiver health 200,
  configured=true and mode=test.

No application source upload, customer/store mutation or payment activation.
The Razorpay Live webhook already exists. Resolve the matching-signing-secret
question before writing its Worker binding or claiming webhook verification.

## 20 October 2026: Live OAuth production preflight, no changes applied

- User explicitly approved production configuration only, with checkout off.
- Read Cloudflare main Worker settings and deployment metadata using runtime
  credentials without printing values. OAuth bindings/mode were absent and a
  single active version had 100% traffic.
- Consulted Cloudflare's published SDK for settings-only multipart PATCH and
  inherited bindings. A read-only `/content` probe returned 405; the SDK
  documents the Worker root GET for a code baseline. No source was uploaded.
- The guarded configuration command stopped during local secret validation,
  before its PATCH: Live client pair differs from Test, but webhook secrets
  match. Restarted the managed API once and confirmed the same boolean result.
- No production binding was written, no provider event was sent, and no
  checkout, merchant record or deployment code was changed.

Pending: update only the existing Live webhook's signing secret and the
Live-only secure entry, then resume the approved guarded configuration.

## 20 October 2026: Single-surface integration Settings verification

- `node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/razorpay-oauth-ui.test.js tests/dashboard-navigation.test.js`:
  23 checks passed; Settings assertions reject the nested onboarding/provider
  card wrappers while preserving provider actions.
- `git diff --check`: clean.
- Restarted `artifacts/api-server: API Server` once to rebuild browser assets.
  Current page/module requests succeeded after startup.
- Screenshot of `/__step4-preview?view=settings&connection=payments` confirmed
  one outer ticket with a flat status/content area, no nested card borders and
  no duplicate Razorpay headings. The capture uses read-only synthetic data.

No provider operation, secret change, database write or production deployment.

## 20 October 2026: Razorpay Settings UI cleanup verification

Working directory: workspace root. User approved UI cleanup only.

- `node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/razorpay-oauth-ui.test.js tests/dashboard-navigation.test.js`:
  23 checks passed after updating obsolete manual-form expectations.
- `git diff --check`: clean.
- Restarted `artifacts/api-server: API Server` once to rebuild browser assets.
  Logs confirmed startup and successful versioned-module delivery.
- Screenshot of `/__step4-preview?view=settings&connection=payments` confirmed
  the ticket-style page without manual key inputs, payment-choice tiles or
  Save choices. This route uses read-only synthetic data, not a signed-in real
  merchant account.

No database migration/write, provider operation, secret update, COD setting
change or Cloudflare production deployment was performed.

## 20 October 2026: Native Preview and OAuth configuration repair

Working directory: workspace root. User reported an unavailable Connect button
and a native Preview missing-route error.

- Read current artifact service definitions and confirmed the web entry owns
  `/`, while the internal API owns `/__worker`.
- Used `verifyAndReplaceDotReplit` on a temporary complete configuration to
  remove the lone legacy external-port mapping. No direct protected-file edit
  was accepted.
- Used `verifyAndReplaceArtifactToml` to rename the API artifact without changing
  its identity, port, command or paths.
- `node --test --test-concurrency=1 tests/native-oauth-preview.test.js tests/live-preview.test.js`:
  seven checks passed for bounded bindings and account/callback routing.
- Restarted `artifacts/lebrands-web: web` once after the changes. Logs confirmed
  Vite readiness and successful proxied asset/page responses.
- Unauthenticated external requests: root/login HTTP 200, dashboard/callback
  HTTP 303 to `/login`. Native readiness reported connected=true,
  restricted application role=true and razorpay_oauth_available=true.
  The readiness check reads role/schema metadata only.
- Native Preview screenshot of `/login` showed the real ticket-style sign-in
  page rather than a router error.
- `git diff --check`: clean.

No migration, customer/store-record mutation, production credential change,
main Worker deployment or financial action was performed.

## 20 October 2026: Refreshed Development credentials

Working directory: workspace root. User supplied the OAuth Development client
pair again through the secure form.

- Restarted `artifacts/api-server: API Server` to load the updated environment;
  logs confirmed the service was serving requests again.
- One additional deliberately invalid-code token probe returned HTTP 401.
  Treat this as inconclusive credential validation, not proof of a bad pair.
- Boolean-only copy-format checks found no outer whitespace, wrapping quotes or
  merchant API-key prefix. No values were displayed.
- A GET to the actual authorisation endpoint with application configuration but
  no merchant session returned HTTP 200. This does not prove completed consent.
- Consulted the official Razorpay integration example to verify the JSON token
  request shape.
- A guarded `pnpm exec wrangler secret bulk --config wrangler.oauth-test.jsonc`
  updated only the isolated receiver's client ID and client secret through
  stdin. Both bindings were created successfully. Output was redacted; no
  production Worker configuration or stored merchant credentials were changed.

Stop negative-code probes here. Continue with a valid owner-consented code,
the registered Development callback and Razorpay-sent Test delivery.

## 20 October 2026: Public Test receiver deployment and network verification

Working directory: workspace root. Scope approved by the user: isolated OAuth
Test verification, not production store deployment or payment activation.

- Restarted `artifacts/api-server: API Server` after the secret update; runtime
  minimum-length validation then passed. The previous check had used a stale
  environment value.
- A guarded Node wrapper executed `pnpm exec wrangler deploy --config wrangler.oauth-test.jsonc`
  for the isolated receiver only, with no custom routes or scheduled triggers.
  Cloudflare returned its public workers.dev URL.
- The wrapper executed `pnpm exec wrangler secret bulk --config wrangler.oauth-test.jsonc`
  with required Test credentials/encryption configuration passed through stdin,
  never command arguments or files. Four secret bindings were created. Output
  was filtered against sensitive values before display.
- An external HTTP probe script passed all eight receiver checks. Signed probes
  used a deliberately synthetic unknown account/payment identifier; they did
  not read or mutate merchant records. Non-secret result reports are under
  ignored `generated-artifacts/`.
- One POST to the real Razorpay token endpoint used Test configuration and a
  deliberately invalid consent code. HTTP 401 indicated rejected client
  credentials. Raw provider responses and credential values were not logged.
- The Development callback initially returned 404. After correcting account
  routing and restarting the API service, a fresh unauthenticated request
  returned HTTP 303 to `/login`, the expected sign-in guard.
- `node --test --test-concurrency=1 tests/live-preview.test.js tests/razorpay-oauth-test-worker.test.js`:
  seven checks passed.
- `git diff --check`: clean before documentation additions.

Only the Test receiver was published. Main store hosting/routes, live merchant
integrations, customer orders and payment settings were unchanged. Real OAuth
consent and Razorpay-sent delivery remain unverified.

## 20 October 2026: Isolated Test receiver preflight

Working directory: workspace root. Target: a separate Cloudflare Test receiver,
not the main production Worker. User requested proceeding with Test verification.

- `node --test --test-concurrency=1 tests/razorpay-oauth-test-worker.test.js`:
  both checks passed, covering strict Test mode, route isolation, signature
  rejection before database access and unchanged raw-body forwarding.
- `pnpm exec wrangler deploy --config wrangler.oauth-test.jsonc --dry-run --outdir generated-artifacts/razorpay-oauth-test-build`:
  bundled successfully without uploading.
- A guarded deployment wrapper checked the isolated configuration and secret
  presence/minimum-length booleans. The Test signing-secret check failed before
  any real deploy or secret-bulk command was invoked. No secret values were
  printed or written to files.
- Replit deployment metadata confirmed there is no Replit-hosted deployment;
  it was not used to infer the separate Cloudflare production state.

External provider verification is blocked; no Cloudflare release or real
Razorpay consent/webhook delivery occurred in this attempt.

## 20 October 2026: Approved shared Supabase OAuth migration

Working directory: workspace root. The user explicitly approved the OAuth
migration to the existing shared Supabase database. The existing runner used
only the administrative secret, validated its Supabase target, cleared PG
environment fallbacks and used one SSL client per command.

- `node db/migrate.js --staged-razorpay-oauth`: committed the routing/refresh
  functions and its migration record. Existing commerce-runtime prerequisites
  were checked by the runner.
- A read-only metadata check verified its checksum and function search paths,
  but failed the intended permissions check because Supabase had granted
  execution directly to its API roles through default privileges.
- `node db/migrate.js --staged-razorpay-oauth-permissions`: committed targeted
  revocations for those same two functions, retaining application-role
  execution. The first migration/checksum was not rewritten.
- A second read-only metadata check verified both checksums and effective
  permissions: application execution allowed; PUBLIC, anon, authenticated and
  service_role execution denied for both functions.
- `node --test --test-concurrency=1 tests/razorpay-oauth.test.js tests/migration-selection.test.js`:
  11 checks passed, including a fixture reproducing Supabase's direct defaults.
- `git diff --check`: clean.

Only schema/migration metadata was queried, not merchant data. No business
records, global default privileges, production secrets, deployed Worker,
provider configuration or payment activation were changed.

## 20 October 2026: Razorpay OAuth verification

- Ran seven focused Node test files serially: OAuth backend/UI, Ann launch
  backend/UI, commerce runtime, dashboard navigation and migration selection.
  The combined pass initially identified a missing launch-state row in the new
  first-connection path; fixed connection completion to create it.
- Re-ran the changed OAuth backend/UI scope: all 11 checks passed. Together with
  the unchanged passing regression scope, 39 checks are covered. `git diff
  --check` was clean.
- One isolated browser pass mocked every private API and provider navigation,
  using only the public fictional integration preview. Connect, refresh,
  disconnect, activation denial, read-only fallback and mobile width worked.
  The stale callback success message it found was fixed and verified with a
  targeted regression. No real provider consent or signed network delivery was
  claimed.
- Restarted the existing managed workflows after source/configuration batches.
  The local API started with redacted OAuth client/mode/callback bindings; the
  synthetic integration page and versioned browser assets returned 200 and were
  visually checked.
- Set only development non-secret mode/callback variables through the environment
  tooling. The client secrets were supplied by the user through the secure form;
  their values were never inspected. After the user confirmed correcting the
  test webhook signing secret, added its development Worker binding and
  restarted the managed API workflow. No Razorpay webhook was created.
- No live database read/migration, real merchant/provider operation, production
  secret update, package installation or deployment command was performed.

## 20 October 2026: Grid cells and defaults, phase 4

- Ran `node --test --test-concurrency=1` over 17 section/grid/layout/controller/
  persistence/asset regression files. All 91 checks passed. The real PGlite
  fixture verified persisted responsive settings, cell text/link/order, invalid
  grid rejection and stale revision rejection.
- Restarted existing managed web/API workflows after the coherent source batch.
  Synthetic `/__ann-builder-preview/sections-editor` returned 200; the new
  allowlisted grid UI JavaScript asset also returned 200.
- Used fictional local fixtures only. No real database queries or migrations,
  package installs, provider operations, publication or deployment commands.
- One bounded isolated browser journey passed: four-cell gallery configuration,
  caption and intentional empty body, move/Undo/move, PATCH 200 and reload,
  shared Ann visibility, duplicate/delete/Undo and 390px mobile usability.
- After final default/hidden-cell edge fixes, reran the 33 affected checks; all
  passed. Restarted the API after that coherent follow-up batch, inspected logs
  and confirmed the synthetic editor renders with a final screenshot.

## 20 October 2026: Section layout previews, phase 3

- Working directory: repository root. Target: local development and fictional
  PGlite fixtures only. Prerequisite: existing workspace packages.
- Ran `node --test --test-concurrency=1` for 14 focused layout, insertion,
  controller, workspace, rendering, persistence and styling test files:
  all 80 cases passed.
- Ran `tests/browser-bundles.test.js` separately with the new preview modules:
  passed the actual Worker raw and versioned asset gates, static import graph,
  request limits and immutable/public cache boundaries. Ann uses 11 requests.
  Initial optional-import graph exceeded the limit; static imports fixed it.
- Restarted the existing managed web and API workflows once after the batch.
  Development curl on `/__ann-builder-preview/sections-editor` returned 200.
  Only the synthetic fixture readiness flow was used.
- The single isolated browser journey passed layout preview, cancel, apply,
  Undo, HTTP-200 save, reload and continuity in Ann, plus 390px dialog overflow
  and scrollability checks. Evidence identified anonymous font CORS from the
  opaque iframe; fixed only the three public allowlisted font responses.
  Added `tests/public-fonts.test.js`, checked the corrected header directly,
  and kept sandbox permissions unchanged. The font/UI/asset correction batch
  passed 20 checks, bringing distinct scoped coverage to 82 cases. Restarted
  the API for this fix; development HEAD with `Origin: null` returned 200,
  `Content-Type: font/woff2` and `Access-Control-Allow-Origin: *`. Final
  screenshot confirmed the editor remained available after Vite's automatic
  restart (which intentionally resets the fictional fixture).
- `git diff --check` passed. No dependency install, schema migration, live
  database read/write, production deployment or publishing command was run.

## 20 October 2026: Section library phase 2

- Working directory: repository root. Target: local preview and isolated
  fictional PGlite fixtures only. Prerequisite: existing workspace packages.
- Ran focused `node --test --test-concurrency=1` checks for section instances,
  drag helpers, library UI, Ann workspace/controller and standalone editor.
  Latest combined client/model pass: 48 tests, all passing.
- Ran `tests/section-instances-persistence.test.js` against the real restricted
  role handlers in isolated PGlite. Save/reload, stale revision rejection,
  foreign binding rejection and protected-core validation passed.
- Ran existing rendering/Worker bundle checks. Browser graph check passed,
  including the new raw-module asset gates. No package installation.
- Restarted the two managed API/web workflows after the application batch.
  Used development-only curl on `/__ann-builder-preview/sections-editor`.
  Synthetic document setup initially failed closed on an incorrect scanner
  test response; corrected its engine to the real configured-scanner contract.
  Subsequent isolated preview returned HTTP 200.
- Final coherent `node --test --test-concurrency=1` run covered 13 scoped test
  files and passed all 70 cases. No failing or skipped cases.
- Captured desktop preview. One bounded browser journey confirmed insertion,
  independent edits, keyboard/pointer ordering, cancel, delete/Undo, draft
  save/reload, continuation in Ann and protected/transaction-page boundaries.
  Mobile 390px view had no measured horizontal overflow; CDP touch start and
  cancellation preserved saved order. The explicit browser PATCH status was
  not captured, but UI/reload persistence and isolated API HTTP assertions
  passed. Existing sandbox warnings and intermittent preview capture behaviour
  are noted in the implementation journal.
- `git diff --check` passed. No production database, migration or deployment
  commands were executed.

## 20 October 2026: Section library phase 1

- `node --test --test-concurrency=1 tests/section-library.test.js tests/section-library-ui.test.js tests/ann-design-workspace.test.js tests/ann-editor-sections.test.js tests/ann-section-content.test.js tests/browser-bundles.test.js`: 29 passed; two existing label assertions then updated for intentional universal names.
- `node --test --test-concurrency=1 tests/ann-editor-sections.test.js`: all three passed after those expectations were updated. Together the scoped checks cover 31 distinct passing cases.
- `git diff --check`: passed.
- Restarted managed API and web previews once after application changes.
- Captured desktop/mobile `/__ann-builder-preview/section-library`; this local
  read-only route opens before synthetic database initialization. No data writes.
- Workflow logs confirm both new raw modules served with HTTP 200; bundle tests
  exercise the actual Worker asset gate. Production deployment not run.

## 19 October 2026: Complete public discovery inventory

- `node --test --test-concurrency=1 tests/platform-seo.test.js`: verify all
  public destinations, crawler responses and sitemap/AI-guide inventory parity.
- `git diff --check`: whitespace validation.
- Managed API workflow restart: refresh static discovery assets.
- `pnpm run deploy`: manual production release, not executed. No migration.

## 19 October 2026: Two Ann editorial guides

- `for image in src/public/img/blog/ann-*.svg; do magick "$image" -strip -define png:compression-level=9 "${image%.svg}.png"; done`: generate the two social-image derivatives.
- `node --test --test-concurrency=1 tests/platform-blog.test.js tests/platform-seo.test.js`: verify the expanded public library and Ann content coverage.
- `git diff --check`: whitespace validation.
- Managed API workflow restart and article screenshot: confirm public serving
  and readable layout. `pnpm run deploy` remains a manual release; not executed.

## 19 October 2026: Twenty-article library and heading adjustment

- `bash scripts/build-blog-images.sh`: create stripped PNG social derivatives
  of the original SVG illustrations using the existing ImageMagick installation.
- `node --test --test-concurrency=1 tests/platform-blog.test.js tests/platform-seo.test.js`:
  eleven checks passed, covering twenty articles, forty image assets, public
  routing, sitemap coverage, metadata, related links and copy restrictions.
- `git diff --check`: whitespace validation.
- Managed API workflow restart: rebuild public assets and serve the new content.
- `pnpm run deploy`: manual production release; not executed. No migration.

## 19 October 2026: Public wording correction

- `node --test --test-concurrency=1 tests/platform-blog.test.js tests/platform-seo.test.js tests/platform-billing-cards.test.js tests/compare-page.test.js tests/dashboard-navigation.test.js`: scoped content, metadata and UI regression verification.
- `git diff --check`: whitespace validation.
- Managed API workflow restart: rebuild changed browser modules and serve updated copy.
- `pnpm run deploy`: manual release required; not executed by the agent. No migration.
- An older Compare test still expected the retired "buying options" label;
  aligned it with the existing "variants" terminology. Production terminology
  was not changed.

## 19 October 2026: Platform blog and search discovery

| Command / operation | Purpose | Actual outcome |
| --- | --- | --- |
| `bash scripts/build-blog-images.sh` | Rasterise the ten original SVGs with existing ImageMagick for social previews. | Ten PNG derivatives generated; all twenty blog image assets total about 416 KB. |
| `node --test --test-concurrency=1 tests/platform-blog.test.js tests/platform-seo.test.js` | Check article routes, structure, metadata, schema, asset gates, HEAD/404 behaviour, escaping and crawler files. | Eleven tests passed. An initial test expectation omitted HTML apostrophe escaping; corrected the expectation to match safe rendering. |
| `git diff --check` | Validate whitespace. | Passed. |
| Managed API workflow restart | Build and serve updated website and assets. | Local preview running; desktop index and mobile article checked. |
| `pnpm run deploy` | Release the public blog, image assets and crawler files to the existing Worker. | Required next action; not executed by the agent. No migration required. |

## 19 October 2026: PIN feedback colour correction

- `node --check src/public/checkout-contact.js`: client syntax validation.
- `node --test --test-name-pattern="postal lookup" tests/checkout-email-auth.test.js`:
  focused postal mapping/failure regression check.
- `git diff --check`: whitespace validation.
- Managed API workflow restart: rebuild and serve the updated browser assets.
- `pnpm run deploy`: required to release the correction; not executed by the agent.

## 19 October 2026: Shared commerce design and browser icons

Workspace verification commands used:

```sh
node --experimental-test-module-mocks --test --test-concurrency=1 tests/storefront-commerce-shell.test.js tests/commerce-options.test.js tests/ann-browser-preview.test.js tests/browser-bundles.test.js tests/*rich*.test.js tests/*section-layout*.test.js tests/sku-checkout.test.js
node --experimental-test-module-mocks --test --test-concurrency=1 tests/storefront-commerce-shell.test.js tests/sku-checkout.test.js
node --experimental-test-module-mocks --test --test-concurrency=1 tests/sku-checkout.test.js
git diff --check
```

The first batch exposed an invalid local-photo URL in the synthetic publication;
the fixture was corrected without weakening the database media-ownership guard.
Subsequent focused checks cover the stock-refresh and favicon boundaries. The
browser pass used only the isolated fixture and public Turnstile test key.
Managed web/API workflows were restarted for the completed code batches.
No production query, migration, online payment or email send was run.

Deployment command for the operator, **not run in this change**:

```sh
pnpm run deploy
```

This invokes the existing browser build and Cloudflare Worker deployment. No
additional migration or secret is introduced by the shared commerce design.

## 19 October 2026: Receipt, utility emails and notification preferences

Working directory: repository root.

- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/sku-checkout.test.js tests/email-preferences.test.js tests/email.test.js tests/storefront-commerce-shell.test.js tests/browser-bundles.test.js` passed 25 checks after correcting the receipt query against the real schema.
- **Executed locally:** `node --test --test-concurrency=1 tests/email-preferences.test.js tests/email.test.js` passed nine checks after final payment-state adjustments.
- **Executed locally:** `node --check src/index.js`,
  `node --check src/email/worker.js` and `git diff --check` passed.
- **Visual previews checked:** `/__sku-checkout-preview/sample-receipt?style=boutique`
  and `/__email-preview?type=confirmed` at 390px, using synthetic data only.
- **Suggested only, database mutation:** `pnpm run db:migrate -- --staged-email-preferences`
  reviews/applies `0043_email_preferences.sql`; prerequisite:
  `0014_transactional_email.sql`. Not executed against the configured database.
- **Suggested only, production mutation:** `pnpm run deploy` after migration
  review/application. Not executed. Live delivery requires the Worker's existing
  Resend secret and verified sender. No test email was sent to a real recipient.

## 19 October 2026: Shared storefront commerce

Working directory: repository root. Tests use synthetic/isolated data.

- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/wizard.test.js tests/commerce-options.test.js tests/commerce-runtime.test.js tests/sku-checkout.test.js tests/ann-browser-preview.test.js tests/aura-preview-motion.test.js tests/checkout-prefix-fixture.test.js` passed 50 checks.
- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/storefront-commerce-shell.test.js tests/ann-browser-preview.test.js tests/commerce-options.test.js tests/browser-bundles.test.js` passed 17 checks after saved-theme checkout framing.
- **Executed locally:** `node --test tests/storefront-commerce-shell.test.js`
  passed four focused checks after the final selected-logo fallback.
- **Executed locally:** `pnpm run typecheck` and `git diff --check` passed.
- **Executed in isolated browser:** one COD purchase and focused 390px
  responsive follow-up under `/__sku-checkout-preview/`; no live checkout.
  Mobile findings and incomplete style sweep are recorded in the daily journal.
- **Suggested only, production mutation:** `pnpm run deploy`, using the intended
  Cloudflare configuration/credentials. No migration is required. Not executed
  by the agent. Existing public slugs, cart IDs and SKU IDs are preserved.

## 19 October 2026: D2C policy content

- Working directory: repository root.
- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/policies.test.js tests/ann-readiness.test.js tests/wizard.test.js tests/store-approval.test.js`.
  Passed 31 checks after correcting the preservation/regeneration test sequence.
  Database mutations used isolated synthetic databases, not live merchant data.
- **Executed locally:** `git diff --check` passed after implementation.
- **Suggested only, production mutation:** `pnpm run deploy`. No migration is
  required. After deployment, explicitly regenerate drafts in Ann to replace
  old policy wording; review all six again before publishing. Regeneration
  overwrites draft customisations, so retain any wording you need first.

## 19 October 2026: Ann policy and contact fix

- Working directory: repository root.
- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/ann-readiness.test.js tests/dashboard-redesign.test.js tests/wizard.test.js` passed 27 focused checks, including isolated DB mutations.
- **Executed locally:** `pnpm run typecheck` and `git diff --check` passed.
- **Executed in isolated browser fixture:** dashboard Settings contact save and reload
  under `/__ann-builder-preview/catalogue/settings`; HTTP 200, with phone
  normalized and both fields persisted. Ann Review browser attempt was blocked
  by the fixture's business-document prerequisite; no live merchant data was used.
- **Suggested only, production mutation:** `pnpm run deploy`. Requires the
  intended Cloudflare credentials/configuration; no migration is needed for
  this change. Not executed by the agent.

## 19 October 2026: Google Analytics platform tag

- Working directory: repository root.
- **Executed locally:** `node --test tests/google-tag.test.js tests/platform-seo.test.js`
  passed eight checks with simulated browser globals and actual Worker public
  responses, without submitting live visitor events.
- **Executed locally:** `git diff --check` passed.
- **Suggested only, production mutation:** `pnpm run deploy`, using the intended
  Cloudflare configuration and credentials. Not executed. No migration or Google
  secret is needed for the public measurement ID.

## 19 October 2026: publication-review fixes

Working directory: repository root.

- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/wizard.test.js tests/ann-readiness.test.js tests/aura-media.test.js`
  passed 24 checks against synthetic fixtures and isolated databases.
- **Executed locally:** `pnpm run typecheck` and `git diff --check` passed.
- **Executed locally:** `node --experimental-test-module-mocks --test --test-concurrency=1 tests/wizard.test.js tests/ann-readiness.test.js tests/browser-bundles.test.js`
  passed the Worker asset gate and 21 other checks. The upload fixture needed
  the existing staged-billing schema probe represented; it passed after that
  test-fixture correction in the 24-check run above.
- **Suggested only, production mutation:** `pnpm run deploy`. Requires configured
  Cloudflare credentials and the intended production configuration. No database
  migration is needed for these UI/review fixes. Not executed by the agent.

**Added:** 19 October 2026. **Working directory:** the project root, unless stated otherwise.

This complements the [daily implementation journal](../IMPLEMENTATION_JOURNAL.md).
It records commands found in project documentation and scripts, plus commands
whose execution was directly observed in the recent work. It is **not a complete
terminal-history export**. Earlier shell sessions are not available as an audited
record, so a supported or documented command is not labelled as executed.

## Safety and evidence labels

- **Observed:** an execution and result were directly recorded in this
  conversation. The date identifies that observation, not a promise about a
  future run.
- **Documented:** present in project setup/release instructions; historical
  execution is not established.
- **Supported reference:** checked against a current script, dispatcher or the
  documented CLI pattern; not evidence that it was run.
- **Local write:** may install packages or write generated files, but is not a
  production deployment.
- **Database mutation:** changes the database selected by the configured
  administrative connection. It must be explicitly authorised.
- **Production/infrastructure mutation:** can change Cloudflare resources or
  publish a Worker version. Do not treat it as a harmless check.

No deployment, integration mutation, credential upload, database migration or
billing-switch operation was executed to create this register. Read-only source
inspection and local documentation validation were performed.
Do not run this document from top to bottom. Choose only the operation required,
check the target account/database, review prerequisites and obtain the appropriate
approval first.

Never put secret values in this file or in recorded command output. Use secure
prompts or the existing secrets tooling. Do not paste private connection strings,
tokens, personal email addresses or real account identifiers into journal entries.

## 1. Development, build and checks

| Command | Purpose and effect | Execution evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Install the locked workspace dependencies. Local write. | Documented in `docs/STEP1.md`; execution not established here. |
| `pnpm run typecheck` | Check workspace TypeScript projects. Can write incremental compiler metadata; does not deploy. | Observed passing during the 18 October product-media/form work. |
| `node scripts/build-browser-assets.mjs` | Build versioned browser assets and their manifest. Local generated-file writes, not publishing. | Observed passing during the 18 October product-media/form work. |
| `pnpm run test:offline` | Run the offline test suite. Use adequate memory and the existing concurrency limits. Not a live-service verification. | Documented in phase releases; no blanket all-tests-passed claim is made. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/product-form-controls.test.js tests/catalogue-forms.test.js tests/catalogue-classification-ui.test.js tests/ann-products.test.js` | Run the targeted product-form, catalogue and Ann regression checks using local fixtures. | Observed on 18 October: 17 tests passed. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/product-media.test.js tests/browser-bundles.test.js` | Check media helpers, theme rendering and browser bundle delivery. | Observed passing during the 18 October media work. |
| `node --check src/public/catalogue-form.js` | Parse the catalogue controller without running it. Read-only source check. | Observed passing during the 18 October form work. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/ann-rich-text.test.js tests/ann-rich-editor.test.js tests/browser-bundles.test.js` | Check safe formatting, all-style rendering, restricted-role draft persistence, editor helpers and the actual Worker module graph using local fixtures. | Observed on 19 October: 14 tests passed. |
| `node --check src/public/ann-design-ui.js` | Parse the shared Ann/theme-editor controller. Read-only source check. | Observed passing on 19 October. |
| `node --check src/public/ann-rich-editor.js` | Parse the shared formatting editor. Read-only source check. | Observed passing on 19 October; syntax is not browser-interaction verification. |
| `node --test --test-concurrency=1 tests/ann-rich-editor.test.js tests/browser-bundles.test.js` | From workspace root, check local editor helpers, scoped toolbar-control CSS and Worker module delivery. No production data or external integration calls. | Observed on 19 October after the readability fix: nine tests passed. |
| `git diff --check` | Check tracked working-tree diffs for whitespace/conflict-marker issues. It does not validate untracked files or application behaviour. | Observed in recent implementation/documentation work. |
| `pnpm --filter @workspace/lebrands-web run dev` | Start the web development service. Long-running local service. | Existing managed web workflow command, not a production deployment. |
| `pnpm exec wrangler dev --local --config ../../wrangler.preview.jsonc --ip 0.0.0.0 --port $PORT` | Start the API preview from `artifacts/api-server`, with the managed workflow supplying its port. Local service; no remote migration implied. | Existing managed API workflow command. |

Prefer the existing managed workflows rather than starting duplicate preview
servers. A local preview can be configured to use external services; never assume
that every action inside Preview is harmless or isolated.

## 2. Cloudflare Worker deployment

| Command | Purpose and effect | Execution evidence |
| --- | --- | --- |
| `pnpm run whoami` | Inspect Wrangler authentication/account context. Cloudflare read operation; do not copy identifying output into the journal. | Supported by `package.json`; execution not established here. |
| `pnpm exec wrangler deploy --config ./wrangler.jsonc --dry-run --outdir /tmp/lebrands-worker-bundle` | Build/package without publishing. Writes a local bundle. A successful dry run does not prove live bindings, database state or provider access. | Documented command pattern in phase release instructions; no new execution in this update. |
| `pnpm run deploy` | Run the project's existing `wrangler deploy` script, including its configured browser-asset build. Production mutation. | Documented and supplied as the next action after the 18 October media/form changes. Assistant execution of that deployment was not observed. |
| `pnpm exec wrangler deploy --config ./wrangler.jsonc` | Explicit-config equivalent of the Worker publishing operation. Production mutation. | Documented in checkout/release instructions; not a second step to run after an already successful deployment. |

Before a release, review the relevant migration requirements, use the correct
Cloudflare account and configuration, and preserve the existing bindings.
After publishing, record the actual result and, when available, the deployed
version reference. Do not infer deployment from a commit, dry run or working local
preview. This project is hosted on Cloudflare, not a separate Replit deployment.

## 3. Platform integrations and resource configuration

| Integration / command | Purpose and effect | Execution evidence and limits |
| --- | --- | --- |
| `pnpm exec wrangler r2 bucket create lebrands-store-media` | One-time creation of the existing public product-media bucket, only if absent. Infrastructure mutation. | Documented in `docs/STEP2.md`; do not recreate an existing bucket. Creation alone does not add the correct Worker binding. |
| `pnpm exec wrangler r2 bucket create lebrands-business-documents` | One-time private business-document bucket creation, only if absent. Infrastructure mutation. | Reference matching the established private-document setup; do not recreate or make it public. |
| `pnpm exec wrangler secret put CLOUDMERSIVE_API_KEY` | Enter the scanner credential at Wrangler's secure prompt. Worker secret/configuration mutation. | Documented in `docs/business-document-scanning.md`; no credential value is recorded. |
| `pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --config ./wrangler.jsonc` | Set the checkout anti-abuse secret through a secure prompt. Production mutation. | Documented in `docs/STEP3_CHECKOUT.md`; no execution claimed by this register. |
| `pnpm exec wrangler secret put SESSION_SECRET` | Set the Worker session secret through a secure prompt. Production mutation; careless rotation can invalidate sessions. | Documented secret-management pattern in `docs/STEP1.md`; historical invocation/result not established. |
| `pnpm exec wrangler secret put PASSWORD_PEPPER` | Set the Worker password pepper through a secure prompt. Production mutation with authentication consequences. | Supported secure-prompt reference. Never generate a replacement during routine deployment: the required existing value must match the administrative reset environment. |
| `pnpm exec wrangler secret put RAZORPAY_KEY_ID` | Set the platform payment key ID through a secure prompt. Production configuration mutation. | Supported reference, not proof it was invoked. Current billing work is sandbox-only. |
| `pnpm exec wrangler secret put RAZORPAY_KEY_SECRET` | Set the matching platform payment secret. Production configuration mutation. | Supported reference. A key change does not itself approve live charging, recurring billing or paid entitlements. |
| `pnpm exec wrangler secret put RESEND_API_KEY` | Set the transactional-email provider credential. Production configuration mutation. | Supported reference. Domain/sender readiness and successful delivery require separate evidence. |
| `pnpm exec wrangler secret put GSTIN_KEY` | Set the business-registration lookup credential. Production configuration mutation. | Supported reference. Paid lookup success is separate from document approval and subscription state. |
| `node scripts/check-business-document-scanner.mjs --run-live` | Exercise the configured scanner with synthetic diagnostic fixtures. Calls an external service and consumes provider quota. | Documented in scanner setup. Explicit live flag is required; do not substitute real merchant documents for diagnostic fixtures. |
| `node scripts/configure-custom-domains.mjs` | Inspect the custom-domain configuration using the helper's read-only mode. Requires configured Cloudflare access. | Documented in `docs/ann-launch-setup.md`; verified against the helper's mode handling, not run for this update. |
| `node scripts/configure-custom-domains.mjs --apply` | Apply the helper's infrastructure changes. Production/infrastructure mutation. | Documented. Required account features, including relevant SaaS routing support, must be available first. |

**Secret uploads can publish a Worker version.** Check the migration and release
order before using `wrangler secret put`. Setting a Replit development secret
does not by itself establish that the Cloudflare Worker has the same credential.
Do not echo secret values or reconstruct connection strings in journal entries.

**Hyperdrive and provider dashboards:** the project uses the existing Supabase
Postgres/Hyperdrive setup and merchant-owned payment/delivery accounts. This
register does not invent missing resource-creation commands or claim that CLI
credential setup completes a provider's dashboard, webhook, domain or merchant
onboarding requirements.

## 4. Database migrations

### 19 October: commerce analytics

Working directory: repository root. Development checks use only isolated
synthetic PostgreSQL data. Production commands below are **suggested only**.

| Command | Effect and prerequisites | Execution evidence |
| --- | --- | --- |
| `pnpm run db:migrate -- --staged-catalogue-cogs` | Stage 1 prerequisite if not yet applied. Review/backup the existing Supabase database first. Requires recorded catalogue API migration. | Not executed against the live database by the assistant. |
| `pnpm run db:migrate -- --staged-commerce-analytics` | Apply only reviewed `0042_commerce_analytics.sql`; requires recorded `0041_catalogue_cogs.sql`. Adds a restricted, tenant/session-checked read function without rewriting historical money or costs. | Prepared, not executed against the live database. |
| `pnpm run deploy` | After successful migrations, build and publish the Worker using the existing Cloudflare configuration and approved credentials. Does not enable live charges. | Suggested manual release, not executed. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/commerce-analytics.test.js tests/catalogue-cogs.test.js tests/dashboard-navigation.test.js tests/browser-bundles.test.js` | Bounded isolated financial, permission, navigation and actual Worker asset-gate checks. No production data. | Executed: 27/29 initially passed; one brittle assertion and its parent failed. Corrected to parse the actual embedded JSON. Other 16 checks passed unchanged. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/commerce-analytics.test.js` | Targeted report calculations, captured costs, date boundaries, permissions, no-store export and XLSX package checks. | Executed after the assertion correction: 13/13 passed. No live database access. |
| `pnpm run typecheck` | Workspace TypeScript checks. | Passed. |
| `git diff --check` | Check tracked diffs for whitespace errors. | Passed during verification. |

The existing managed web/API workflows were restarted, and the Worker built
23 fingerprinted browser entries / 34 files. Native-preview screenshots
verified desktop and mobile rendering using `/__analytics-preview/` synthetic
data only. Browser Print / Save PDF is a user-operated system dialog; a saved
PDF file was not claimed as tested.

### 19 October: catalogue COGS

All commands below run from the repository root.

| Command | Effect and prerequisites | Execution evidence |
| --- | --- | --- |
| `pnpm run db:migrate -- --staged-catalogue-cogs` | Apply only reviewed `0041_catalogue_cogs.sql`; requires catalogue API migration `0021_catalogue_forms_api.sql`. Adds private cost metadata/history, prospective order-cost snapshots and a tenant index. Review/backup first; allow for index/DDL locks. | Prepared for the operator; **not executed against the live database**. |
| `pnpm run deploy` | Existing Cloudflare Worker release, including browser assets; run after the staged database change is confirmed. Does not activate paid checkout or subscriptions. | Manual release instruction only; **not executed**. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/catalogue-cogs.test.js tests/catalogue-form-model.test.js tests/catalogue-forms.test.js tests/catalogue-persistence.test.js tests/catalogue-modal.test.js tests/dashboard-navigation.test.js tests/inventory.test.js tests/browser-bundles.test.js` | Focused cost, catalogue, UI and inventory checks using isolated databases. | Executed. The first batch had 45/46 passing because of an old SKU-publication assertion. Corrected its status/message and confirmed all three checks in that file. New cost checks, including actual SKU COD checkout with the snapshot migration applied, also passed in their focused rerun. |
| `pnpm run typecheck` | Check shared libraries and registered artifact workspaces. | Executed and passed. |
| `git diff --check` | Check whitespace errors without changing files. | Executed and passed. |

### General commands

| Command | Purpose and effect | Execution evidence |
| --- | --- | --- |
| `pnpm run db:migrate` | Apply pending regular migrations using the administrative Supabase connection. Database mutation; not an automatic dependency-install or merge action. | Documented throughout the phase instructions. This journal update did not execute it. |
| `pnpm run db:test-isolation` | Run restricted-role isolation checks against the deliberately selected test database. Creates/removes strictly marked fixtures and rolls back probes; not read-only. | Documented. Requires the existing administrative and restricted application connections; never point casually at live merchant data. |

Take the appropriate backup and review the target environment and pending SQL
before applying a migration. Administrative migration scripts use the existing
`SUPABASE_DB_URL` secret; the restricted application connection is not a substitute.
No database, secret value or connection URL is copied here.

### Supported staged migrations

These exact commands are checked against `db/migration-selection.js`.
They select a staged migration rather than silently applying every later feature.
The prerequisite column is the dispatcher's explicit staged prerequisite; the
runner also checks regular migrations and other schema requirements.

Every command below is a **supported reference and database mutation**, not an
assertion that it was run or applied in production. The numeric order is a useful
reference, not permission to execute the entire table.

<!-- STAGED_COMMANDS_BEGIN -->
| Command | Selected staged migration | Explicit staged prerequisite |
| --- | --- | --- |
| `pnpm run db:migrate -- --staged-gstin` | `0011_gstin_approval.sql` | `0009_required_gstin.sql` |
| `pnpm run db:migrate -- --staged-aura` | `0012_aura_skeleton_sections.sql` | No explicit staged prerequisite; regular/schema checks still apply. |
| `pnpm run db:migrate -- --staged-ai` | `0013_ai_builder.sql` | `0012_aura_skeleton_sections.sql` |
| `pnpm run db:migrate -- --staged-email` | `0014_transactional_email.sql` | `0013_ai_builder.sql` |
| `pnpm run db:migrate -- --staged-starters` | `0015_aura_starter_library.sql` | `0012_aura_skeleton_sections.sql` |
| `pnpm run db:migrate -- --staged-ann` | `0016_ann_foundation.sql` | `0015_aura_starter_library.sql` |
| `pnpm run db:migrate -- --staged-launch` | `0017_ann_launch_setup.sql` | `0016_ann_foundation.sql` |
| `pnpm run db:migrate -- --staged-commerce` | `0018_commerce_runtime.sql` | `0017_ann_launch_setup.sql` |
| `pnpm run db:migrate -- --staged-catalogue` | `0019_catalogue_forms.sql` | `0018_commerce_runtime.sql` |
| `pnpm run db:migrate -- --staged-catalogue-masters` | `0020_catalogue_masters.sql` | `0019_catalogue_forms.sql` |
| `pnpm run db:migrate -- --staged-catalogue-api` | `0021_catalogue_forms_api.sql` | `0020_catalogue_masters.sql` |
| `pnpm run db:migrate -- --staged-catalogue-references` | `0022_catalogue_reviewed_references.sql` | `0021_catalogue_forms_api.sql` |
| `pnpm run db:migrate -- --staged-d2c-variants` | `0023_d2c_variant_profiles.sql` | `0022_catalogue_reviewed_references.sql` |
| `pnpm run db:migrate -- --staged-store-variant-values` | `0024_store_variant_values.sql` | `0023_d2c_variant_profiles.sql` |
| `pnpm run db:migrate -- --staged-catalogue-writer-identity` | `0025_catalogue_writer_identity.sql` | `0024_store_variant_values.sql` |
| `pnpm run db:migrate -- --staged-d2c-memberships` | `0026_d2c_type_memberships.sql` | `0025_catalogue_writer_identity.sql` |
| `pnpm run db:migrate -- --staged-d2c-food-profiles` | `0027_d2c_food_profile_corrections.sql` | `0026_d2c_type_memberships.sql` |
| `pnpm run db:migrate -- --staged-d2c-descriptors` | `0028_d2c_descriptor_coverage.sql` | `0027_d2c_food_profile_corrections.sql` |
| `pnpm run db:migrate -- --staged-sku-checkout` | `0029_sku_checkout.sql` | `0028_d2c_descriptor_coverage.sql` |
| `pnpm run db:migrate -- --staged-registration-contact` | `0030_registration_contact.sql` | `0004_password_pepper.sql` |
| `pnpm run db:migrate -- --staged-business-documents` | `0031_business_documents.sql` | `0030_registration_contact.sql` |
| `pnpm run db:migrate -- --staged-business-editor-access` | `0032_business_editor_access.sql` | `0031_business_documents.sql` |
| `pnpm run db:migrate -- --staged-business-document-retention` | `0033_business_document_retention.sql` | `0031_business_documents.sql` |
| `pnpm run db:migrate -- --staged-business-document-scanning` | `0034_business_document_scanning.sql` | `0033_business_document_retention.sql` |
| `pnpm run db:migrate -- --staged-business-document-review` | `0035_business_document_review.sql` | `0034_business_document_scanning.sql` |
| `pnpm run db:migrate -- --staged-legacy-user-country` | `0036_legacy_user_country.sql` | `0030_registration_contact.sql` |
| `pnpm run db:migrate -- --staged-platform-billing` | `0037_platform_billing.sql` | `0035_business_document_review.sql` |
| `pnpm run db:migrate -- --staged-free-subscriptions` | `0038_free_subscriptions.sql` | `0037_platform_billing.sql` |
| `pnpm run db:migrate -- --staged-ann-plan-selection` | `0039_ann_plan_selection.sql` | `0038_free_subscriptions.sql` |
| `pnpm run db:migrate -- --staged-billing-test-checkout` | `0040_billing_test_checkout.sql` | `0039_ann_plan_selection.sql` |
<!-- STAGED_COMMANDS_END -->

The runner rejects a missing prerequisite with an error rather than treating the
feature as applied. The earlier editor-access setup reported a missing business-
document prerequisite; the correct response is to apply and review the required
earlier migration, not bypass that check.

The media uploader and the latest product-form dropdown/stock-display changes
did not require a new migration.

## 5. Review roles, billing switches and account support

| Command | Purpose and effect | Execution evidence |
| --- | --- | --- |
| `node db/admin-business-reviewer.js grant "$ACCOUNT_ID"` | Grant the restricted review role to an existing account. Database permission mutation. | Documented in `docs/business-document-review.md`; execution against a particular account is not established here. |
| `node db/admin-business-reviewer.js revoke "$ACCOUNT_ID"` | Remove that restricted role. Database permission mutation. | Documented; requires explicit administrative intent. |
| `node db/billing-test-config.js enable` | Enable the database-side sandbox checkout configuration after its prerequisites. Database mutation. | Documented in `docs/platform-billing-test-checkout.md`; no enable operation was run for this journal update. |
| `node db/billing-test-config.js disable` | Disable sandbox checkout through the same configuration helper. Database mutation. | Documented; not a cancellation or refund operation. |
| `pnpm run db:admin-reset-password -- "$ACCOUNT_EMAIL"` | Perform an explicitly authorised support reset for a chosen existing account. Changes password/session state. | Documented pattern in `docs/STEP1.md`; not a routine deployment action and not executed for this update. |

`ACCOUNT_ID` and `ACCOUNT_EMAIL` above are **local placeholders that the operator
must set privately to the intended existing account**. Never paste unquoted
angle-bracket placeholders such as `<existing-account-uuid>` into Bash: they are
interpreted as shell redirection. Do not record the real identifiers in the
shared journal.

Billing switches do not turn sandbox payments into live entitlements, issue real
tax invoices, enable recurring payments or replace business-document approval.
Use only the approved environment and existing sandbox credentials for test work.

## 6. Historical phase index

These links connect the operational reference to the feature history. They do
not assign an unverified execution date to a command.

| Related activity | Command groups / original documentation |
| --- | --- |
| 4 October: database foundation | Regular migrations and isolation fixtures; `README.md`, `db/migrate.js`, `db/test-isolation.js`. |
| 5 October: accounts and setup | Dependency/local preview commands, account support, initial R2 setup; `docs/STEP1.md`, `docs/STEP2.md`. |
| 6 to 11 October: COD, dashboard and GSTIN | Worker dry-run/deploy, Turnstile, regular migrations and isolation tests; `docs/STEP3_CHECKOUT.md`, `docs/STEP4_DASHBOARD.md`, `docs/GSTIN_PROVIDER_MAPPING.md`. |
| 12 to 16 October: Aura, AI, email, starters and Ann | Corresponding staged selectors and launch/domain helper; `db/migration-selection.js`, `docs/ann-launch-setup.md`. |
| 17 October: catalogue and SKUs | Catalogue/D2C/SKU staged selectors; `docs/catalogue-phase-2.md`, `docs/catalogue-phase-3.md`, `docs/catalogue-phase-4.md`, `docs/sku-checkout.md`. |
| 18 October: documents and review | Business-document staged selectors, scanner diagnostic and reviewer-role helper; `docs/business-document-scanning.md`, `docs/business-document-review.md`. |
| 18 October: subscription/test checkout | Billing staged selectors, sandbox enable/disable and manual Worker release; `docs/platform-billing-test-checkout.md`. |
| 18 October: media and form corrections | Observed targeted checks/build commands above; `pnpm run deploy` was the supplied manual release instruction, not an observed assistant deployment. |

## Maintenance

### 19 October: Verified shopper email and PIN assistance

| Command / operation | Purpose | Result |
| --- | --- | --- |
| `pnpm exec wrangler secret list` | Read production Worker secret names only. | Existing Resend, session-signing and Turnstile secret names are configured. No values printed or changed. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/checkout-email-auth.test.js tests/checkout.test.js tests/sku-checkout.test.js tests/store-offers.test.js tests/email.test.js tests/email-preferences.test.js tests/commerce-options.test.js tests/storefront-commerce-shell.test.js tests/browser-bundles.test.js` | Broad local verification, including new real-schema OTP and postal tests. | New security tests and existing unaffected suites passed. Legacy checkout tests initially lacked the newly required email proof; old mock query/column contracts also needed alignment with the prior offer release. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/checkout.test.js tests/sku-checkout.test.js tests/checkout-email-auth.test.js` | Verify authenticated legacy fixtures and real-schema identity integration. | Real-schema SKU and identity tests passed. Remaining fake-database failures traced to the missing offer-schema availability query and shifted discount-column positions, subsequently corrected. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/checkout.test.js` | Final focused check after mock-contract fixes. | 14/14 passed. |
| `node --check src/public/checkout-contact.js` / `node --check src/checkout/email-auth.js` / `node --check src/public/commerce.js` | Parse changed modules. | Passed. |
| `git diff --check` | Whitespace validation. | Passed. |
| Managed API workflow restart | Build browser assets and start local preview. | Running; isolated browser email/PIN/COD journey passed. |
| `pnpm run db:migrate -- --staged-checkout-email-auth` | Manual new challenge-table migration. | Documented, not executed against the user's database. |
| `pnpm run deploy` | Publish the updated Worker after migration. | Documented, not executed. |

### 19 October: Offer-code rejection recovery

- Ran a **read-only** Supabase administrative transaction using the existing
  connection helper, with a 10-second statement timeout. Selected only offer
  application/status/value and code configuration. Found a code-like promotion
  title using automatic application, with no corresponding customer code.
  Credentials were not printed; no rows were changed.
- Managed deployment log lookup found no matching entries for this externally
  deployed Worker.
- `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/sku-checkout.test.js`
  exercised SKU regressions and the new recovery contract. The new HTTP test
  initially failed because its synthetic session secret was below the existing
  minimum length; the fixture secret was corrected, not the runtime guard.
- `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/browser-bundles.test.js`
  passed 9/9, including complete quotes after unknown/malformed codes.
- `git diff --check` passed. Restarted only the local managed API workflow;
  no production migration/deployment was performed.

### 19 October: Store offers and dashboard tickets

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/sku-checkout.test.js` | Local real-schema, restricted-role synthetic offer/SKU verification. | Passed following removal of a redundant configuration row lock; no APP UPDATE privilege was added. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/storefront-commerce-shell.test.js tests/commerce-options.test.js tests/browser-bundles.test.js tests/*email*.test.js tests/*invoice*.test.js tests/*dashboard*test.js tests/*migration*test.js` | Broad local regression pass. | 74/77 initially passed. Remaining failures were an old seven-group navigation assertion and an invalid invented fixture role, including its parent-test failure. Corrected to eight groups and the actual `editor` role. The unmatched migration glob contributed no test file. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/dashboard-navigation.test.js` | Verify corrected schema/access and navigation cases. | 15/15 passed. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/store-offers.test.js tests/browser-bundles.test.js` | Final availability/rounding/COD/delivery edge checks, staged migration selector and actual Worker browser-asset gate. | 9/9 passed. |
| `git diff --check` | Local whitespace validation. | Passed. |
| Managed API workflow restart | Local preview Worker/build only. | Started successfully; browser assets served. No remote Worker release. |
| `pnpm run db:migrate -- --staged-store-offers` | Manual administrative schema migration; depends on the recorded SKU checkout migration. | Documented, not executed against the user's database. |
| `pnpm run deploy` | Manual production Worker release, after migration. | Documented, not executed. |

### 19 October: Themed commerce framing

| Command | Target / effect | Actual result |
| --- | --- | --- |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/storefront-commerce-shell.test.js tests/ann-browser-preview.test.js tests/browser-bundles.test.js` | Local rendering, all-theme preview and actual browser-asset gate checks. | All 13 tests passed after restoring themed headers/footers around the shared commerce body. |
| `git diff --check` | Local whitespace validation. | Passed. |
| `pnpm run deploy` | Manual production Worker release. | Not executed by the assistant; required to update published stores. |

### 19 October: Storefront availability incident

| Command | Target / effect | Actual result |
| --- | --- | --- |
| `curl -sS -o /dev/null -w '%{http_code}\n' https://mystonescence.lebrands.store/` | Public production storefront GET only. | HTTP 503 before correction. |
| `pnpm exec wrangler tail lebrands-store --format json` | Brief read-only production Worker log observation; stopped after reproduction. | Observed SQLSTATE `22023` on the store request. Initial attempt with `--sampling-rate 1` was rejected by Wrangler; retried without the flag. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/sku-checkout.test.js tests/storefront-commerce-shell.test.js` | Local synthetic database and renderer verification, including driver-equivalent serialization. | All 20 tests passed. |
| `pnpm run deploy` | Manual production Worker release of the correction. | Required next action; not executed by the assistant. |

## Platform operations administration

| Command (workspace root) | Purpose and target | Actual execution |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/platform-admin.test.js tests/business-review.test.js` | Isolated in-memory real-DDL authorization, password login, read sanitization, suspension/restore, revisions, audit and document-review regression verification. No live database. | All three tests passed. Browser verification also passed the synthetic suspension/restore/logout flow. |
| `pnpm run db:migrate -- --staged-platform-admin` | Administrative database connection; adds the restricted platform console schema. Requires reviewed business-review and billing schema. | Executed against live Supabase with explicit user approval on 19 October 2026. Migration committed successfully; no store suspension. |
| `node db/admin-platform-access.js create` | Operator provisioning using chosen `PLATFORM_ADMIN_USERNAME` and `PLATFORM_ADMIN_PASSWORD` Secrets; stores the existing password hash format and grants private review access. | Executed successfully with user approval on 19 October 2026. Dedicated administrator created without merchant membership. |
| `node --input-type=module` (read-only activation check) | Workspace root, existing administrative Supabase connection, read-only transaction. Checks the migration and only the selected administrator's account; verifies the saved password in memory and prints booleans only. | Passed: migration recorded, account active, password matches, review access enabled, no merchant membership or mandatory password-change flag. No secret or hash output. |
| `node db/admin-platform-access.js reset-password` | Operator credential rotation; terminates existing sessions. | Documented only. |
| `node db/admin-platform-access.js revoke` | Operator platform/review access revocation; terminates existing sessions. | Documented only. |
| `pnpm run deploy` | Established manual Cloudflare Worker publication. | Not executed by the assistant. |

### 19 October: Unified admin workspace and separate status menus

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/platform-admin.test.js tests/business-review.test.js` | Workspace root, isolated synthetic real-schema database; new status routes and shared business-review shell plus existing authorization and action regressions. | All three tests passed. No live database access. |
| Managed web and API workflow restarts | Local preview services after the complete route/UI edit batch. | Both running; preview requests served. Screenshot browser reached sign-in, not authenticated admin content. |
| `pnpm run deploy` | Manual Cloudflare publication of the updated dashboard. | Not executed by the assistant. No additional migration required. |

### 19 October: Shared platform and storefront typography

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/shared-typography.test.js tests/homepage-typography.test.js tests/aura-layout.test.js tests/storefront-commerce-shell.test.js` | Workspace root, local rendering and actual Worker asset-gate checks, no live DB. | All 27 tests passed. |
| Managed web and API workflow restarts | Local preview code/build refresh. | Running; sign-in screenshot confirms sans-serif headings, CSS/font requests return HTTP 200. |
| `pnpm run deploy` | Manual Cloudflare publication of shared typography changes. | Not executed by the assistant. No database migration needed. |

### 19 October: Account store limits and legacy Free migration

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/account-store-limits.test.js tests/ann-plan-selection.test.js tests/free-subscriptions.test.js` | Workspace root, isolated real-schema tests; no live DB. | 21 tests passed. |
| `node --test --test-concurrency=1 tests/account-store-limits.test.js` | Focused isolated verification after adding paid-plan preservation coverage. | Both tests passed, including their Free history and paid preservation assertions. |
| `node db/transition-account-stores.js --draft=<approved-subdomain> --keep-live=<approved-subdomain>` | Read-only live Supabase assessment using administrative Secret; no credentials or private IDs output. | Found the approved two-store selection, one existing Free record and one separate store requiring original publication-date confirmation. |
| `pnpm run db:migrate -- --staged-account-store-limits` | Live administrative Supabase migration, explicitly authorized transition. | Migration committed successfully. Database ownership/live-store guards active. |
| `node db/transition-account-stores.js --apply --draft=<approved-subdomain> --keep-live=<approved-subdomain>` | Live transaction: approved draft selection and historical Free assignments. | Selected store became draft and received historical Free. Existing Free preserved. Store with missing first-publication evidence left unchanged. |
| `node --input-type=module` (read-only post-transition verification) | Workspace root, existing administrative Supabase connection; only relevant status/timer records and aggregate ownership conflicts. | Confirmed approved draft/live states, persisted Free clocks and zero multiple-live-owner accounts. |
| `node --check db/transition-account-stores.js` and `git diff --check` | Local syntax/whitespace checks. | Passed. |
| `node db/transition-account-stores.js --apply --first-publication=<subdomain>:<ISO-timestamp>` | Explicit operator completion for a legacy store with missing original publication evidence. | Executed after user approval of the recorded 6 October 2026 timestamp. Free assignment succeeded, expiry verified as 5 November 2026, existing Free records preserved. |
| `pnpm run deploy` | Manual Cloudflare publication of account UI and conflict messages. | Not run by the assistant. |

### 19 October: Integration screens, initial DNS setup and navigation

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/dashboard-navigation.test.js tests/ann-launch-ui.test.js tests/ann-launch.test.js tests/account-store-limits.test.js` | Workspace root; isolated account quotas, navigation, domain and partner integration tests. | Focused run passed before the final DNS UI enhancement. No live merchant connection was touched. |
| `node --test --test-concurrency=1 tests/ann-launch-ui.test.js tests/ann-launch.test.js tests/dashboard-navigation.test.js` | Workspace root; final DNS UI, provider and navigation checks. | 23 tests passed. |
| `node --test --test-concurrency=1 tests/ann-launch.test.js` | Workspace root; read-only CNAME verification before Cloudflare provisioning and domain activation guards. | Four tests passed after the additional DNS verification path. |
| `node --test --test-concurrency=1 tests/ann-launch-ui.test.js` | Workspace root; final DNS CNAME wording and merchant Settings forms. | Twelve tests passed. |
| Replit preview workflow restarts for `artifacts/api-server: API Server` and `artifacts/lebrands-web: web` | Development Worker and web preview, not production publication. | Both restarted and served the public sign-in page without runtime errors. |
| `pnpm run deploy` | Manual Cloudflare publication of the updated Worker, account page and integration screens. | Not run by the assistant; published site can continue to show the older Create button until publication. |

### 19 October: Independent ticket-style integration pages

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --check src/ui/dashboard.js` / `node --check src/public/ann-launch-ui.js` / `node --check src/public/settings-connections.js` | Workspace source syntax checks. | Passed. |
| `node --test --test-concurrency=1 tests/dashboard-navigation.test.js tests/ann-launch-ui.test.js tests/dashboard-preview.test.js` | Separate integration pages, always-visible Settings panels, existing Ann controls and read-only fixtures. | Final run: 24 passed. Initial assertions for the old accordion markup were corrected to distinguish Ann from Settings. |
| Replit workflow restarts: `artifacts/api-server: API Server`, `artifacts/lebrands-web: web` | Rebuild versioned browser assets and serve the updated preview. | Both running; desktop and mobile fixture pages loaded their forms. |
| `pnpm run deploy` | Manual Cloudflare production publication. | Not run. |

### 19 October: Merchant-wide ticket styling

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/ticket-workspaces.test.js tests/dashboard.test.js tests/dashboard-redesign.test.js tests/dashboard-navigation.test.js tests/dashboard-preview.test.js tests/editor-render.test.js tests/ann-editor-panel.test.js tests/ann-editor-sections.test.js` | Workspace root; dashboard/editor render and interaction checks. | Initial run: 48 passed, three failed. The new fixture's missing settings were corrected and its checks passed separately; two unchanged Ann panel mocks still fail. |
| `node --test --test-concurrency=1 tests/ann-design-workspace.test.js tests/ann-browser-preview.test.js` | Existing shared workspace and isolated browser-preview checks. | Ten passed; obsolete workspace assertion failed; browser-preview module mocking requires the flag below. |
| `node --experimental-test-module-mocks --test tests/ann-browser-preview.test.js` | Correct Node invocation for browser-preview module mocks. | Five passed. |
| `node --test tests/ticket-workspaces.test.js` | Final ticket contracts, custom page bodies, editor boundaries and checkout form fields. | Four passed. |
| Replit preview workflow restarts | Rebuild existing versioned CSS bundles and serve the changed workspace. | Services running; public root returned HTTP 200. |
| `pnpm run deploy` | Manual Cloudflare production publication. | Not run. |

### 19 October: Account entry and store-list ticket styling

| Command / operation | Target / effect | Actual result |
| --- | --- | --- |
| `node --check src/ui/accounts.js` | Account template syntax. | Passed. |
| `node --test --test-concurrency=1 tests/account-ticket-style.test.js tests/auth.test.js tests/registration-contact.test.js tests/browser-bundles.test.js` | Shared account styling, account-state restrictions, existing auth and registration contracts, fingerprinted CSS delivery. | 22 passed. Test database fixtures were isolated; no live accounts were changed. |
| Replit preview workflow restarts | Rebuild browser assets and reload API/web preview. | Both running. Desktop login, mobile signup and synthetic store-list screenshots loaded successfully. |
| `pnpm run deploy` | Manual Cloudflare publication. | Not run. |

### 19 October: Public ticket layouts and analytics chart views

All commands ran from the workspace root against local files and isolated
synthetic database fixtures, not the production database.

| Command / operation | Purpose / result |
| --- | --- |
| `node --check src/public/analytics.js` and `node --check src/public/analytics-charts.js` | Client syntax passed. |
| `node --test --test-concurrency=1 tests/analytics-charts.test.js tests/commerce-analytics.test.js tests/browser-bundles.test.js` | Initial run exposed a missing named Worker asset allowlist entry and an outdated synthetic fixture's empty email. Both were corrected; no production guards were relaxed. |
| `node --test --test-concurrency=1 tests/commerce-analytics.test.js tests/pricing.test.js tests/compare-page.test.js tests/platform-blog.test.js tests/platform-info.test.js tests/platform-white-backgrounds.test.js` | 38 passed, four legacy pricing-copy assertions failed. Actual analytics DDL, data, exports and permission checks passed. |
| `node --test --test-concurrency=1 tests/analytics-charts.test.js tests/browser-bundles.test.js` | Final chart and raw/fingerprinted Worker module-delivery checks: nine passed. |
| Replit managed API/web preview restarts | Rebuilt assets. Public pages and isolated analytics charts rendered in screenshots; chart modules and styles returned HTTP 200. |
| `pnpm run deploy` | Not run. Production publication remains manual. |

### 19 October: Checkout menu and Ann header actions

Commands ran from the workspace root against local code and synthetic fixtures.

| Command / operation | Purpose / result |
| --- | --- |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/checkout-settings-layout.test.js tests/checkout.test.js tests/dashboard-navigation.test.js tests/ann-design-header-actions.test.js tests/ann-design.test.js tests/ann-builder-stage4.test.js tests/browser-bundles.test.js` | 34 passed; two navigation assertions required the explicitly requested Checkout settings label instead of Dispatch preferences. |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/checkout-settings-layout.test.js tests/dashboard-navigation.test.js` | All 12 passed after updating label expectations. |
| `git diff --check` | Passed. |
| Managed API/web preview restart, screenshot and focused browser pass | Local checkout layout verified. Ann interactive save/review check blocked by synthetic business-document gate; no live data or publication attempted. |
| `pnpm run deploy` | Not run. Production publication remains manual. |

### 20 October: Ann single-line ticket toolbar

Working directory: workspace root. Targets: local source, isolated fixtures and
managed development preview only. Production publication remains manual.

| Command / operation | Purpose / observed result |
| --- | --- |
| `node --experimental-test-module-mocks --test --test-concurrency=1 tests/ann-compact-toolbar.test.js tests/ann-builder-stage4.test.js tests/ann-design-workspace.test.js tests/ann-language.test.js tests/ann-plan-selection.test.js tests/ann-visible-subscription.test.js tests/ann-chat-layout.test.js tests/ann-design.test.js tests/ann-design-header-actions.test.js tests/ann-business-gate.test.js tests/browser-bundles.test.js` | 47 passed, six existing harness/source-assertion failures. Actual draft isolation/save and subscription safeguards passed. |
| `git diff --check` | Passed. |
| Managed API/web workflow restarts and app-preview screenshots | Rebuilt assets; desktop and mobile synthetic Ann toolbar layouts verified. Required business notice remains visible. |
| `pnpm run deploy` | Not run. No production publication or migration. |

### 20 October: Empty Ann design-tools card

Workspace root, local source/Worker bundle checks only:

| Command / operation | Purpose / observed result |
| --- | --- |
| `node --test --test-concurrency=1 tests/ann-design-header-actions.test.js tests/ann-compact-toolbar.test.js tests/browser-bundles.test.js` | Five passed, including empty/whitespace cards and retained active controls. |
| `git diff --check` | Passed. |
| Managed API preview restart | Rebuilt updated client assets successfully. No production publication. |

### 20 October: Ann header navigation cleanup

Workspace root, local code and synthetic preview only:

| Command / operation | Purpose / observed result |
| --- | --- |
| `node --test --test-concurrency=1 tests/ann-compact-toolbar.test.js tests/ann-design-header-actions.test.js tests/browser-bundles.test.js` | Six passed; header, contextual recovery, relocated editor link and browser delivery preserved. |
| `git diff --check` | Passed. |
| Managed API/web restarts and synthetic Ann screenshot | Simplified ticket-style header verified. No production publication. |

### 20 October: Ann initial loading placeholder

Workspace root, local source and Worker asset checks only:

| Command / operation | Purpose / observed result |
| --- | --- |
| `node --test --test-concurrency=1 tests/ann-design-header-actions.test.js tests/ann-compact-toolbar.test.js tests/browser-bundles.test.js` | Seven passed, including empty initial loading and preserved error/retry path. |
| `git diff --check` | Passed. |
| Managed API preview restart | Rebuilt updated assets. No production publication or migration. |

### 20 October 2026: Approved marketing integration release

All commands below ran from the workspace root following explicit approval.
Credentials were consumed internally and were not recorded.

| Command / operation | Target, prerequisites, purpose and observed result |
| --- | --- |
| `node --test --test-concurrency=1 tests/marketing-integrations.test.js tests/checkout.test.js` | Local disposable data, no providers. All 27 passed, including the manual single-file migration selector. |
| Selected Supabase ledger/checksum and Cloudflare settings preflight | Shared Supabase/production Worker, read-only. Prerequisites recorded, OAuth checksums matched, new marketing schema absent; captured existing binding and Razorpay-record fingerprints. Optional DNS-list metadata was unavailable; deployed Worker routes were verified. |
| `node db/migrate.js --staged-marketing-integrations` | Approved shared Supabase administrative migration. Applied only the new additive migration atomically; committed successfully. Historical ledger checksums untouched. |
| Post-migration metadata/permission verification | Shared Supabase, read-only. New checksum matched; three tables have forced RLS; API roles denied private access; zero configurations/jobs; existing Razorpay records unchanged. |
| `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars` | Approved production Cloudflare publication. Successful Worker/assets upload, regular routes, queue bindings and five-minute schedule. Preserved existing secrets and variables. |
| Cloudflare settings comparison and live HTTP probes | Production, read-only. All non-asset bindings/runtime settings unchanged; login and new script/CSS assets and bundles returned 200; anonymous marketing-settings API returned 401 with no-store. No provider event or purchase was created. |

For future work, add the relevant command, working directory, target environment,
purpose/effect, prerequisite and **actual execution status/result**. Distinguish
commands suggested to the operator from commands actually executed. Keep
credentials, personal identifiers, full connection URLs and sensitive output out
of this register.

## 2026-10-20: Merchant in-app dialogs (development only)

| Command / operation | Actual result and effect |
| --- | --- |
| Native-dialog source audit and `node --check` for changed browser scripts | Read-only development checks. Remaining bare `confirm` identifiers are existing local application helpers, not browser calls. Corrected one async listener found by syntax validation; all changed scripts then parsed. |
| `node --test --test-concurrency=1 tests/application-dialogs.test.js tests/navigation-loading.test.js tests/catalogue-modal.test.js tests/section-grid.test.js tests/inventory.test.js tests/catalogue-cogs.test.js tests/marketing-integrations.test.js tests/dashboard.test.js` | Offline: 79 passed, one old checkout fixture failed because its customer email was blank under the existing required-email contract. No shared database or provider access. |
| `node --test --test-concurrency=1 tests/application-dialogs.test.js` | Six passed after final shared-guard changes, including cancellation, native-form submitter preservation, one-time approval and shared state across module copies. |
| `node --test --test-concurrency=1 --test-name-pattern='real SKU checkout' tests/catalogue-cogs.test.js` | Passed after supplying a synthetic email in that existing test fixture. Production checkout logic unchanged. |
| `node scripts/build-browser-assets.mjs` | Successful development browser compilation; 29 versioned entries. Public generated assets only, no database writes or publication. |
| Managed frontend/API workflow restarts and log inspection | Both running. Initial proxy refusal occurred while the API was restarting, followed by successful requests. No environment variables or secrets changed. |
| Isolated browser navigation/dialog pass and mobile preview capture | Passed: cancel/Escape preserve edits and focus; approved navigation occurs once; pristine navigation has no warning; date/time cancellation, accepted value and inline required validation work. Zero native dialogs/JS exceptions, no horizontal dialog overflow at 390px. Fake memory-only fixture; no provider event, database write or real payment. |

## 2026-10-20: Approved dialog-fix Cloudflare publication

| Command / operation | Actual result and effect |
| --- | --- |
| Read-only Cloudflare Worker settings snapshot | Saved only non-secret metadata/hashes under `/tmp` for pre/post comparison. Did not reveal secret values or modify configuration. |
| `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars` | User-approved production publication succeeded. Worker version `8dbe9afe-691e-4329-9581-e65d846773f5`; existing regular routes, queues and schedule retained. No migration executed. |
| Read-only Cloudflare metadata and production HTTP/module checks | Passed: 24 non-asset bindings, 14 encrypted secrets and runtime settings unchanged. Account page HTTP 200; current live scripts/module graph byte-match the approved local build, without native dialog calls/unload hooks. Updated ticket dialog, leave guard and date/time prompt present. |

## 2026-10-20: Support ticket schema design

| Command / operation | Actual result and effect |
| --- | --- |
| Read-only source/DDL inspection of Help & support, user/store membership, platform administrators and transactional email infrastructure | Confirmed existing support popover, identity references and durable platform email jobs. No database connection or mutation. |
| Schema documentation and requirements memory | Wrote the proposed eight-table design, privacy/workflow constraints and delivery sequence. Design only; no executable migration, deployment, email send or app behavior change. |

## 2026-10-21: Approved storyboard homepage publication and heading refinement

| Command / operation | Actual result and effect |
| --- | --- |
| Homepage markup, current-media and stylesheet changes | Preserved the archived original hero. Used the user-selected opening portrait and supplied English/Hindi Ann captures. Opening now contains only six founder concerns, followed by the product-presence message and Meet Ann. Removed the requested editor, checkout and standalone product-page sections. Added four integration cards and the numbered launch guide. |
| `node scripts/build-browser-assets.mjs` | Successful final compilation: 31 versioned entries, 42 files. Instrument Sans headings, opacity-only entrances and exact public image allowlists retained. |
| `node --test --test-concurrency=1 tests/marketing.test.js tests/homepage-flow.test.js tests/homepage-hero-white.test.js tests/homepage-typography.test.js tests/ann-homepage-examples.test.js tests/homepage-redesign.test.js` | Final focused verification: 28 passed. Covers narrative order, six concerns inside two founder cards, requested section removals, four integrations, three launch steps, current captures, typography, archived-hero integrity and interactive demo controls. |
| Earlier `tests/browser-bundles.test.js` check | Passed after adding only the missing `ann-adaptive-layout.js` filename to the existing static module allowlist. No general asset-gate relaxation. |
| Managed API/frontend restarts, logs and native preview screenshots | Desktop/mobile opening and desktop connections verified. Mobile launch guide and final Ann heading hierarchy verified. One later desktop screenshot timed out during local Worker reconnection; subsequent native requests recovered to HTTP 200. No new browser testing agent or live merchant-data access. |
| `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars`, from repository root | Approved Cloudflare publication succeeded, followed by publication of the user's final heading-size correction. Initial version `de54b6eb-5dab-4503-8b8f-bbd59864b046`; final version `9d0e3137-6acc-4e7f-8e96-c9957620b126`. Existing routes, queue and schedule retained. |
| Read-only production metadata, homepage and asset checks | HTTP 200; latest narrative and larger story/Meet Ann headings with smaller flagship line confirmed. Nine published portrait/Ann image files byte-match local sources; heading font HTTP 200. All 27 non-asset bindings, 17 encrypted secrets, checkout-security encryption-key presence and runtime settings match the pre-publication snapshot. No secret values disclosed. |
| Scope boundary | No schema migration, database write, merchant-domain activation, order, payment, email send, environment-variable change or credential rotation. |

## 2026-10-21: Homepage hero, launch-section removal and footer contrast follow-up

| Command / operation | Actual result and effect |
| --- | --- |
| Homepage and scoped stylesheet edits | Removed the standalone “Three clear steps” section. Used the user's two-statement hero heading about conversion and connecting payments, delivery, domain and ads. Footer CTA now has explicit dark text on a light peach background, with contrasting hover and keyboard-focus states. |
| `node scripts/build-browser-assets.mjs` and the six focused homepage test files listed above | Build succeeded, 31 versioned entries and 42 files. Updated obsolete launch-section assertions; final result 29 passed. `git diff --check` clean. |
| Managed API restart, logs and native preview screenshots | Final mobile hero and desktop FAQ/footer captured successfully. All six concerns remain beside the portraits; the footer CTA text is visibly readable. Temporary proxy refusals during restart recovered to HTTP 200. |
| Publication boundary | Preview changes only at this point. No new Cloudflare publication, database operation, credential change or external merchant mutation. |

## 2026-10-21: Homepage slideshow and responsive visual refinement

| Command / operation | Actual result and effect |
| --- | --- |
| Homepage visual refinement | Unified Meet Ann, languages, looks and business-desk stories into one manual slideshow. Preserved the selected images, six founder questions and existing language/style/business controls. Refined typography, buttons, cards and screenshot frames without rewriting the approved narrative. |
| Responsive hero and homepage theme | Desktop uses a headline/portrait-card composition; mobile uses avatars with full-width questions. Compact header retains navigation and the store-opening action. Removed the homepage theme button and enforced light mode without overwriting theme preferences on other pages. |
| `node scripts/build-browser-assets.mjs`; focused marketing, flow, hero, typography, Ann-capture, redesign and slideshow tests | Build succeeded with 31 versioned entries and 42 files. Final focused suite: 35 passed. Controller tests cover selectors, keyboard, swipe intent, retained nested state and fragment navigation. `git diff --check` clean. |
| Managed API restart and native preview captures | Verified the final hero at 390px and 1440px widths, theme-button removal, readable founder questions and mobile Ann deep-link navigation with slideshow controls visible. Homepage, scripts, fonts and images returned HTTP 200 after restart. No browser-console errors reported. |
| Publication boundary | Preview only. No Cloudflare publication, migrations, credential changes, orders, payments, emails or merchant data changes in this refinement. |

## 2026-10-21: Approved homepage refinement published to Cloudflare

| Command / operation | Actual result and effect |
| --- | --- |
| User approval | User explicitly requested “publish” after reviewing the refined homepage. |
| `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars` from repository root | Published the existing production Worker successfully. Version `01429d95-d216-4018-b852-0dd9a54549ed`. Build completed with 31 versioned entries and 42 files; two changed static assets uploaded. Existing routes, queue triggers and schedule retained. |
| Production configuration comparison | All 27 non-asset binding metadata hashes matched the fresh pre-publication baseline, including 17 encrypted secrets. Runtime settings unchanged. Only hashes and non-secret settings were used for comparison. |
| Public verification | `https://lebrands.store/` returned HTTP 200 with the current hero, four-story slideshow, light-only root and no theme toggle. Published marketing CSS and JavaScript returned HTTP 200, exactly matched approved local source hashes and retained `no-cache` canonical-asset policy. |
| Scope | No database migrations, secret updates, merchant domain activation, orders, payment operations or emails were performed. |

## 2026-10-21: Lower-homepage visual refinement in Preview

| Command / operation | Actual result and effect |
| --- | --- |
| Scoped homepage markup and stylesheet changes | Refined Help and trust, LeBrands.Space discovery and the three ownership promises. Added seven decorative line-art icons, readable service cards, a larger framed discovery screenshot and prominent promise cards. Preserved all approved copy, destinations, the real screenshot, hero, header and slideshow. |
| `node scripts/build-browser-assets.mjs` and eight focused homepage test files from repository root | Build succeeded with 31 versioned entries and 42 files. Final suite: 38 passed, including new copy/link preservation and decorative-graphic accessibility checks. `git diff --check` clean. |
| Managed API restart, logs and native screenshots | Verified all three areas at 1440px, support cards at 390px and discovery/promises at 320px. No visible text overflow or clipped cards. Public preview assets and page returned HTTP 200; no new browser-console errors reported. |
| Publication boundary | Preview only; the previously published homepage is unchanged. No deployment, database operations, credentials, payments, emails or merchant data changes. |

## 2026-10-21: Homepage FAQ visual refinement in Preview

| Command / operation | Actual result and effect |
| --- | --- |
| Scoped FAQ stylesheet refinement | Added rounded question cards, responsive typography, numbered question rows, circular CSS-drawn plus/minus indicators, a blush open state and visible keyboard focus. Preserved all seven questions, answers, links, shared FAQ schema and independent native details/summary behavior. Other page styles remain separate. |
| Build and regression checks | Browser asset build succeeded with 31 versioned entries and 42 files. All 40 focused cases were verified across the regression run and final five-case closing/FAQ rerun; corrected a test assertion to recognize the CSS-drawn indicator. `git diff --check` clean. |
| Managed API restart, logs and native preview captures | Verified closed FAQ layouts at 1440px and 320px, with readable questions and no clipped cards. Open/focus rules and disclosure markup were checked in source/tests, not claimed as interaction screenshots. Page and assets returned HTTP 200 after restart; no new browser-console errors reported. |
| Publication boundary | Preview only, together with the pending lower-homepage refinements. No production publication, database operations or external mutations. |

## 2026-10-21: Brand-story transition refined in Preview

| Command / operation | Actual result and effect |
| --- | --- |
| Presence-section markup and scoped stylesheet | Added the exact requested supporting message beneath the main headline: “Not charging on every sale. Not holding your customer data and payments.” Retained the three existing narrative lines, refined typography and spacing, and added a small wine accent rule on the white section. |
| Build and regression checks | Browser assets built successfully. All 41 focused homepage tests passed; final 14-case regression/closing rerun also passed after adding the section anchor. `git diff --check` clean. |
| Managed API restart and native preview captures | Verified the section at 1440px and 320px: prominent brand-story headline, smaller supporting copy and no clipped text. Public page/assets returned HTTP 200 after restart; no new browser-console errors reported. |
| Publication boundary | Preview only. Pending lower sections, FAQ and this transition have not been published. No database, credentials, payment, email or merchant-data operations. |

## 2026-10-21: Approved lower-homepage, FAQ and brand-story updates published

| Command / operation | Actual result and effect |
| --- | --- |
| User approval | “Publish to Cloudflare” for the pending homepage updates. |
| `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars` from repository root | Published Worker `lebrands-store`, version `af25963b-eebf-45bb-a2fa-14ce5f2a17be`. Uploaded the updated stylesheet and Worker-rendered homepage. |
| Before/after settings comparison | All 27 non-asset bindings, 17 encrypted secrets and runtime settings preserved. Snapshots record binding digests, not credential values. |
| Live verification | `https://lebrands.store/` returned HTTP 200 with the requested supporting copy, seven decorative benefit icons, seven native FAQ disclosures and light-only mode. Live canonical `marketing.css` and `marketing.js` byte-match approved local sources; both return `Cache-Control: no-cache`. |
| Scope | Published only the approved homepage refinements. No migrations, credential changes, merchant-domain activations, payment operations, emails or customer-data writes. |

## 2026-10-21: Production account outage diagnosed as connector usage limit

| Operation | Actual result and effect |
| --- | --- |
| Read-only diagnosis | Fresh login returned HTTP 200; a deliberately nonexistent synthetic session triggered HTTP 503 with database error 58000. Direct origin read-only checks succeeded, application-role login was enabled, session-function execution was allowed and connection counts were low. No real user cookie or password was used. |
| Approved connector repair attempt | Revalidated/refreshed the existing restricted application connection through the provider API. Host, user, database, port, disabled caching and connection limit stayed unchanged. Validation passed, but runtime access remained blocked. |
| Safe diagnostic change and publication | Added fixed-category and allowlisted-vocabulary diagnostics for connector error 58000. No raw provider message, SQL, credential or session value is logged. Published with `--keep-vars`; current Worker version is `7e8fbf56-a8d4-4eee-985a-5ebac20c343c`. |
| Confirmed cause | Production diagnostics reported `CONNECTOR_QUERY_LIMIT` and fixed signals for account usage limit exceeded. Provider documentation lists 100,000 daily database queries on Free, reset at 00:00 UTC; Workers Paid includes unlimited Hyperdrive queries. Account billing-plan lookup was forbidden by the current token, so the actual subscription must be checked by the owner. |
| Verification and safety | Final auth/diagnostic run: 17 passed. Earlier unchanged connection tests: 20 passed. Preserved 27 Worker bindings, 17 encrypted secrets and runtime settings. Restarted the managed preview API once after the code batch; native homepage preview and assets loaded normally. Stopped diagnostic log tails. No database schema, real account passwords, account records or store data were changed. |
| Resolution update | Production remained blocked after connector revalidation. The user subsequently confirmed production login was working again after checking the provider plan. No billing subscription or purchase was made by the agent. Preview uses the direct restricted connection and is unaffected by this connector quota. |

## 2026-10-21: Dashboard plan feature copy simplified in Preview

| Scope | Result |
| --- | --- |
| Plan cards | Removed per-feature readiness annotations and paid-card Draft/Proposal labels. Feature names and limits remain; excluded features retain their existing styling and accessible indication without a redundant visible suffix. Removed the obsolete paragraph referring to status labels. |
| Boundaries | Prices, intervals, backend readiness, Free dates, eligibility, test-mode disclosures and disabled checkout guards are unchanged. No schema, credentials, financial records or live billing settings were changed. |
| Verification | All six focused plan-card tests passed; whitespace checks passed. The broader companion billing-page fixture attempt passed its first three cases but timed out while setting up the synthetic authenticated fixture; it is not reported as a completed integration pass. Managed preview API was restarted once after the code batch and resumed HTTP 200 responses. |
| Publication | Published after explicit approval using the existing Cloudflare pipeline with `--keep-vars`. Worker version: `ea08d814-10eb-4f29-ae2e-6018a1c99476`. Downloaded the active script and confirmed simplified feature lists, removal of the old status markup, and preservation of payment-test controls. All 27 non-asset bindings, 17 encrypted secrets and runtime settings, including limits, match the immediately preceding production snapshot. |
| Live availability | A valid-shaped but nonexistent synthetic session returned HTTP 200 with the login form, confirming the production connector can perform session lookup again. No real account credentials or sessions were used. Native Preview login was also visually checked. |

## 2026-10-21: Current-plan usage and connection status prepared

| Operation | Result and boundaries |
| --- | --- |
| Implementation | Added owner-authorized aggregate usage to billing page data and the current-plan section. Shows saved-plan allowances, readable media storage, staff excluding owners, UTC-month created orders, saved payment/delivery/domain state and enabled Meta/Google configuration. A refresh is read-only. |
| Universal feature | Social media Ad Integration appears once per dashboard plan and on Free plus all paid public pricing cards and their comparison. Historical subscription snapshots, prices, limits and financial activation gates are untouched. |
| Verification | `node --test --test-concurrency=1 tests/platform-billing-cards.test.js tests/platform-billing-usage.test.js tests/platform-billing-usage-sql.test.js`: all 16 passed. PostgreSQL tests use isolated PGlite and real foundational DDL, never production. Whitespace checks passed. |
| Runtime and visual check | Restarted the existing managed API once after the code batch. Preview returned HTTP 200 for Pricing and assets; screenshot confirmed the new feature across Free and the four paid cards. Private usage markup and owner denial were checked by focused tests, not a signed-in browser session. |
| Database and publication | No migrations or live writes, no provider calls/activation, and no production publication. Awaiting user approval. |

## 2026-10-21: Approved current-plan usage release published

| Operation | Actual result and boundaries |
| --- | --- |
| Pre-release | Confirmed the existing 16-test pass and clean whitespace checks; recorded fresh binding/runtime fingerprints without reading or logging secret values. |
| Publish | Ran `pnpm exec wrangler deploy --config wrangler.jsonc --keep-vars` from the workspace root after explicit approval. Uploaded the canonical usage CSS, its versioned bundle and browser build manifest. Worker version: `0c2f6fd5-5c74-4c65-8ba9-b9ca33b760c9`. Existing routes, schedule and queue triggers were retained. |
| Preservation | All 27 non-asset bindings, 17 encrypted-secret bindings, compatibility flags, usage model, placement, logging and runtime limits matched the immediate pre-release snapshot. |
| Live verification | Downloaded the active script and confirmed usage aggregation, current-plan UI, universal social feature and payment-test controls. Pricing returned HTTP 200 with social integration on Free and four paid cards. Canonical usage CSS matched the generated release and the versioned bundle returned HTTP 200. |
| Account health | A valid-shaped, nonexistent synthetic session returned HTTP 200 and the login form through the production database connector. No real account session, password or private merchant data was used. |
| Safety | No schema migration, live database writes, billing activation, provider setup or credentials changes. Private usage behavior remains covered by the earlier focused tests rather than an authenticated production browser test. |
