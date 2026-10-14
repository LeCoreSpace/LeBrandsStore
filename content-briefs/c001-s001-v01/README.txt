AURA STARTER CONTENT: FASHION & APPAREL / MENS CLOTHING
Category ID: 1. Category slug: fashion-and-apparel.
Subcategory ID: 1. Subcategory slug: mens-clothing.
Pack ID: c001-s001. Content version: 1.

WHAT TO RETURN
Create a ZIP named c001-s001-mens-clothing-v01.zip containing:
  c001-s001-mens-clothing-v01/
    README.txt
    content.json
    images-manifest.json
    images/
      the 20 WebP files named in images-manifest.json

This brief contains no generated images. Generate the 16 originals, then
produce the 4 derivatives by cropping existing originals. Do not pay for a
new AI generation when a crop is sufficient.

The enclosed content.json already supplies starter text. You can keep it,
edit it yourself, or use the text prompt below. It is an exchange format,
NOT a live store_pages layout or a product import. Media paths must be
resolved and schemas validated before application to a store.

IMAGE RULES
1. Read images-manifest.json. It gives each exact filename, required output
   width/height, generation prompt, caption/alt text and intended use.
2. For EVERY original generation, prepend this master instruction:

   Create premium, photorealistic editorial imagery for an illustrative
   men's clothing storefront. Visual direction: quiet contemporary Indian
   menswear; clean white studio product backgrounds, softly lit urban
   architecture for lifestyle scenes, restrained colours, natural textures,
   accurate garment construction and believable human anatomy. Colour
   palette: ecru, indigo, black, sage, sand and charcoal. Use soft daylight,
   realistic shadows, matte finishing and restrained commercial retouching.
   Garments must be unbranded. No visible logos, text, labels, signage,
   watermarks, borders, collages or graphic overlays. Do not imitate an
   identifiable fashion brand or photographer. No certification badges or
   claims. Keep garment colour, buttons, pockets, stitching and silhouette
   consistent with the supplied reference images. Leave safe margins for
   cropping. The image must look like considered product/editorial
   photography, not an AI poster or an illustration.

3. Then append the specific prompt from the manifest.
4. Generate product p01 front FIRST. Use it as a reference for p01 back,
   detail and model images. Use the approved product shots as references
   for hero/lookbook scenes so garments do not change between photographs.
5. Reuse the same fictional adult male model for the hero, p01 model and
   lookbooks where possible. Use reference-image/edit mode, not just a seed
   or a text instruction, to improve consistency. The founder portrait is a
   different, fictional person and must never be described as a real founder.
6. Sizes in the manifest are the FINAL file dimensions. If your tool cannot
   generate them directly, generate the nearest supported aspect ratio at
   sufficient resolution, then crop and resize without stretching. Record
   an upscale in production_notes if one was necessary.
7. Export actual WebP image files in sRGB. Renaming a PNG to .webp is not
   conversion. Use quality approximately 80-88; avoid banding or blurred
   fabric texture. No animation. Keep originals outside the submission if
   desired; only the final WebP files are required.
8. Aim for <=400 KB per hero image, <=250 KB per product/collection image
   and <=300 KB per other image. These are targets, not permission to
   sacrifice image quality. Strip unnecessary EXIF/location information.
9. Use EXACT lowercase filenames from the manifest. No spaces, Unicode,
   parentheses or extra suffixes such as "(1)" or "final-final".

GENERATION ORDER
Phase A: p01-p06 front product photographs.
Phase B: p01 back/detail/model using the front as a reference.
Phase C: hero and three lookbook scenes using product references.
Phase D: craft macro, construction photograph and fictional portrait.
Phase E: hero mobile crop and three collection-card crops.

RICH TEXT FORMAT
All content is UTF-8 JSON. Rich text fields are HTML STRINGS, not Markdown,
not an object from a rich-text editor, and not a full HTML document.
Allowed tags ONLY: <p>, <br>, <strong>, <em>, <ul>, <ol>, <li>.
No attributes, styles, classes, scripts, iframe, img, table, a, h1 or h2 tags.
All tags must be balanced; escape JSON quotes and line breaks correctly.
Heading fields are plain strings; headings are rendered by Aura.
Buttons/links are separate fields. Do not embed links in rich text.

Example:
  "description": "<p>Thoughtful essentials for everyday dressing.</p><p>Start with <strong>clean silhouettes</strong> and a restrained palette.</p>"

This is acceptable:
  "body": "<p>Check the garment's care label.</p><ul><li>Separate light and dark colours.</li><li>Store garments clean and dry.</li></ul>"

This is NOT acceptable:
  "body": "<h2 style=\"color:red\">Care</h2><img src=\"shirt.webp\">"

Field limits are in content.json under text_limits. Keep body text compact:
typically 40-80 words per section, a 100-150 word sample founder story,
and 20-45 words per FAQ answer. A maximum is not a target.

TEXT GENERATION PROMPT
Give your text AI content.json, images-manifest.json and this instruction:

  You are editing a premium men's clothing starter-content pack for Aura.
  Category 1 is Fashion & Apparel. Subcategory 1 is Mens Clothing.
  Produce one complete valid UTF-8 JSON document using the supplied
  content.json as the exact structural template. Return JSON only.
  Preserve pack metadata, all 43 section records, section IDs, page keys,
  positions, section types, media filenames, sample references and review
  flags. Keep every section in the provided order. Do not add or remove
  schema fields, manufacture UUIDs, change URLs or alter native controls.

  Improve only editable text values and sample catalogue descriptions,
  staying within the supplied per-field limits. Write refined, warm,
  straightforward English for contemporary Indian menswear. Avoid
  excessive luxury adjectives, cliches, sparkle symbols and em dashes.
  Coordinate copy around a considered everyday wardrobe, useful layers,
  texture and understated colour. Do not copy another brand.

  Rich text uses ONLY attribute-free p, br, strong, em, ul, ol and li tags.
  Plain text headings must not contain HTML or Markdown. Do not put
  images inside HTML. Their references are already provided separately.

  The sample catalogue has six fictional clothing concepts:
  p01 ecru long-sleeve button-down shirt; p02 indigo long-sleeve shirt;
  p03 black crew-neck T-shirt; p04 sage two-pocket overshirt;
  p05 sand chinos; p06 charcoal short-sleeve polo.
  Preserve the supplied INR demo prices exactly. They are fictional
  preview prices, not recommendations for real merchant products.
  Do not invent stock, GST, SKUs, discounts, manufacturer facts,
  certificates, sustainability claims or actual merchant products.
  Treat materials/specifications as illustrative examples requiring
  merchant replacement or verification. Do not add product variants.

  Keep the founder explicitly labelled as sample content. Do not invent
  a founder name, a founding year, location, achievements or credentials.
  Do not invent customer testimonials, ratings or verified reviews.
  Reviews contain headings/empty-state guidance only.

  Shipping/returns/support copy must stay neutral and point to the
  merchant's real policies. Do not promise free shipping, a delivery
  timeline, a refund window, a payment option or a support channel.
  Gift wrapping, upsells, coupons and payment methods must not be
  presented as active unless the application actually supports and
  enables them. Preserve server-controlled commerce behaviour.

  Return the complete content.json, not a summary or a shortened example.
  If the response would be truncated, edit the file in separate passes
  rather than returning invalid or incomplete JSON.

SECTION INVENTORY AND ORDER
HOME:
home.announcement, home.header, home.hero, home.featured-collection,
home.featured-products, home.statement, home.spotlight, home.lookbook,
home.craft, home.founder, home.trust, home.reviews, home.faq, home.footer.

COLLECTION:
collection.header, collection.collection-heading, collection.collection-nav,
collection.collection-tools, collection.product-grid,
collection.collection-pagination, collection.collection-description,
collection.related-collections, collection.footer.

PRODUCT:
product.header, product.product-details, product.shipping-info,
product.product-specs, product.material-care, product.size-guide,
product.how-to-use, product.faq, product.related-products,
product.reviews, product.footer.

CART:
cart.header, cart.commerce, cart.shipping-info, cart.trust, cart.footer.
cart.commerce contains the native items, supported optional extras,
recommendations, summary and checkout action. These are not five new
independent section types.

CHECKOUT:
checkout.header, checkout.commerce, checkout.trust, checkout.footer.
checkout.commerce contains native contact, address, shipping, payment,
optional notes, summary and place-order controls. These are not seven
new independent section types.

There are 43 current placements: 14 home + 9 collection + 11 product +
5 cart + 4 checkout. All are included.

IMPORTANT CONTENT BOUNDARIES
- sample_catalog is PREVIEW ONLY. It contains six product concepts with
  images and explicit INR demo prices. Each of the three collections
  contains at least three sample products. Show a clear sample/demo label.
  It must never create live products or purchasable inventory automatically.
  Do not copy these prices over actual merchant prices.
- Demo prices: p01 INR 1,999; p02 INR 2,199; p03 INR 899;
  p04 INR 2,999; p05 INR 2,499; p06 INR 1,499.
  JSON prices are integer paise (INR 1,999 is 199900 paise).
  Do not add crossed-out prices, invented discounts or fake sale claims.
- The demo bag contains p01 and p05, one each: subtotal INR 4,498.
  Shipping, tax and payable totals are not invented; no demo order can
  be placed. Real checkout remains bound to the actual merchant catalogue.
- Collection names and sample product keys describe illustrative preview
  groupings, not live tenant IDs.
- Founder story, sizing and product facts require merchant review.
- Native commerce labels live in native_copy for reference; they are
  not all currently customisable through Aura settings. The importer
  must not inject these keys into schema-controlled settings.
- Native trust/review sections do not accept invented block data.
- Actual product images populate grid, spotlight, recommendations and
  cart thumbnails when the merchant provides a real catalogue.
- Existing media/tenant validation must not be bypassed to import this ZIP.
- This is an offline content-production handoff, not an implemented
  importer, migration, store creation or publication.

NAMING CONVENTION
c001-s001-<subject>-<view-or-variant>-v01.webp
Examples:
c001-s001-hero-desktop-v01.webp
c001-s001-product-p01-front-v01.webp
c001-s001-lookbook-02-v01.webp
Keep category/subcategory IDs as zero-padded source IDs. Increment the
version for an intentional revised pack, not for every attempted generation.

FINAL CHECK BEFORE ZIP
- Exactly 20 required WebP filenames, matching manifest dimensions.
- All six product colours and p01 views are consistent.
- No text/logos, distorted hands, duplicate buttons or impossible pockets.
- content.json is valid JSON and retains all section placements.
- All rich text uses the allow-list with balanced tags.
- Alt text describes the final image rather than unverified product claims.
- Sample facts/review flags remain present.
- Missing files are explicitly reported, never silently substituted.
