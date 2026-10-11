# Homepage media

The homepage uses actual public Stonescence storefront captures, taken on
11 October 2026 at desktop and 390px mobile widths. The WebP variants are
small, responsive assets. They are not fabricated storefront mockups.
The original captures and review screenshots are in the ignored
`generated-artifacts/homepage/` directory.

No original product photography, real checkout/dashboard/invoice capture,
or wizard screen recording was supplied. These slots show named placeholders
instead of invented imagery or broken image/video requests.

## Assets to supply

Place supplied files in `src/public/img/`. Their public URLs are:

| URL | Required content |
| --- | --- |
| `/img/REPLACE-store-photo.jpg` | Original Stonescence product photography, not a stock or AI image |
| `/img/REPLACE-checkout.jpg` | Actual COD checkout capture, with customer information removed |
| `/img/REPLACE-dashboard.jpg` | Actual brand dashboard capture, with personal/financial details removed |
| `/img/REPLACE-invoice.jpg` | Actual GST invoice capture, with personal/customer details removed |
| `/img/REPLACE-wizard-loop.webm` | Short recording of the real wizard and its changing live preview |
| `/img/REPLACE-wizard-poster.jpg` | Still from that recording |

After supplying a file, set its `available` flag to `true` in
`src/ui/marketing-media.js` and update the width/height to its real dimensions.
Keep paths aligned with the Worker image/video allowlist. Prefer WebP or AVIF
for supplied images; the placeholder routes accept both formats.

The video is muted, inline and looping. It starts automatically only while
visible and with motion allowed. Reduced motion stops video and parallax.
`?motion=off` also gives a motion-free page for static full-page exports.

Instrument Sans is self-hosted with a single Latin WOFF2 subset, using only
weights 400 and 600. Its OFL licence is in `licenses/instrument-sans-OFL.txt`.

The font and two eager desktop hero images total less than 100 KB.
This is an asset budget, not a claim that 4G LCP has been measured.

The refund-policy page is explicitly a draft, like the existing Terms and
Privacy pages. No final legal policy was invented.
