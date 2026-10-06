---
name: Store setup delivery boundaries
description: Approved scope and deliberate differences from the broader product requirements.
---

For the initial store-setup phase, the user explicitly requires Worker multipart
uploads into Cloudflare R2, despite REQUIREMENTS.md describing signed upload URLs.
Only Aura and wizard steps 1–4 are in scope; Bazaar is a disabled Coming soon card.
Checkout/cart, integrations, AI helpers and email are out of scope.

**Why:** The user's phase-specific instructions override the broader MVP roadmap.
The full requirements are not permission to build every described capability.

**How to apply:** Keep later phases out of follow-up fixes unless requested.
No deployment or migration execution is authorized by implementation work.

Production deploys must use only the root `wrangler.jsonc`. The second Wrangler
config is for local preview only.

**Why:** The user explicitly requires one production configuration.

**How to apply:** Keep preview adapters out of production entrypoints and commands.
