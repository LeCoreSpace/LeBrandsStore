import {article,section,faq} from "./blog-helpers.js";

export const ANN_GUIDES=[
  article("ann-theme-styles-and-inline-editing",
    "Make your store look like your brand with Ann's themes and inline editor",
    "Choose an Ann theme style, refine typography and colours, and edit storefront text inline while keeping a consistent LeBrands.Store buying experience.",
    "Inside LeBrands.Store",
    "Ann connects the first design decision to the words shoppers actually read. Choose a visual direction, preview its effect and refine individual text elements without treating every change as a separate design project. A recognisable store comes from consistent choices, not simply a dramatic homepage.",
    ["Compare theme styles using the same sample catalogue, then review your actual store.","Use global colours and typography for consistency, and inline controls for deliberate exceptions.","Check the saved design on mobile, including the merchant-themed frame around commerce pages."],
    [
      section("choose-a-style","Choose a theme for the way your brand communicates",[
        "Ann offers distinct visual directions rather than a single layout with interchangeable colours. Editorial uses expressive typography and magazine-like compositions. Modern Boutique balances contemporary retail details. Bold Architectural emphasises strong grids and sharp edges, while Minimal gives products room within a quieter visual treatment.",
        "Other choices, including Vintage, Social Pop, Creator Feed and Proof & Detail, support different presentation priorities. Begin with the tone of your actual range: considered product information, visual storytelling, a heritage identity or an energetic assortment. Choose a direction you can sustain across product imagery, collection introductions and customer-facing copy.",
      ]),
      section("compare-the-preview","Compare styles without confusing sample products with your catalogue",[
        "The style showcase uses consistent sample content across styles so that layout differences are easier to judge. Look at image proportions, heading hierarchy, the spacing between sections and the prominence of useful actions. A good comparison holds the content steady instead of changing the products and design at the same time.",
        "Switch to your actual-store preview before judging whether the design works for launch. Real product titles can be longer, images can have different backgrounds and your range may contain fewer collections than a sample. Illustrative prices and products help demonstrate a style; they are not evidence that those items belong to your store.",
      ]),
      section("global-design","Set a consistent foundation with colours and typography",[
        "Use the theme's colour and typography choices to establish the default appearance. Decide which colour identifies primary actions, how headings differ from body copy and whether the overall tone should feel restrained or expressive. Those decisions should work together rather than competing for attention in every section.",
        "Keep text readable against its actual background, particularly over photography and on a narrow screen. A subtle brand palette still needs sufficient contrast. Before making many local changes, check whether adjusting the shared typography or colour choice solves the problem more consistently across the saved design.",
      ]),
      section("inline-formatting","Edit the text where the design needs refinement",[
        "Ann and the theme editor share an inline text-formatting experience. Open an editable text element to change its content and use the available controls for font, size, emphasis, alignment and colours. The editor can format a selected passage, or the text as a whole when nothing is selected.",
        "Use local formatting to create a clear reading hierarchy, not to make every phrase look different. Keep body text comfortable to read and reserve strong emphasis for information that genuinely matters. Review the words as well as their appearance: a shorter, specific product statement can communicate more than an oversized generic slogan.",
      ]),
      section("saved-design","Review the saved design as one customer experience",[
        "Continue from the saved theme rather than treating each editing session as a fresh design. Check the homepage and the surrounding merchant-themed header and footer on product, checkout and confirmation pages. The shared commerce body keeps the buying steps recognisable while your brand identity frames that journey.",
        "Before publishing, review the result on a phone as well as a desktop screen. Look for awkward title wrapping, low-contrast copy, oversized section headings and buttons whose wording is unclear. Saving visual changes and completing publication checks remain distinct actions, so use the final review to verify the real catalogue and business details too.",
      ]),
    ],
    [faq("Can I change text styling without replacing my theme?","Yes. The shared inline editor lets you refine editable text and its supported formatting while retaining the saved theme."),
      faq("Does the style showcase display my real products?","The showcase uses illustrative sample content. Use the actual-store preview to inspect your own catalogue and saved design.")],
    ["ann-multilingual-conversations-and-gst-verification","lebrands-store-ann-builder-guide","lebrands-store-checkout-and-order-experience"],
    "Distinct storefront theme cards above a shared inline editor with typography, alignment and colour controls"),

  article("ann-multilingual-conversations-and-gst-verification",
    "Build in your language with Ann and verify your GST details",
    "Use Ann in English, Hindi, Tamil, Marathi or Telugu, and verify an Indian GSTIN with returned business details and explicit invoice-identity confirmation.",
    "Inside LeBrands.Store",
    "A founder should be able to understand the setup conversation without losing accuracy in business records. Ann combines multilingual guidance with an automatic GST verification workflow for Indian GST-registered businesses, while keeping the merchant's legal identity and confirmation decisions separate from the language used to explain them.",
    ["Choose English, Hindi, Tamil, Marathi or Telugu for Ann's conversation.","Verify your GSTIN and review the returned legal business and address details.","Treat GST verification, invoice-identity confirmation and business-document approval as distinct checks."],
    [
      section("conversation-language","Use the language that makes the decisions clearest",[
        "Ann's language selector supports English, Hindi, Tamil, Marathi and Telugu. Choose the language in which instructions and questions are easiest to understand, especially when reviewing business details or deciding how the store should be presented. The aim is clearer participation in the setup conversation, not simply translating a welcome message.",
        "Keep the actual store content appropriate for your customers. The language of Ann's guidance is a different choice from the wording of a product description, the legal business name or an address. Switching the conversation language should not silently rewrite records that the merchant entered or confirmed.",
      ]),
      section("business-country","Keep registration context separate from language",[
        "A conversation language does not determine the business's registration country. Ann uses the business country to identify the relevant registration context and evidence. A Tamil-speaking founder and a Hindi-speaking founder can be registering the same type of Indian business; the language choice does not change their tax identity.",
        "For an Indian GST-registered business, use the GSTIN associated with the actual supplier identity. Do not use a convenient number belonging to another organisation just to complete a form. Other registration contexts need their own appropriate business information rather than a copied Indian identifier.",
      ]),
      section("automatic-verification","Verify the GSTIN and inspect the returned details",[
        "Ann's GST flow checks the entered GSTIN and retrieves the business details returned by the verification service. This helps the merchant work from registration evidence instead of manually retyping an assumed legal name. Review the full identifier carefully, including its state information and the details associated with that registration.",
        "Automatic retrieval is valuable because it makes mismatches visible. Compare the returned legal business name and registered address with the identity that should appear on the store's financial documents. If the evidence does not describe your business correctly, investigate the discrepancy rather than confirming an identity simply because the format looks valid.",
      ]),
      section("identity-confirmation","Confirm the invoice identity deliberately",[
        "After verification, review and explicitly confirm the business identity and invoice address. These are consequential records, not ordinary marketing copy. A brand name displayed to shoppers may differ from its registered legal name; the distinction should remain understandable in the business details and customer-facing policies.",
        "A confirmed invoice identity is protected from casual design edits. Changing Ann's language, adjusting a headline or replacing a logo does not authorise changing that identity. Where a genuine correction is needed, use the appropriate business-details process instead of trying to relabel legal information through the theme editor.",
      ]),
      section("document-review","Understand what each verification decision proves",[
        "GST verification concerns the tax registration and returned supplier details. Business-document review examines the submitted registration evidence through its own approval process. Security screening of an uploaded file is another separate safeguard. None of these events should be mistaken for all the others being complete.",
        "Use the final store review to check the business evidence, confirmed details, support contacts, policy drafts and real catalogue together. Ann can guide that review in the selected conversation language, but the merchant still owns the accuracy of the submitted facts. Consult a qualified professional when registration or invoicing obligations need advice specific to the business.",
      ]),
    ],
    [faq("Does changing Ann's language translate my GST identity?","No. The conversation language is separate from the legal name, GSTIN, registered address and confirmed invoice identity."),
      faq("Does automatic GST verification replace business-document approval?","No. GST verification and manual business-document approval have different purposes. Both must satisfy the applicable publication checks.")],
    ["ann-theme-styles-and-inline-editing","lebrands-store-verification-and-publication","gst-invoices-for-indian-online-stores"],
    "Five conversation bubbles connected to GST business details, explicit identity confirmation and separate document checks"),
];
