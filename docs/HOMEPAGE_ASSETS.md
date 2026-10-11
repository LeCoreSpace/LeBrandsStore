# Homepage media

The hero retains genuine public Stonescence storefront captures. Its live-store
link remains https://stonescence.lebrands.store. These images are not AI art.

The other five media slots are real Playwright captures of the existing Aura,
dashboard, checkout, invoice and setup-wizard renderers, populated with the
fictional Example Studio local fixture. Every homepage example is captioned
**Example store**. None is a real merchant, customer or financial record.

## Local-only source

`src/local-example-fixture.js` is imported only by `src/preview.js`, the entry
for `wrangler.preview.jsonc`. Production still uses root `wrangler.jsonc` and
`src/index.js`; production cannot serve the example routes or original local
product assets.

The local fixture contains six cotton apparel products priced from ₹1,290 to
₹3,490, all six reviewed example policies, and twelve fictional orders across
seven days. Names are abbreviated; addresses and contacts are fictional.
Intra-state CGST/SGST and interstate IGST are calculated with the existing pure
cart/tax rules. Dashboard totals come from these orders, not invented metrics.
The sample tax invoice belongs to the interstate demo order, uses the existing
short FY numbering convention, displays a fake GSTIN-format placeholder, and
has a light SAMPLE watermark. It is never issued to the database.

Only the six garment photographs were AI-generated. Their original and
2000×2500 exports are in ignored `generated-artifacts/homepage-media/`.
The garment photos were reviewed for anatomy, seams, matte texture and absence
of people, text or branding. Smaller WebP copies serve the local fixture.
No AI-generated UI or device artwork is used.

Local routes: `/__example-preview/store`, `/checkout`, `/dashboard`, `/invoice`,
`/wizard` and `/composite` (each under the same `/__example-preview` prefix).
The compositor places the actual desktop/mobile captures in simple CSS frames.
The wizard uses the real client in visual-only mode; edits update its real live
preview in memory. Save, publish and order placement are blocked. Cart quote
requests compute prices locally without persistence or provider access.

## Finished homepage files

Files live in `src/public/img/`:

| Base filename | Content |
| --- | --- |
| `REPLACE-store-photo` | Real desktop and mobile storefront captures in CSS device frames, 2880px wide |
| `REPLACE-checkout` | Real mobile COD checkout, 780×1688 |
| `REPLACE-dashboard` | Real dashboard Home, 2880×1800 |
| `REPLACE-invoice` | Actual supplier/items/tax-summary crop with SAMPLE watermark |
| `REPLACE-wizard-loop.webm` | Real Playwright wizard recording, 1600px wide, VP9, no audio |
| `REPLACE-wizard-poster` | First frame from the final recording |

Stills have responsive AVIF/WebP sources and JPG fallbacks. The checkout is not
upscaled for its responsive candidates. All example images are lazy-loaded
below the hero, including the first-frame poster. The video source loads only when visible; playback is
muted, inline, looping and disabled by reduced motion or `?motion=off`.

Raw captures, full-resolution photos, recording intermediates and full-page
review screenshots stay in ignored `generated-artifacts/`, not Git history.
No database migration, production data write, deployment or secret read was
performed to produce this media.

Instrument Sans remains self-hosted with its OFL licence in
`licenses/instrument-sans-OFL.txt`. The font and two eager hero images remain
under 100 KB combined. This is an asset budget, not a measured 4G LCP claim.
