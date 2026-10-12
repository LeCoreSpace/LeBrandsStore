---
name: GSTIN transaction boundary
description: Published supplier selection and preservation of paid lookup evidence across failed invoice transactions.
---

Invoices and administrative approval review the published supplier, not later draft Settings edits.

**Why:** The user explicitly confirmed that Settings changes remain drafts until republishing. Approval must review the submitted store rather than a moving draft.

**How to apply:** Compare provider registration/address data with published GSTIN, legal/trade names and selected registered address; do not let draft changes silently change invoices.

Commit a paid GSTIN preflight separately before attempting an invoice mutation.

**Why:** A failed invoice transaction must not roll back its lookup quota reservation or an inactive/unverified result. Otherwise repeated failures can spend provider calls without retaining the evidence or limit.

**How to apply:** Recheck and record the provider result in its own tenant transaction, then start the financial write transaction. Never include the paid call in the transaction that may reject invoice issuance.
