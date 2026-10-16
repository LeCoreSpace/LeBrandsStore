# Ann store-building flow

## Explore first

1. Open Ann. Sample products are the default on every visit, even if a saved
   design or an older browser preference exists. This also resets FunStyle's
   starting Ann view after deploying this change, without touching its data.
2. Choose a category and subcategory. Preview copy and available sample media
   follow the selection. Unsupported niches are labelled as placeholder imagery.
3. Compare eight styles on the same selected sample catalogue. Browse home,
   collection, product, cart, checkout, about and contact in desktop/mobile views.
4. Choose background, accent, button shape and lettering. Changes update the
   preview without publishing.
5. Optionally name collections and product ideas. These are planning notes,
   not sellable inventory. Both can be skipped while continuing with samples.
6. Add a store name, optional tagline and brand story.
7. Choose optional page sections, then review the plan. Choices remain inline
   under Ann's active question, with the message composer at the bottom.

## Save and personalise

- Planning progress and the actual saved design are distinct.
- Saving/reopening a design must not automatically select the real catalogue.
- Choosing "Your store" or "Edit my saved design" first asks for explicit
  confirmation to use existing catalogue names, images and prices in the preview.
  Declining keeps the samples. Preview consent is per visit, not a permanent
  change to catalogue records or a database migration.
- "Use this design" requires both draft-replacement acknowledgement and explicit
  agreement to use the merchant's own catalogue in the saved draft. Samples are
  never imported. It does not publish the store.
- Adopted designs support on-page copy/section-image editing, saving the draft,
  opening the theme editor and publication review.
- Product titles, descriptions, photos, prices and stock remain catalogue data;
  product editing uses the existing catalogue controls, not sample-page editing.
- Business/product setup and opening checks are initially collapsed in review.
  Merchants open one when ready. Real data writes keep their existing confirmations.
- Shipping/payment settings, policy review, GSTIN verification and platform
  approval keep their established separate checks. A finished chat does not
  bypass readiness or publish anything.

## FunStyle reset boundary

No catalogue deletion, design reset, database write or live publication change
is required. After deployment, reopening Ann starts with samples instead of
automatically restoring the old product photo. The saved design and real products
remain available behind the explicit product-source choice.

## Optional operational setup

Ann Review now contains three separate, collapsible launch steps. They are also
reachable through **Store connections** in Ann and dashboard settings.

1. **Where should customers find your store?** Keep the included subdomain or add
   a custom subdomain, receive CNAME/TXT instructions, check actual Cloudflare SSL
   and DNS state, then explicitly activate. A root/apex domain is not supported.
2. **How would you like to get paid?** Keep COD or verify a merchant-owned Razorpay
   account. Test/live mode is inferred from the key ID, not an editable label.
3. **How will you send your orders?** Keep manual fulfilment or verify a
   merchant-owned Shiprocket API user and pickup-location access.

These setup preferences save separately from the design and catalogue. Only the
owner can write connections. Credential inputs stay in memory, never in chat,
URLs or browser storage, and are encrypted in the database. Status responses
exclude all credentials and remote customer/order/address data. Revision guards
prevent stale tabs overwriting newer setup. Failed provider checks leave the
saved connection unchanged. Disconnect explicitly removes saved credentials.

### What is not activated by verification

This release is the connection/setup stage, not the payment/shipping execution
stage. Razorpay API authentication does **not** prove KYC, approved checkout
domains, a working webhook or a successful live payment. Shiprocket
authentication does **not** enable serviceability checks, shipment booking, AWB
assignment or tracking sync. The UI explicitly says that online checkout and
automatic shipping are not enabled, even after verification.

COD checkout and manual fulfilment remain the working launch path. They still
need their existing checkout settings, policies, catalogue, GSTIN and platform
approval. No optional connection is added to mandatory publication checks.
There is no domain purchase, Razorpay OAuth, Domain Connect or automatic billing.

See [launch setup operations](ann-launch-setup.md) for migration, configuration,
limitations and remaining activation work.
