---
name: Aura prefilled starter content
description: Prefilled Aura content and the user's two-path setup direction: Ann and Standard Builder.
---

Aura sections should come prefilled with text and media, both when initially created and when dragged into a page. The user wants section IDs linked to text and media across every category/subcategory combination, rather than requiring an AI builder.

The user's initial 18-category estimate is not the authoritative coverage
target. Use the supplied product-only taxonomy; do not count service
categories toward the product-brand library.

**Why:** The user said repeated AI generation was not working and preferred the prefilled-content approach used by Zoho Commerce. Mixed category/subcategory exports included service entries, so raw export counts are not reliable product-pack counts.

**How to apply:** Scope a starter-content library against the actual LeBrands.Space taxonomy, not invented category names. Treat earlier merchant-facing AI generation instructions as superseded for the primary setup experience; do not remove existing functionality or overwrite store content without an implementation request.

Starter theme previews need product images, pricing, populated collections
and at least three sample products.

**Why:** The user said these are needed for anyone to visualise a theme.

**How to apply:** Include a labelled demonstration catalogue and demo prices
in starter previews, rather than empty catalogue sections. Keep examples
separate from actual merchant inventory and financial settings.

An explicit unsaved starter proposal should display its complete demonstration
catalogue even when the merchant already has real products.

**Why:** Existing inventory must not prevent the merchant from visualising
the starter's products, prices and collections before adopting it.

**How to apply:** Use demonstration catalogue references only in the preview
clone, including preview selectors. Saved layouts and normal catalogue views
continue to use the merchant's real inventory; never import demo stock by
saving a theme.

Offer "Build your Store with Ann" and "Standard Builder" instead of the
earlier AI builder option. Standard Builder keeps the existing four-step
setup followed by the Aura theme editor. Ann uses a conversation on the
left and a whole-store canvas preview on the right.

**Why:** The user asked for both paths and confirmed proceeding with this
approach, rather than requiring every merchant to use the earlier AI flow.

**How to apply:** Ann follows the interactive whole-store approach discussed
with the user, with fast previews as choices change, not sequential
page-building or per-section AI approvals. Preserve Standard Builder.

Selecting or switching a builder is a preference change, not a content
reset or a business-details edit. It must preserve policy review, wizard
progress, catalogue, page drafts and the live publication.

**Why:** Both builders are alternative interfaces to the same store, and
the user requires the existing Standard Builder to remain usable.

**How to apply:** Keep the builder preference write separate from setup
operations that invalidate reviewed policies or replace layouts.

Use complete interactive browser previews, with animation, to sell the
storefront styles. Page-design images are optional reference material, not
the primary theme-selection experience.
Each style must be scrollable and interactive, with Desktop and Mobile views.
The user wants five previews, including Vintage, even when the merchant has
existing products and older images. The earlier shared-fashion-image approach
has been superseded by approved separate image sets for each showcase.

**Why:** The user pointed to Webflow's template browser preview and said,
"this is what sells. not a image of a website".

**How to apply:** Render real Aura pages with working preview navigation
and a clearly isolated demonstration shopping flow; never let a preview
place an order, take payment or add demonstration inventory to a store.
Keep the style showcase distinct from the actual merchant catalogue rather
than silently substituting existing inventory during style comparison.

The five styles must differ in complete composition, including section colours,
highlights, animation, section arrangement and section count, not merely fonts.
The user approved distinct image sets for five sample niches: women's clothing,
skincare, streetwear, home decor and leather bags.

**Why:** The user rejected the font-led differences and requested separate
photography across styles and subcategories.

**How to apply:** Treat these pairings as illustrative showcases, not a rule
restricting which style a merchant can select. Keep white as the default base
without forcing every section to be white. Preserve merchant-authored content,
inventory and live publications when building or comparing previews.

The user confirmed that the distinct website designs per style are "amazing"
and wants them enhanced with animations and more sections. Choice pills in
the conversational window and above the preview should have rounded corners.

**Why:** The user approved the existing design direction and specifically
requested richer motion, more sections and rounded builder controls.

**How to apply:** Refine the established five identities rather than replacing
them. Scope the rounded-control request to Ann's conversation and preview
toolbar; it does not require rounding every storefront's visual language.

Sections must suit each subcategory, not merely the style. The user specifically
requested before/after for skincare and other relevant products, plus social
proof, UGC, reviews, bundles, offers, payment, delivery and trust badges.
Additional carousel or section images may be generated if needed.

**Why:** The user said "each subcategory has its own needed sections" while
approving the richer showcase refinements.

**How to apply:** Select relevant guidance and comparison sections from the
product taxonomy. Preserve each visual style while adapting product-specific
content. Demonstration reviews, offers, customer photos and operational badges
must be visibly illustrative, not fictional real claims. Before/after must not
manufacture product efficacy evidence; require genuine, permissioned comparison
media before a merchant publishes results.

Shared demonstration images do not mean shared text: category and subcategory
choices must immediately change the preview copy, including Skincare.

**Why:** The user accepted reused sample images but explicitly rejected the
unchanged clothing text after selecting Skincare.

**How to apply:** Keep media visibly labelled as placeholders; tailor section and
sample catalogue copy to the selection without overwriting merchant-authored text
or inventing product efficacy, ingredient, certification or policy claims.

Ann must have an actual chat window, interactive conversation and progressing
visual, not merely a multi-step form with input buttons.

**Why:** The user explicitly rejected the form-like experience as missing
interactivity, a chat window and a progressing visual.

**How to apply:** Make questions and submitted replies visible as a conversation,
with focused prompts and progress tied to actual choices and preview updates.
Do not claim that deterministic preview changes are AI generation or that
planning progress proves publishing readiness.

## Ann planning and catalogue boundary

Attribute/value exports are global reference choices. The supplied ad-card
assignments are not merchant ownership records or permission to create
inventory. Ann's saved product ideas remain proposals until explicitly
created through the existing store-owned catalogue APIs.

**Why:** Ann must let merchants explore and change their store without
silently importing another system's catalogue or altering real stock.

**How to apply:** Keep planning answers separate from real products,
verified business data, policies and publication. A saved Ann session or
a completed interview step never proves that a store is ready to publish.

Linking an existing catalogue item in Ann is not permission to synchronize
its name, copy, photos, price or stock from an idea. Later theme changes must
reuse confirmed bindings rather than silently creating replacement inventory.

**Why:** The catalogue is authoritative. Reapplying a style or editing an Ann
idea must not reset merchant work or checkout-adjusted inventory.

**How to apply:** Keep product creation explicit, with confirmed selling
details. Preserve existing records and collection members when binding a plan;
use the ordinary catalogue editor for intentional changes to those records.

## Ann setup and live checkout

Keep Ann's interview, draft application and live selling settings distinct.
Business and policy work is draft work; shipping and COD changes use the
existing checkout configuration and can affect customers immediately.

**Why:** A single "build a draft" interaction must not imply that a live
payment or delivery change is safely deferred until publication.

**How to apply:** Require separate explicit consent for live checkout changes,
preserve owner-only checkout permissions, and require policy review again when
business or selling terms change. An Ann interview/checklist never substitutes
for GSTIN verification, address confirmation or platform approval.

Ann's media upload entry point should enforce Ann's write-role boundary before
reading multipart bytes, while continuing to use the established store-owned
media handler for validation and storage.

**Why:** The older Standard Builder media route has a different role contract;
reusing it as a direct Ann endpoint would let a read-only Ann participant
upload. Tightening Standard Builder's role contract as a side effect could
break its existing workflow.

**How to apply:** Gate new Ann media entry points under Ann's owner/admin
authorization before delegation. Do not weaken tenant, media approval,
upload validation or orphan cleanup in the shared handler.
