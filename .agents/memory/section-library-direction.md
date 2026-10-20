---
name: Shared section library direction
description: User's goal for consistent section names and cross-theme, cross-page reuse
---
The user wants named sections to be reusable across themes and pages, rather
than restricted by the theme or page they originated from. Section names and
categories should be agreed with the user.

**Why:** The user explicitly requested an inventory across all themes, followed
by finalising names and categories so any section can be used across pages.

**How to apply:** Treat current page-bound section availability as an existing
limitation, not the permanent product direction. Keep section identity and
library naming consistent across theme presentations.

The user approved phased implementation of the universal names/categories and
cross-theme browsing proposal. Header and footer remain store-wide elements;
transactional buying and checkout components are not ordinary content blocks.

**Why:** This separates content design freedom from the controls required for
correct storefront navigation and transactions.

**How to apply:** Preserve old saved identities when changing display names.
Browsing a section must not imply that it can already be inserted: insertion
still needs a supported data model, page context and edit permission.

The user specifically wants inserting and moving sections to feel "very smooth
drag and drop like butter", while retaining the compact ticket-style editor.

**Why:** The user made interaction quality an explicit condition of the next
phase, not just the availability of an Add button or reorder arrows.

**How to apply:** Preserve direct insertion points, clear drag feedback and
cancel/Undo behaviour. Treat mouse, touch and keyboard handling as part of the
same editing experience, without filling the workspace with extra toolbars.

Section layout changes must preserve the identities of saved text and media
fields, not just the section's visible name and position.

**Why:** The editor identifies editable leaves by their order within a section.
Replacing a section with a different theme's raw markup can silently attach a
saved heading, caption or image to a different field.

**How to apply:** Use presentation changes that keep editable DOM leaves in the
same order. A future structurally different renderer needs an explicit field
mapping or migration before it can replace an already edited section. Never
change the whole store theme as a side effect of choosing one section layout.
