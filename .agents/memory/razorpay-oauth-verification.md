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
