---
name: Short financial document numbering
description: GST serial limits, prefix locking and new-document-only numbering.
---

Use a short uppercase alphanumeric merchant prefix, locked after any current
Indian-financial-year invoice or credit note issuance. Protect removal or
deletion of the prefix settings too. Never renumber historical documents.

**Why:** The user requires GST Rules 46/53's 16-character limit and a database
42501 lock, not merely a UI restriction.

**How to apply:** Financial numbering reads the published Settings prefix,
never an unpublished draft. Protect publication upserts and deletion as well
as draft edits: a prefix drafted before issuance must not bypass the FY lock
when republished. Unchanged-prefix republish must remain allowed. Every
prefix lock/context denial uses SQLSTATE 42501.
Missing or blank published prefixes must also fail clearly with 42501, never
silently regenerate a prefix during invoice or credit-note issuance.

Invoice and credit series are independent; reject overflow
instead of truncating or reusing serials. Four digits is minimum padding, not
an instruction to truncate a longer counter. Prefix editing and issuance must
serialize on the same settings row and published snapshot. Credits belong to their issuance FY, not
the historical invoice's FY; the original invoice remains unchanged.
