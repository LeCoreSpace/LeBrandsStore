# Integration, migration and deployment command register

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

For future work, add the relevant command, working directory, target environment,
purpose/effect, prerequisite and **actual execution status/result**. Distinguish
commands suggested to the operator from commands actually executed. Keep
credentials, personal identifiers, full connection URLs and sensitive output out
of this register.
