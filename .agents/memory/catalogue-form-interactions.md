---
name: Catalogue form interactions
description: Shared product classification layout, in-app confirmations and meaningful dirty-state tracking.
---

Keep Category and Subcategory immediately above Product type in the shared
product form. Closing an Ann product or collection form must use an in-app
discard confirmation, not a native browser confirmation.

Use the same in-app confirmation boundary for setup/publication actions such as
policy regeneration and readiness reloads.

**Why:** The user repeated that modal closing and confirmation must not use
the browser's default prompt, including the publication-review policy workflow.

**How to apply:** Reuse the shared accessible dialog; cancellation must preserve
draft text and reviewed state.

All dashboard, Ann, theme-editor and settings confirmations, text-entry prompts
and unsaved-change warnings must use in-app dialogs, not browser/Windows modals.
This supersedes the earlier exception for native navigation-loss warnings.

**Why:** The user repeated the instruction for every merchant page and supplied
the browser's “Leave site?” popup as an example to remove.

**How to apply:** Protect app links/forms with a shared in-app navigation guard.
Do not add blocking unload hooks. Custom dialogs cannot reliably protect closing
or refreshing a browser tab; preserve existing save/autosave behavior, explain
that limit and never silently save credentials or destructive configuration.

**Why:** The user explicitly requested this arrangement and rejected the native
close prompt. Separating classification controls from variant setup made the
available product types and required selections difficult to find.

**How to apply:** Preserve the same arrangement in Ann's embedded form and the
dashboard. Cancelling a discard or regeneration must retain the current form,
SKU identities, prices and entered stock.

Use dropdowns for listing status, vendor or maker, and country of origin.

**Why:** The user explicitly requested selection controls instead of disabled status or free-text vendor/country fields.

**How to apply:** Keep these controls consistent in Ann and the dashboard, and retain previously saved values rather than silently replacing them.

Reference loading and status rendering are not merchant edits.

**Why:** Treating every child-list mutation as an edit made freshly opened forms
appear dirty when asynchronous category, type and option choices finished
rendering.

**How to apply:** Track actual inputs and meaningful catalogue/media changes.
When replacing blocking browser confirmations with in-app dialogs, await the
decision before modifying variants and prevent overlapping generation.
