---
name: Short financial document numbering
description: GST serial limits, prefix locking and new-document-only numbering.
---

Use a short uppercase alphanumeric merchant prefix, locked after any current
Indian-financial-year invoice or credit note issuance. Protect removal or
deletion of the prefix settings too. Never renumber historical documents.

**Why:** The user requires GST Rules 46/53's 16-character limit and a database
42501 lock, not merely a UI restriction.

**How to apply:** Invoice and credit series are independent; reject overflow
instead of truncating or reusing serials. Four digits is minimum padding, not
an instruction to truncate a longer counter. Prefix editing and issuance must
serialize on the same settings row. Credits belong to their issuance FY, not
the historical invoice's FY; the original invoice remains unchanged.
