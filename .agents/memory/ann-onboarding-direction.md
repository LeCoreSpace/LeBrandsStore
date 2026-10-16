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

Keep every Ann question short, friendly and self-explanatory. Explain HSN
suggestions once, not inside every product choice; keep optional provider setup
behind disclosures so it does not overwhelm the conversation.

**Why:** The user said the conversation and product/HSN choices had too much text
and clutter, especially for non-technical merchants.

**How to apply:** Prefer one short question with a brief hint where needed.
Preserve GST invoice-lock warnings, tax confirmation and explicit live-service
activation even when shortening the copy.

Merchants may choose COD together with Razorpay, and manual tracking together
with Shiprocket. Choosing a partner is an intention, not activation; allow
preferences to be saved before connecting, while retaining activation checks.

**Why:** The user explicitly wants both payment methods and both delivery
approaches available together.

**How to apply:** Preserve combined choices across save/reload and activation.
Manual courier/tracking entry remains in Orders, separate from partner setup.

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

All merchant-typed answers in Ann must use the single chat text box at the
bottom, not separate text inputs inside the conversation.

**Why:** The user repeatedly requested a natural chat flow and explicitly said
all user-typed input should come from that bottom text box.

**How to apply:** Keep selectable choices and explicit confirmations beside the
question. When additional details are needed, clearly identify which question
the bottom reply will answer rather than introducing another text-entry location.

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

A saved Ann conversation is not permission to overwrite an existing design.
If no design has been adopted, show the saved plan in the editor as a pending
preview and require explicit adoption before editing or persisting it.

**Why:** Saving the conversation alone previously led to a blank default editor,
but silently creating a design on opening the editor would replace a draft
without the merchant's acknowledgement.

**How to apply:** Use the same projection for the pending preview and adoption,
including category/subcategory settings as well as style, copy and creatives.
An already-adopted design remains authoritative and must never be reseeded.

Catalogue confirmation must not also choose a theme, replace page content, or
silently switch a sample preview to the merchant's products. Selecting real
catalogue content is a separate, explicit choice. Sample prices and stock are
not merchant inventory and cannot be used to publish a sellable catalogue.

**Why:** The user wants to explore a finished design first and replace its
products later, with explicit consent before using their existing products.

**How to apply:** Preserve the current visual design when committing catalogue
records, keep sample previews isolated, and retain the real-catalogue
publication checks.
