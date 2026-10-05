# LeBrands.Store

## Step 2: store setup, Aura and publishing

See [docs/STEP2.md](docs/STEP2.md) for the four-step wizard, shared live-preview
templates, member-only R2 uploads, publish snapshots, file list and exact manual
commands. Migration `0005_store_wizard.sql` is supplied but not run.
No checkout, deployment, remote bucket creation or database migration was performed.
Step 2 adds no secrets.

## Step 1: homepage and brand accounts

See [docs/STEP1.md](docs/STEP1.md) for the changed-file list, exact manual
commands, account behavior and password-pepper setup.
The Replit preview now runs the local Cloudflare Worker without a database
binding. The account migration and database isolation checks remain manual;
no deployment or email sending is part of this step.

Passwords use HMAC-SHA256 with the secret pepper, followed by PBKDF2-SHA256 at
exactly **100,000 iterations**. Production Cloudflare Workers reject higher
counts even when local Wrangler accepts them. Set `PASSWORD_PEPPER` in Replit
Secrets for the admin reset script and as the same Cloudflare Worker secret
before enabling accounts. It must be base64 encoding of at least 32 random bytes.
Missing or invalid peppers fail closed with a generic error.

Stored hashes use `pbkdf2-sha256$v1$p1$100000$<salt>$<hash>`; `p1` records the
pepper version. Compatible older records are rehashed atomically on successful
login. Existing unpeppered 600,000-iteration records need a support reset, not
silent conversion. Manual migration `0004_password_pepper.sql` updates the
constraints and account functions without changing earlier migrations.

## Cloudflare credentials

Open the Replit Secrets tool and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` with values from your Cloudflare account. Keep both values out of source files.

## Wrangler commands

- `npm run whoami` — confirm the Cloudflare account Wrangler is using.
- `npm run deploy` — deploy the Worker to Cloudflare.

## Phase 1a: database setup (manual)

No migrations, seed, Cloudflare configuration changes, or deployments are run automatically.

**Supabase Postgres is the only database. Never use Replit's built-in database,
Replit DB, or Replit Postgres.**

The two database secrets are:

- `SUPABASE_DB_URL`: administrative role, for migrations and seeding only.
- `SUPABASE_APP_DB_URL`: restricted `lebrands_app` role, for Hyperdrive only.

The scripts read only `SUPABASE_DB_URL`. They reject missing/invalid URLs and
hostnames outside `supabase.com`, with no fallback to `DATABASE_URL` or `PG*`
variables. Before connecting, they print only username, hostname and port.
Each script clears `PG*` variables in its own process and creates one client
with `postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', max: 1 })`.
The original URL is passed unchanged; no helper reconstructs credentials.
Failures report the error code and message with URLs and passwords redacted.

1. Set `SUPABASE_DB_URL` in Replit Secrets to the administrative connection string
   for this project's Supabase Postgres database in Mumbai. Use a session-pooler
   hostname ending in `.supabase.com`, not the transaction pooler. URLs ending
   in `.supabase.co` are intentionally rejected by the hostname guard. This role must have
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
    psql "$SUPABASE_DB_URL"
   ```

   Inside psql:

   ```text
   \password lebrands_app
   \q
   ```

   No password is set in the migration. Do not save it in SQL or source files.
4. Add `SUPABASE_APP_DB_URL` to Replit Secrets, using the dedicated
   `lebrands_app` credentials for the same database. For Supabase's session
   pooler, the username is `lebrands_app.<project-ref>`; for a direct
   connection it is `lebrands_app`. Never configure Hyperdrive with the
    administrative `SUPABASE_DB_URL`. Use the same Supabase session-pooler host.
5. Create the Hyperdrive configuration manually:

   ```sh
   npm run whoami
    npx wrangler hyperdrive create lebrands-store --connection-string "$SUPABASE_APP_DB_URL" --caching-disabled
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
  themes. Custom account and wizard handlers use narrowly scoped database functions;
  no external SSO or Supabase Auth is used.
- `resolve_store` is the public tenant bootstrap function exposed to the app role.
  Its privileged owner can read through RLS, but it returns only the ID,
  subdomain, name and status of a live store for one hostname.
- Instantiate `createDb(env)` inside a request. Use
  `db.withStore(storeId, async (tx) => { ... })` for tenant queries and use only
  the supplied transaction client. The store ID is context, not authorization;
  future authenticated handlers must separately validate membership.

## Manual tenant-isolation test

After applying migrations yourself, set `SUPABASE_DB_URL` (ADMIN) and
`SUPABASE_APP_DB_URL` (`lebrands_app`) for the same **development/test**
Supabase session-pooler project, host, port and database. Then run:

```sh
pnpm run db:test-isolation
```

This is a real database test, not an offline mock. It temporarily commits
two marked test brands, live stores `rls-test-a`/`rls-test-b`, and draft store
`rls-test-draft`. Each live store gets two products, one customer, one order
and one order item. It never uses or cleans up `testbrand` or unmarked data.
Reserved subdomain/brand collisions abort rather than overwrite data.
A session advisory lock prevents concurrent runs, and marked leftovers from
an interrupted run are cleaned before setup.

All APP checks use their own transactions. Mutation and DDL probes always roll
back, including unexpected successes; the read-only context-reset probe commits
to verify the normal request path. Checks cover missing context, each store's
exact fixture visibility, cross-store inserts/updates/deletes, context reset,
hostname resolution and forbidden DDL/role changes. ADMIN is used only for
fixture setup/cleanup and the requested independent product verification.
Output is one PASS/FAIL line per check, a summary, and exit status 1 on failure.
Passwords and URLs are redacted from failures.

**Cleanup prerequisite:** orders/invoices normally cannot be deleted. ADMIN must
be allowed to `SET LOCAL session_replication_role = replica`. The script checks
this before creating fixtures, then uses it only inside its cleanup transaction
to delete verified, marked fixtures in dependency order. It does not disable
global triggers or change existing migrations. Cleanup is attempted in `finally`
even after check failures. If cleanup itself fails, the script reports FAIL;
rerunning with the prerequisite fixed cleans the marked leftovers. An abrupt
process termination may also leave fixtures for the next run.

No migration, deployment or isolation test runs automatically.

## Offline checks

```sh
node --test tests/db-connection.test.js
node --experimental-test-module-mocks --test tests/db.test.js
```

These tests use an in-memory driver mock. They do not connect to Supabase,
execute migrations, start a web server, or verify database-enforced RLS.
The connection guard tests use synthetic credentials only.