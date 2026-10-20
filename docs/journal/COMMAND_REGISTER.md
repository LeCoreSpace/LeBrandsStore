# Integration, migration and deployment command register

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

For future work, add the relevant command, working directory, target environment,
purpose/effect, prerequisite and **actual execution status/result**. Distinguish
commands suggested to the operator from commands actually executed. Keep
credentials, personal identifiers, full connection URLs and sensitive output out
of this register.
