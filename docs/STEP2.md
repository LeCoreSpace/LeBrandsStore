# Step 2: store setup, Aura, R2 and publishing

Implemented on the existing Cloudflare Worker and Supabase Postgres stack.
No deployment, migration, database isolation run, remote bucket creation,
Cloudflare secret transfer or real password reset was performed.

## Delivered

- Signed-in app headers show the user's name and a POST Sign out control.
  The LeBrands mark and favicon now use L.
- Four-step setup at `app.lebrands.store/stores/{id}/setup`: brand basics,
  Aura settings, products, and review/publish. New store creation opens setup.
- Debounced draft autosaves, saved/error/retry states, step progress,
  product CRUD, image ordering and alt text, editable policy drafts and review.
- Desktop form/preview split, mobile fullscreen preview, Home/Collection/Product
  tabs and Mobile/Desktop sizes. Browser preview and public pages use the same
  `src/public/aura.js` HTML templates.
- Aura home, collection, product gallery, about, contact, policy and branded
  404 pages, small-catalogue spotlight, SEO, three font presets, button styles
  and contrast-adjusted button text. Bazaar is visibly disabled.
- Member-only Worker multipart uploads to the single `MEDIA` R2 binding.
  Magic-byte inspection, format/size/dimension limits, conservative SVG
  rejection, immutable UUID keys and database metadata. Failed database commits
  attempt to delete their newly uploaded object. No S3 credentials are used.
- Public media delivery at `media.lebrands.store/stores/{storeId}/{uuid}.{ext}`,
  with one-year immutable caching, etags, correct content types and nosniff.
- Atomic publish snapshots. Public stores use only the last published snapshot;
  autosaves never silently change a live catalogue. Publishing again updates it.
  Unpublish makes the store draft and unavailable to public hostname resolution.
  Legacy live stores without a wizard snapshot retain their previous landing.
- Address edits are autosaved as draft text. Continuing from Brand basics confirms
  an address change, limited to once per 30 days. Old names are reserved and
  redirect to the current live address for 90 days. No custom-domain setup added.

Checkout/cart buttons are disabled with “Checkout opening soon”. No orders,
payments, Razorpay, Shiprocket, domain provisioning, AI helpers/scanning, mall
sync, email, videos, product options or drag-and-drop page builder were added.
Product descriptions support a safe basic bold/italic/bullet-list toolbar and
shared renderer, without accepting raw HTML. Policies remain escaped plain text
with line breaks.

## Database and security

Manual migration `0005_store_wizard.sql` adds tenant-scoped `store_setup`,
`store_publications` and `store_address_history`, media upload purpose, product
tags, policy review timestamps and store address-change timestamps.
All new tables have store IDs, created/updated timestamps and forced RLS.
Composite foreign keys prevent attaching another store's logo.
Earlier migrations `0001` through `0004` are unchanged.

`withMemberStore` checks the active session and membership in the same transaction,
rejects forced-reset accounts, sets transaction-local tenant context and locks
the store row to serialize saves/publishing. Every API mutation checks the
exact account Origin, including PATCH/PUT/DELETE. Public assets contain only the
shared renderer, validation, wizard browser code and styles, never server code.

Policy templates are draft starting points, not lawyer-approved documents.
The brand must review and confirm all six: Privacy, Terms, Shipping,
Cancellation & Refund, Contact and Pricing. Changing underlying settings or
products invalidates review confirmations but preserves edited policy bodies.
Regenerating policies is explicit and replaces draft text after UI confirmation.

## New secrets

**None for Step 2.** R2 is accessed through the Worker binding, not S3 keys.
Keep the existing `PASSWORD_PEPPER` and `SESSION_SECRET` identical between Replit
Secrets and the production Worker when you manually configure account secrets.
They are not automatically copied to Cloudflare.

## Exact commands for you

Run from the project root. Offline checks do not connect to the database or
publish. The two database commands below are deliberately **your manual actions**.

```sh
pnpm run test:offline
pnpm exec wrangler deploy --dry-run --outdir /tmp/lebrands-step2-build

# After your usual backup: applies only pending migrations, including 0005.
pnpm run db:migrate

# Use the same DEVELOPMENT/TEST Supabase project for both ADMIN/APP secrets.
# Creates/removes only marked fixtures. No R2 objects are uploaded by this test.
pnpm run db:test-isolation

# Only if the single bucket has not already been created in your account:
pnpm exec wrangler r2 bucket create lebrands-store-media
```

The dry run is local bundling only. There is no publishing command here.
`wrangler.jsonc` binds `MEDIA` to `lebrands-store-media` and `ASSETS` to the four
public wizard/theme files. Its existing Hyperdrive ID and wildcard routes remain.
Keep Hyperdrive query caching disabled for accounts, setup and publications.
`media.lebrands.store` must have proxied DNS covered by the existing wildcard
Worker route. The bucket can remain private; public delivery is through the Worker.

No seed is required for the wizard. Do not use Replit DB or Supabase Storage.

## Preview and verification limits

Local Wrangler uses local R2 storage, not the remote bucket. The existing
development preview intentionally has no database binding and does not bypass
the production account Origin checks.
Development-only `/__step2-preview` shows an empty, clearly labelled read-only
wizard for visual inspection; `/__aura-preview` shows Aura placeholders.
Neither route exists in the production Worker. No fake users/saves are supplied.

Offline tests cover rendering/escaping/placeholders, small-catalogue behavior,
validation, contrast, upload magic bytes/limits/SVG rejection, R2 metadata and
rollback cleanup, origin/session/membership guards, and publication routing.
The browser testing service failed before returning a verdict due to a platform
infrastructure error. Isolated browser-state mocks additionally cover concurrent
envelope merges, dirty-only product saves, serialized policy edits/reviews, and
visual-only zero-network startup. These do not replace a signed-in browser run.
Final verification: 67 offline tests passed, JavaScript syntax and whitespace
checks passed, the production Worker dry-run bundle succeeded, and a mobile
screenshot confirmed the read-only development wizard renders correctly.
The manual database isolation runner is extended for every new table and media,
cross-store mutations, logo foreign keys and session membership checks.
Real SQL migration execution, real R2 storage, live hostname rendering and
signed-in persistence against Supabase remain unverified until you apply the
schema/configuration manually.

## Changed files

Existing: `src/index.js`, `src/preview.js`, `src/db.js`, `src/auth/routes.js`,
`src/auth/security.js`, `src/reserved.js`, `src/ui/layout.js`, `src/ui/accounts.js`,
`src/ui/favicon.js`, `db/isolation-fixtures.js`, `db/test-isolation.js`,
`tests/db.test.js`, `tests/auth.test.js`, `wrangler.jsonc`, `wrangler.preview.jsonc`, `README.md`.
`.replit` also gained the Python runtime for local agent/testing tools; the app
itself remains a JavaScript Worker. Agent memory records the approved phase scope.

Added: `db/migrations/0005_store_wizard.sql`, `db/wizard-isolation.js`,
`src/store/input.js`, `src/store/media.js`, `src/store/policies.js`,
`src/store/repository.js`, `src/store/routes.js`, `src/store/live.js`,
`src/public/aura.js`, `src/public/validation.js`, `src/public/wizard.js`,
`src/public/wizard.css`, `src/ui/wizard.js`, `tests/wizard.test.js`,
`docs/STEP2.md`.
