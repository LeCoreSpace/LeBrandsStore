---
name: Replit application preview boundary
description: Safe application-wide browsing in Replit without live-data operations
---
The Replit application preview is a labelled, read-only demonstration using
fictional data, not a signed-in session for a real brand.

**Why:** Application-wide browsing should not implicitly connect preview pages
to the live Supabase database or authorise store writes, publishing, orders or
password changes. The user requested preview access, not a live-data environment.

**How to apply:** Keep preview navigation and fixtures local-only and excluded
from the production dependency graph. State the read-only limitation clearly.
Treat authenticated preview with persistent saves as separate environment work,
requiring an explicit decision about database isolation.
