# LeBrands.Store subscription commercial baseline

**Status: confirmed for implementation planning, following the owner's instruction
to proceed with Phase 1. The baseline is finalised with the open items below.
This is not authorisation to enable live offers, migrations, subscriptions or charges.**

This is the Phase 1 commercial baseline. The companion JSON records the same
planning values, but is documentation only and is not imported by the app.
“Implemented” below means code was found during a static audit, not that a
production journey or a merchant's external account has been verified.

## 1. Proposed launch market and tax presentation

| Market | Currency | Proposed commercial availability |
| --- | --- | --- |
| India, IN | INR | Initial subscription launch, after the later implementation and release checks |
| Other countries | Not configured | No paid checkout or automatic currency conversion. International publication/checkout readiness needs a separate country review. Existing supported draft/onboarding behaviour is not changed by this proposal. |

Use the brand's confirmed billing country, checked against its business evidence,
for paid eligibility. Ann's language, browser location, IP and account-country
suggestion are not tax evidence.

Recommend **tax-exclusive prices**, labelled “plus applicable taxes”, with the
full tax-inclusive total before payment authorisation. A qualified tax review must
confirm the platform issuer's legal details, service classification, registration,
rate, place-of-supply rules and any export treatment before charging.
No tax rate is approved or hardcoded by this proposal.

The Free plan needs neither a payment mandate nor a provider transaction.

## 2. Proposed India price and allowance matrix

Prices match the existing proposed public prices. The following values form the
implementation-planning baseline, not existing billing enforcement, a live offer
or capacity guarantees. Capacity verification remains required before selling them.

| Commercial item | Free | Launch | Grow | Scale | Flagship |
| --- | --- | --- | --- | --- | --- |
| Monthly base price, before tax | INR 0 | INR 1,499 | INR 3,499 | INR 7,999 | From INR 19,999, quotation only |
| Annual base price, paid upfront | Not applicable | INR 14,990 | INR 34,990 | INR 79,990 | Quotation |
| Published products | 100 | 500 | 2,500 | 10,000 | Contract |
| Published SKUs, store-wide | 1,000 | 5,000 | 25,000 | 100,000 | Contract |
| Additional staff seats, excluding owner | 0 | 2 | 5 | 15 | Contract |
| Monthly order soft band | None during Free live period | 300 | 1,500 | 7,500 | Contract |
| Public media allowance | 512 MiB | 5 GiB | 20 GiB | 100 GiB | Contract |
| Included store address | Yes | Yes | Yes | Yes | Yes |
| Custom-domain entitlement | No | Yes, subject to platform readiness | Same | Same | Contract |
| Platform sales commission | 0% | 0% | 0% | 0% | 0% |

- Annual Launch/Grow/Scale costs ten monthly base payments, billed as one annual
  upfront payment. Do not show an effective monthly figure as the actual debit.
- Staff seats include accepted non-owner members plus unexpired pending invitations,
  deduplicated by identity/email. The owner is separate.
- One active subscription applies to one store. Owning another store does not
  automatically share the first store's allowance or subscription.
- Each sellable variant counts once. A product without variants counts as one SKU.
  Do not also count the parent, or duplicate a SKU because it appears in collections.
  Published out-of-stock SKUs count; drafts, archived SKUs and samples do not.
- Every plan retains the maximum of three variant-option types and 200 variants
  per product, subject to the remaining store-wide allowance. Descriptors do not
  create SKUs.
- Order bands produce an upgrade recommendation after two consecutive months
  above the band. They never block checkout or create an automatic overage charge.
- Media accounting counts unique tenant-owned persistent originals and derivatives,
  not repeated references. Shared demo assets and private compliance documents are
  excluded. Capacity and quota enforcement must be verified before selling these limits.
- No automatic extra-store, extra-seat, storage or order-overage charges.
  Add-ons and founding-member discounts remain unavailable until separately approved.

### Core feature entitlements

The owner requires the following capabilities to appear as explicit plan features,
not merely as audit notes. Planning baseline: include the shared store features in
Free, Launch, Grow, Scale and Flagship, subject to duration and allowances.
LeBrands.Space placement is a paid-plan feature only; Free has no placement.
Implementation readiness remains separate from feature inclusion.

| Plan feature | Free | Launch | Grow | Scale | Flagship |
| --- | --- | --- | --- | --- | --- |
| LeBrands.Space placement | Not included | Starter placement | Premium placement | Freedom placement | Freedom plus contracted extras |
| Ann and theme editor, including five Ann conversation languages | Included | Included | Included | Included | Included |
| Fully branded, customisable checkout | Included | Included | Included | Included | Included |
| Per-page SEO titles and descriptions | Included | Included | Included | Included | Included |
| Transactional order emails | Included | Included | Included | Included | Included |
| Brand's own payment-partner integration | Included | Included | Included | Included | Included |
| Delivery-partner integration | Included | Included | Included | Included | Included |
| Native conversion-section library | Included | Included | Included | Included | Included |
| Data export | Included | Included | Included | Included | Included |

“Included” records the intended entitlement, not proof that every part is live:

- **LeBrands.Space placement:** Free includes no placement or linked paid package.
  Preserve the paid Starter/Premium/Freedom mapping. Confirm the paid fulfilment/
  provisioning process before making activation promises. Store and Space
  entitlements move together.
- **Branded checkout:** the feature includes the brand's identity and supported
  design/content controls. Complete the customisation acceptance checks before
  presenting the full claim as available. Server-owned payment/security fields
  remain protected; this does not promise arbitrary checkout scripts.
- **SEO per page:** provide title and description controls for eligible public
  pages, not just one store-wide title or product SEO. Retain noindex/privacy
  protection on checkout, cart, account and private order pages.
- **Transactional emails:** order confirmations and supported payment, shipping,
  cancellation and refund/credit-note notifications, with correct brand identity.
  Verify templates and event delivery; marketing campaigns are a different feature.
- **Partner integration:** connect the brand's own payment account and a supported
  delivery partner. Provider approval, configuration, serviceability and partner
  charges still apply. This does not include unlimited simultaneous partners.
- **Conversion sections:** announcement/offer areas, hero, featured products and
  collections, product galleries/details, trust content, review/testimonial layouts,
  FAQ, size guide, specifications, care/how-to-use, delivery information,
  related products/collections, lookbook, founder/craft/press content, collection
  discovery tools and cart/checkout sections. Include the registered native section
  library in plan entitlements. Review layouts are not verified-purchase review
  collection; showcase bundles/upsells are not live commercial engines.
- **Data export:** include customer, order and product CSV exports and available
  media references. A downloadable media-file archive remains a separate
  implementation gap, not a claimed existing ZIP export.

The companion JSON explicitly maps store features to every plan, excludes Space
placement from Free, and records implementation readiness separately.
Add further sellable entitlements
when their implementation is complete; do not use future proposals as current
paid benefits.

## 3. Free plan and Ann modal

1. Confirm the store name, then open the plan-selection modal inside Ann.
2. Require explicit **Activate Free plan** consent. Save the policy version and
   activation event; do not silently enrol a brand.
3. Paid-plan interest may be saved, but it neither activates that plan nor permits
   charging before business approval.
4. Closing the modal leaves the plan step incomplete and provides a reopen action.
   Do not enable later design operations through a direct URL or API bypass.
5. Free activation allows the existing business-verification and building flow.
   Indian GST requirements and private-document controls remain independent.
6. The 30-day live period starts atomically on the first successful publication.
   It does not start on registration, activation, document upload or failed publish.
7. The period is 30 consecutive days, not 30 accumulated days of traffic.
   Unpublishing, renaming, changing language, cancelling or republishing does not reset it.
8. At expiry, pause new order-taking unless a paid plan is verified. Preserve the
   design, media, product URLs and access to existing orders and fulfilment.
9. Display remaining time and send reminders seven, three and one days before
   expiry, plus an expiry notification, once notification delivery is implemented.
10. For unpublished Free drafts, propose an inactivity notice at 60 days and an
    inactive state at 90 days. The owner may explicitly resume without resetting a
    consumed live period. No automatic deletion is authorised.

Free is store-scoped and available once in a store's history. Additional anti-abuse
rules across different stores/accounts require separate approval, not invented quotas.

## 4. AI, communications and partner costs

- Preserve the existing AI policy: one completed full build per store, failed
  generations do not consume it, no upgrade-driven reset, bounded approval-stage
  image regeneration, and existing global spending controls. No “unlimited AI”.
- Do not promise new AI generation capacity merely because a plan is paid.
- Transactional order emails are distinct from bulk marketing credits.
- No included paid SMS, WhatsApp campaign or calling credits are proposed.
- Merchant gateway, shipping, advertising and external messaging-provider fees
  remain payable separately. A 0% platform commission does not waive these fees.
- Domain registration/renewal is separate from permission to connect a custom domain.

## 5. Advertised feature audit

Status meanings:

- **Implemented:** a corresponding application path was located; production
  configuration and end-to-end behaviour still require release verification.
- **Conditional:** implementation depends on external accounts/platform readiness.
- **Partial:** some UI, stored content or a subset exists; do not sell the complete claim.
- **Planned/unverified:** no complete routed capability was located in this audit.
- **Operational:** requires a real service-delivery commitment, not a software flag.
- **Billing work required:** underlying capability exists or is proposed, but plan
  enforcement is not implemented.

| Advertised feature | Audit status and recommended commercial treatment |
| --- | --- |
| Product/variant/staff/order limits | Billing work required. Existing catalogue/staff/order paths do not establish subscription quotas. |
| 0% platform sales commission | Commercial policy; external provider fees are separate. |
| LeBrands.Space Starter/Premium/Freedom inclusion and brand listing | Planned/unverified cross-product provisioning. Do not promise automatic activation until integration or an explicit manual fulfilment process is approved. Store and Space changes must remain coordinated. |
| Top 300 blog, Instagram and newsletter promotion | Operational. Contracted/manual fulfilment only; no guaranteed automatic exposure. |
| Ann and theme editor | Implemented, with existing business-access controls. |
| Ann's five conversation languages | Implemented language support for English, Hindi, Tamil, Marathi and Telugu. This is not automatic storefront translation. |
| Version history and restoring previous designs | Full customer-facing history/restore entitlement not established by draft/publication storage alone; planned/unverified. |
| Logo, favicon and branded pages | Implemented branding paths. |
| Fully customisable checkout | Partial. Branded checkout exists; do not promise unrestricted checkout structure or custom checkout code. |
| Custom domain and SSL | Conditional on merchant setup, external validation and Cloudflare SaaS readiness. A code path is not proof production routing is configured. |
| Media library | Implemented. Per-plan storage enforcement is billing work. |
| SEO titles, descriptions, slugs, sitemap/product metadata | Implemented paths; no ranking guarantee. |
| Custom sections/design services | Operational, scoped quotation; not an unlimited self-service promise. |
| Size guide, trust content, FAQ and How it works | Content/rendering components exist. Brand must supply truthful information. |
| Real customer reviews | Partial. Review layouts/content are not verified purchase collection, moderation or authenticity verification. |
| Delivery estimate and COD eligibility by pincode | Conditional/partial. Partner serviceability checks exist; exact customer-facing delivery promises require verification. |
| Sticky add-to-cart and free-shipping progress | UI/showcase elements are not independently sufficient to guarantee all production themes; verify before including as available. |
| Pincode autofill | Full live lookup flow not established; planned/unverified. |
| Prepaid discount at checkout | Showcase/copy does not establish server-authoritative discount calculation; planned/unverified. |
| Basic/advanced discount codes | Full live discount engine not located in checkout calculation; planned/unverified. |
| Frequently bought together bundles | Showcase UI is not a server-priced discount/bundle engine; partial. |
| Cart and post-purchase upsells | Planned/unverified as live commercial flows. |
| Back-in-stock alerts, gift wrap and referrals | Planned/unverified as complete flows. |
| Loyalty points and upsell A/B testing | Planned; not a paid-launch entitlement. |
| Merchant's own payment gateway | Conditional implementation exists for merchant checkout. This is not the platform subscription integration. |
| COD bot check, amount and per-phone controls | Implemented checkout checks. Do not describe these as a fraud guarantee. |
| Payment links, partial COD and COD fees | Provider-dependent; not verified as native LeBrands features. |
| Manual tracking and branded order tracking | Implemented order/shipment tracking paths. |
| One logistics partner API, shipments/labels/AWB/sync | Conditional integration paths exist; require connected merchant account and runtime verification. |
| Multiple logistics partners simultaneously | Planned/unverified; quotation must not imply this is already available. |
| COD/Returns centre with risk flags and remittance | Partial. Order/COD/returned/RTO states do not establish a complete dedicated remittance and risk centre. |
| Reason for every return/RTO and multidimensional RTO analysis | Complete enforced reasons/analysis workflow not established; planned/unverified. |
| Automatic RTO rules and risk-based COD | Existing baseline COD limits are not a risk-rule engine; planned. |
| Transactional order emails | Implemented email-job paths, conditional on delivery configuration. |
| WhatsApp order updates/COD confirmation | Planned/unverified as merchant communication integration. |
| Email marketing, WhatsApp campaigns and automation | Planned/unverified; no included provider credits. |
| Click-to-call and call logs | Planned/unverified. |
| Multichannel abandoned-cart recovery and segmentation | Planned/unverified. |
| Sales/order reports | Basic dashboard summaries are implemented; advanced report-builder capabilities are not implied. |
| GSTIN verification, GST invoices and credit notes | Implemented merchant tax/financial paths. Platform subscription invoicing still needs separate implementation. |
| GSTR-1-style reports and HSN summary | Dedicated reports not located; planned/unverified. |
| Funnel, cohort and advanced product analytics | Planned/unverified. |
| CSV and media export | Customer/order/product CSV exports exist, including media references. A downloadable media-file archive is not established. |
| Email/WhatsApp support, account manager, dedicated team | Operational; confirm staffing and fulfilment before offering. No response-time SLA is approved. |

**Paid-launch condition:** do not charge for a package that presents planned features
as available. Before launching, either deliver the advertised entitlement or obtain
approval to clearly mark it as unavailable and revise the public package. Cross-product
benefits and operational promises require fulfilment confirmation too.

Audit anchors: `src/ui/pricing.js`, `src/public/pricing-plans.js`,
`src/public/ann-language.js`, `src/store/routes.js`, `src/store/ann-routes.js`,
`src/dashboard/routes.js`, `src/dashboard/repository.js`, `src/email/staff.js`,
`src/checkout/repository.js`, `src/checkout/routes.js`, `src/connections/payments.js`,
`src/connections/shipping.js`, `src/connections/domain-platform.js`,
`src/public/aura-showcase-sections.js`. Negative findings are scoped to this static audit.

## 6. Proposed upgrades, cancellation and refunds

| Action | Proposed rule |
| --- | --- |
| Free to paid | Full chosen period starts at verified successful payment, even if the store has not published. Disclose this before paying. Do not restart or bank Free days. |
| Same-interval upgrade | Immediate after verified payment/authorisation of the positive prorated base-price difference. Preserve the current period end. Compute remaining time in UTC seconds; round once to the currency's minor unit, half up; calculate applicable tax on the resulting line. Never double-charge through both provider and local proration. |
| Proration support | Verify the selected provider and mandate type supports this operation. If it does not, require an explicitly authorised replacement mandate or schedule the change for renewal. Never silently debit an unsupported mandate. |
| Monthly/annual switch or currency change | Schedule for current paid-period end with an explicit new quote/authorisation. No mid-cycle cross-currency balance conversion. |
| Downgrade | Schedule for period end. If usage exceeds the new limits, show a remediation path before confirming the change. Preserve existing data; do not delete products or stop checkout because an order band was exceeded. |
| Cancellation | Stop future renewal; retain the already-paid service through period end. No surprise immediate suspension or new charge. |
| Refunds | No routine prorated refund merely for cancelling after a period starts. Verify duplicate/erroneous charges for correction; review service-failure requests manually. Applicable mandatory legal rights prevail; legal review required before publishing this policy. |
| Renewal | Collect only through a valid authorised mandate and approved price. Disclose renewal amount and notice requirements; price changes do not rewrite existing invoices. |
| Founding discounts/add-ons | Disabled until an explicit offer, eligibility, duration and renewal price are approved. |

Flagship is quotation-only: verify requirements and feature availability, issue an
expiring written quote with fixed currency, scope, limits, tax and billing schedule,
obtain acceptance, then create the exact authorised payment. The public “from”
amount is not itself an approved checkout amount.

## 7. Proposed expiry, non-payment and retention

- Free expiry: pause new order-taking at the end of its 30-day live window.
  No automatic charge or conversion.
- Paid renewal failure: seven full days of grace from the original due date.
  Proposed day 8: design/catalogue become read-only. Proposed day 15: pause new
  order-taking. These exact staging dates need approval; they refine the earlier
  “grace, read-only, pause” sequence.
- Billing repair, security, required documents, existing-order fulfilment and
  access to financial records remain available despite design restrictions.
- Restore eligible service after verified payment, without resetting historic
  invoice periods or business-verification restrictions.
- Preserve ordinary store data for at least 90 days after the relevant pause;
  deletion after that is not authorised in this phase.
- Retention of business evidence, invoices, credit notes, payment records and
  legal holds is separate. No automatic deletion or claim that 90 days is a
  statutory financial-record retention period.

## 8. Proposed existing-store transition

Give existing owners 14 days' notice before new billing gates are enforced,
without silently accepting terms or creating payment mandates.

| Existing store | Proposed transition |
| --- | --- |
| Unpublished draft | Explicit Free activation in Ann, preserving all saved work. Its live timer starts on its first successful publication. |
| Already live | One explicitly accepted legacy Free window of 30 days from activation. This is a migration exception, not a rewrite of historical publication dates. |
| Above proposed Free limits | Preserve data and existing operation during the transition notice; require a reviewed allowance/plan decision, not automatic archiving or deletion. |
| Business-restricted/suspended | Subscription enrolment never removes that independent restriction or grants approval. |
| No action after notice | Require plan selection for further Ann/design work. Do not retroactively charge. Any storefront restriction needs the disclosed transition policy and an advance notice. |

The legacy concession is store-scoped, logged once and cannot be reissued by
renaming, cancelling, changing owners or republishing.

## 9. Provider decision and release blockers

The user requested Razorpay and stated that test credentials already exist.
Existing code uses Razorpay for shoppers paying merchants; that does not establish
platform recurring-billing readiness, mandates or international subscription support.
No credential values were read and no provider transactions were created in this phase.

The supported new billing-connection flow available for this work offers Stripe
or Whop rather than a new Razorpay subscription connection. Do not silently switch
the user's provider or reuse merchant integrations for platform billing.

The provider choice remains **pending**. Stripe requires confirmation that the
platform's business can activate the required account and billing functions.
Whop requires review of merchant-of-record, invoice issuer and tax responsibility
against the agreed platform invoicing requirements. A provider selection is not
proof of live account eligibility.

Before paid billing can launch, approve the provider, verify the platform's actual
account capabilities and mandate/currency support, complete tax/legal review,
confirm operational benefits, implement billing and quotas, and pass test-mode
and controlled release verification. Test keys alone cannot approve live launch.

Public reference checked for scope, not account eligibility:
https://razorpay.com/docs/payments/subscriptions/faqs/

## 10. Approval record

- Required store features and paid-only Space placement: **confirmed for implementation planning**.
- Commercial matrix: **confirmed as the Phase 1 planning baseline**.
- India-only launch and tax-exclusive display: **planning baseline; live offer not authorised**.
- Paid SKU/product/staff/media limits: **planning baseline; capacity and enforcement not verified**.
- Upgrade/refund/non-payment and legacy-transition rules: **planning baseline; legal and release review required before activation**.
- Free LeBrands.Space placement: **not included, explicitly confirmed by owner**.
- Provider: **Razorpay remains the user's requested provider; new platform-subscription setup is unresolved**.
- Tax/legal and operational fulfilment checks: **required before live charges**.
- Billing enabled: **no**.

Approval of commercial terms does not approve publication, a database migration,
provider connection, live payment or automatic acceptance on behalf of brands.

### Open decisions and handoff

1. Resolve the new platform subscription-provider setup. Do not change the requested
   provider to Stripe/Whop without approval, and do not treat merchant checkout as
   a working platform recurring-billing connection.
2. Complete tax/legal, operational-benefit and capacity checks before activating
   any live offer. Planning confirmation is not a substitute for these checks.

These unresolved items do not require changing the provider-neutral table design,
but full Phase 1 decision closure and paid activation must not be reported as
complete while they remain open. No Phase 2 migration is part of this deliverable.
