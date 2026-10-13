---
name: AI copy boundary
description: Keep provider output constraints aligned with server-owned Aura controls
---
Constrain AI section responses to copy fields derived from the section schema.
Keep server-side rejection of non-copy settings, HTML and unsupported facts.
Never fix repeated protected-setting failures by allowing AI to own visibility,
links, media references, entity references or commerce controls.

**Why:** A generic JSON output contract lets the model return controls that
the copy-only validator rejects. Merchant retries do not correct that
contract mismatch and can repeatedly incur generation costs.

**How to apply:** When adding section fields or changing providers, keep the
provider's structured output contract and the validator aligned. Defaults and
protected settings remain server-owned; factual verification is separate.
