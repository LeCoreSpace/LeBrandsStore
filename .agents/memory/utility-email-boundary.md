---
name: Utility email design and notification choices
description: Shared merchant-aware email design, essential-message boundaries and private recipient preferences.
---

Use one recognisable LeBrands.Store email design for order confirmation and all
utility messages, while retaining the merchant's identity for customer orders.
Include a real email-preferences/unsubscribe link rather than an inert footer.

**Why:** The user requested a distinctive professional order summary and
confirmation email, with the same template used across every utility email.

**How to apply:** Keep HTML and plain text consistent. Preserve queued delivery
idempotency and never claim a payment, refund or successful email delivery
without evidence.

Optional shipping and delivery updates may be disabled for a recipient at one
store without affecting other stores. Essential confirmations, payment/refund
and account-security messages remain enabled, and the preferences page must
explain this distinction. Preferences are not marketing consent.

**Why:** An unsubscribe footer must produce a real effect without silently
disabling critical receipts or security messages.

**How to apply:** Link scanners must not unsubscribe on GET. Changes require
POST and a signed, purpose-specific capability that discloses no recipient or
order information. These narrow notification-choice capabilities do not expire;
they must never be repurposed for account or order access.
