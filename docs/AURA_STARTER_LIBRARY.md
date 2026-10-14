# Aura category starter pilot

## Manual migration and release

Do not create tables manually or run the earlier review draft SQL.

The new staged migration requires the existing `0010_store_pages.sql` and
`0012_aura_skeleton_sections.sql`. It does not require GSTIN, AI or email migrations.

```sh
pnpm run test:offline
node db/migrate.js --staged-starters
pnpm run deploy
```

Run the commands yourself after reviewing the migration. Development Preview is
connected to the live database; the implementation does not apply this migration
automatically. Do not use the generic migration command to apply this staged file.

## Included

- Product-only source taxonomy: 17 categories, 340 subcategories, original IDs,
  names and slugs. Service categories are excluded.
- Eight shared library/selection tables from the previous review draft, with
  ENABLED and FORCED RLS and read-only app privileges.
- A single versioned Fashion & Apparel / Mens Clothing pilot: 43 placements and
  20 exact shared image URLs. Other combinations have taxonomy entries but no pack.
- The pilot is marked library-published (available for selection), not store-live.
  Its assets remain illustrative; rights, upscaling and framing notes are retained
  in the delivered pack. This is not certification of merchant facts or reviews.
- Images are small, bundled, versioned Worker theme assets, not merchant uploads.
  This pilot introduces no new storage service or Cloudinary/R2 dependency.
- A scoped SECURITY DEFINER pin function checks the current tenant, existing
  session/role helper, selected category/subcategory and published pilot. App has
  EXECUTE only, not direct selection-table writes. `search_path=pg_catalog,public`.
- The existing field validator keeps all tenant media checks and adds only the
  twenty literal shared image URLs; arbitrary asset paths and foreign tenant media
  remain forbidden. Existing function ownership, security mode and ACL are retained.
- Every seeded page is checked against the installed database Aura validator;
  invalid seeds abort the migration.

## Merchant flow

1. Guided setup: select Fashion & Apparel, then Mens Clothing.
2. Open Theme and store editor. Uncustomised legacy pages show the prefilled
   starter proposal, not an automatically saved page.
3. On a customised page, Use Aura starter layout opens a confirmation and a
   replacement preview for that page only. Discard restores the previous draft.
4. Save starter draft explicitly to persist through the existing authenticated,
   version-checked page-save flow. Publication remains a separate action.
5. Newly added supported sections use the same prefilled text and media.

If there are no merchant products, the editor renders six clearly labelled sample
products, INR demo prices and three populated collections. These exist only in a
preview clone; they are never inserted into products or collections, submitted as
real product references, or used by live checkout. Real products always take
precedence. Reviews remain empty rather than fabricated.

## Compatibility

Before migration, categories/subcategories work from the immutable taxonomy and
the new Worker hides the category starter behind table/pack availability checks.
After migration, the old Worker still works: no existing store rows, pages,
products, setup data, publication snapshots or applied migration files are changed.

Previously saved short category values remain accepted. They are not rewritten.
Changing a parent category clears its selected subcategory in the wizard;
the server validates the effective saved pair too.

## Author-time regeneration

`scripts/build-aura-starter-library.py` builds immutable pilot data, assets and SQL
from the supplied exports and consolidated ZIP. Do not regenerate an already
applied SQL migration; add a new migration and pack version for future releases.
