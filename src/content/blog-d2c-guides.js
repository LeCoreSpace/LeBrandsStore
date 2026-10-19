import {article,section,faq} from "./blog-helpers.js";

export const D2C_GUIDES=[
  article("size-guide-reduce-purchase-uncertainty",
    "A size guide that helps shoppers choose with confidence",
    "Build a useful D2C apparel size guide with garment measurements, fit notes, measurement instructions and consistent variant labels.",
    "Product experience",
    "A size chart should answer a buying question, not simply occupy space below a product. Explain what was measured, how the garment should fit and how shoppers can compare it with something they already own.",
    ["Distinguish body measurements from finished garment measurements.","Use the same size names in your guide and product options.","Turn repeated fit questions into specific, verified product information."],
    [
      section("measurement-basis","State exactly what your measurements describe",[
        "Start by deciding whether your chart describes a person's body or a finished garment. A chest measurement taken across a flat shirt is not the same as a body circumference. Label the method, unit and measurement points. If you publish both centimetres and inches, check the conversion and rounding before sharing the chart.",
        "Measure actual samples from the relevant style rather than reusing a chart from an unrelated collection. Two garments carrying the same size label can have different shapes, fabrics and intended fits. Record a tolerance only if your production team can support it; an unexplained range can create more uncertainty than it resolves.",
      ]),
      section("fit-context","Add the context a number cannot provide",[
        "Describe the intended fit in plain language: close to the body, regular through the shoulders or deliberately oversized. Explain whether the fabric stretches and whether the item has an adjustable waistband or fastening. Avoid claiming universal comfort or recommending that everyone choose one size larger without evidence from the product.",
        "Model measurements can help when the photographed sample size is known and accurately stated. Pair those facts with a practical comparison: measure a similar garment that already fits well. Product-specific guidance is more useful than a generic promise that the item is true to size.",
      ]),
      section("guide-placement","Keep size information beside the decision",[
        "Place a short size-guide link or section close to the size selector. Keep the labels identical across the chart, variant options and order records. A buyer should not need to translate between numerical sizes on the product and letter sizes in a separate document.",
        "Make the chart readable on a phone without shrinking every column into tiny text. Prioritise the measurements that affect fit for that garment. Use a clear table or a compact list, and explain how to measure before presenting a long set of numbers.",
      ]),
      section("feedback-loop","Improve the guide using real support questions",[
        "Keep a simple log of fit-related enquiries and returned-item feedback. Separate a measurement problem from a preference problem, a packing mistake or a defect. Those are different causes and need different responses. Update the guide when you have verified new measurements, not after every isolated complaint.",
        "After changing a guide, check the product page, image captions and support responses for consistency. Preserve the facts associated with earlier orders when handling a dispute. A clearer guide can support a better decision, but it does not remove consumer rights or guarantee that returns will fall.",
      ]),
    ],
    [faq("Can I use one size chart for every product?","Only when the measurement basis and fit genuinely apply to all those products. Different cuts or fabrics may need their own guide."),
      faq("Should the chart show body or garment measurements?","Either can be useful. State which one you use, define the units and show shoppers how to take a comparable measurement.")],
    ["product-pages-that-answer-buyer-questions","lebrands-store-catalogue-and-variants"],
    "A garment outline beside a measuring tape, three size labels and a clearly marked measurement chart"),

  article("collections-merchandising-d2c-store",
    "Build collections around how customers actually shop",
    "Organise a D2C catalogue into clear collections using customer intent, useful product ordering and honest availability information.",
    "Merchandising",
    "Your internal product spreadsheet is not a navigation strategy. Good collections turn a broad catalogue into recognisable choices: what a shopper needs, who it is for and which products can be bought together without confusion.",
    ["Use collection names customers understand without an explanation.","Place relevant, available products before weak or unrelated matches.","Audit collection pages on mobile, including empty and sold-out states."],
    [
      section("shopping-intent","Start with a shopping task, not an internal label",[
        "List the questions customers ask before looking at individual products. They may shop for a daily skincare routine, lightweight workwear or a gift within a budget. Choose collection names that match those tasks. Keep manufacturing codes, supplier names and internal season references out of primary navigation unless customers already recognise them.",
        "Avoid creating a collection for every keyword you can imagine. A small range benefits from a few substantial, clearly differentiated destinations. If two collections contain almost identical products and descriptions, explain the difference or consolidate them. The aim is easier selection, not a larger menu.",
      ]),
      section("product-order","Give the first screen a coherent selection",[
        "Choose the first products deliberately. Balance relevance, availability and a sensible spread of prices or styles. A visually consistent first row can make the collection easier to understand, but it should not conceal missing stock or imply that a product is a bestseller without a valid basis.",
        "Check each card's title, price and primary image together. A visitor should understand the difference between products without opening every page. If a photographed item is an accessory rather than part of the purchase, make that clear on the product page before checkout.",
      ]),
      section("collection-copy","Write a useful introduction and metadata",[
        "A short introduction should describe what belongs in the collection and how to choose. Mention a real distinction such as fabric weight, intended use or product format. Do not fill the page with repeated keyword combinations that add no buying information.",
        "Give the collection its own page title and search description. Keep those statements consistent with the products actually shown. If a collection changes substantially, review its introduction and links rather than leaving a seasonal promise attached to an unrelated assortment.",
      ]),
      section("routine-audit","Review the full browsing experience regularly",[
        "Open each important collection on a phone and follow a product through to its options and cart. Look for broken images, inconsistent naming, unclear sold-out states and links that lead nowhere. An empty collection should not be a prominent entry point without an honest explanation.",
        "Use customer questions and observed behaviour to decide what to adjust. If shoppers consistently ask where to find a particular type of product, the label or grouping may be unclear. Change one meaningful element at a time so your team can understand the reason behind the result.",
      ]),
    ],
    [faq("How many collections does a small store need?","Enough to support distinct shopping tasks. A few well-populated collections are usually more useful than many overlapping or empty destinations."),
      faq("Should a collection description repeat every product keyword?","No. Explain the assortment and selection criteria naturally, and keep metadata specific to the page.")],
    ["product-pages-that-answer-buyer-questions","ecommerce-seo-and-ai-readable-content"],
    "Three organised product collections with distinct visual groupings and a simple navigation path"),

  article("inventory-replenishment-small-d2c-brands",
    "A practical replenishment routine for small D2C brands",
    "Calculate stock cover and reorder points, track demand by SKU and separate sellable stock from returns and unresolved COD shipments.",
    "Store operations",
    "Replenishment is a decision about the right SKU at the right time, not simply whether a product looks popular. A small, consistent stock review helps a growing brand make purchasing decisions without treating every order as proof of settled demand.",
    ["Review demand at SKU level rather than only by product title.","Use lead time and a justified buffer to calculate a reorder point.","Keep damaged stock, returns and unsettled shipments separate from sellable inventory."],
    [
      section("sku-demand","Track the combination a customer can actually buy",[
        "A product total can hide the fact that its most requested size is unavailable while other sizes remain untouched. Review demand for each sellable combination, including size, colour or pack format where applicable. Keep the SKU identifier consistent between your order records, stock sheet and supplier purchase request.",
        "Record the observation period and any unusual event affecting demand. A promotion, launch or large single purchase can distort a short average. Do not assume that one busy weekend represents a normal month, and do not quietly combine units sold with the number of orders placed.",
      ]),
      section("stock-cover","Calculate stock cover with explicit assumptions",[
        "Stock cover estimates how long current sellable units would last at a chosen sales rate. In an illustrative example, 12 units sold over six days gives a rate of two units per day. With 80 sellable units, that rate implies 40 days of cover, before considering reservations or changes in demand.",
        "Treat that figure as an estimate, not a promise. If the rate is zero, do not invent a finite number of days. Review slow-moving stock separately and ask whether the observation period, listing quality or product positioning explains the lack of demand.",
      ]),
      section("reorder-point","Include supplier lead time and a reasoned buffer",[
        "A basic reorder point combines expected demand during replenishment lead time with safety stock. At two units per day, a seven-day lead time uses 14 units. Adding six buffer units gives an illustrative reorder point of 20 units. The buffer should reflect your supply variability and service expectations.",
        "Confirm how the supplier defines lead time: production start, dispatch or arrival at your location. Include any relevant quality checks before units become sellable. An inexpensive purchase can still tie up cash if its delivery schedule does not match the rate at which stock is needed.",
      ]),
      section("weekly-routine","Separate stock movements before buying again",[
        "Choose a regular review day and reconcile physical sellable stock with recorded movements. Keep damaged units, returned items awaiting inspection and unresolved parcels distinct. A return does not become available inventory until your team has received, checked and approved it for resale.",
        "For COD, distinguish an order being placed, dispatched, delivered and financially settled. Use the appropriate operational evidence when forecasting. Keep a note of each reorder decision and its assumptions so you can improve the process without rewriting historical records.",
      ]),
    ],
    [faq("Is a reorder point the same as a purchase quantity?","No. The reorder point indicates when to review replenishment. Purchase quantity also depends on demand, supplier minimums, cash and storage."),
      faq("Can I treat every returned parcel as available stock?","No. Receive and inspect it first. Damaged, missing or otherwise unsuitable units must not be counted as sellable.")],
    ["cash-on-delivery-and-rto-workflow","lebrands-store-catalogue-and-variants"],
    "An inventory ledger with stock-cover bars, a reorder threshold and separate return-inspection bins"),

  article("transactional-emails-customer-retention",
    "Use order emails to build trust after checkout",
    "Make D2C order emails clear and useful with accurate totals, payment status, order links, support details and respectful marketing preferences.",
    "Customer experience",
    "The first email after a purchase should remove uncertainty. It should tell a customer what happened, what they bought and what to do next, without confusing an order confirmation with a promotional campaign.",
    ["Match email totals and payment language to the actual order.","Make the next action and support contact easy to find.","Separate essential order messages from optional marketing consent."],
    [
      section("confirmation-facts","Lead with the facts a buyer needs",[
        "A useful confirmation includes the order identifier, items, selected options, quantities and the payable total. Show delivery charges, applied discounts and tax treatment consistently with the order record. The email should not silently recalculate an old order using today's product price or offer configuration.",
        "Use payment language precisely. A cash-on-delivery order can be confirmed without an online payment having been taken. A payment still awaiting verification should not be described as paid. Clear status language prevents unnecessary support questions and avoids creating a misleading record for the buyer.",
      ]),
      section("next-action","Give the customer one clear next step",[
        "Make the order or tracking link easy to identify and ensure it opens the correct store context. If there is no confirmed delivery estimate, do not create one for the sake of a polished template. Tell customers how to contact support and what information helps the team locate their purchase.",
        "Keep support details current across the website, policy pages and messages. A reply address that nobody monitors undermines an otherwise professional email. Decide who handles replies and how the team recognises a genuine order enquiry before sending a large volume of notifications.",
      ]),
      section("readable-template","Design for a small screen and an imperfect inbox",[
        "Put the main message in text, not only inside a large image. Use readable type, clear contrast and a logical order for item details and totals. Product images can provide recognition, but the message must remain understandable when an email client blocks images.",
        "Test representative long names, multiple line items and discounted totals. Keep the sender name recognisable and the subject specific to the message. An order confirmation does not need exaggerated urgency, unrelated banners or unsupported claims about how quickly the parcel will arrive.",
      ]),
      section("consent-and-learning","Respect preferences and improve from real questions",[
        "Do not treat an email supplied for checkout as blanket permission for promotions. Explain optional communications separately and provide a genuine way to change those preferences. Essential order or security messages serve a different purpose from newsletters and should not be presented as if all communication can be switched off.",
        "Review recurring support questions after customers receive notifications. If buyers regularly ask whether COD was charged online, change the payment explanation. If they cannot locate the order link, simplify the hierarchy. Improve useful information before adding promotional content to the same message.",
      ]),
    ],
    [faq("Does a verified checkout email mean marketing consent?","No. Verifying an email establishes access to that address for the checkout flow; promotional consent is a separate decision."),
      faq("Should a COD confirmation say payment successful?","No. State that the order is confirmed for cash on delivery and that no online payment has been taken.")],
    ["checkout-trust-and-verified-email","lebrands-store-checkout-and-order-experience"],
    "A recognisable order email showing item details, COD status, a tracking button and a separate preferences link"),

  article("shipping-and-returns-policy-d2c",
    "Write shipping and returns policies your team can honour",
    "Turn D2C shipping, cancellation and return rules into practical customer-facing policies with clear timelines, exceptions and support instructions.",
    "Business essentials",
    "A policy is an operating commitment. Before polishing the wording, confirm what your team can actually deliver, which timelines apply and how customers can ask for help when an order does not follow the expected path.",
    ["Separate processing time, transit estimates and delivery commitments.","Describe return eligibility, request steps and refund handling clearly.","Review policy drafts against actual operations and applicable consumer rights."],
    [
      section("delivery-scope","Define the delivery promise before writing it",[
        "List the destinations you can serve, the handling time before dispatch and the source of any transit estimate. These are different parts of the delivery journey. A supplier's packing time is not a carrier's transit time, and neither should be presented as a guaranteed arrival date without a valid commitment.",
        "Explain charges and any order-value conditions clearly before checkout. If certain products need extra preparation or cannot travel to particular destinations, say so near the purchase decision. Do not advertise free delivery while hiding a compulsory handling charge in a later step.",
      ]),
      section("return-eligibility","Make return eligibility specific and understandable",[
        "State the request window, the condition in which a product must be returned and the evidence needed for a damaged or incorrect item. Avoid vague phrases such as returns accepted subject to approval without explaining the criteria. Treat hygiene, customisation and perishability restrictions carefully and obtain appropriate legal advice.",
        "Explain how a customer starts a request and how support will respond. Do not imply that a business policy overrides statutory consumer rights. If an exception applies to one category, identify that category rather than applying an unexplained blanket exclusion to every purchase.",
      ]),
      section("cancellation-refunds","Connect cancellation and refunds to operational states",[
        "A cancellation before packing can require a different process from a parcel already handed to a carrier. Explain the available request route and the point at which a different return process applies. Do not describe a request as automatically accepted unless the actual workflow supports that promise.",
        "For refunds, distinguish business review, refund initiation and the payment provider's processing time. State a supported method and a realistic timeline rather than inventing an instant-credit guarantee. COD refunds also need an agreed way to collect the necessary payout information securely.",
      ]),
      section("policy-review","Check the policy against a real order scenario",[
        "Walk through a delayed parcel, a wrong item, a change-of-mind request and an unsuccessful delivery. Ask who owns each action, what information the customer receives and how the team records the outcome. If support cannot follow the policy, revise the operation or the wording before publication.",
        "Use generated drafts as a starting point, not as legal approval. Replace generic statements with your actual business details and supported procedures. Keep an internal record of material policy changes so that your team can understand which terms a customer saw when placing an earlier order.",
      ]),
    ],
    [faq("Can I publish a generated policy without reviewing it?","A generated draft needs review against your business facts, actual fulfilment process and applicable law. It is not legal advice or approval."),
      faq("Should shipping time include processing time?","Explain both separately, then make any overall estimate clear. Customers should not have to infer when packing ends and transit begins.")],
    ["launch-checklist-indian-d2c-store","lebrands-store-verification-and-publication"],
    "A parcel route and return loop beside a policy checklist separating processing, delivery and refund steps"),
];
