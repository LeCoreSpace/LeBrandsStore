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
draft text and reviewed state. Do not remove the browser's genuine navigation-loss
warning merely to replace an ordinary application confirmation.

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
