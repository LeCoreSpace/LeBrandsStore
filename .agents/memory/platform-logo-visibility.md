---
name: Platform logo visibility
description: Prominent LeBrands branding across platform pages and host-specific delivery verification
---
Make the LeBrands logo bigger and clearly visible across all platform pages.

**Why:** The user repeatedly requested larger logos and reported a missing
logo on the signup page after other branding work.

**How to apply:** Check account pages as well as marketing, dashboard and
wizard headers. Keep mobile navigation usable without making the logo tiny.
Preserve merchant-owned branding.

A logo appearing in local Preview does not establish that its image route
works on the account hostname in the production Worker.

**Why:** The signup logo referenced existing artwork, but the account hostname
did not serve that image path.

**How to apply:** Verify shared artwork requests against the production
handler with the account hostname, not only against local asset serving.

Browser icons need their own contrasting background, not just a transparent
plum logo.

**Why:** The user reported that the transparent favicon became diluted against
dark browser tabs. Browser chrome can be dark even when the website is light.

**How to apply:** Keep the supplied sign mark on a high-contrast tile. Support
the browser's colour preference independently of the website's theme toggle,
retain a clear multi-size ICO fallback and refresh icon URLs when changing art.

Self-contained SVG favicons with embedded PNGs and theme CSS need a resource
policy that permits those data images and the exact inline stylesheet.

**Why:** The preview's fallback `default-src 'self'` blocked both despite the
SVG returning 200, producing a broken icon instead of theme adaptation.

**How to apply:** Use a favicon-specific restrictive CSP with `img-src data:`
and the stylesheet hash. Check the hash against actual SVG content and render
both colour preferences in a browser. Do not loosen the application-page CSP.
