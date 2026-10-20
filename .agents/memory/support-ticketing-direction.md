---
name: Support ticketing direction
description: User-requested support coverage, statuses, admin visibility and email notifications.
---

Brands should be able to raise support tickets during store creation and for
themes, sections, Meta, domains, delivery integrations, subscriptions and all
other platform features. The platform admin dashboard must show tickets.
Ticket statuses must be Created, Pending and Closed. Both admin and brand
must receive emails when a ticket is created and closed.

**Why:** The user requested these capabilities and exact statuses.

**How to apply:** Support cannot depend on a store already existing. Preserve
these requirements when designing the schema and implementing brand/admin
workflows; a design request is not approval to migrate or publish.

For brands with a store, Help & support belongs inside the existing brand
dashboard, retaining its sidebar and header across ticket lists, creation and
conversations. It must not become a separate account-style page.

**Why:** The user explicitly corrected the initial standalone placement.

**How to apply:** Use dashboard-context support routes and preserve old
ticket/email links through authorized redirects. Keep account-level support
available before the brand has its first store; the admin inbox stays in the
admin dashboard.

Help & support must also use the shared flat ticket visual style across the
list, new-ticket form and conversation, not merely sit inside the dashboard.

**Why:** The user explicitly reported that support was missing the ticket style
after its dashboard integration.

**How to apply:** Match the plum rail, tinted headers and dashed separators.
Use one surface per section; do not frame filters, tables or replies in nested
cards.

Creation and closure notices are essential support-service messages, not
optional marketing updates. Keep private note content and sensitive context out
of email; direct recipients to the authenticated ticket.

**Why:** Brands need confirmation and resolution of a request independently of
optional campaign preferences, without copying private conversations into email.

**How to apply:** Reuse durable transactional delivery, recheck recipient access
at delivery, and preserve the creation/closure event distinction after reopening.
