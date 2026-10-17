---
name: Ann-only onboarding direction
description: User-requested replacement of the Ann/Standard chooser and the required Ann-to-editor handoff.
---

Use Ann as the single store-building entry point. Remove Standard Builder choices
from the app, while keeping the theme editor for subsequent design editing and
publishing. Products and Collections should be separate dashboard menu entries.

After a merchant reaches Style, disable Ann's Business and Store address steps,
including their transcript Edit links and logo shortcut. Keep GST verification
mandatory before reaching Style.

**Why:** The user explicitly requested the first two steps stop being editable
once step 3 is reached.

**How to apply:** Scope this navigation restriction to Ann. Do not treat it as
permission to weaken the server's confirmed GST/invoice-identity lock or remove
legitimate ongoing brand management from other screens.

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
Do not repeat brand and included-address questions later. Finish with review and
a short store-essentials summary, not payment, delivery or custom-domain
integration questions. Connection management belongs in the corresponding
Settings screens, with direct links from Ann and no loop back into Ann.

**Why:** The user described this sequence to replace the previous onboarding.

**How to apply:** Keep questions conversational and understandable to
non-technical merchants. Preserve the existing verified-registration and
historical-invoice boundaries.

Ann explains the included LeBrands address, available COD and manual tracking,
and shows actual enabled/connected status. Never imply an available capability
or a saved preference is activated. Partner services and custom domains are
optional.

**Why:** The user accepted moving connection setup out of Ann to simplify the
conversation and centralise ongoing management.

**How to apply:** Preserve explicit provider activation and combined COD/online
payment and manual/partner shipping choices. Today must distinguish saved Ann
build progress from required opening checks, without counting optional partner
connections as unfinished work. Collapse onboarding reminders for live stores.

All merchant-typed conversation answers in Ann must use the single chat text
box at the bottom, not separate text inputs inside the conversation. Direct
canvas content edits are an explicit exception and use the selected item's
inline controls.

**Why:** The user repeatedly requested a natural chat flow and explicitly said
all user-typed input should come from that bottom text box.

**How to apply:** Keep selectable choices and explicit confirmations beside the
question. When additional details are needed, clearly identify which question
the bottom reply will answer rather than introducing another text-entry location.
Do not relocate contextual design-editor fields into the chat composer.

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
Ann also supports contextual inline edits once the merchant adopts their style
at step 3, with collapsible design tools on the preview side. Both surfaces edit
the same merchant-owned draft; retain the standalone theme editor.

**Why:** The user called the exact Ann-to-editor match very important.

**How to apply:** Do not rebuild an approximation from a style name on editor
handoff, flatten the design into an image, or discard its sample content.
Keep the original Style showcase read-only, separate from the merchant's
editable design even when that design still contains sample products. Viewing
that saved sample design must not require consent to use the real catalogue.
Reselecting or keeping an already-adopted style must resume editing that
merchant draft, not return to the read-only showcase or reset its custom styling.

**Why:** The merchant reported missing inline editing after confirming their
saved style because that interaction returned them to showcase mode.

A saved Ann conversation is not permission to overwrite an existing design.
If no design has been adopted, show the saved plan in the editor as a pending
preview and require explicit adoption before editing or persisting it.

**Why:** Saving the conversation alone previously led to a blank default editor,
but silently creating a design on opening the editor would replace a draft
without the merchant's acknowledgement.

**How to apply:** Use the same projection for the pending preview and adoption,
including category/subcategory settings as well as style, copy and creatives.
An already-adopted design remains authoritative and must never be reseeded.
Optional-section choices must come from the adopted design on every rendering
surface, not just Ann's temporary conversation preview. Keep section identities
stable when other sections are added or removed.
Show any confirmation needed to unlock editing in full, not behind a collapsed
control, and present editing tools only once the design is editable.

**Why:** A hidden adoption prerequisite made the editor appear entirely broken
to the merchant even though its save action was available.

Selecting a section or individual text, image or video should open its own
editing controls beside the selection on the canvas, not send the merchant
back to a distant general settings panel. Keep a section-level view for choosing
its contents. State labels must make editing on/off clear.

**Why:** The user repeated that direct selection should work like Shopify's
contextual editor. A field above the sidebar's scroll position looked
unresponsive, and added sections listed only in the sidebar were insufficient.

Catalogue confirmation must not also choose a theme, replace page content, or
silently switch a sample preview to the merchant's products. Selecting real
catalogue content is a separate, explicit choice. Sample prices and stock are
not merchant inventory and cannot be used to publish a sellable catalogue.

**Why:** The user wants to explore a finished design first and replace its
products later, with explicit consent before using their existing products.

**How to apply:** Preserve the current visual design when committing catalogue
records, keep sample previews isolated, and retain the real-catalogue
publication checks.

Theme Undo is scoped to the current store's editing session and must not reset a
shared style or change the live site. Keep it usable across draft saves in that
session; applying an undone version still requires Save draft. A reload starts a
new session, not a historical-version rollback.

**Why:** The user requested a top-right Undo control after explicitly checking
that theme edits affect only their brand and leave the base style unchanged.

Publishing from the theme editor must stay on publication review, not resume
the legacy setup wizard. Show saved business and GST details without asking
merchants to enter them again. Keep missing-requirement checks and explicit
policy-review/publication confirmation; link corrections back to their proper
editing surfaces.

**Why:** The user finalised a design but publication sent them back to an
unneeded input form. The review handoff must not depend on old wizard progress.

Products created through Ann should have a collection, tags and a vendor.

Every product-creation capability added to Ann must also be available in
Dashboard → Products → Add product and Edit product. Both entry points must
operate on the same catalogue records with consistent validation, limits,
variant/SKU behavior and media associations, not separate copies.
Collection and product forms should open as modals within Ann and reuse the
dashboard forms. Their inputs stay inside the form, not Ann's chat composer.

Buying-option selection belongs inside that shared product form only. Use the
existing subcategory-specific attribute names and values exactly; let merchants
choose their options and values rather than inventing a separate suggestion list.
Ann's current category and subcategory must carry into a blank new-product form.
Do not require the merchant to choose them again, and do not override an existing
product's classification. Show loading, errors and available options inside the
buying-options section, not only elsewhere in the form.

**Why:** The user explicitly requested the exact variants and values for each
subcategory in both Ann and Dashboard, then clarified that selection should move
into the product form itself.
They reported no options after selecting Womens Clothing in Ann; the modal had
lost the selection and its disabled button's explanation was off-screen.

Generate product and variant SKUs automatically and show them to the merchant,
rather than requiring the merchant to create a SKU. Preserve existing saved SKUs.

**Why:** The user explicitly asked for auto-generated SKUs shown to the user.

The reply composer must feel continuous with Ann's main conversation, not like
a separate form card or section. Preview controls should have a clear hierarchy
without changing the standalone theme editor.

**Why:** The user requested professional refinement of the bottom conversation
field and right-side preview controls, explicitly saying the conversation field
should look like part of the main chat.

**How to apply:** Keep Ann-specific presentation separate from shared editor
behavior and preserve save, publish, validation and keyboard interactions.

**Why:** The user explicitly requires product-adding features in Ann to also
appear in the dashboard Add product form, and reported that the collection and
product steps were not opening the requested modals.

**How to apply:** Treat parity across Ann and dashboard product creation/editing
as part of each feature's completion criteria. Preserve the distinction between
Ann planning ideas/sample previews and actual saved catalogue products.

**Why:** The user explicitly included these in the desired product-creation flow.

**How to apply:** Include these catalogue details when implementing Ann product
creation, rather than saving only product names and descriptions.

Keep Ann's Design workspace discoverable and automatically open it when a saved
merchant design is restored, not only immediately after adopting a new style.
Opening it from a showcase should resume the saved merchant draft, never edit
the shared showcase.

**Why:** The user repeatedly reported that the workspace and editing controls
were missing in Ann.

**How to apply:** Preserve close/reopen controls, the shared theme-editor draft
and read-only restrictions. Do not hide the entry point under More.

Ann and the standalone theme editor must use the same Design workspace UI.
Menus belongs beside Sections, Content and Style, covering header and footer
navigation. These edits belong to the merchant, never to a shared style preset.

**Why:** The user explicitly asked to see the theme editor's workspace in Ann
and proposed a separate workspace tab for the menu editor.

**How to apply:** Keep the two editing surfaces consistent, preserve the
standalone editor, and treat navigation as merchant-owned content when changing
visual styles. Keep draft edits separate from publishing.
Design workspace and contextual editor inputs stay local to those controls;
chat-only typing applies to Ann's conversational questions, not design tools.

Localize Ann's conversation only in English, Hindi, Tamil, Marathi and Telugu.
Do not translate merchant-entered content, verified invoice identity, dashboard,
design workspace, theme editor or storefront as a side effect.

**Why:** The user requested Hindi first and then confirmed that these five
languages are enough. The scope is Ann-side conversations, not translation of
the application or merchant content.

**How to apply:** Keep language preference separate from store draft data and
use prepared copy for questions and warnings. Preserve identifiers, names,
addresses and user answers exactly when changing conversation language.
