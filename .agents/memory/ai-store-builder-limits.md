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

## Approved provider and spending choices

Use OpenAI for text and image generation and Resend for verification emails.
The global monthly AI spending cap is USD 20 across all stores.
Allow up to six extra section images per build, separately from the product-image allowance.
Review generated images in the complete draft and replace unsuitable ones
in the theme builder before publishing.

Show merchant-facing AI usage amounts in INR, not USD. Label conversions
as approximate and disclose the reference rate. Keep the approved provider
cost accounting and USD spending cap unchanged unless separately requested.

**Why:** The user requested INR usage display, not a change to the existing
spending controls or provider billing.

**Why:** The user selected these providers, budget and section-image allowance.

**How to apply:** Preserve these limits in the Phase 3 builder and its setup.

## Skeleton first and complete-draft generation

The primary setup direction has since changed to prefilled category-based
starter content. See [Aura starter content](aura-starter-content.md). The
generation workflow below is historical scope, not the current primary setup.

First create and test the Aura skeleton for home, collection, product, cart
and checkout, with all essential sections and components. Then include AI
after the user completes the fill-in-the-blanks prompt. Generate the entire
store draft without stopping for section-by-section approvals. The user
previews and approves the complete result in the theme builder and changes
images there if desired.

**Why:** After repeated generation failures, the user explicitly replaced
the earlier progressive approval workflow with complete-draft generation.

**How to apply:** Keep the tested skeleton. Generate all store copy in one
coordinated request, not a queue job or AI request for each of 51 sections.
Use one factual verification pass for the complete output. Show rendered page
previews as soon as copy is ready, with one final draft review. Extra section
images are opt-in; uploaded photos are the faster default. Requested AI images
use their separate API and must not introduce section approval gates.
Preserve resume checkpoints, bounded retries, provider
cost accounting and validation. Save the completed draft for theme-builder
review; never publish automatically or alter the existing published snapshot.

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
and collection content. Complete-draft AI generation builds the shared templates
once, while each page resolves its own entity data. Keep the template model and
editor selection extensible so additional templates can be added later without
replacing the default-template architecture.

## Existing stores: no bulk backfill

Upgrade the existing Aura template implementation. Do not bulk backfill
existing stores to add the new sections or replace their layouts.
Existing brands can access the new sections in the editor, use AI once
when that phase is completed, then publish their updated draft.

**Why:** The user explicitly requested no backfill for the existing brands.

**How to apply:** Preserve existing store content and published layouts. New
section availability is distinct from inserting sections into saved layouts.
If template tables are introduced, existing stores must continue to work
without pre-populated template rows; create store-specific draft records
only through an explicit save or build action.

## Ordered starter layouts in the editor

The new Aura template must have its sections initially arranged in the
proper proposed order in the editor itself, not merely available in
the section library.

**Why:** The user explicitly clarified that section availability alone
does not satisfy the required initial template.

**How to apply:** Provide ordered starter layouts for home, default collection,
default product, cart and restricted checkout customisation. Every section and
component must remain visible with its heading in the editor skeleton even
when data is absent, ready for AI to fill in later phases. Do not hide empty
sections from that preview; distinguish empty states from actual content.
Keep empty placeholders out of published storefronts. For existing stores, prepare the upgraded draft
preview without bulk backfilling or silently changing published layouts;
persist changes only on explicit save/build.

**Why for the visibility rule:** The user explicitly corrected the hidden
empty-section approach after reviewing the initial skeleton screenshots.
