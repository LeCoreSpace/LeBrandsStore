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

Storefront/Aura colours belong to the brand's chosen preset, not LeBrands plum.

**Why:** The user explicitly stated this boundary when approving the app accent
recolour.

**How to apply:** Never apply operational branding tokens to storefront presets,
storefront CSS, or brand-selected preview colours.
