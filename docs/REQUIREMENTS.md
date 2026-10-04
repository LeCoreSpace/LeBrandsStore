# LeBrands.Store — Product & Technical Requirements

**Product:** LeBrands.Store — store builder for brands onboarding to LeBrands.Space
**Owner:** LeBrandsSpace Digital Private Limited
**Status:** Agreed scope and decisions (v2), incorporating platform, infrastructure, pricing and website-creation decisions

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| What we're building | A Shopify-like store builder where a brand fills one guided form and gets a complete, working store |
| Positioning | Presence + discovery + traffic + conversion. No marketing to the brand's customers |
| Platform domain | `lebrands.store` (separate from `lebrands.space`) |
| Store addresses | `brandname.lebrands.store`, optionally the brand's own domain |
| Builder / admin | `app.lebrands.store`, entered from a "Create your store" button in LeBrands.Space |
| Code | One master application (Cloudflare Worker) serving every store. No per-brand code, folders or projects |
| Development | Separate Replit project `lebrands-store`, connected to GitHub, deployed with Wrangler |
| Database | One unified Supabase Postgres database (Mumbai region) for all stores, `store_id` on every table, row-level security. Used **only as Postgres**, connected via Cloudflare Hyperdrive |
| Media | One Cloudflare R2 bucket for all images and videos, prefixed `stores/{storeId}/` |
| Email | Resend, transactional order emails only, sent from `notify.lebrands.store` |
| Payments | Brand's own Razorpay account (brand pastes keys). COD by default |
| Delivery | Brand's own Shiprocket account (API user). Manual shipping until connected |
| Domains | Brands connect their own domain (CNAME) or buy one through a reseller API, registered in the brand's name |
| Themes | 2 themes at launch, section-based, drag-and-drop within fixed slots |
| Data ownership | Brand owns its data, media and domain; full export anytime. Platform code and themes stay LeBrands IP |
| Pricing | Store + mall bundles from ₹3,999/month list (founding price ₹2,999), plus setup fee |

---

## 1. Positioning and scope

### 1.1 The problem
AI website builders make a site that *looks* finished, but founders then struggle with payments, logistics, GST, hosting, databases and media. Shopify gives a store but no traffic, charges a 2% third-party transaction fee in India (Shopify Payments isn't available), and needs paid apps.

### 1.2 What LeBrands.Store does
1. **Presence** — a complete, compliant store, live in minutes.
2. **Discovery** — the brand is findable in the LeBrands.Space search engine and mall.
3. **Traffic** — mall shoppers flow to the brand's store.
4. **Conversion** — fast store, smooth checkout, reliable order updates.

Everything after the sale belongs to the brand. The platform does **not** market to a brand's customers. LeBrands.Space may engage **its own** mall shoppers (mall campaigns, challenges, brand spotlights); that is the traffic engine.

**Pitch line:** *"We bring you online, bring you shoppers, and help you close the sale. Your customers stay yours."*
**Ownership line:** *"Your domain, your payments, your data. We run the store."*

### 1.3 Claims — keep them honest
- "Zero commission" and "store set up for you" are guaranteed and provable on day one.
- Avoid "no marketing needed." Use "built-in discovery, so you're not paying for every visitor."
- Show mall traffic numbers on the pricing page; give every brand a mall-traffic dashboard.
- Consider a traffic guarantee (e.g. fewer than an agreed number of mall visits in 90 days → next month free).

### 1.4 Out of scope (MVP)
- Marketing emails, newsletters, abandoned-cart reminders, pop-ups, sign-up forms.
- Multi-brand marketplace checkout (each store sells one brand only; the mall links to stores).
- Free-form design, custom CSS/code.
- Multi-option variants (Size × Colour), blogs, multi-language, multi-currency (INR only).
- Per-brand code or hosting copies.

---

## 2. Platform architecture

### 2.1 Two separate projects

| | LeBrands.Space | LeBrands.Store |
|---|---|---|
| Owns | Brand accounts, login, subscriptions, billing, mall, search, mall shoppers | Stores, builder, themes, products, orders, customers, checkout |
| Database | Its own (unchanged) | One unified Supabase Postgres (Mumbai) |
| Media | Cloudinary (unchanged) | Cloudflare R2 |
| Email | Its own Resend domain and API key | Resend, `notify.lebrands.store`, separate API key |
| Code | Existing project | New Replit project `lebrands-store` |

**Rule:** share accounts where convenient (same Supabase, Resend or Cloudflare login and billing), never share data or keys. The two projects talk through APIs:
- LeBrands.Space → Store: brand subscribed / plan changed / paused.
- Store → LeBrands.Space: store published, product created/updated/removed, store paused.
- The mall displays product images directly from the store's image URLs (no copies into Cloudinary).

### 2.2 Entry and single sign-on
1. Brand clicks **Create your store** in their LeBrands.Space dashboard.
2. LeBrands.Space generates a short-lived signed link (1–2 minutes) with the brand ID and plan.
3. The brand lands on `app.lebrands.store`, already signed in, with brand name and logo pre-filled.
4. A "Back to LeBrands.Space" link returns them.

The builder lives in LeBrands.Store because the live preview must use the same theme components as the live store.

### 2.3 Request routing
One Worker handles every request and decides what to serve from the hostname:

| Hostname | Serves |
|---|---|
| `lebrands.store`, `www.lebrands.store` | Platform home page |
| `app.lebrands.store` | Builder, editor, store admin |
| `{subdomain}.lebrands.store` | That brand's store (looked up in `stores`) |
| Reserved subdomains | Platform use or "Store not found" |
| Any other hostname (brand's custom domain) | Looked up in `domains` (cached in KV) |

### 2.4 Reference: how Shopify does it
- Shopify runs many **pods**; each pod is an isolated instance with **one MySQL database shared by many shops**, every table carrying a `shop_id`. Nginx routes requests to the right pod. Busy shops are moved between pods with their open-source tool Ghostferry.
- Media is served from Shopify's CDN with on-the-fly resizing and WebP conversion. Merchants get no folders; file URLs include a shop-specific path segment.
- LeBrands.Store follows the same principle: **shared infrastructure, every record tagged with its owner.** We start with one "pod" and can split later.

ShopDeck (Bengaluru) has not published its internal architecture. Its model is software plus a service team, reportedly a free store with a growth team for ~3% of delivered orders (verify). Our contrast: flat subscription, zero cut of sales.

---

## 3. Infrastructure setup (done / to do)

### 3.1 Domain and DNS — `lebrands.store` ✅
- Registered at GoDaddy; nameservers changed to Cloudflare (`savanna.ns.cloudflare.com`, `zeus.ns.cloudflare.com`). Zone active on the Free plan.
- GoDaddy DNSSEC: off.
- Check `.store` **renewal** price annually.

**DNS records**

| Type | Name | Content | Proxy | Purpose |
|---|---|---|---|---|
| AAAA | `@` | `100::` | Proxied | Platform root (Worker answers) |
| AAAA | `*` | `100::` | Proxied | Every `brandname.lebrands.store` |
| AAAA | `brands` | `100::` | Proxied | Target for brands' custom domains (CNAME) and Cloudflare for SaaS fallback origin |
| TXT | `@` | `v=spf1 -all` | — | Root domain sends no email (anti-spoofing) |
| TXT | `_dmarc` | `v=DMARC1; p=reject; adkim=r; aspf=r` | — | Reject spoofed mail |

`100::` is a placeholder; the Worker answers. Warning icons on these records are expected. One wildcard record serves unlimited stores (zone limit of 200 records is irrelevant). No MX record needed.

### 3.2 SSL/TLS ✅
- Encryption mode: **Full (strict)**.
- Universal certificate covers `lebrands.store, *.lebrands.store` — Active, auto-renewing. Do **not** click "Disable Universal SSL". No need for Advanced Certificate Manager or Total TLS.
- Always Use HTTPS: on. Automatic HTTPS Rewrites: on. Minimum TLS: 1.2.
- HSTS: off for now; enable only after weeks of stable running.

### 3.3 Security
- Bot Fight Mode: **off** initially (can block Razorpay/Shiprocket webhooks).
- Scoped API token for deployments (Edit Cloudflare Workers template, zone `lebrands.store` only). Never use the Global API Key.

### 3.4 Development environment
- Replit project `lebrands-store` (Node.js), `wrangler` installed as a dev dependency.
- Replit Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`wrangler login` doesn't work inside Replit).
- Connected to a GitHub repository from day one.
- Deploy with `npx wrangler deploy`; test on the real domain (Replit's `wrangler dev` preview runs on a Replit hostname, so subdomain logic can't be tested there).

`wrangler.jsonc` (initial):
```jsonc
{
  "name": "lebrands-store",
  "main": "src/index.js",
  "compatibility_date": "2025-09-01",
  "workers_dev": false,
  "routes": [
    { "pattern": "lebrands.store/*", "zone_name": "lebrands.store" },
    { "pattern": "*.lebrands.store/*", "zone_name": "lebrands.store" }
  ]
}
```
A `*/*` route is added later for custom domains.

**First test Worker ✅ deployed:** reads the subdomain and shows "{subdomain} — coming soon"; reserved names return "Store not found". Verified: `lebrands.store`, `testbrand.lebrands.store` and `admin.lebrands.store` behave as expected. Deployed with an account-scoped "Edit Cloudflare Workers" API token (zone `lebrands.store` only), stored in Replit Secrets. Project uses **pnpm** (`pnpm run whoami`, `pnpm run deploy`). Do not use Replit's Publish button.

### 3.5 Reserved subdomains
`www, app, admin, api, brands, customers, mail, notify, news, help, support, status, shop, store, checkout, cart, pay, payments, login, account, dashboard, blog, docs, cdn, static, assets, media, lebrands, lebrandsspace`

### 3.6 Why not one Replit project / one copy per brand
Rejected: code drift across hundreds of copies, manual setup per brand, cold starts or ~$15+/month per brand for always-on hosting. One codebase with tenant-tagged data is the agreed model.

---

## 4. Data and media

### 4.1 Database — one unified Postgres (Supabase)

**Why Supabase:** Postgres with a **Mumbai (ap-south-1) region** (faster for Indian shoppers; customer data stays in India), and an easy dashboard for inspecting data. Neon was the alternative (database branching, serverless driver), but its closest region at the time of evaluation was Singapore.

**How Supabase is used — Postgres only:**
| Supabase feature | Used? | Instead |
|---|---|---|
| Postgres database | ✅ Yes | — |
| Supabase Storage | ❌ No | Cloudflare R2 |
| Supabase Auth | ❌ No | Brand login via signed handoff from LeBrands.Space; app sessions issued by the Worker |
| Auto-generated APIs (PostgREST / `supabase-js` data calls) | ❌ No | The Worker queries Postgres directly with SQL |
| Realtime, Edge Functions | ❌ No (not needed for MVP) | Cloudflare Workers / Queues |

This keeps row-level security under our control and keeps the app portable: the database can be moved to any Postgres host later without rewriting the app.

**Connection:**
- Worker → **Cloudflare Hyperdrive** → Supabase Postgres. Hyperdrive pools connections and caches, so each request doesn't open a new database connection.
- Hyperdrive is configured with the Supabase connection string (direct connection or session pooler, as recommended by Cloudflare's Hyperdrive + Supabase guide).
- The Worker uses a standard Postgres driver (e.g. `postgres` / `pg`) through the Hyperdrive binding.
- Connection strings live in Replit Secrets (`DATABASE_URL`) for local scripts/migrations and in the Hyperdrive config for production — never in code.
- Supabase **service_role** and **anon** API keys are not used by the app. Supabase's "Data API" can be disabled or restricted to avoid an unused public surface.

**Row-level security approach:**
- RLS enabled on every tenant table.
- The app connects as a dedicated, non-superuser database role (not `postgres`), so RLS is enforced.
- For each request, the Worker sets the current store in the transaction (e.g. `SET LOCAL app.store_id = '...'`); RLS policies allow only rows where `store_id = current_setting('app.store_id')`.
- Platform-level admin jobs use a separate role and are logged.

**Plan and backups:**
- Development can start on the Free plan (note: free projects pause after a week of inactivity).
- Production on **Pro** (~$25/month base): no pausing, daily backups; consider point-in-time recovery add-on once real orders flow.

**Migrations:**
- SQL migration files kept in the repo (`db/migrations/0001_init.sql`, …), applied in order by a script; never edit the schema by hand in the dashboard for production.
- One database for all stores. Every tenant table has `store_id`.
- **Row-level security** on from day one, so the database itself refuses cross-store reads even if app code has a bug.
- One schema; one migration applied once for all stores.
- Large brands can later be moved to their own database (Shopify-style), without changing the app's design.

**Conventions**
- Money in integer paise (₹499 = `49900`).
- `created_at`, `updated_at` on every table.
- Orders and invoices are never deleted — cancelled/refunded with history.
- Secrets (Razorpay, Shiprocket) encrypted at rest; key lives only in Worker secrets.

**Initial tables**

| Area | Tables | Notes |
|---|---|---|
| Accounts | `brands`, `stores`, `users`, `store_members` | Brand = the business (legal name, GSTIN). Store = the website (subdomain, theme, country, currency, timezone; default India / INR / Asia/Kolkata). One brand usually has one store |
| Storefront | `themes`, `pages`, `page_versions`, `media`, `policy_pages` | Page sections and slots stored as JSON; draft and published versions |
| Catalogue | `products`, `product_options`, `product_media`, `collections`, `collection_products` | Products need **HSN code and GST rate** for invoices. Store references its LeBrands.Space mall category ID; the taxonomy itself stays in LeBrands.Space |
| Customers | `customers`, `customer_addresses` | Identified by phone |
| Orders | `orders`, `order_items`, `payments`, `shipments`, `refunds`, `invoices` | Invoice numbers: consecutive, per store, per financial year (e.g. `BRAND/2026-27/0001`) |
| Setup | `domains`, `integrations` | Custom domain status; encrypted credentials |
| System | `otp_verifications`, `email_log`, `webhook_events`, `audit_log` | Webhooks stored so none are processed twice; audit of who changed what |

Later phases: `discounts`, `reviews`, reporting tables.

### 4.2 Media — one Cloudflare R2 bucket
- All images and videos in one bucket, keyed `stores/{storeId}/…` (a naming prefix, not separate storage).
- Uploads go directly to R2 via short-lived signed upload URLs.
- Cloudflare resizes and converts images to WebP on delivery.
- Video: short clips hosted in R2; YouTube/Vimeo embeds for longer content. Cloudflare Stream only if long uploaded videos become common.
- Brands see a media library, never folders.

| Type | Formats | Limit |
|---|---|---|
| Logo | PNG, JPG, SVG, WebP | 5 MB |
| Images | JPG, PNG, WebP | 10 MB each |
| Hosted video | MP4, WebM | 50 MB, max 60 s, ~10 per store (fair use) |
| Embedded video | YouTube, Vimeo | Unlimited |
| Total storage | — | ~5 GB fair use; paid add-on beyond |

### 4.3 Data ownership, export and migration
The brand owns its data; LeBrands.Store processes it on the brand's behalf (DPDP Act: brand = data fiduciary, LeBrands = processor). Data processing terms to be drafted by a lawyer.

**Exports (dashboard)**
- Customers: name, phone, email, addresses, order count, total spent, first/last order date.
- Orders: one row per order item with order number, date, customer, product, qty, price, payment method/status, shipping status, tracking, invoice number. Date filters.
- Products: re-importable, with image URLs.
- Full export: all of the above + ZIP of all media.
- **Shopify-format CSVs** for products and customers.
- **Redirect list** of old URLs for SEO-safe migration.

**Safeguards:** owner-only, OTP confirmation, expiring download links (24 h), logged in `audit_log`, large exports run in the background, spreadsheet-formula neutralisation (cells starting with `=`, `+`, `-`, `@`).

**What stays with LeBrands.Store:** themes, platform code and hosting — licensed while subscribed (state clearly in Terms). Same as Shopify, Wix and others.

**Deletion:** after cancellation, data deleted within a defined period after a final export window.

---

## 5. Integrations

### 5.1 Payments — Razorpay (brand-owned)
- Brand creates their own Razorpay account and completes KYC. Money goes directly to the brand. LeBrands handles no settlements or refunds.
- Razorpay requires an approved live website before issuing live keys, and checks for: Shipping policy, Contact us, Pricing, Terms & Conditions, Privacy policy, Cancellation & Refunds. Our auto-generated pages cover these.
- Subdomain stores (`brandname.lebrands.store`) are generally acceptable; Razorpay checks content, not the domain type. Approval is per brand and can't be guaranteed.
- **Checkout domain must match a registered website**, or Razorpay blocks live payments. Additional domains go through manual review → brands must add their custom domain in Razorpay **before** switching.
- Keys: Key ID, Key Secret, Webhook Secret; validated with a test call; test/live mode toggle; secrets encrypted, never sent to the browser.
- Webhook is the source of truth for payment status.
- Each store sells only its own brand's products to stay a normal merchant site (multi-brand checkout would require Razorpay Route and a marketplace setup).

**To do:** contact Razorpay partnerships to confirm the model in writing; explore the partner programme / OAuth connection to replace key pasting later. Use the first customer as the approval test case.

### 5.2 Delivery — Shiprocket (brand-owned)
- Brand creates an **API user** in Shiprocket and enters its email/password; platform logs in, stores credentials encrypted, refreshes the token automatically.
- Orders pushed automatically (optional manual), AWB and tracking synced back, pincode serviceability and COD checks at checkout.
- Before connection: manual shipping (courier + tracking number fields, Mark as shipped / delivered).

### 5.3 Email — Resend (transactional only)
- Sent from `BrandName <brandname@notify.lebrands.store>`, Reply-To the brand's support email.
- Optional upgrade: brand's own domain (SPF/DKIM records shown in dashboard; auto-added if domain bought through us).
- Never send "from" a brand's Gmail/Yahoo address.
- Separate Resend API key from LeBrands.Space, restricted to its sending domain.
- Emails: order confirmation, payment received, order cancelled, shipped (with tracking), delivered, refund processed, login OTP (if shopper accounts are added).
- No promotional blocks inside these emails (keeps them transactional).
- Brands wanting newsletters export opted-in customers to their own tools. Brands wanting an inbox use Zoho Mail / Google Workspace / Cloudflare Email Routing.

### 5.4 Domains
**Option A — brand already owns a domain (CNAME).** See section 9.

**Option B — buy through us (reseller).**
- Becoming an ICANN registrar is not worth it (US$4,000/yr fee plus per-domain fees, ~US$70,000 working capital, insurance, registry agreements, compliance).
- Use a **reseller API**. GoDaddy: needs an **API Reseller** account (Basic/Pro Reseller storefronts can't be automated; API reseller may require a certification test). Alternative: ResellerClub API.
- Register **in the brand's name** (brand is legal owner); DNS set automatically; transfer code on request.
- Price at cost plus a small margin; GST invoice from LeBrandsSpace Digital Pvt Ltd.
- Renewal reminders at 30/15/3 days; auto-renew with consent; keep reseller wallet funded.
- Avoid registering in LeBrands' name and transferring later (extra steps, 60-day transfer locks, ownership risk).
- Brands with domains at GoDaddy can't hand us API keys (GoDaddy terms); they add the CNAME themselves. Later: Domain Connect for one-click DNS.

### 5.5 GST verification
Paid GST verification API (GSP/KYC provider, a few rupees per check); returns legal name, address, state for auto-fill.

---

## 6. Website creation flow

### 6.1 Overview
```
LeBrands.Space → "Create your store" → app.lebrands.store
   ├─ Step 1  Brand basics            (required)
   ├─ Step 2  Choose theme            (required)
   ├─ Step 3  Add products            (required, min. 1)
   ├─ Step 4  Review & publish        (required)
   │          → LIVE on brandname.lebrands.store with COD
   ├─ Step 5  Online payments         (optional, anytime)
   ├─ Step 6  Delivery integration    (optional, anytime)
   └─ Step 7  Custom domain           (optional, anytime)
After publish → dashboard with setup checklist + page editor
```

Goals: live store in under 15 minutes with no help; preview identical to the live store; every store compliant enough for Razorpay review; automatic mall listing.

### 6.2 Wizard behaviour
- Desktop: form left (~40%), live preview right (~60%). Mobile: full-width form, floating "Preview" button.
- Progress bar with completed / current / optional states.
- Autosave every field (~1 s debounce); "Saved" indicator.
- Resume anytime at the last unfinished step; back navigation never loses data.
- Plain-language inline validation.

### 6.3 Step 1 — Brand basics
| Field | Rules |
|---|---|
| Brand name | Required, 2–40 chars |
| Store address (subdomain) | Auto-suggested; a–z, 0–9, hyphens; 3–30 chars; unique; not reserved; live availability check |
| Logo | Required; PNG/JPG/SVG/WebP, ≤5 MB |
| Brand description | Required, 50–500 chars; "Improve with AI" |
| Tagline | Optional, ≤60 chars; AI suggestion |
| GSTIN | Recommended; auto-verified; fills legal name, address, state |
| Legal business name | Required (auto-filled from GSTIN) |
| Business address | Required (auto-filled from GSTIN) |
| Support email | Required |
| Support phone / WhatsApp | Required |
| Category | Required; from LeBrands.Space taxonomy |

Non-blocking checks: GST name vs brand name mismatch → admin flag; category vs restricted list.

### 6.4 Step 2 — Choose theme
- Two theme cards rendered with the brand's own name and logo (mobile + desktop thumbnails).
- Accent colour (suggested from logo), 3 preset font pairings per theme, button style.
- Theme can be changed later without losing content.

### 6.5 Step 3 — Add products (min. 1)
| Field | Rules |
|---|---|
| Title | Required, 3–80 chars |
| Price (₹) | Required, GST-inclusive |
| Compare-at price | Optional (MRP) |
| Description | Required, 30–2,000 chars; basic rich text; "Write it for me" |
| Images | 1–8; ≤10 MB each; reorderable |
| Video | Optional (upload or YouTube/Vimeo) |
| Tags | Optional, ≤10 |
| SKU | Optional, auto-generated |
| Stock | Optional (empty = always in stock) |
| HSN code, GST rate | Required for invoices |
| Weight (g) | Required once delivery is connected |
| Option (e.g. Size) | Optional, one option type, each value with own price/stock |

Preview switches to the product page while editing; collection page shows all products. CSV bulk upload later.

### 6.6 Step 4 — Review & publish
Automatic checklist: basics complete, theme chosen, ≥1 complete product, contact details, policy pages generated and reviewed, AI restricted-content scan.

Publish → live in seconds at `https://brandname.lebrands.store` with COD; listed on LeBrands.Space; success screen with link, "Share on WhatsApp" and setup checklist. Flagged stores stay live but hidden from the mall until admin review (target 24 h).

The Payments step then shows the live URL to submit to Razorpay with a copy button.

### 6.7 Step 5 — Online payments (Razorpay)
1. Create Razorpay account + KYC (link).
2. Submit store URL for Razorpay website review (policies already present).
3. Paste Key ID, Key Secret, Webhook Secret; add the shown webhook URL in Razorpay.
On save: test call → ✓ Connected or clear error; test mode first, then live. Pay Online appears at checkout alongside COD; brand may disable COD.

### 6.8 Step 6 — Delivery (Shiprocket)
Create API user (guide) → enter credentials → select pickup location → validated. Auto-push, tracking sync, pincode/COD checks; products missing weight flagged.

### 6.9 Step 7 — Custom domain
"I already have a domain" (CNAME flow, section 9) or "Buy a domain" (reseller, section 5.4). Razorpay domain check before switching.

### 6.10 Setup checklist (after publish)
```
✓ Store live — brandname.lebrands.store      [View store]
○ Accept online payments (Razorpay)          [Set up]
○ Connect delivery (Shiprocket)              [Set up]
○ Add your own domain                        [Set up]
○ Add more products                          [Add]
```

---

## 7. Live preview
- Built from the **same theme components** as the live store, fed with draft data.
- Updates within ~300 ms; no reloads.
- Tabs: Home · Collection · Product · Cart · Checkout. Device toggle: Mobile (default) · Desktop.
- Interactive (links, preview cart, checkout form — no real orders).
- Tasteful placeholders before content exists; banner "Preview — not yet live" / "Unpublished changes".
- Auto-switches to the page relevant to the field being edited.

---

## 8. Themes and drag-and-drop editor

### 8.1 Launch themes (working names)
| | Aura | Bazaar |
|---|---|---|
| Feel | Minimal, premium, calm | Bold, colourful, energetic |
| Best for | Beauty, fashion, jewellery, wellness, décor | Food, kids, pets, home essentials, gifting |
| Small-catalogue mode | Large single-product hero sections, story-led | Product spotlight cards, benefit strips |

Both must look premium with 1–2 products.

### 8.2 Editor model
```
HEADER (locked)       logo, menu links, announcement bar text
MAIN ZONE             drag-and-drop sections: add · remove · reorder · duplicate · hide
   Section → fixed SLOTS: text (char limits), image (aspect ratio), video, button
FOOTER (locked)       links, social profiles, contact info
```
- Section list with drag handles, hide, duplicate, delete; "+ Add section" filtered by page.
- Click-to-edit and inline text editing in the preview; drop media onto image/video slots.
- Undo/redo (≥30 steps), autosave as draft, **Publish changes**, version history (last 10).
- Max 20 sections per page. Mobile: slot editing + up/down reordering.

Brands can change: logo, accent colour, font preset, button style, section content/order/visibility, menu and footer links.
Brands cannot change: spacing, grid, font sizes, element positions, cart/checkout/confirmation layouts, policy page layout.

### 8.3 Section library (MVP)
| Section | Slots | Pages |
|---|---|---|
| Announcement bar | Text (80), link | Header |
| Hero — image | Heading (60), subheading (140), image, button | Home, Collection |
| Hero — video | Heading, subheading, video (≤30 s), poster, button | Home |
| Featured products | Heading, 1–8 products or tag | Home, Product |
| Single product spotlight | 1 product, heading, text (300), image | Home |
| Collection grid | Heading, tag/all, columns | Home, Collection |
| Image + text | Image, heading, text (500), button, side | Home, Product |
| Brand story | Heading, text (1,000), image | Home |
| Benefits / USP strip | 3–4 icon + title + text | Home, Product |
| Testimonials | 1–6 quotes, name, photo, rating (no fake reviews) | Home, Product |
| Video | Upload/embed, heading, caption | Home, Product |
| Image gallery | 2–8 images | Home |
| FAQ | 1–10 Q&A | Home, Product, Contact |
| Rich text | Heading, text (2,000) | Home, Policy, Contact |
| Contact / store info | Auto | Contact, Home |
| "As featured on LeBrands.Space" badge | Auto | Footer |

Excluded by design: newsletter sign-up, pop-ups, customer-marketing sections.

### 8.4 Pages
| Page | Editing |
|---|---|
| Home, About | Full drag-and-drop |
| Collection | Sections above/below a fixed grid |
| Product (template) | Fixed core (gallery, title, price, option, qty, Add to cart, Buy now, description) + drag-and-drop sections below |
| Contact | Sections + auto contact info |
| Policies | Text only |
| Cart, Checkout, Order confirmation, Track order, 404 | Not editable; branded automatically |

### 8.5 Page content storage
```json
{
  "storeId": "st_8f2k",
  "theme": "aura",
  "themeSettings": { "accentColor": "#7A4E2D", "fontPairing": "aura-serif-1", "buttonStyle": "rounded" },
  "pages": {
    "home": {
      "status": "published",
      "version": 7,
      "sections": [
        { "id": "sec_01", "type": "hero_image", "hidden": false,
          "slots": {
            "heading": "Handmade with care",
            "subheading": "Small-batch skincare from Chennai",
            "image": { "assetId": "ast_91", "alt": "Bottles of face oil on a stone" },
            "button": { "label": "Shop now", "link": "/collections/all" } } },
        { "id": "sec_02", "type": "featured_products", "hidden": false,
          "slots": { "heading": "Bestsellers", "products": ["prd_1", "prd_2"] } }
      ]
    }
  }
}
```
Each theme defines per section type: allowed pages, slots, limits and rendering. Content is separate from design, so switching themes keeps content.

---

## 9. Custom domains

**One-time platform setup**
1. Cloudflare: enable **SSL/TLS → Custom Hostnames** (payment method required; first 100 free, then ~$0.10/domain/month). Fallback origin: `brands.lebrands.store`.
2. Worker route `*/*`.
3. `domains` table (hostname, store_id, status, is_primary), cached in KV.

**Per brand (automatic)**
1. Brand enters `www.theirbrand.com`; platform registers it via the Cloudflare for SaaS API.
2. Dashboard shows `CNAME www → brands.lebrands.store` (plus a TXT record if Cloudflare requests ownership verification), with registrar-specific guides (GoDaddy, Hostinger, BigRock, Namecheap…).
3. Platform polls; when active with SSL, the store switches; `brandname.lebrands.store` redirects to it.
4. Brand sets registrar forwarding from `theirbrand.com` → `www.theirbrand.com`.
5. **Razorpay:** brand must add the new domain in Razorpay and get it approved before the switch (dashboard holds the switch until confirmed).
6. Optional: email sending from the brand's domain (SPF/DKIM).

No data or media moves; the domain is a new address for the same store.

---

## 10. Checkout, orders and COD

### 10.1 Cart
Drawer + cart page; quantity, remove, subtotal, delivery charge (free / flat / free above ₹X), total; stock checks.

### 10.2 Checkout (single page, mobile-first)
1. Contact: mobile (required), email (recommended), name.
2. Address: pincode first (auto city/state), address lines, landmark.
3. Serviceability + COD availability (when delivery connected).
4. Payment: **COD** (default) and **Pay Online** (when Razorpay is live).
5. Summary → Place order. Guest checkout; no account required.

### 10.3 COD safeguards
- Phone OTP for COD orders (SMS; WhatsApp later).
- Max COD order value (default ₹3,000).
- Pincode COD check once delivery is connected.
- Optional COD fee (default ₹0).
- Max 3 COD orders per phone per 24 h (configurable).

### 10.4 On order placement
Customer created/matched by phone → order created (COD: `Confirmed (COD)`; online: `Pending payment` → `Paid` via webhook) → inventory reduced → emails → brand notified → pushed to Shiprocket if enabled → source attribution saved (mall / direct / social).

---

## 11. Auto-generated pages
- **Policies** (generated at publish, editable): Privacy, Terms & Conditions, Shipping, Cancellation & Refund, Contact Us, Pricing. Linked in the footer. Templates reviewed by a lawyer before launch; brand responsible for accuracy.
- **System pages:** Order confirmation, Track order (order ID + phone), branded 404.

---

## 12. Rules and moderation
- **Subdomain:** a–z, 0–9, hyphens; no leading/trailing hyphen; 3–30 chars; unique; change allowed once per 30 days, old one redirects for 90 days.
- **Restricted products:** AI scan at publish and on product changes for medicines, weapons, tobacco/vapes, alcohol, adult content, counterfeits, gambling, financial products, Razorpay-prohibited items → admin review; store hidden from mall until cleared.
- **Verification flags (non-blocking):** GST name mismatch, reused contact details, unusual early COD volume.

---

## 13. LeBrands.Space mall integration
- On publish: mall listing created/updated (logo, description, category, tags, products).
- Product changes sync automatically; mall uses store image URLs.
- Mall product cards link to store product pages with source tracking.
- Brand dashboard reports mall traffic and orders separately (key renewal argument).
- Pausing/unpublishing the store hides the mall listing.

---

## 14. Pricing and costs

### 14.1 Running cost
| Item | Per month |
|---|---|
| Platform fixed (Workers paid ~$5, Supabase Pro ~$25 + compute as needed, email, monitoring) | ~₹5,000–8,000 for the first ~100 stores |
| Per store (hosting share, storage, email) | ~₹50–150 |
| Domain, if included | ~₹100–125 (₹1,200–1,500/yr) |
| Custom domains (Cloudflare for SaaS) | Free for first 100, then ~$0.10 each |
| **Total per store** | **~₹200–300** |

The main cost is developer and support time, not infrastructure.

### 14.2 Plans
| Plan | Mall only (existing) | Store + mall (list) | Founding-brand price |
|---|---|---|---|
| 1 shop | ₹1,500 | ₹3,999 | ₹2,999 |
| 2 shops | ₹2,500 | ₹5,499 | ₹4,499 |
| 3 shops | ₹3,500 | ₹6,999 | ₹5,999 |

- Plus 18% GST.
- **Setup fee ₹4,999**, waived on annual billing.
- Founding price for the first 50 brands, locked while subscribed.
- Mall-only plans remain for brands with their own websites.
- If traffic proof and a guarantee are in place, list price can apply from launch.

### 14.3 Included (fair use)
- Domain: free first year on annual plans; renewals at cost + small margin. Connecting an existing domain is free.
- Images: unlimited products, ~5 GB fair use.
- Video: ~10 hosted short clips; unlimited embeds; more storage as an add-on.
- All transactional emails.

### 14.4 Value argument vs Shopify
Shopify Basic ≈ ₹1,499/month + 2% third-party fee + Razorpay fee + apps, and no traffic. A brand selling ₹2 lakh/month pays ~₹4,000 in Shopify transaction fees alone (~₹5,500+ total). LeBrands.Store: flat fee, zero commission, store + mall discovery.

---

## 15. Non-functional requirements
| Area | Requirement |
|---|---|
| Performance | LCP < 2.5 s on a mid-range Android on 4G; served from Cloudflare's edge |
| Mobile-first | All storefront pages and checkout |
| SEO | Editable titles/meta, product structured data, sitemap, robots.txt, clean URLs, canonical tags on custom domains |
| Accessibility | Alt text (AI-suggested), contrast check on accent colour, keyboard-navigable checkout |
| Security | HTTPS everywhere; encrypted credentials; rate limits on checkout and OTP; RLS on all tenant tables |
| Data isolation | Shared database and bucket; isolation by `store_id`, RLS and storage prefixes |
| Reliability | Autosave; webhook retries and idempotency via `webhook_events` |
| Browsers | Last 2 versions of Chrome, Safari, Firefox, Edge; Android Chrome; iOS Safari |

---

## 16. Acceptance criteria (MVP)
1. Steps 1–4 → live store on `brandname.lebrands.store` in under 15 minutes, unassisted.
2. Preview updates in ~300 ms and matches the live store exactly.
3. Published store includes home, collection, product, cart, checkout, confirmation, track order, about, contact and all six policy pages.
4. COD order with OTP creates customer + order, sends confirmation email, notifies brand.
5. Validated Razorpay keys enable Pay Online; webhook updates order status.
6. Connected Shiprocket auto-pushes orders and syncs tracking to orders and emails.
7. Without Shiprocket, manual Mark as shipped triggers the Shipped email.
8. Home page sections can be added, removed, reordered, duplicated, hidden, edited, undone and published.
9. Switching between the two themes keeps all content.
10. A custom domain connects with SSL after one CNAME; subdomain redirects.
11. Brand can leave and resume with no data loss.
12. Store appears on LeBrands.Space after publish (unless flagged).
13. Owner can export customers, orders, products and media; exports are logged.

---

## 17. Build phases
| Phase | Scope |
|---|---|
| 0. Infrastructure ✅ | `lebrands.store` on Cloudflare, DNS, SSL, test Worker deployed, Replit + Wrangler (GitHub connection pending) |
| 1. Foundations | Supabase project (Mumbai) + Hyperdrive + schema + RLS, store routing via `stores` table, R2 uploads, SSO handoff from LeBrands.Space |
| 2. Theme 1 + preview | "Aura", section library, live preview, wizard Steps 1–4 |
| 3. Checkout & COD | Cart, checkout, OTP, customers, orders, invoices, order emails, manual shipping |
| 4. Editor | Drag-and-drop editor, media library, undo/redo, versions |
| 5. Integrations | Razorpay, Shiprocket, custom domains (Cloudflare for SaaS) |
| 6. Theme 2 + polish | "Bazaar", AI writing helpers, content scan, exports, mall sync polish |
| 7. Later | Domain purchase via reseller API, Razorpay partner OAuth, Domain Connect, discounts, reviews, reports, CSV import, shopper accounts |

**First customer:** onboarded after Phase 3 on Theme 1 (team-assisted), also used as the Razorpay subdomain-approval test.

---

## 18. Open questions
1. Final theme names.
2. SMS provider and cost for COD OTP; WhatsApp OTP at launch or later.
3. Default delivery charge options; per-pincode charges?
4. Shopper accounts at launch, or guest checkout only?
5. GoDaddy reseller account type (Basic/Pro vs API) — apply for API Reseller or use ResellerClub?
6. Lawyer review of policy templates, Terms (IP and data ownership) and data processing terms.
7. Stores without GSTIN (below threshold): allowed? What extra verification?
8. Razorpay written confirmation of the subdomain model; partner programme application.
9. Traffic guarantee: threshold and terms.
10. Data retention period after cancellation.
