---
name: Store setup delivery boundaries
description: Approved scope and deliberate differences from the broader product requirements.
---

For the initial store-setup phase, the user explicitly requires Worker multipart
uploads into Cloudflare R2, despite REQUIREMENTS.md describing signed upload URLs.
Only Aura and wizard steps 1–4 are in scope; Bazaar is a disabled Coming soon card.
Checkout/cart, integrations, AI helpers and email are out of scope.
This was the initial setup phase only. The user later explicitly authorized
cart, guest COD checkout, customer records and orders as a separate phase.
Razorpay, Shiprocket, email/SMS and invoice PDFs were still excluded.
The user then authorized the brand dashboard, manual fulfilment, CSV exports,
and printable HTML invoices with browser print/save-as-PDF. A separate PDF
generation service is not authorized. Razorpay, Shiprocket, email/SMS, custom
domains and the drag-and-drop editor remain excluded from this phase. Add new
migrations only; do not execute migrations or deploy.

The user runs database migrations personally. Whenever a migration is needed,
provide the exact Shell command rather than executing it.

**Why:** The user explicitly requested this migration handoff.

**How to apply:** Prepare and verify staged migrations in isolation, then give
the command with its prerequisites and scope. Do not combine deferred migrations
into an all-pending command when the release is intentionally staged.

**Why:** The user's phase-specific instructions override the broader MVP roadmap.
The full requirements are not permission to build every described capability.

**How to apply:** Keep later phases out of follow-up fixes unless requested.
No deployment or migration execution is authorized by implementation work.

Ann's end-to-end merchant flow must include domain connectivity, online payments
and delivery/logistics connections as operational stages, not end at visual
design and publication.

**Why:** The user reminded us these were already agreed in earlier product
phases when they were omitted from the Ann flow summary.

**How to apply:** Carry those stages forward in flow explanations and subsequent
implementation. Distinguish the agreed roadmap from working integrations;
do not describe COD, manual shipping or an assigned subdomain as a connected
payment gateway, logistics partner or custom domain.

Keep those provider connections optional: merchants may launch with the included
subdomain, COD and manual fulfilment, then connect providers later.

**Why:** The user approved that Ann launch path rather than requiring every
external account to be ready before the merchant can open.

**How to apply:** Preserve the existing mandatory business, catalogue, policy,
GST and platform checks. Do not turn optional connection choices into mandatory
publication blockers or treat credential verification as payment/shipping activation.

Production deploys must use only the root `wrangler.jsonc`. The second Wrangler
config is for local preview only.

**Why:** The user explicitly requires one production configuration.

**How to apply:** Keep preview adapters out of production entrypoints and commands.

The user explicitly expanded the connection stage to working Razorpay checkout,
automatic Shiprocket shipping and Cloudflare custom-domain activation. OAuth is
to follow only once the provider/partner integration is in place.

**Why:** The user requested operational integrations rather than stopping at
credential verification, while explicitly deferring OAuth.

**How to apply:** Do not reinstate older phase exclusions for these three
integrations. Distinguish implemented runtimes from account approval, merchant
activation, live credentials, DNS propagation and a real-money production test.
Continue handing migrations and infrastructure changes to the user explicitly.
