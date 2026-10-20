---
name: Razorpay OAuth verification limits
description: Distinguish negative-code probes, synthetic webhook checks and actual owner consent.
---

Do not conclude that an OAuth client pair is wrong solely because a deliberately
invalid authorisation-code probe returns HTTP 401.

**Why:** That probe cannot conclusively separate client/application/redirect
configuration from invalid-code handling. Treating it as definitive caused
unnecessary repeated credential requests before real consent was attempted.

**How to apply:** Check copy-format booleans and the documented request shape
without exposing values, then complete owner consent with the exact registered
callback. Label invalid-code results inconclusive. Likewise, a signed unknown-
account webhook probe proves endpoint/signature/resolver connectivity, not
Razorpay-sent delivery, matched-account processing or financial idempotency.

The owner explicitly chose the same webhook signing value for Test and Live.
Keep their separate client pairs and webhook endpoints; do not repeatedly
request a different signing value as though Razorpay required it.

**Why:** The user confirmed that sharing the value is intentional after the
separation recommendation. Secret values themselves must never be recorded.

**How to apply:** A valid HMAC under a shared value does not prove the originating
environment. Verify cross-mode/account/application handling before activation,
especially revocation, and never replay a real Test merchant event into Live
as a harmless probe. Use synthetic unknown-account checks for non-mutating
connectivity verification and label their limits explicitly.

## Partner webhook delivery diagnostics

Do not direct owners to the ordinary merchant Developers > Webhooks list as
though it contains partner-application webhook history.

**Why:** The owner checked that page and confirmed the partner webhook is absent.
The Partner application's Manage Webhook popup edits configuration; the reviewed
partner documentation did not establish a separate delivery-history viewer.

**How to apply:** Leave unrelated merchant webhooks untouched. Use receiver-side
diagnostics instead of inventing a provider menu or creating a duplicate hook.
Check whether historical collection was enabled before promising past logs.
Transient Worker tailing can still work when persistent Observability is off.
Keep output to time, method, response status and outcome for the partner path;
never print headers, signatures or customer payloads.

Wrangler JSON tail output may omit the normal Connected banner. Verify capture
using an observed, explicitly labelled unsigned probe rather than relying on
that banner. A rejected agent probe proves live-capture connectivity, not
Razorpay delivery or merchant verification.
