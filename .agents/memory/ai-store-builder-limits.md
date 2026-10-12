---
name: AI store builder limits
description: User's revised build allowance, image regeneration and cost controls override the attachment's trial/rebuild allowances
---
- ONE full AI build per store. After the build, the brand edits pages, sections, text, colours, fonts and media in the theme editor; no further full rebuilds.
- AI product images: up to 4 per product during the build. In the approval step, each image may be regenerated at most 2 times or discarded; nothing else is regenerated later.
- If a build fails (provider error, invalid output), it does not count; the brand can retry. A build counts only when it completes and is saved as a draft.
- Generation only after email verification.
- Usage table records tokens, images and cost per build.
- Global monthly spend cap setting; when reached, show a friendly "try again later" message.
- Admin script to grant one extra build to a store (for support cases).

**Why:** These are the user's revised section 6 requirements, replacing the attached brief's three trial builds, higher paid-plan limits and later single-section regeneration.

**How to apply:** Use these limits when scoping the AI store builder. They are product requirements, not evidence that the builder or billing enforcement exists.

## Skeleton first and progressive generation

First create and test the Aura skeleton for home, collection, product, cart
and checkout, with all essential sections and components. Then include AI
step by step after the user completes the fill-in-the-blanks prompt.
The user sees each page being created one at a time, one section at a time,
with the AI-generated image for that section approved by them before moving
to the next section, rather than creating all sections in a page at once.

**Why:** The user changed the proposed workflow from generating everything
in one go to a tested skeleton followed by progressive generation and approval.

**How to apply:** Preserve this order when planning the builder. Section-image
allowances beyond the specified product-image allowance remain undecided.
