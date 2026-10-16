---
name: Dashboard visual boundary
description: Why the brand admin and public Aura storefront have separate visual identities
---
The brand dashboard should feel like a dense, calm professional commerce admin,
using LeBrands plum accents and system UI typography rather than editorial headings.
Its visual identity is separate from the public Aura storefront and checkout.

**Why:** The user requested a professional operational dashboard and later
explicitly authorised changing its and the wizard's accent colour and LeBrands
logo only to plum, with layout, behaviour, copy and test assertions unchanged.

**How to apply:** Scope dashboard styling to dashboard assets. Do not propagate
admin styling into storefront or checkout files. For visual-only requests,
represent unavailable capabilities honestly rather than inventing data or
silently expanding backend/schema scope.

LeBrands app branding also includes sign-in, signup, password and account pages,
not just the wizard and store dashboard. Use the supplied hanging-sign logo.
The user also explicitly requested it across all static and dynamically rendered
platform pages and as the browser favicon. Use the complete lockup where it fits
and the supplied compact sign mark for collapsed or narrow layouts.

**Why:** The user pointed out that the inner account pages and old L logo had
been missed when the app branding was recoloured.

**How to apply:** Check public account-entry pages as well as protected app
screens when changing LeBrands branding; preserve operational layouts and flows.

Storefront/Aura colours belong to the brand's chosen preset, not LeBrands plum.

**Why:** The user explicitly stated this boundary when approving the app accent
recolour.

**How to apply:** Never apply operational branding tokens to storefront presets,
storefront CSS, or brand-selected preview colours.

The theme editor's left panel should be a professional, distinct LeBrands
workspace. Use Shopify only as a usability reference, not an exact visual copy.

**Why:** The user explicitly requested a complete left-panel makeover and said
"dont copy the exact shopify style."

**How to apply:** Keep the editing tools organised and concise, while preserving
the exact merchant design and existing on-canvas editing interactions.
