---
name: Ann translation coverage
description: Avoid partial localisation when adding prompts and system-generated replies.
---

Cover conditional prompt branches, status messages, headings and hints in all
five supported Ann languages. Mark authored status replies separately from
merchant-entered answers. Translate a GST status prefix without changing the
registered name, and localise country display names without changing country codes.

**Why:** New subscription and document-review prompts bypassed tests that only
recognised directly assigned static questions. The conversation also deliberately
excluded reply bubbles, leaving system-generated statuses in English.

**How to apply:** New onboarding copy needs cross-locale coverage, including
conditional branches and asynchronous redraws. Preserve reversible language
switching, unsent input, legal identity, catalogue values and preview content.
Do not solve missing translations by translating arbitrary merchant records.
