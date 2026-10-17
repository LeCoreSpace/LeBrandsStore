import { PLATFORM_COMPANY, PLATFORM_EMAIL, PLATFORM_INFO } from "./platform-info.js";

// Confirmed production domain in root wrangler.jsonc, not the preview origin.
export const PLATFORM_ORIGIN = "https://lebrands.store";
export const PLATFORM_DESCRIPTION = "Build an online store for your Indian D2C brand with product catalogues, COD orders, customer records and GST invoices. Zero sales commission.";
export const PUBLIC_PLATFORM_PATHS = ["/", "/pricing", "/compare", "/terms", "/privacy", "/contact", "/support"];
export const ACCOUNT_ROBOTS = "User-agent: *\nDisallow: /\n";

// One source for both the visible, server-rendered answers and FAQ schema.
export const PLATFORM_FAQ = [
  ["Do you take a commission?", "No. LeBrands.Store takes no commission on your sales."],
  ["Do I need GST registration?", "Yes. A valid GSTIN is required to publish. Your brand remains responsible for accurate business details and applicable taxes."],
  ["How do payments work?", "Set up Cash on Delivery and connect your brand’s own Razorpay account through your dashboard. Razorpay settles online payments to your brand’s account."],
  ["How do I set up delivery?", "Set up delivery through your dashboard. Connect your own Shiprocket account, or manage shipping manually and add tracking details for your orders."],
  ["Can I use my own domain?", "Yes. Your store starts at yourbrand.lebrands.store. You can connect your own custom domain through your dashboard by following the DNS setup and domain verification instructions."],
  ["Who owns my customer data?", "Your brand owns its customer data. We never market to your customers."],
  ["How long does setup take?", "Setup time varies with your product catalogue and business details. You complete a guided wizard, then first publication requires platform approval."],
];

const attribute = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

export function platformSeoHead({ canonical, title, description, includeImage = false }) {
  if (!canonical) return "";
  let url;
  try { url = new URL(canonical); } catch { return ""; }
  if (url.origin !== PLATFORM_ORIGIN || !PUBLIC_PLATFORM_PATHS.includes(url.pathname)) return "";
  const organization = `${PLATFORM_ORIGIN}/#organization`;
  const website = `${PLATFORM_ORIGIN}/#website`;
  const application = `${PLATFORM_ORIGIN}/#software`;
  const webpage = `${canonical}${url.pathname === "/" ? "/" : ""}#webpage`;
  const logo = `${PLATFORM_ORIGIN}/img/REPLACE-lebrands-light-transparent.png`;
  const marketing = url.pathname === "/" || url.pathname === "/pricing";
  const image = marketing ? `${PLATFORM_ORIGIN}/img/REPLACE-example-desktop.jpg` : logo;
  const imageAlt = marketing
    ? "Example Studio, a fictional clothing storefront concept built with LeBrands.Store"
    : "LeBrands.Store hanging-sign company logo";
  const graph = [
    {
      "@type": "Organization", "@id": organization, name: "LeBrands.Store",
      legalName: PLATFORM_COMPANY, url: PLATFORM_ORIGIN, logo, email: PLATFORM_EMAIL,
      address: { "@type": "PostalAddress", addressLocality: "Chennai", addressCountry: "IN" },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: PLATFORM_EMAIL },
    },
    {
      "@type": "WebSite", "@id": website, name: "LeBrands.Store", url: PLATFORM_ORIGIN,
      description: PLATFORM_DESCRIPTION, inLanguage: "en-IN", publisher: { "@id": organization },
    },
    {
      "@type": url.pathname === "/contact" ? "ContactPage" : "WebPage",
      "@id": webpage, url: canonical, name: title, description, inLanguage: "en-IN",
      isPartOf: { "@id": website }, publisher: { "@id": organization },
      about: { "@id": application },
    },
  ];
  if (url.pathname === "/") {
    graph.push({
      "@type": "SoftwareApplication", "@id": application, name: "LeBrands.Store",
      url: PLATFORM_ORIGIN, description: PLATFORM_DESCRIPTION,
      applicationCategory: "BusinessApplication", operatingSystem: "Web browser",
      provider: { "@id": organization },
      featureList: ["Online storefront and product catalogue", "Cash on Delivery orders", "Customer records", "GST invoices"],
    }, {
      "@type": "FAQPage", "@id": `${PLATFORM_ORIGIN}/#faq`, url: `${PLATFORM_ORIGIN}/#faq`,
      isPartOf: { "@id": webpage },
      mainEntity: PLATFORM_FAQ.map(([question, answer]) => ({
        "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    });
  } else {
    const name = url.pathname === "/pricing" ? "Pricing" : url.pathname === "/compare" ? "Compare platforms" : PLATFORM_INFO[url.pathname.slice(1)].title;
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "LeBrands.Store", item: PLATFORM_ORIGIN },
        { "@type": "ListItem", position: 2, name, item: canonical },
      ],
    });
  }
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph })
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<meta property="og:locale" content="en_IN">
  ${includeImage ? `<meta property="og:image" content="${image}"><meta property="og:image:width" content="${marketing ? 2880 : 900}"><meta property="og:image:height" content="${marketing ? 1800 : 320}"><meta name="twitter:card" content="summary_large_image">` : ""}
  <meta property="og:image:alt" content="${attribute(imageAlt)}">
  <meta name="twitter:title" content="${attribute(title)}">
  <meta name="twitter:description" content="${attribute(description)}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${attribute(imageAlt)}">
  <link rel="alternate" type="text/plain" href="${PLATFORM_ORIGIN}/llms.txt" title="LeBrands.Store information for AI assistants">
  <script type="application/ld+json">${json}</script>`;
}
