---
name: Ann-only onboarding direction
description: User-requested replacement of the Ann/Standard chooser and the required Ann-to-editor handoff.
---

Use Ann as the single store-building entry point. Remove Standard Builder choices
from the app, while keeping the theme editor for subsequent design editing and
publishing. Products and Collections should be separate dashboard menu entries.

**Why:** The user said offering two ways to build confuses merchants.

**How to apply:** Replace the choice, not existing merchant data. Preserve existing
stores, products, collections and saved drafts when changing onboarding.

The requested conversation starts with brand name, GSTIN API verification and
the verified invoice address, then the logo and editable included store address.
Explain that connecting a custom domain comes later. Continue through style,
fonts and colours, product category/subcategory, niche-specific products with HSN
and custom additions, and relevant attributes for up to five initial products in
a collection. Explain that more products and collections can be added later.
Do not repeat brand and included-address questions later. Finish with payments,
delivery, custom-domain connection and review.

**Why:** The user described this sequence to replace the previous onboarding.

**How to apply:** Keep questions conversational and understandable to
non-technical merchants. Preserve the existing verified-registration and
historical-invoice boundaries.

GSTIN verification and explicit confirmation of the registered invoice address
are mandatory at the opening business stage, not deferrable until publication.
After confirmation, the invoice legal name, GSTIN and registered address cannot
be changed through merchant settings.

**Why:** The user corrected the skip/later behaviour and said this is the
address used on invoices and cannot be changed later.

**How to apply:** Keep failed verification on this stage, retain typed entries,
block navigation past it, and enforce the confirmed-identity lock on the server.
Do not mistake workspace secret availability for a deployed Worker binding.

Ann and the theme editor must open the same saved design, including section
arrangement, text, sample creatives, colours and typography. Keep sections
individually editable, addable and removable. Preserve browser preview in both.

**Why:** The user called the exact Ann-to-editor match very important.

**How to apply:** Do not rebuild an approximation from a style name on editor
handoff, flatten the design into an image, or discard its sample content.

Catalogue confirmation must not also choose a theme, replace page content, or
silently switch a sample preview to the merchant's products. Selecting real
catalogue content is a separate, explicit choice. Sample prices and stock are
not merchant inventory and cannot be used to publish a sellable catalogue.

**Why:** The user wants to explore a finished design first and replace its
products later, with explicit consent before using their existing products.

**How to apply:** Preserve the current visual design when committing catalogue
records, keep sample previews isolated, and retain the real-catalogue
publication checks.
