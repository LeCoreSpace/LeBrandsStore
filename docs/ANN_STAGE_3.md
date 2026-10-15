# Stage 3: Ann reference data and private progress

Ann remains disabled in the chooser until the guided interface is complete.
Standard Builder, Aura layouts, catalogue, policy reviews and publications are
not modified by this stage. No real database migration or deployment was run.

## Reference data

The staged migration reuses the product-only taxonomy from the immutable
0015 starter-library migration. Its seed compiler reads the supplied niche
attribute/value exports, normalises whitespace and Unicode, removes unusable
labels and non-product taxonomy rows, and deduplicates by case-insensitive
label while keeping the lowest source ID. Values for merged attributes are
reassigned to the retained reference ID. Empty questions are excluded.

The ad-card assignment export is not imported. It is another system's
assignments, not permission to create merchant products or inventory.
The seed is deterministic and included in the migration checksum.

The supplied snapshot produces 1,971 attribute questions and 9,613 distinct
selectable values. The import report records excluded and merged rows; these
are global choices, not new merchant catalogue items.

## API for Stage 4

- GET `/api/stores/:id/ann/reference`: taxonomy, five styles, palettes, fonts,
  ordered steps and supported optional-section choices.
- GET the same URL with `?subcategory_id=1`: selected attributes and values.
- GET `/api/stores/:id/ann/session`: saved progress or a null session, plus a
  preview-only configuration. Reading never creates a session.
- PATCH `/api/stores/:id/ann/session` with
  `{"expected_revision":0,"current_step":"style","answers":{"style_preset":"vintage"}}`
  creates the first session. Subsequent saves send the last returned revision
  and only changed answers. Null deletes an optional answer.

Members can read; owners/admins can save. Origin and authenticated membership
are checked before writes. Database writes use a tenant- and session-checked
function, not direct table grants. Integer revisions prevent stale-tab
overwrites, including simultaneous first saves. Conflicts return 409.

Planning collection/product ideas are not real catalogue records. Product
attributes must belong to the chosen product subcategory. Changing category
clears an incompatible subcategory; changing category/subcategory clears old
attribute choices but retains descriptions. The response names cleared fields.
Checkout controls, verified GST data, prices, stock, policies, payment secrets
and publication are not writable through the Ann-answer API.

No step name or saved session is evidence that a store is ready to publish.
Existing publication checks remain authoritative. AI is not called here.

## User-run migration

First run offline checks:

    pnpm run test:offline

0016 requires 0015, which itself requires 0012. If the starter-library
migration is not applied yet, run:

    node db/migrate.js --staged-starters

Then apply this stage:

    node db/migrate.js --staged-ann

Existing applied migrations are skipped after their checksums are verified.
If a prerequisite is missing, the runner stops without applying this stage.
Do not create these tables manually or run ordinary db:migrate expecting
it to apply staged migrations.

Then run the existing database isolation checks and publish the Worker using
the project's deployment script:

    pnpm run db:test-isolation && pnpm run deploy

Stage 4 adds the conversation interface and uses these contracts. Stage 5
handles real catalogue/selling configuration through existing verified APIs.
