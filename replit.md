# LeBrands.Store

LeBrands.Store is a multi-tenant store builder for Indian D2C brands. One codebase serves stores at `{brand}.lebrands.store`; brands own their payment and delivery accounts. LeBrands.Space is a separate project and must not be changed.

## Fixed stack

- Runtime: Cloudflare Workers, JavaScript ES modules, and Wrangler CLI.
- Domain: `lebrands.store`, with wildcard subdomains on Cloudflare DNS.
- Database: Supabase Postgres only, one shared database in the Mumbai region, used only as Postgres and connected from the Worker via Cloudflare Hyperdrive, with `store_id` and row-level security.
- Later phases: one Cloudflare R2 bucket with keys under `stores/{storeId}/`; Resend for transactional order email from `notify.lebrands.store`.
- Development is in Replit; hosting and production are on Cloudflare.

## Rules

- Do not use Replit Deployments, Replit DB, or Replit Postgres.
- Replit's built-in database must not be used. `SUPABASE_DB_URL` is the administrative secret for migrations and seeding; `SUPABASE_APP_DB_URL` uses the restricted `lebrands_app` role for Hyperdrive.
- Database scripts read only `SUPABASE_DB_URL`, require a hostname ending in `supabase.com`, and never fall back to `DATABASE_URL` or `PG*` variables. Print only username, hostname and port before connecting; never print passwords or full connection URLs.
- Migrations and seed must each use one client: `postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', max: 1 })`. Clear `PG*` variables in the script process. Helpers must not reconstruct or override credentials, use `SUPABASE_APP_DB_URL`, create another client, or execute `SET ROLE`. Report failure codes and messages with URLs/passwords redacted.
- Migrations and seeds are manual only. Never run database pushes or migrations automatically after a merge or dependency installation.
- The manual isolation test uses separate ADMIN/APP clients. Only marked `rls-test-*` fixtures may be created/removed; never touch `testbrand` or unmarked data. Roll back all APP probes, including unexpected DDL success. Verify session-local administrator cleanup permission before creating protected order fixtures.
- Phase 1a migrations were previously run against Replit's built-in Postgres accidentally. Removing its template configuration does not authorize deleting that database or its contents.
- Do not use Supabase Storage, Supabase Auth, supabase-js data calls, or PostgREST.
- Do not create an Express, Next.js, or other Node server. The app is a Cloudflare Worker.
- Do not create a project, folder, database, or bucket per brand. All brands share one codebase, database, and bucket.
- Never put secrets in code. Wrangler reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from Replit Secrets.
- Store money as integer paise. Every database table must have `created_at` and `updated_at`.
- Escape user-supplied values before inserting them into HTML.
- Build only the requested phase; do not start later phases without instruction.

## Reserved subdomains

These names cannot be used as store names:

`www`, `app`, `admin`, `api`, `brands`, `customers`, `mail`, `notify`, `news`, `help`, `support`, `status`, `shop`, `store`, `checkout`, `cart`, `pay`, `payments`, `login`, `account`, `dashboard`, `blog`, `docs`, `cdn`, `static`, `assets`, `media`, `lebrands`, `lebrandsspace`.