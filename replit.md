# LeBrands.Store

LeBrands.Store is a multi-tenant store builder for Indian D2C brands. One codebase serves stores at `{brand}.lebrands.store`; brands own their payment and delivery accounts. LeBrands.Space is a separate project and must not be changed.

## Fixed stack

- Runtime: Cloudflare Workers, JavaScript ES modules, and Wrangler CLI.
- Domain: `lebrands.store`, with wildcard subdomains on Cloudflare DNS.
- Later phases: one shared Supabase Postgres database in the Mumbai region, used only as Postgres and connected from the Worker via Cloudflare Hyperdrive, with `store_id` and row-level security; one Cloudflare R2 bucket with keys under `stores/{storeId}/`; Resend for transactional order email from `notify.lebrands.store`.
- Development is in Replit; hosting and production are on Cloudflare.

## Rules

- Do not use Replit Deployments, Replit DB, or Replit Postgres.
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