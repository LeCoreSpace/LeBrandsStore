# Stage 4: Ann conversation and whole-store preview

The chooser now offers the working guided planning interface when migration
0016 is present. No additional database migration is required.
`ANN_BUILDER_ENABLED=false` can explicitly disable access; otherwise Ann is
available after its database readiness check. A missing migration leaves
Standard Builder usable and does not save an Ann preference.

## Included

- Conversation on the left and interactive Aura storefront on the right.
- Five existing styles, desktop/mobile previews and whole-store navigation.
- Category, subcategory, style, palette, font, collection and product-idea
  questions, with registered brand details prefilled without a write on load.
- Subcategory-specific attribute choices and their values.
- Brand story and optional-section selections without drag and drop.
- Instant preview changes before saving.
- Explicit saved progress, resume, back/change answers, revision conflicts,
  unsaved-change warnings and owner/admin-only saves.
- Review with links to existing setup and editor routes.

The preview uses an isolated illustrative shopping flow. Planned products and
collections exist in the preview clone, not the catalogue. Images and prices
are examples, not generated product photography or confirmed selling prices.
Existing products, page layouts, policy reviews and publication are untouched.

Selling, verified business details, policies, domains, payments and shipping
are not completed by a saved plan. The existing setup and publishing checks
remain authoritative. Stage 5 connects the confirmed plan to real catalogue
and selling configuration. No OpenAI request or image generation is used here.

## Isolated browser verification

The Node development adapter exposes `/__ann-builder-preview`, backed by a
separate in-memory PGlite database and the real Ann API handlers. Its
`?readonly=1` variant uses an editor membership. No real store credentials,
live queries or live writes are involved. This middleware is not imported by
the production Worker and is not available on the published website.

## User-run deployment

If 0016 is already applied, do not run another migration for this stage.

    pnpm run test:offline
    pnpm run deploy

No deployment or database migration is run by the agent.
