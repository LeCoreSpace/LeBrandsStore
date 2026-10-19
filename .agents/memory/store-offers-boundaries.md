---
name: Store offers boundaries
description: Initial offer scope, future bundle activation and historical calculation authority.
---

Offers and codes are a separate dashboard destination. The user authorised a
few initial offer types and asked for a schema that can accommodate future
offers and bundles, plus selective ticket styling across the dashboard.

**Why:** Product, collection and order promotions are not merely catalogue
records; the user wants a recognisable LeBrands dashboard, not a Shopify copy.

**How to apply:** Keep the first release's controls honest about supported
types. Versioned extensibility must not permit unfinished promotion types to
activate. Keep offer tickets expressive and ordinary tables/forms readable.

Discounts use published prices and collection membership; exact applied savings
and tax allocations are historical evidence, not recalculated from current
offers. A single best offer minimises payable total including delivery.

**Why:** Shipping thresholds can otherwise make an automatic discount increase
the final amount. Later offer edits must not rewrite invoices or margins.

**How to apply:** Exercise rounding, final delivery total, checkout retries and
usage caps together. Preserve invoice privileges and treat unverified guest
contact details as insufficient for reliable per-customer caps.

Do not grant configuration-table UPDATE privileges merely to obtain a
`SELECT ... FOR UPDATE` lock when the enclosing store lock already serialises
checkout and configuration changes.

**Why:** PostgreSQL requires UPDATE permission for row-locking SELECTs. A
read-only configuration privilege boundary should not be weakened just to
duplicate an existing serialisation lock.

**How to apply:** Keep the shared store lock as the documented transaction
boundary and verify the write paths under the actual restricted role.
