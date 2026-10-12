---
name: Replit application preview boundary
description: Native Preview tab entry versus optional sample browser and live-data operations
---
The user wants the actual application to appear directly in Replit's native
Preview tab, like other web applications. A separate sample-screen browser is
not a substitute for that entry point.

**Why:** The user repeated the request after a sample browser was delivered and
showed the Preview tab's "Nothing to preview yet" screen.

**How to apply:** Preserve the existing Cloudflare application and expose it
through a registered web entry. Do not rebuild it as a second React frontend.
The sample browser may remain optional, but the default entry is the real site.

Preview registration alone does not authorise attaching the live database or
enabling real brand writes, publishing, orders or password changes.

**Why:** Fixing Preview visibility is distinct from choosing which database a
working local login and persistent changes should use.

**How to apply:** State database-backed limitations clearly. Treat authenticated
preview with persistent saves as separate environment work requiring an explicit
decision about database isolation. Keep fictional fixtures local-only.
