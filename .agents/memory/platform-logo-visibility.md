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
