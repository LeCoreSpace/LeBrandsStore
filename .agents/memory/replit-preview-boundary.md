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

The user has now explicitly authorised connecting Replit Preview to the live
Supabase database, using the existing secrets, so they can create and test stores.

**Why:** The user wants persistent application testing here, not just fictional
screens. Their authorisation is for the connection and their own testing, not
automatic migrations or agent-created live records.

**How to apply:** Use only the restricted application connection in the preview
Worker. Keep administrator credentials out of its bindings, retain tenant and
session checks, and clearly identify that user-initiated saves affect live data.

A successful native Node database probe does not prove the connection works
inside the local Worker runtime.

**Why:** Direct Supabase TCP/TLS returned `Network connection lost` in local
Workerd while the same restricted connection succeeded in Node. This is a
runtime connection limitation, not evidence that the credentials are wrong.

**How to apply:** Confirm connectivity through the actual browser-facing
preview route. Keep the production Hyperdrive path intact; do not weaken the
database role checks or expose administrative credentials as a workaround.

**How to apply:** State database-backed limitations clearly. Treat authenticated
preview with persistent saves as separate environment work requiring an explicit
decision about database isolation. Keep fictional fixtures local-only.

Workflow restarts do not clear capture-browser caches or replace an existing
tester's browser context.

**Why:** The capture browser reused old marketing HTML after the Worker was
restarted, while a direct request already returned the corrected page. A tester
also retained old fixture state after a restart; a fresh browser context on the
explicit current development host matched the reset fixture and passed.

**How to apply:** Local HTML should override production cache lifetimes. If a
capture or tester contradicts current responses, compare its actual host and
read-only fixture API state with a fresh workspace request before changing code
or resetting data. Use a fresh browser context and query URL on the current
development host to verify the current revision.

Persistent browser-flow checks should use development-only isolated fixtures
backed by the real handlers and local PostgreSQL, not a newly created live
merchant account.

**Why:** The normal native preview connects to live Supabase. Testing saved
plans must not create or alter real merchant data just to verify the interface.

**How to apply:** Keep fixture imports outside the production Worker graph.
When exercising account-origin-only handlers, translate only a verified
same-origin development request; leave foreign origins rejected.

Wrangler binding logs alone do not establish that provider settings reached
the native account preview.

**Why:** OAuth settings were present in Wrangler while the separate native
account adapter omitted them, leaving Connect disabled. Checking only the
callback's fallback route also missed the separate session/database path.

**How to apply:** Verify capabilities through the actual native account runtime,
not only a direct Worker or shell configuration check. Keep login, provider
start and callback on the same native path. Refresh the web workflow when its
captured environment changes; refreshing only Wrangler is insufficient.

Keep production host-specific asset restrictions intact when building
development-only visual fixtures.

**Why:** A file existing in the asset bundle does not mean the account-facing
runtime serves its public-platform path. Loosening the host gate to repair a
fixture would change production exposure unnecessarily.

**How to apply:** Use the existing development fixture asset adapter and check
the exact image URL with an HTTP request before spending another browser capture
on missing thumbnails. Verify the runtime actually loaded changed fixture code.
