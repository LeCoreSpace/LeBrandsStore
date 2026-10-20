---
name: Cloudflare binding-only updates
description: Preserve deployed code and resource bindings when changing production OAuth configuration.
---

For configuration-only releases, use individual Worker Secret updates instead
of republishing workspace source or relying on inherited bindings in the
settings PATCH API.

**Why:** Cloudflare's SDK listed inherited settings bindings, but the actual
settings endpoint rejected them with code 10057. Targeted Secret updates worked
while preserving deployed code-module hashes and every unrelated binding.

**How to apply:** Snapshot current code and unrelated bindings, update only the
approved names, then compare again. Secret updates create version metadata:
annotation changes are not evidence that runtime compatibility changed. Compare
runtime date, flags and usage model separately from version annotations.

Production Razorpay mode and callback intentionally use encrypted Secret
bindings alongside the client pair, even though those two values are not
sensitive.

**Why:** This allowed the user's approved configuration-only change without
uploading unreleased application code or replacing other Worker settings.

**How to apply:** Do not interpret an unreadable mode/callback Secret as missing,
or add same-named plain-text Wrangler variables without an explicit conversion.
Keep workspace Test values and Live-only secure handoff entries separate.
