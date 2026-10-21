---
name: Brand-provided marketing integrations
description: Requested Meta and Google setup and commerce-event boundaries from the user's marketing brief.
---

The user requested a real Settings → Marketing integrations page with one
Meta Pixel ID and one GA4 Measurement ID as the minimum brand-provided inputs.
Optional configuration belongs under collapsed Advanced controls; preserve
the professional ticket-style dashboard without nested cards.

**Why:** Their supplied marketing brief explicitly prioritises minimal setup
for each brand, with optional Meta CAPI, verification codes, Google Ads labels
and enhanced conversions rather than mandatory complex onboarding.

**How to apply:** Keep configuration store-isolated and enable/disable each
provider independently. Meta tokens must be encrypted, server-only, masked
after saving and never copied into public storefront configuration. Do not
reuse LeBrands.Store's own platform marketing tag for merchant storefronts.

The requested purchase boundary is a verified Razorpay payment or successful
COD order creation, not a Place order click. Browser and Meta server events
must share an immutable event ID, and cart events follow successful cart API
responses. Refreshing confirmation must not create another purchase.

**Why:** The brief explicitly excludes failed/cancelled payments and raw cart
clicks and requires purchase deduplication.

**How to apply:** Treat COD purchase events as orders placed, not proof that
cash was collected. Use authoritative saved order totals and stable catalogue
identities. Preserve verified-shopper-email and financial-write boundaries.
Shopper email verification is not optional marketing/tracking consent.

Never expose private order-confirmation URLs to advertising or analytics SDKs.
Use clean browser URLs and keep receipt access proof in essential HttpOnly
cookies, separately for different orders.

**Why:** A receipt URL is a bearer credential. Overriding an event's page URL
alone is insufficient because vendor SDKs can read the actual URL and referrer.

**How to apply:** Clean the browser URL before starting a vendor SDK. Do not
break receipt access when tracking is disabled or confuse orders in separate tabs.

Funnel events must describe the actual page/action, not just a populated cart.

**Why:** Accepting consent can initialise tracking again while a shopper is
still viewing a product; that is not entering checkout.

**How to apply:** Enforce page eligibility centrally and guard concurrent event
initialisation. Re-consent must not manufacture a new funnel step.

Social media Ad Integration is included in every plan, including Free.

**Why:** The user explicitly requested this as a feature in all plans while
asking for actual usage and integration status on the billing dashboard.

**How to apply:** Keep plan feature lists consistent with the existing
store-level Meta/Google settings. Do not interpret this as ad-account OAuth,
campaign management, included ad spend or permission to change historical
subscription snapshots.
