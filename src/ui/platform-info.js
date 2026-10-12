// Platform facts already published in the project. No invented contact details.
export const PLATFORM_COMPANY = "LeBrandsSpace Digital Private Limited";
export const PLATFORM_LOCATION = "Chennai, India";
export const PLATFORM_EMAIL = "support@lebrands.store";
const email = `<a href="mailto:${PLATFORM_EMAIL}">${PLATFORM_EMAIL}</a>`;

export const PLATFORM_INFO = {
  terms: {
    title: "Terms of service",
    description: "How LeBrands.Store works, and the responsibilities of brands using the platform.",
    sections: [
      { title: "The platform", paragraphs: [
        `LeBrands.Store is operated by ${PLATFORM_COMPANY}, based in ${PLATFORM_LOCATION}. It provides storefront, catalogue, order, customer and GST invoicing software for independent Indian brands.`,
        "These terms concern the LeBrands.Store platform. A purchase from a brand's store is a transaction with that brand, not a purchase of goods from LeBrands.Store.",
      ] },
      { title: "Accounts and publication", paragraphs: [
        "Provide accurate account and business information, protect your sign-in details, and give access only to people authorised to work for your brand.",
        "A valid GSTIN is required to publish a store. First publication requires platform approval. You are responsible for keeping business details, products and policies accurate.",
      ] },
      { title: "Your products and customers", paragraphs: [
        "The brand is the seller of its products and is responsible for product descriptions, prices, stock, fulfilment, customer service, returns and applicable taxes.",
        "Only upload material you own or have permission to use. Your store must comply with applicable law and display accurate customer-facing policies.",
        "You are responsible for your use of customer information and for obtaining any permissions required for that use.",
      ] },
      { title: "Pricing, payments and integrations", paragraphs: [
        'LeBrands.Store markets zero commission on sales. Platform subscription pricing is being finalised; contact us through the <a href="/pricing">pricing page</a> for the terms applicable to your brand.',
        "Cash on delivery is available. Razorpay payments with your own account and logistics partner integrations can be discussed with the team. Payment and logistics providers have their own terms and may charge their own fees.",
        "Do not assume that an integration is connected until its setup has been confirmed for your store.",
      ] },
      { title: "Responsible use", paragraphs: [
        "Do not use the platform for unlawful products, misleading listings, infringement, unauthorised access or interference with another store. Do not share another person's private information without an appropriate basis.",
        "Report suspected account compromise or a platform problem to the support team. Never send passwords or API keys by email.",
      ] },
      { title: "Support and questions", paragraphs: [
        `For questions about the platform or these terms, contact ${email}. Include your brand name and store address so the team can identify the relevant account.`,
        'For information about personal data, read the <a href="/privacy">Privacy policy</a>. For help with a purchase, contact the seller using that store\'s contact details.',
      ] },
    ],
  },
  privacy: {
    title: "Privacy policy",
    description: "The information handled by LeBrands.Store and how it supports your account and store.",
    sections: [
      { title: "Who operates LeBrands.Store", paragraphs: [
        `${PLATFORM_COMPANY}, based in ${PLATFORM_LOCATION}, operates the platform. For privacy questions or requests, email ${email}.`,
      ] },
      { title: "Information handled", paragraphs: [
        "Information depends on the features you use and the details supplied by you or your store's customers.",
      ], items: [
        "Account information, including names, email addresses and authentication information.",
        "Business and store information, including brand details, GSTIN, business addresses, settings and uploaded media.",
        "Customer and order information, including names, phone numbers, email addresses where supplied, delivery addresses, purchases and invoice records.",
        "Technical and security information associated with requests, sessions and misuse prevention.",
        "Information you include when contacting the support team.",
      ] },
      { title: "How information is used", paragraphs: [
        "Information is used to operate accounts and storefronts, manage products and orders, maintain customer records, create invoices, support users and protect the service from misuse.",
        "Business registration details may be checked when business verification is used. We do not market to your store's customers.",
      ] },
      { title: "Access and service providers", paragraphs: [
        "Store information is accessible to the people authorised to manage that store. Platform staff may access information where needed for support, review, security or operation of the service.",
        "Cloudflare supports hosting and file delivery, and Supabase supports database storage. Business-verification services may process registration details where verification is used.",
        "Services connected by a brand, including payment or logistics providers, are also subject to those providers' terms and privacy notices.",
      ] },
      { title: "Sessions and security", paragraphs: [
        "The account service uses session cookies for sign-in. Storefront functions and display preferences can use browser storage. Security checks may process technical request information to help prevent abuse.",
        "Passwords are stored as hashes rather than plaintext. Access controls separate stores and restrict account functions to authorised users.",
      ] },
      { title: "Retention and requests", paragraphs: [
        "Information is retained as needed to operate the service and meet applicable accounting, tax, security and legal requirements. Invoice or audit records may need to be retained even when another record is corrected or removed.",
        `To request access, correction or deletion, contact ${email} from your account email address. The team may need to verify your identity and explain any records that must be retained.`,
      ] },
      { title: "Purchases from a brand", paragraphs: [
        "Each brand is responsible for its own use of customer information and its customer-facing privacy policy. Contact the seller for questions about a purchase or that brand's marketing.",
        "For a platform privacy concern, include the store address and a description of the issue. Do not include passwords, payment credentials or unnecessary personal information.",
      ] },
    ],
  },
  contact: {
    title: "Contact",
    description: "Reach the LeBrands.Store team about your account, your store or a business enquiry.",
    sections: [
      { title: "Company details", paragraphs: [
        `<strong>Company:</strong> ${PLATFORM_COMPANY}`,
        `<strong>Location:</strong> ${PLATFORM_LOCATION}`,
        `<strong>Email:</strong> ${email}`,
      ] },
      { title: "Accounts and store support", paragraphs: [
        `Email ${email} with your brand name, store address and a description of the issue. For account-related requests, use the email address registered to your account.`,
        'Visit <a href="/support">Support</a> for guidance on sign-in, setup, orders and invoices. Never send your password or API keys.',
      ] },
      { title: "Business and integrations", paragraphs: [
        `For pricing, Razorpay or logistics integration enquiries, contact ${email}. Include your brand name, the provider you want to use and what you need help setting up.`,
      ] },
      { title: "Help with a purchase", paragraphs: [
        "For delivery, product, return or refund questions, contact the brand using the details shown on its store or order documentation. The brand is the seller and handles those requests.",
      ] },
    ],
  },
  support: {
    title: "Support",
    description: "Practical help for brands using LeBrands.Store.",
    sections: [
      { title: "Contact support", paragraphs: [
        `Write to ${email}. Include your brand name, store address, the page or action involved, and the error message if one is shown.`,
        "For account issues, contact us from your registered email address. Never send passwords, API keys or payment credentials.",
      ] },
      { title: "Signing in", paragraphs: [
        '<a href="https://app.lebrands.store/login">Sign in to your account</a> using your registered email address. If you cannot sign in, contact support with that email address and your store address.',
      ] },
      { title: "Setting up and publishing", paragraphs: [
        "Check your brand details, products, business address, GSTIN and settings before publishing. A valid GSTIN is required and first publication requires platform approval.",
        "If your store is awaiting approval or shows a setup error, include the store address and the status or message shown when contacting support.",
      ] },
      { title: "Orders and invoices", paragraphs: [
        "Use your account dashboard to manage products, customers, orders and invoices. When reporting an issue, include the order or invoice number and the action you were trying to complete.",
        "Do not include unnecessary customer information in your first support message.",
      ] },
      { title: "Privacy and account requests", paragraphs: [
        `Send privacy, correction or deletion requests to ${email} from your account email address. See the <a href="/privacy">Privacy policy</a> for details.`,
      ] },
      { title: "Customers buying from a store", paragraphs: [
        "Contact the brand directly for product questions, deliveries, returns and refunds. Its contact details and policies are shown on its store. Contact LeBrands.Store for a technical problem with the platform.",
      ] },
    ],
  },
};
