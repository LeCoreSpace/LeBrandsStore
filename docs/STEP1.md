# Step 1: homepage and custom brand accounts

Implemented on the existing Cloudflare Worker. No deployment, migration,
database isolation run, password reset, or email sending was performed.
Migrations `0001_init.sql` and `0002_rls.sql` are unchanged.

## Files

Created:

- `src/config/pricing.js`: editable monthly INR prices, setup fee, GST and founding limit.
- `src/ui/layout.js`, `src/ui/home.js`, `src/ui/accounts.js`, `src/ui/favicon.js`: server-rendered pages.
- `src/auth/passwords.js`, `src/auth/security.js`, `src/auth/repository.js`, `src/auth/routes.js`: custom account security and routes.
- `db/migrations/0003_accounts.sql`: account columns, private tables and restricted functions (original, unchanged).
- `db/migrations/0004_password_pepper.sql`: current peppered-password constraints and atomic login rehash API.
- `db/admin-reset-password.js`: one-time temporary-password reset utility.
- `db/account-isolation.js`: membership, private-table, expiry, revocation and lockout probes.
- `tests/auth.test.js`: offline crypto, security, rendering and account-flow tests.
- `src/preview.js`, `wrangler.preview.jsonc`: local Worker preview, without any database binding.
- `docs/STEP1.md`: this handoff.

Changed:

- `src/index.js`: apex/home/legal/account routing and www redirect; existing tenant routing retained.
- `src/db.js`: role-checked account transactions.
- `db/test-isolation.js`, `db/isolation-fixtures.js`: marked account fixtures and rollback-only probes.
- `tests/db.test.js`: updated homepage and reserved-host routing expectations.
- `package.json`: offline tests and manual reset command.
- `.gitignore`: excludes generated local Wrangler state.
- `artifacts/api-server/.replit-artifact/artifact.toml`: development preview runs the Worker, not the Express template.
- `README.md`: links to this handoff.

Workspace notes: `.agents/memory/MEMORY.md` and
`.agents/memory/cloudflare-password-runtime.md` record the user-approved change
from the obsolete 600,000-iteration requirement.

Production `wrangler.jsonc`, its real Hyperdrive ID, existing migration files,
and existing admin/app database connection conventions are not changed.

## Exact manual commands

Run these at the project root, in this order. Database commands use the
existing workspace secrets and never print connection URLs or passwords.

```sh
pnpm install --frozen-lockfile
pnpm run test:offline
pnpm exec wrangler deploy --dry-run --outdir /tmp/lebrands-step1-build

# YOUR manual database action: applies pending migrations, including 0003/0004.
# Existing applied migration checksums must match; take your usual backup first.
pnpm run db:migrate

# YOUR manual database test: creates/removes only marked isolation fixtures.
# Requires both SUPABASE_DB_URL and SUPABASE_APP_DB_URL for the same project.
pnpm run db:test-isolation

# OPTIONAL, only when an existing account needs a support reset.
# Replace the sample address. This changes its password and revokes its sessions.
pnpm run db:admin-reset-password -- owner@example.com
```

The dry-run command bundles locally and exits without uploading or publishing.
There is deliberately no deployment command in this handoff.
Do not run the seed unless separately needed; it is not required for accounts.

For the static local preview:

```sh
pnpm exec wrangler dev --local --config wrangler.preview.jsonc --ip 0.0.0.0 --port 8787
```

Visit `/` for the homepage and `/signup`, `/login`, `/forgot-password` for public
account pages. `/dashboard` is a preview-only alias for the account host's `/`.
This preview has **no database binding**, no fake users and no simulated login.
POSTs from the preview's different origin are intentionally rejected, rather than
relaxing production origin security. Functional authentication is tested offline
against an explicitly in-memory test repository, not advertised as live persistence.

## Before any future publication

### Password scheme and pepper configuration

Production Workers cap PBKDF2 at 100,000 iterations. Passwords first pass through
HMAC-SHA256 using the base64-decoded `PASSWORD_PEPPER` as the key and the password
as the message. The raw 32-byte HMAC output is then the WebCrypto PBKDF2-SHA256
input, at exactly 100,000 iterations with a fresh 16-byte salt.

Set `PASSWORD_PEPPER` to base64 encoding of **at least 32 cryptographically
random bytes**, both in Replit Secrets and as the identical Worker secret.
Do not put it in SQL, source code, logs, or chat. Missing, invalid, or too-short
peppers fail closed with a generic service error. The reset utility checks the
pepper before connecting to Postgres.

The stored string is `pbkdf2-sha256$v1$p1$100000$<salt>$<hash>`.
Algorithm, format version and pepper version are encoded in it; iteration and
salt columns must agree with the string. `PASSWORD_PEPPER_VERSION` defaults to
`1`. For future rotation, increment that non-secret version and retain old
secrets as `PASSWORD_PEPPER_V1`, etc., until all affected records have upgraded.
Verification uses the recorded version, and a successful login atomically
replaces outdated supported records with a fresh current hash. Failed logins
never rehash. Unsupported formats fail rather than being guessed.

Earlier unpeppered 600,000-iteration hashes cannot be verified on Workers and
cannot be converted without the password. They require a support reset. The
new manual migration preserves them for that purpose; it does not rewrite data.

### Production bindings and hostnames

- Hyperdrive must connect as `lebrands_app`, never the administrative role.
- Disable Hyperdrive query caching for the account-bound configuration. Revocation,
  password records, sessions, lockout and address checks cannot use stale results.
- Set a strong Cloudflare Worker `SESSION_SECRET` of at least 32 characters.
  The existing Replit secret is not automatically a production Worker binding.
  It is used only to HMAC IP addresses; no raw IPs are stored.
- When separately authorized to configure Cloudflare secrets, this manual command
  transfers the existing secret through stdin without displaying it:

  ```sh
  printf '%s' "$SESSION_SECRET" | pnpm exec wrangler secret put SESSION_SECRET
  printf '%s' "$PASSWORD_PEPPER" | pnpm exec wrangler secret put PASSWORD_PEPPER
  ```

- Use HTTPS at `app.lebrands.store`. Every account POST requires exactly that
  `Origin`; the host-only `__Host-lbs_session` cookie cannot work on insecure HTTP
  or carry over from another hostname.
- Review the explicitly marked draft terms, privacy and contact pages.

## Account behavior and boundaries

- Signup creates an account but does not auto-sign in. New/existing valid email
  submissions get the identical response to avoid disclosing account existence.
- Login failures, including lockout, use `Email or password is incorrect`.
  Ten failures per email **or** hashed IP in a rolling 15 minutes lock login.
  Transaction advisory locks serialize concurrent attempts.
- Tokens are random 32-byte bearer secrets; only their SHA-256 hashes reach Postgres.
  Sessions expire absolutely after 30 days, and logout is POST-only.
- Admin resets revoke all sessions and require a new password at `/account`.
  Changing a password revokes the account's other sessions.
- Draft creation is atomic: brand + draft store + owner membership.
  Address uniqueness is ultimately enforced in Postgres, including concurrent claims.
- `create_brand_and_store(user_id, brand_name, subdomain)` keeps the requested
  three-argument API. Ownership is bound to the verified session through a
  transaction-local `app.account_session_hash`, which resets at transaction end.
  `change_password` is also session-bound.
- New users retain compatibility with the existing unique lowercase email index.
  Legacy users without a password cannot log in until an admin sets one.
- The account tables have forced RLS, no direct `lebrands_app` table privileges
  and no Supabase API-role access. Functions have `search_path = pg_catalog`;
  only the trusted Worker role may execute the account API.
- No theme builder, product entry, checkout, payments, delivery integrations,
  domain provisioning, Supabase Auth, supabase-js or email sending was added.

## Verification and what remains manual

Offline tests cover password hash/verification, common-password rejection,
cookie flags, origin validation, subdomain validation, editable pricing rendering,
output escaping, generic signup/login, draft creation, forced reset and logout.
Existing database-wrapper/routing regression tests remain included.
The Worker bundle is checked with Wrangler's local dry-run.

The database isolation extension and migration are supplied but **not executed**.
Signed-in browser pages have not been verified against real Postgres because
applying the new schema is intentionally a manual user action.
