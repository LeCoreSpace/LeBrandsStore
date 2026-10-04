# LeBrands.Store

## Cloudflare credentials

Open the Replit Secrets tool and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` with values from your Cloudflare account. Keep both values out of source files.

## Wrangler commands

- `npm run whoami` — confirm the Cloudflare account Wrangler is using.
- `npm run deploy` — deploy the Worker to Cloudflare.

## Phase 1a: database setup (manual)

No migrations, seed, Cloudflare configuration changes, or deployments are run automatically.

1. Set `DATABASE_URL` in Replit Secrets to the administrative connection string
   for this project's Supabase Postgres database in Mumbai. Use a direct or
   session-pooler connection, not the transaction pooler. This role must have
   `BYPASSRLS` (or be a superuser) and permission to create `lebrands_app`.
2. Run:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

   The runner takes an advisory lock, applies pending files in a transaction,
   and records SHA-256 checksums in `schema_migrations`. Never edit an applied
   migration; add a new numbered file. The seed creates/upserts one live
   `testbrand` store and refuses to overwrite another brand's store.
3. Set a password for the new `lebrands_app` role securely. With a PostgreSQL
   client, run the following and enter the password at the hidden prompt:

   ```sh
   psql "$DATABASE_URL"
   ```

   Inside psql:

   ```text
   \password lebrands_app
   \q
   ```

   No password is set in the migration. Do not save it in SQL or source files.
4. Add `HYPERDRIVE_DATABASE_URL` to Replit Secrets, using the dedicated
   `lebrands_app` credentials for the same database. For Supabase's session
   pooler, the username is `lebrands_app.<project-ref>`; for a direct
   connection it is `lebrands_app`. Never configure Hyperdrive with the
   administrative `DATABASE_URL`.
5. Create the Hyperdrive configuration manually:

   ```sh
   npm run whoami
   npx wrangler hyperdrive create lebrands-store --connection-string "$HYPERDRIVE_DATABASE_URL" --caching-disabled
   ```

   Keep caching disabled for tenant-context isolation and fresh store-status
   checks; Hyperdrive still pools connections. Replace
   `REPLACE_WITH_HYPERDRIVE_ID` in `wrangler.jsonc` with the returned ID.
   The placeholder is intentionally not deployable.
6. Only when you decide to publish this change, run `npm run deploy`.
   No deployment is performed as part of Phase 1a.

Custom-domain **database lookup** is included; Cloudflare for SaaS registration
and routing are not configured in this phase.

## Tenant model

- `stores.store_id` is the UUID primary key and tenant identifier.
- All 25 tenant child tables have a `store_id` foreign key. Their relationships
  use composite foreign keys where applicable to prevent cross-store links.
- All 26 tenant tables (including `stores`) have ENABLE/FORCE RLS, with both
  read and write checks against transaction-local `app.store_id`.
- `brands`, `users`, and `themes` are shared registries, not tenant-owned copies.
  The Worker role has no direct access to brands/users and read-only access to
  themes. Administrative scripts manage those records for now; no SSO or
  account-management API is built.
- `resolve_store` is the only bootstrap function exposed to the app role.
  Its privileged owner can read through RLS, but it returns only the ID,
  subdomain, name and status of a live store for one hostname.
- Instantiate `createDb(env)` inside a request. Use
  `db.withStore(storeId, async (tx) => { ... })` for tenant queries and use only
  the supplied transaction client. The store ID is context, not authorization;
  future authenticated handlers must separately validate membership.

## Offline checks

```sh
node --experimental-test-module-mocks --test tests/db.test.js
```

These tests use an in-memory driver mock. They do not connect to Supabase,
execute migrations, start a web server, or verify database-enforced RLS.