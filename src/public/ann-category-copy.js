import { TAXONOMY } from "./aura-taxonomy-data.js";

// Preview-only examples. Never ingredient, efficacy, certification or policy claims.
const RANGES = {
  1: ["Everyday essentials", "New perspectives", "The signature edit"],
  2: ["Daily essentials", "Your daily ritual", "Discover something new"],
  3: ["Everyday pieces", "Occasion edit", "Finishing touches"],
  4: ["Everyday living", "Considered spaces", "Finishing touches"],
  5: ["Everyday technology", "Work and create", "Useful accessories"],
  6: ["Everyday favourites", "Explore new flavours", "The pantry edit"],
  7: ["Everyday movement", "Your routine", "Time to unwind"],
  8: ["Everyday care", "Explore the range", "Useful essentials"],
  9: ["Little everyday moments", "Play and discover", "Useful essentials"],
  10: ["Everyday companions", "Playtime favourites", "Care essentials"],
  11: ["Work and create", "Everyday supplies", "New inspiration"],
  12: ["Everyday projects", "Useful tools", "Explore the range"],
  13: ["Discover the collection", "Everyday inspiration", "New additions"],
  14: ["New discoveries", "The considered edit", "Find your next favourite"],
  15: ["Everyday celebrations", "Thoughtful gestures", "Special occasions"],
  16: ["Objects with character", "The everyday edit", "A closer look"],
  38: ["Everyday adventures", "Explore outdoors", "Useful equipment"],
};
const SKINCARE = ["Daily cleanser", "Everyday moisturiser", "Daily routine serum", "Face care mask", "Evening care cream", "Travel skincare set"];
const ESC = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function annCategoryContext(config = {}) {
  const category = TAXONOMY.categories.find(c => c.id === Number(config.category_id));
  if (!category) return null;
  const subcategory = TAXONOMY.subcategories.find(s => s.id === Number(config.subcategory_id) && s.category_id === category.id);
  return { category, subcategory, topic: (subcategory?.name || category.name).trim() };
}

/** Receives the already cloned preview; no changes to merchant data or image bytes. */
export function applyAnnCategoryCopy(data, config = {}, { sectionsOnly = false } = {}) {
  const ctx = annCategoryContext(config);
  if (!ctx || !data.style_demo) return null;
  const style = config.theme?.style_preset || "editorial";
  const contemporary = ["social-pop", "creator-feed", "proof-detail"].includes(style);
  // Preserve established menswear copy in the original five designs.
  if (!contemporary && ctx.category.id === 1 && (!ctx.subcategory || ctx.subcategory.slug === "mens-clothing")) return ctx;
  const topic = ctx.topic, lower = topic.toLowerCase(), skin = ctx.subcategory?.slug === "skincare";
  const titles = skin ? {
    editorial: "Everyday rituals. Thoughtfully chosen.", boutique: "Make room for a little care.",
    architectural: "Build your daily ritual.", minimal: "Skincare. Simply considered.", vintage: "A little care. Every day.",
    "social-pop": "Your routine. A little more you.",
    "creator-feed": "Skincare, in your everyday.",
    "proof-detail": "Skincare. Know what you choose.",
  } : {
    editorial: `${topic}, thoughtfully chosen.`, boutique: `Find your kind of ${lower}.`,
    architectural: `${topic}. Your point of view.`, minimal: `${topic}. Simply considered.`,
    vintage: `A fresh perspective on ${lower}.`,
    "social-pop": `${topic}. Good finds, your way.`,
    "creator-feed": `See ${lower} in your day.`,
    "proof-detail": `${topic}. Know the details.`,
  };
  const introduction = skin
    ? "Explore cleansers, moisturisers and serums, and find the starting point for your own daily skincare ritual."
    : `Explore a considered selection of ${lower}. Discover everyday favourites, compare the details and find what works for you.`;
  const voice = {
    "social-pop": {
      kicker: `Fresh perspective. Same you.`,
      description: skin ? "Your skincare shelf, your call. Explore cleansers, moisturisers and serums, then find the steps that fit your day." : `Meet your next ${lower} favourites. Take a closer look, find your kind of thing and make it yours.`,
      button: "Find your favourites", products: "Your next good find", collections: "Find your kind of thing", about: `Your kind of ${lower}.`,
      statement: `Your day. Your taste. Your kind of ${lower}.`,
    },
    "creator-feed": {
      kicker: "Less scrolling. More finding.",
      description: skin ? "A closer look at everyday skincare. Browse the products, explore the details and picture your own routine." : `A closer look at ${lower}, from the little details to the bigger picture. See what fits your everyday.`,
      button: "Take a closer look", products: "Seen something you like?", collections: "Explore the stories", about: `A closer look at ${lower}.`,
      statement: `A little inspiration for the way you use, wear or enjoy ${lower}.`,
    },
    "proof-detail": {
      kicker: "The details make the difference.",
      description: skin ? "Explore the skincare range. Review each product's ingredients, directions and verified details before choosing." : `Explore ${lower} with the information that matters. Compare product details, check the specifications and choose what suits your needs.`,
      button: "Explore the details", products: "Compare the details", collections: "A clear view of the range", about: `${topic}, clearly explained.`,
      statement: `A clearer way to explore ${lower}.`,
    },
  }[style];
  const description = voice?.description || introduction;
  if (voice) data.showcase_voice = { products: voice.products, collections: voice.collections, about: voice.about };
  const groups = skin ? ["Cleanse & prepare", "Daily skincare", "Evening rituals"] : RANGES[ctx.category.id] || ["Everyday favourites", "Explore the range", "New discoveries"];
  data.ann_category_copy_applied = true;
  data.showcase_topic = topic;
  if (!sectionsOnly) {
  data.settings.tagline = titles[style] || titles.editorial;
  data.settings.description = description;
  for (const [i, collection] of (data.collections || []).entries()) {
    if (data.showcase_media_exact) continue;
    collection.title = groups[i % groups.length];
    collection.description = `Discover ${lower} in ${collection.title.toLowerCase()}. Explore the selection and check each product's details before choosing.`;
  }
  for (const [i, product] of (data.products || []).entries()) {
    if (data.showcase_media_exact) continue;
    product.title = skin ? SKINCARE[i % SKINCARE.length] : `${topic} ${["everyday edit", "signature selection", "discovery pick", "daily favourite", "new perspective", "essentials selection"][i % 6]}`;
    product.description = `Explore ${product.title.toLowerCase()} as part of your ${lower} collection. Replace this sample with the product's verified description, specifications and usage information.`;
    product.tags = [lower];
    product.content = {};
  }
  }
  const questions = [
    { question: `How do I choose from the ${lower} range?`, answer: `<p>Compare the information on each product page and choose what suits your needs. Ask the brand if you need more detail.</p>` },
    { question: skin ? "Where can I find ingredients and directions?" : "Where can I find product specifications?", answer: "<p>Read the product's verified information and the instructions on its packaging before use. Sample preview text is not a product specification.</p>" },
    { question: "What should I know before ordering?", answer: "<p>Check the store's published delivery, payment and returns information before placing an order.</p>" },
  ];
  for (const layout of Object.values(data.layouts || {})) for (const section of layout) {
    const s = section.settings ||= {};
    switch (section.type) {
      case "hero": Object.assign(s, { kicker: voice?.kicker || `The ${topic} edit`, title: titles[style] || titles.editorial, description, button_label: voice?.button || `Explore ${lower}` }); break;
      case "statement": s.text = voice?.statement || `Make room for ${lower} that fits your everyday.`; break;
      case "announcement": s.text = `Explore the ${lower} collection`; break;
      case "featured-collection":
      case "featured-collections": s.title = voice?.collections || `Explore ${lower}`; break;
      case "featured-products": s.title = voice?.products || (skin ? "Your skincare starting points" : `The ${lower} edit`); break;
      case "spotlight": s.kicker = `Discover ${lower}`; break;
      case "lookbook":
        Object.assign(s, { kicker: "Find your inspiration", title: skin ? "Build your own ritual" : `Everyday ${lower}` });
        (section.blocks || []).forEach((b, i) => Object.assign(b.settings, { title: groups[i % groups.length], text: `<p>Explore the ${ESC(lower)} collection and discover your own favourites.</p>`, label: "Explore the range" })); break;
      case "craft":
        Object.assign(s, { kicker: "A closer look", title: skin ? "The details behind your daily care" : `Discover the details of ${lower}` });
        (section.blocks || []).forEach(b => { b.settings.caption = "Sample photograph. Replace with your own product and detail images."; }); break;
      case "founder": Object.assign(s, { kicker: "Behind the brand", name: "Your brand story", story: `<p>Introduce your approach to ${ESC(lower)}. Share the real experiences, decisions and people behind your brand, and replace this sample portrait with your own.</p>` }); break;
      case "faq": s.title = `Questions about ${lower}`; section.blocks = questions.map((q, i) => ({ id: `${section.id}-q${i}`, type: "item", settings: { ...q } })); break;
      case "material-care": Object.assign(s, { kicker: "Know your product", title: skin ? "Ingredients & storage" : "Product details & care", body: "<p>Add verified specifications, packaging information and care or storage directions for this product. Follow the manufacturer's instructions.</p>" }); break;
      case "size-guide": Object.assign(s, { kicker: "Find your format", title: "Sizes & formats", heading_a: "Option", heading_b: "Product information", note: "<p>Add the verified sizes, quantities or formats available for this product.</p>" }); section.blocks = []; break;
      case "how-to-use":
        Object.assign(s, { kicker: "Your everyday routine", title: skin ? "Making skincare part of your day" : `Using your ${lower} selection` });
        section.blocks = [{ id: `${section.id}-use`, type: "item", settings: { title: "Start with the product directions", text: "Read the instructions supplied with the product. Add verified product-specific usage guidance here." } }]; break;
      case "collection-description": s.title = `About this ${lower} collection`; s.body = `<p>${ESC(description)}</p>`; break;
      case "collection-heading": Object.assign(s, { kicker: `The ${topic} edit`, intro: description }); break;
      case "related-products": s.title = `More ${lower} to explore`; break;
      case "related-collections": s.title = "Keep exploring"; break;
    }
  }
  return ctx;
}
