# Homepage media

The landing page uses an original fictional Example Studio premium clothing-store
concept, not Stonescence screenshots or a live-customer claim. The concept is
staged independently; it has not been transferred into the live Aura theme.

Storefront and checkout images are captures of the staged browser-rendered
design. Dashboard, invoice and setup-wizard images and recording are preserved
from the previous actual-renderer captures. Every homepage example is captioned
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

The six garment photographs and two original fashion/lookbook photographs were
AI-generated. The garment originals and
2000×2500 exports are in ignored `generated-artifacts/homepage-media/`.
The garment photos were reviewed for anatomy, seams, matte texture and absence
of people, text or branding. Smaller WebP copies serve the local fixture.
New lookbook originals are in ignored `generated-artifacts/premium-clothing/`.
No AI-generated UI or device artwork is used.

Local routes: `/__example-preview/store`, `/checkout`, `/dashboard`, `/invoice`,
`/wizard` and `/composite` (each under the same `/__example-preview` prefix).
The compositor places the actual desktop/mobile captures in simple CSS frames.
The wizard uses the real client in visual-only mode; edits update its real live
preview in memory. Save, publish and order placement are blocked. Cart quote
requests compute prices locally without persistence or provider access.

The new `/__example-preview/premium-store` and
`/__example-preview/premium-checkout` routes stage the clothing concept locally.
They are not production routes. The concept is not advertised as an available
Aura preset, and the landing page does not link to local-only routes.

## Finished homepage files

Files live in `src/public/img/`:

| Base filename | Content |
| --- | --- |
| `REPLACE-example-desktop` | Original clothing concept, desktop browser capture |
| `REPLACE-example-mobile` | Original clothing concept, mobile browser capture |
| `REPLACE-store-photo` | New desktop and mobile concept captures in CSS device frames, 2880px wide |
| `REPLACE-checkout` | Premium-styled local mobile COD checkout, 780×1688 |
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
`licenses/instrument-sans-OFL.txt`. Hero images have responsive modern-format
candidates; source captures do not establish a measured 4G LCP claim.
