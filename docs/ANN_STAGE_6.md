# Ann Stage 6: guided setup and launch readiness

## Conversational planning and preview

Ann's planning area is a question-and-reply timeline with a focused composer.
Category, subcategory, style, background, accent, buttons, type, collection names,
product ideas and brand-story answers appear as individual conversational turns.
Enter sends a message and Shift+Enter adds a line. Earlier answers can be edited;
collection/product notes are optional, and the detailed editors remain available
for advanced fields. Typed, unsent messages are retained while switching prompts
and protected by the unload warning. Stage boundaries use the existing
revision-checked plan save, including its conflict recovery.
Question transitions do not wait for that network request. Failed saves pause
background retries and display an explicit unsaved warning with Retry save;
they never imply that changes are persisted or ready to apply.

The progress meter counts populated design areas from actual answer data, not
simply visiting later stages. It is not a launch-readiness or publication score.
Preview feedback completes when the iframe loads the changed preview. This is
guided planning using curated content, not a claim that an AI provider is
generating new pages or media.

Fashion showcase uses the shared menswear pack even when a merchant already has
products or old page images. Your store is a separate preview of the real
catalogue, and confirmed application/readiness saves switch to that view. The
choice is remembered for the browser session; choosing another style returns
to the showcase. Neither preview mode imports sample inventory, replaces saved
images or publishes a store.
The shared photographs can remain menswear placeholders, but selected category
and subcategory change section, sample product and collection text immediately.
Inherited registration copy does not replace this niche-specific starter copy.
Explicitly written Ann copy and the actual merchant catalogue remain protected.

## Product completion in Ann

Ann's Review panel now shows saved product details and the same validation
errors used by the existing catalogue editor. A merchant can explicitly save
changes to the title, description, price, compare-at price, SKU, tags, HSN,
GST rate and ordered product photos without leaving Ann. Stock and variants
remain in the catalogue tools; editing other details never writes stock.
The backend accepts only a patch of the changed fields, locks the product,
checks the store draft fingerprint, validates the patch with the normal product
rules, and calls the same store-owned product writer. There is no implicit
publish or catalogue activation. Confirmation is required for each product.
Historical GST rates remain unchanged unless the merchant explicitly selects
a current rate; 0% on apparel shows the exemption warning.

Uploaded photos go through the existing Worker multipart/R2 route using an
Ann-specific write-role gate before bytes are read. The media library lists
up to 200 recent approved images owned by this store, plus images already
assigned to its products. An uploaded image is a library asset only until the
merchant explicitly attaches it and saves that product. The repository
checks image ownership and approval, limits products to eight unique photos,
and maintains their order. Editing a shared photo description can change
the same image's description on other products that use it. Source files are
validated by content, not by extension alone.

The isolated `__ann-builder-preview?stage=6` fixture includes one explicitly
fictional incomplete product, one approved sample photo and six fictional
policy drafts. Its R2 replacement holds uploads in process memory. No
merchant store, production bucket, publication, order or payment is touched.
Product API isolation is covered in `tests/ann-products.test.js`; confirmed
field changes, price conversion and unsaved photo state are covered in
`tests/ann-products-ui.test.js`.

**No database migration** is required for this stage. Apply the usual offline
tests before the owner runs their deployment command. Browser editing tests
must use only the isolated fixture, not the live-preview database.

Ann's Review screen now reads and saves actual business, support, policy and
shipping/payment settings. These are separate from saved Ann planning answers.
Saving the conversation plan does not save the setup forms.

## Merchant flow

1. Apply confirmed page/catalogue choices using Stage 5.
2. Review the actual business details. Select an existing owned logo or use the
   existing setup for uploads. Confirm and save this group separately.
3. The owner confirms delivery charges, an optional free-delivery threshold,
   COD availability/limit and the tax origin state. These settings affect the
   current live checkout immediately, not only a future published draft.
4. Edit and review each policy individually. Changes to business or checkout
   details clear policy reviews while retaining edited policy text.
5. Resolve the shared readiness errors. Missing product photos/tax data link to
   Products; address confirmation, GSTIN supplier selection and uploads link to
   the existing setup; final review/publication links to the existing editor.

Regenerating policies explicitly overwrites all six policy texts and clears
reviews. Its checkbox names that consequence. Templates remain starting drafts,
not legal advice or evidence that the merchant's terms are correct.

## Contract and boundaries

- GET `/api/stores/:id/ann/readiness` returns real settings, owned logo choices,
  business/product validation errors, policies, checkout configuration, actual
  address/status and authoritative checklist items.
- PATCH uses `expected_draft`, `confirm: true`, an action and its corresponding
  payload: `business/settings`, `checkout/checkout`, `policy/policy`, or
  `generate-policies`. Unknown keys, subdomain and invoice-prefix changes are
  rejected here.
- Existing shared settings, policy and checkout parsers/repositories are reused.
  Existing supplier protection is applied. Admins may edit business/policies;
  only owners may change checkout settings, matching the merchant controller.
- Writes run in the existing tenant-checked store transaction. A stale settings,
  policy, catalogue or checkout snapshot returns 409. Typed edits remain until
  the user explicitly reloads and accepts discarding them.
- Saved sections refresh their data/checks without discarding unsaved work in
  other sections. Business/checkout saves clear even unsaved review ticks.
- Cash on Delivery is the supported payment method here. No online gateway,
  custom-domain connection, carrier integration, provider verification or
  platform approval is invented or enabled by answering questions.
- There is no Ann publish endpoint or automatic completion flag. The existing
  editor rechecks publication, GST and platform approval rules independently.

## Verification and release

The isolated `/__ann-builder-preview` uses separate in-memory PGlite with real
foundational migrations and the actual handlers/repositories. Its browser-only
dataset has six labelled fictional policy drafts. It never connects to the
external merchant database, sends email, takes payment or publishes.

Offline tests cover exact INR parsing, consent, origin/membership/role checks,
unknown-field rejection, stale snapshots, real business normalization, policy
generation/review, and preserving policy text while invalidating its review.

No new migration or backfill is required. The user publishes the Cloudflare
application using:

```sh
pnpm run test:offline && pnpm run deploy
```
