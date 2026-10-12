# LeBrands.Store web preview entry

This artifact registers the existing Cloudflare Worker application as a web app
so it appears in Replit's Preview tab. Vite forwards requests to the existing
Wrangler workflow on port 8080. It does not render the scaffolded React app or
replace any application screens.

Run both managed workflows:

- `artifacts/api-server: API Server`
- `artifacts/lebrands-web: web`

The homepage is `/`; account pages such as `/login` use the existing local
Worker adapter. The optional read-only sample browser remains at
`/__app-preview`, but it is not the web preview's entry page.

This is development-only. Production remains Cloudflare using the root
`wrangler.jsonc`. Do not publish this gateway as a static React application.
Database-backed sign-in and saved changes still require a separately configured
preview database; this gateway does not attach the live database.
