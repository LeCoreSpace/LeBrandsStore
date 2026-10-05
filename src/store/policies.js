const definitions = [
  ["privacy", "Privacy Policy", "We use information you provide to respond to enquiries and fulfil orders when ordering becomes available. We share only the information necessary with service providers. Contact us for access, correction or deletion requests. The business must review its actual retention, security and processing practices before publication."],
  ["terms", "Terms & Conditions", "Product descriptions and prices should be checked before purchase. Our products and services are subject to availability and applicable Indian law. These terms must be reviewed for the business's actual sale conditions, dispute handling and consumer rights."],
  ["shipping", "Shipping Policy", "Checkout and ordering are not yet available on this website. Before accepting orders, the business must specify dispatch times, delivery regions, shipping charges and handling of delays or lost parcels. Contact support for current delivery information."],
  ["cancellation-refund", "Cancellation & Refund Policy", "Checkout and ordering are not yet available. Before accepting orders, the business must specify cancellation windows, eligible returns, refund timelines and exceptions. Statutory consumer rights remain applicable. Contact support for assistance."],
  ["contact", "Contact Us", "For product questions or business enquiries, use the support details above. The business must confirm these channels are monitored and provide its actual support hours before publication."],
  ["pricing", "Pricing Policy", "All product prices are in Indian rupees and include applicable GST. Compare-at prices, where displayed, are reference prices. Checkout and ordering are not yet available. The business must disclose any additional shipping or other charges before accepting orders."],
];
export function generatePolicies(data) {
  const s = data.settings;
  const details = `${s.brand_name}\nOperated by ${s.legal_name}\n${s.address}\nSupport: ${s.support_email} | ${s.support_phone}${s.gstin ? `\nGSTIN: ${s.gstin}` : ""}`;
  return definitions.map(([kind, title, text]) => ({
    kind, title, body: `${title}\n\n${details}\n\n${text}`, reviewed: false,
  }));
}
