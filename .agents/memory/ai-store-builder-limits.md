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

## Shared product and collection templates

AI builds the default product page template and default collection page
template. All products follow the default product template, and all
collections follow the default collection template. Creating additional
product/collection templates and assigning templates individually are
scoped for later implementation.

Reserve space/options for future template additions from the start, even
though only the default product and collection templates are initially available.

**Why:** The user proposed shared default templates rather than separately
building the structure of every product and collection page.

**How to apply:** Keep shared layout settings separate from individual product
and collection content. Progressive AI generation builds the shared templates
once, while each page resolves its own entity data. Keep the template model and
editor selection extensible so additional templates can be added later without
replacing the default-template architecture.
