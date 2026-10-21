import {article,section,faq} from "./blog-helpers.js";

export const PLATFORM_GUIDES=[
  article("lebrands-store-ann-builder-guide",
    "How Ann turns your store brief into a LeBrands.Store draft",
    "Explore LeBrands.Store's Ann builder: store naming, plan review, business details, theme choices, inline text editing and saved draft review.",
    "Inside LeBrands.Store",
    "Ann brings store setup into a guided conversation instead of asking a founder to start with an empty page. The important distinction is that a saved design, a verified business and a published store remain separate checkpoints. Here is how to use that workflow deliberately.",
    ["Review your store plan after naming the brand; choosing Free does not start its live-day clock.","Use Ann's language selector for guidance without changing merchant-entered records.","Review the saved design, real catalogue and publishing checks as separate parts of launch readiness."],
    [
      section("name-and-plan","Start with the brand and review its plan",[
        "Begin with the name customers should recognise. Ann includes plan selection after the store-name step, so the commercial choice is part of setup rather than an unrelated dashboard task. Read the applicable terms in the modal before accepting; opening or reviewing the plan is not itself a paid purchase.",
        "The Free allowance is 100 catalogue products and 1,000 SKUs, including drafts and items currently live, with 30 live days beginning at the first successful publication. Uploaded files count toward storage even when unused. It does not include LeBrands.Space placement. Do not confuse the first day spent editing a draft with the start of that live period, and check the offer applicable to your store before continuing.",
      ]),
      section("business-context","Provide the business facts the store needs",[
        "Ann asks for business context alongside design decisions. Country affects the registration evidence required, while business-document review remains distinct from GST verification and publication approval. For an Indian GST-registered business, confirm the returned legal identity and invoice address carefully rather than treating them as decorative profile text.",
        "The conversation supports English, Hindi, Tamil, Marathi and Telugu. Use the language that makes the prompts easiest to follow, but keep legal names, addresses and product records accurate as entered. Translating guidance should not silently rewrite a merchant's registered identity or previously saved business evidence.",
      ]),
      section("design-choices","Build a coherent theme rather than isolated sections",[
        "Work through the available style, colour, typography, collection and story choices with the preview beside the conversation. Add a brand logo where available, or use a deliberate wordmark treatment when the brand name is the appropriate starting identity. Check both the first impression and the information lower on the page.",
        "The saved design is the basis for continued theme editing. Use the shared inline text editor to refine wording and its formatting, including size, emphasis, alignment and colour. Keep headings readable and avoid styling every line as a competing headline. The goal is a coherent storefront, not the largest possible collection of effects.",
      ]),
      section("real-catalogue","Know when you are looking at illustrative content",[
        "Ann can show a style showcase with sample images and illustrative product prices. That helps compare designs without requiring a complete catalogue first. Switch to the actual-store view when checking what a customer will be able to buy; a sample product is not a merchant's sellable item.",
        "Create and review real products, their options, media, prices and stock separately. A polished preview does not confirm that the catalogue is complete or that checkout is enabled. This distinction lets a founder explore presentation without accidentally presenting demo content as an available product range.",
      ]),
      section("review-and-publish","Finish with an explicit launch review",[
        "Use the final review to check business status, contact details, catalogue readiness and policy drafts. Read and edit those policies inside the review flow; generation alone does not mark them reviewed. Support details should lead to channels your team actually monitors, not simply fill a required field.",
        "Publishing is a separate action with its own checks. A draft can be saved while document review is unresolved, but choosing a plan or completing a design does not approve the business. That separation is useful: you can keep preparing the store while seeing which specific launch condition still needs attention.",
      ]),
    ],
    [faq("Does choosing Free start the 30 live days immediately?","No. The 30 live days begin at the first successful publication, not when you name the store, review plans or edit a draft."),
      faq("Does switching Ann's language translate my business records?","No. The conversation language is separate from merchant-entered names, addresses, product records and submitted evidence.")],
    ["ann-theme-styles-and-inline-editing","ann-multilingual-conversations-and-gst-verification","lebrands-store-verification-and-publication","lebrands-store-catalogue-and-variants"],
    "A guided Ann conversation linked to plan review, theme controls and a saved storefront draft"),

  article("lebrands-store-catalogue-and-variants",
    "Inside the LeBrands.Store catalogue: products, variants and media",
    "Learn how LeBrands.Store separates product classification, variant options, SKU stock, product media and private cost information.",
    "Inside LeBrands.Store",
    "A dependable storefront starts with structured product records. LeBrands.Store separates the facts that describe a product from the options a buyer selects, the stock a merchant owns and the costs that should never appear in a public listing.",
    ["Classify products separately from the variants that create sellable SKUs.","Review product media before upload, including its frame and file limits.","Treat public product content, live stock and private costs as different records with different purposes."],
    [
      section("classification","Give the catalogue a consistent structure",[
        "The catalogue uses category, subcategory, product type, variants and descriptors as distinct concepts. A product type identifies what the item is; its title is the customer-facing name. A descriptor records a fact such as material or pattern without automatically creating another stock item.",
        "This matters when the range grows. If fabric composition is entered as a variant merely because it appears in a checklist, the catalogue can develop combinations that no customer can actually purchase. Use classification to organise the assortment and use variants only where the buying decision and fulfilment process genuinely require a choice.",
      ]),
      section("sellable-combinations","Use variants for the combinations you fulfil",[
        "A variant option such as size can create separate sellable SKUs. Check that each offered combination has a consistent label, the correct price and a meaningful stock quantity. A buyer selecting a medium top should not end up with an ambiguous order line that only identifies the parent product.",
        "LeBrands.Store preserves the selected options in order records rather than relying solely on the current product page to explain an old purchase. Published option and price information, live SKU stock and copied order selections serve different purposes. Editing a listing is not a reason to change what a customer previously ordered.",
      ]),
      section("media-preparation","Prepare images and video with a visible preview",[
        "The product media uploader accepts JPEG, PNG and WebP images and MP4 or WebM video, with a 10 MB per-file limit. Images have a 4:5 framing preview so the merchant can adjust the crop or fit the complete image with padding. Review the item edges, labels and important details before confirming.",
        "Image preparation attempts WebP output in supported browsers and clearly reports a PNG fallback. Video can be prepared as WebM where browser support allows, or uploaded in an accepted original format. Conversion is not an unconditional guarantee. Media is stored in Cloudflare-backed storage, with its references attached to the product record.",
      ]),
      section("facts-and-costs","Separate product facts from private economics",[
        "Manufacturer, country of origin, package contents and relevant descriptors help answer customer questions. They do not create stock on their own. Keep claims accurate and use the fields that apply to the actual item rather than populating every available field with generic text.",
        "The optional cost field and Catalogue's COGS area serve a different purpose: internal product economics. Owner and admin access keeps those figures out of shopper-facing pages. Blank cost means unknown, not zero, and a cost edit does not authorise rewriting the financial history associated with earlier sales.",
      ]),
      section("publication-check","Review what is actually available to shoppers",[
        "Before publication, inspect the real catalogue in the store preview. Check a long title, a selected variant, an out-of-stock combination and a product with more than one media item. Verify that the first image, price and description tell a consistent story about exactly what the buyer receives.",
        "A complete-looking product is not automatically ready for sale if its required options, price or stock are wrong. Keep catalogue preparation distinct from business approval and store publication. That discipline makes both the public buying experience and the merchant's subsequent order handling easier to trust.",
      ]),
    ],
    [faq("Do descriptors such as fabric or pattern create SKUs?","Not by themselves. Variants define buyer-selectable combinations; descriptors record product facts."),
      faq("Are product costs visible to shoppers?","No. COGS is private owner/admin information, separate from public product prices and descriptions.")],
    ["product-photography-and-media-guide","lebrands-store-offers-and-cost-control"],
    "A product record branching into size SKUs, a 4:5 media frame and a locked private cost ledger"),

  article("lebrands-store-checkout-and-order-experience",
    "The LeBrands.Store buying journey, from product to confirmation",
    "See how LeBrands.Store combines theme-matched headers and footers with shared product, cart, checkout and order-confirmation layouts.",
    "Inside LeBrands.Store",
    "A brand can have its own visual identity without making customers relearn every buying step. LeBrands.Store uses the merchant's theme around a shared commerce experience, keeping product choices, cart totals, checkout verification and confirmation details recognisable across stores.",
    ["Merchant theme styling frames a consistent product-to-order journey.","Shoppers verify an email before submitting a new order.","Confirmation and email totals reflect the order, including offers and COD status."],
    [
      section("theme-and-commerce","Keep the brand identity and buying logic aligned",[
        "The merchant's theme supplies the surrounding header and footer on product, checkout and order-confirmation pages. The body uses shared commerce layouts so a buyer can recognise where to find options, totals and the next action. A merchant should not need a separate custom layout for every operational page.",
        "That consistency is not a claim that every store has identical colours or content. The product imagery, brand identity and merchant information still matter. Review the browser-tab icon as part of the same identity check, and use title-based product URLs to give customers a clearer destination than an unexplained identifier.",
      ]),
      section("product-and-cart","Carry the selected product into a clear cart",[
        "On the product page, the buyer selects the actual available options and quantity before adding an item. The cart identifies those selections alongside quantity and price. This gives the customer a chance to catch a wrong size or duplicate unit before entering delivery information.",
        "The cart also needs to distinguish item subtotal, delivery, included tax and offer savings. An automatic offer is not the same as a code that must be entered. A rejected code should explain what needs attention without concealing the cart contents or suggesting that an unrelated automatic saving is invalid.",
      ]),
      section("verified-checkout","Use verification for the shopper, not the merchant account",[
        "New orders require a verified shopper email. That verification is separate from the merchant's LeBrands.Store login and from optional marketing consent. It provides a verified destination for order communication; it is not a reason to claim that a customer has subscribed to promotional messages.",
        "The address flow can use an Indian PIN code to fill city and state where lookup succeeds. Customers should review the result and enter the actual street and locality accurately. If the lookup cannot resolve the PIN, the form needs a clear explanation rather than invented address details or a silent mismatch.",
      ]),
      section("status-and-totals","Make the confirmation match the transaction",[
        "The confirmation page presents the order identifier, purchased items, selected options, quantities, delivery address and totals. Offer savings remain visible so the payable amount can be understood without reconstructing the checkout. A specific status explains whether the order is confirmed and which payment method applies.",
        "For cash on delivery, the page states that no online payment has been taken and shows the amount due on delivery. It should not call a COD confirmation a captured online payment. Order details are a record of that purchase, not a fresh calculation from whatever prices happen to be displayed later.",
      ]),
      section("order-communication","Extend the same clarity into order emails",[
        "The shared utility email presentation carries recognisable branding, a clear order reference, item details, totals and a useful order link. Customer and merchant notifications serve different audiences, but both should be grounded in the same order evidence. Essential messages should not be mistaken for promotional campaigns.",
        "Email preferences separate optional updates from critical order and security communication. The operational goal is straightforward: a buyer knows what was ordered and where to find help, while the merchant receives enough context to begin fulfilment. A professional design supports that goal only when the underlying facts remain correct.",
      ]),
    ],
    [faq("Does the shared checkout replace my store's theme?","No. The header and footer follow the merchant theme, while the commerce body follows a consistent LeBrands.Store structure."),
      faq("Can a shopper place a new order without verifying an email?","No. Email verification is required for new orders and is separate from the merchant login and marketing consent.")],
    ["checkout-trust-and-verified-email","transactional-emails-customer-retention"],
    "A continuous product, bag, verified checkout and order-confirmation journey inside a merchant-branded frame"),

  article("lebrands-store-offers-and-cost-control",
    "Run offers with a clearer view of product costs on LeBrands.Store",
    "Understand LeBrands.Store's separate Offers menu, supported discount scopes, automatic savings and private Catalogue COGS workflow.",
    "Inside LeBrands.Store",
    "Discounts and costs answer different questions. Offers determine which eligible saving a shopper receives; COGS helps an authorised merchant understand the cost of the item being sold. LeBrands.Store gives them separate places in the dashboard rather than treating every commercial decision as a catalogue edit.",
    ["Use Offers for promotions and Catalogue > COGS for private product costs.","Review eligible savings against the final payable amount, not the headline percentage.","Keep historical order allocations and financial evidence separate from later edits."],
    [
      section("separate-workspaces","Use the right workspace for each decision",[
        "Offers sits outside Catalogue because a promotion can apply to a product, a collection or an order rather than only to one item record. COGS belongs inside Catalogue because the merchant starts with an existing product and records its cost. These are related commercial tasks, but they do not share the same customer-facing effect.",
        "The dashboard's ticket-style treatment makes the commercial controls recognisable without changing their authority. A visual offer card does not by itself make a discount active, and a private cost figure is not a second public price. Review the saved settings and the available action rather than inferring behaviour from the presentation.",
      ]),
      section("offer-settings","Define an offer with an explicit scope and method",[
        "Supported offers include percentage and fixed-amount savings, with eligible product, collection or order scopes. The creation flow distinguishes a code customers enter from an automatically considered offer. Review the required scope, active dates and applicable minimums or usage conditions in the saved record.",
        "Use a name that helps the team understand the campaign without overstating what a customer receives. A code such as SAVE100 is only a label; the configured value and eligibility determine its effect. A fixed-amount discount, a percentage reduction and an automatic offer should not be described as interchangeable mechanisms.",
      ]),
      section("checkout-result","Inspect the final total and the rejection message",[
        "The checkout evaluates eligible offers against the best final payable result rather than relying only on the largest advertised percentage. The shopper should see the saving reflected in the breakdown. Do not promise that every offer stacks with every other offer; the checkout's supported combination rules decide what can apply.",
        "When a code is rejected, check whether it is actually a code-based offer, whether the selected items qualify and whether its conditions are satisfied. An automatic offer can already be providing a saving while a separately entered code is invalid. Those two states need different explanations and must not be confused.",
      ]),
      section("private-costs","Record COGS without turning missing data into profit",[
        "Owners and admins can open Catalogue's COGS area, select existing products and record optional costs. The product form also provides an optional cost field. A blank entry means the cost is unknown; it must not be treated as a zero-cost item simply to produce a more attractive margin.",
        "Decide what your internal cost figure includes and apply that basis consistently. Product cost alone is not the whole contribution calculation when shipping, payment fees or returns also affect the order. Use the available records with explicit assumptions rather than describing every difference between selling price and COGS as net profit.",
      ]),
      section("historical-records","Protect the meaning of an earlier sale",[
        "An order's discount allocation records what happened when that purchase was accepted. A later offer edit should not reprice that earlier order. The same principle applies to historical cost evidence: updating today's product cost is not permission to rewrite the economics of a past sale.",
        "Before a campaign, review a representative basket, its eligible items, the displayed saving and the final total. Afterward, compare the actual outcomes with the campaign's objective and the costs you know. Useful commercial control comes from consistent records, not from adding more discount labels to the same checkout.",
      ]),
    ],
    [faq("Why is Offers not inside Catalogue?","Offers can target products, collections or whole orders. A separate workspace matches that broader scope, while product costs remain in Catalogue."),
      faq("Does changing today's COGS rewrite earlier sales?","No. Current cost edits must not retrospectively replace the cost evidence associated with historical sales.")],
    ["discount-codes-and-automatic-offers","cogs-and-product-margin-basics"],
    "An offer ticket and final-total receipt beside a separate locked product-cost ledger"),

  article("lebrands-store-verification-and-publication",
    "What happens before a LeBrands.Store draft becomes a live store",
    "Understand LeBrands.Store business evidence, GST verification, support details, policy review and the checks behind store publication.",
    "Inside LeBrands.Store",
    "Publishing should mean more than making a preview visible. LeBrands.Store separates business-document approval, tax identity, contact details, policy review and design readiness so a founder can see what each checkpoint proves and what it does not.",
    ["Business evidence review and GST verification are separate checks.","Generate, edit and review policy drafts within the final review flow.","A chosen plan and a saved design do not override the publication checks."],
    [
      section("separate-evidence","Know what business-document review establishes",[
        "Business-document submission collects registration evidence for manual review. The evidence required depends on the business country and registration context. Uploaded documents remain private; the fact that a file was accepted for upload or passed security screening is not the same as a reviewer approving the business.",
        "Read the document status shown in the business-details flow rather than assuming that submission means approval. A merchant can continue preparing a design while a standard review is unresolved, but the publication checkpoint still needs the applicable approval. This keeps design work productive without turning a document-upload event into permission to go live.",
      ]),
      section("tax-identity","Verify tax details independently of the design",[
        "For an Indian GST-registered business, GST verification provides a legal identity and registered address that need careful confirmation. These details serve financial and publication purposes; they are not simply a heading to restyle. A verified number should match the business context and the required state information.",
        "Business-document approval does not change tax treatment, enable payment collection or authorise a different invoice identity. Likewise, choosing a subscription does not verify the business. Treat each checkpoint according to its purpose, and seek qualified professional guidance where your registration or invoicing obligations need interpretation.",
      ]),
      section("support-and-policies","Make contact details and policy drafts useful",[
        "The final review includes customer-facing contact details and policy drafts. Complete support email and phone information with channels the team actually monitors. Where the review requests business basics, resolve the specific missing facts there instead of treating a generic readiness message as confirmation that everything has been supplied.",
        "Generate policy drafts from the saved business context, then read and edit the text inside the review. The set covers privacy, terms, shipping, cancellation and refunds, contact and pricing. Generated content is a starting point for the merchant's review, not legal advice or proof that the actual operation follows those statements.",
      ]),
      section("catalogue-and-design","Check real products as well as visual readiness",[
        "Review the saved theme and at least one complete real product before publication. Confirm the title, media, price, options and available stock. An attractive showcase containing illustrative products is not a substitute for a catalogue that can fulfil a real customer purchase.",
        "A preview can show shopping as unavailable when it is not a live purchase surface or when the relevant readiness checks are incomplete. Do not interpret that label as a reason to bypass business or catalogue requirements. Use the review's specific conditions to understand which part of setup needs attention.",
      ]),
      section("successful-publication","Keep plan acceptance distinct from going live",[
        "The Free plan's 30 live days start at the first successful publication. Naming a store, choosing Free and saving a design do not start that clock. The allowance covers 100 published products and 1,000 published SKUs, without LeBrands.Space placement, subject to the offer applicable to the store.",
        "When the checks are satisfied, publication is an explicit action rather than a side effect of generating copy or editing a contact field. After going live, review the public store on a phone: navigation, product selection, cart, checkout identity, policies and support information should all tell the same, accurate story.",
      ]),
    ],
    [faq("Does document security screening mean the business is approved?","No. File security screening and manual business-document approval are separate steps."),
      faq("Do generated policies automatically count as reviewed?","No. The merchant must read, edit as needed and explicitly review each policy. Generation is not legal approval.")],
    ["lebrands-store-ann-builder-guide","gst-invoices-for-indian-online-stores"],
    "Distinct document review, tax identity, support, policy and catalogue checkpoints leading to an explicit publication action"),
];
