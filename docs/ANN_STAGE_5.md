# Stage 5: Confirm and apply Ann to store drafts

No new database migration is required. Stage 3's Ann tables and the existing
catalogue, setup and versioned page APIs are reused. The server-owned
`settings.ann_application` marker contains the applied Ann revision, request
digest and catalogue bindings, not example prices, stock or personal data.
It cannot be supplied through the settings or Ann-answer patch contracts.

## Merchant flow

1. Save the plan and open Review.
2. Prepare draft changes. This reads the current catalogue and page revisions.
3. Choose editable page drafts to replace. Legal policy pages are excluded.
4. For each collection, create a new one or choose an existing collection.
5. For each idea, keep it as an idea, link an existing product, or explicitly
   create a product. New products require an entered INR price and a chosen
   current GST rate. Stock, HSN and an approved store-owned photo are optional
   here, but publishing still enforces the existing completeness checks.
6. Confirm catalogue additions and page-draft replacements, then apply.
7. Review the updated theme in the existing editor. Complete selling,
   business, policy, domain, payment and shipping setup through the existing
   setup flow. Publication remains a separate deliberate action.

There is no AI request or automatic import of demo product images, prices,
inventory, testimonials or policy approvals. Approved starter lifestyle
media may be used by the existing eligible starter theme, as before.

## Safety

- Owner/admin, verified account origin, store membership and RLS apply.
- All writes share one store-locked transaction. An invalid photo or failed
  page save rolls back catalogue creation, memberships, settings and pages.
- The exact saved Ann revision and a digest of current draft content are
  checked before changes. Concurrent edits produce 409, not an overwrite.
- Replaying an identical successful request returns the existing bindings.
  A different request against that already-applied revision is rejected.
- Existing product copy, price, stock and images are never rewritten.
  Existing collection copy, cover and members are preserved; confirmed
  members are appended. Removed ideas never delete catalogue records.
- The preparation response includes owned product IDs, titles, actual prices
  in paise and tracked stock (null means untracked) for verification.
- New Ann revisions default to previously linked records rather than
  creating duplicate products/collections. Applied previews use real records.
- Page changes use the normal version history and protected checkout schema.
  Store publications, policy bodies/reviews and wizard completion are not
  fabricated. Normal brand/product-change policy invalidation still applies.

## Local verification

The development-only Ann fixture now runs real foundational migrations and
compiled page, skeleton, starter-library and Ann migrations in PGlite.
The same handlers and catalogue/page repositories are used. It never connects
to the project's external database and is outside the production Worker graph.

## User-run deployment

    pnpm run test:offline && pnpm run deploy

Do not run a new migration for this stage. The agent does not migrate or deploy.
