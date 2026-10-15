import { TAXONOMY } from "./aura-taxonomy-data.js";
import { safeImage } from "./aura-sections.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BASE = {
  1: ["wardrobe", ["Find your fit", "Fabric up close", "Wear and care"]],
  2: ["personal-care", ["Find your starting point", "Know the formula", "Make it a ritual"]],
  3: ["jewellery", ["Choose your size", "Materials and finishes", "Keep it beautiful"]],
  4: ["living", ["Picture it in your space", "Dimensions and materials", "Everyday care"]],
  5: ["technology", ["Check compatibility", "Explore the specifications", "Setup and support"]],
  6: ["food", ["Explore the flavour", "Ingredients and allergens", "Serving and storage"]],
  7: ["wellness", ["Choose for your routine", "Specifications and suitability", "Use and care"]],
  8: ["health-information", ["Read the product information", "Suitability and precautions", "Directions and storage"]],
  9: ["children", ["Age and sizing guidance", "Materials and care", "Safety information"]],
  10: ["pets", ["Choose for your companion", "Size and suitability", "Use and care"]],
  11: ["creative", ["Choose your essentials", "Materials and specifications", "Get started"]],
  12: ["automotive", ["Vehicle fit and compatibility", "Materials and specifications", "Installation and care"]],
  13: ["digital", ["Check compatibility", "What is included", "Licensing and setup"]],
  14: ["pre-owned", ["Inspect the condition", "What is included", "History and care"]],
  15: ["gifting", ["Choose the occasion", "Personal touches", "Packaging and presentation"]],
  16: ["craft", ["Meet the craft", "Materials and dimensions", "Care for your piece"]],
  38: ["outdoor", ["Find the right fit", "Equipment specifications", "Setup and maintenance"]],
};

// Families are deliberately category-bounded: a health product never inherits
// a beauty before/after panel merely because its slug mentions skin or hair.
function needs(subcategory) {
  const slug = subcategory.slug.toLowerCase(), category = subcategory.category_id;
  let [family, guides] = BASE[category] || ["product", ["Explore the details", "Choose your option", "Use and care"]];
  let comparison = false;
  const set = (next, headings, compare = false) => { family = next; guides = headings; comparison = compare; };
  if (category === 1) {
    if (/shoe|footwear|sneaker/.test(slug)) set("footwear", ["Find your shoe size", "Sole and construction", "Cleaning and care"]);
    else if (/bag|luggage|wallet/.test(slug)) set("carry", ["Choose your carrying capacity", "Compartments and dimensions", "Materials and care"]);
    else if (/accessor/.test(slug)) set("accessories", ["Style the finishing touch", "Sizing and materials", "Keep it looking its best"]);
  }
  if (category === 2) {
    if (/skincare|anti-aging|face-masks|eye-care|lip-care|sunscreen|natural-and-ayurvedic/.test(slug))
      set("skincare", ["Find your skin-type guidance", "Read the ingredient list", "Build your daily routine"], true);
    else if (/haircare|hair-color/.test(slug)) set("haircare", ["Choose for your hair type", "Ingredients and shade guidance", "Application and care"], true);
    else if (/makeup|nail/.test(slug)) set("colour-cosmetics", ["Explore shades and finishes", "Ingredients and product details", "Create your look"], true);
    else if (/fragrance/.test(slug)) set("fragrance", ["Explore the scent notes", "Concentration and format", "Wearing and storage"]);
    else if (/tools|appliance/.test(slug)) set("beauty-tools", ["Find your tool", "Settings and compatibility", "Cleaning and safe use"]);
    else if (/oral-care/.test(slug)) set("oral-care", ["Find your routine", "Ingredients and suitability", "Directions and precautions"]);
    else if (/shaving|grooming/.test(slug)) set("grooming", ["Choose your grooming routine", "Formula and skin guidance", "Application and care"]);
  }
  if (category === 3) {
    if (/watch/.test(slug)) set("watches", ["Case and strap sizing", "Movement and specifications", "Care and servicing"]);
    else if (/ring/.test(slug)) set("rings", ["Find your ring size", "Metal and stone details", "Care and gifting"]);
  }
  if (category === 4) {
    if (/storage|organization/.test(slug)) set("organisation", ["Plan your storage", "Capacity and dimensions", "Make room for everyday"], true);
    else if (/cleaning/.test(slug)) set("surface-care", ["Check surface suitability", "Directions and precautions", "Care for your space"], true);
    else if (/lighting|lamps/.test(slug)) set("lighting", ["Choose your room lighting", "Dimensions and electrical specifications", "Installation and care"], true);
    else if (/furniture/.test(slug)) set("furniture", ["Measure your space", "Materials and assembly", "Placement and care"]);
    else if (/bedding|linen|curtain|rug/.test(slug)) set("home-textiles", ["Measure for the right fit", "Weave and material details", "Washing and care"]);
    else if (/kitchen|tableware/.test(slug)) set("tableware", ["Set your everyday table", "Dimensions and materials", "Food-contact and care information"]);
    else if (/purifier|appliance|smart/.test(slug)) set("home-appliances", ["Check room and device compatibility", "Specifications and requirements", "Setup and maintenance"]);
  }
  if (category === 5 && /case|charger|cable|accessor/.test(slug))
    set("tech-accessories", ["Find your device fit", "Ports, power and dimensions", "Use and support"]);
  if ((category === 6 || category === 7) && /protein|supplement|vitamin|nutrition/.test(slug))
    set("nutrition-information", ["Read the nutrition label", "Ingredients and allergen information", "Serving directions and precautions"]);
  if (category === 6 && /coffee|tea|beverage/.test(slug)) set("beverages", ["Find your flavour profile", "Ingredients and origin information", "Preparation and storage"]);
  if (category === 9 && /toy|game/.test(slug)) set("play", ["Age-appropriate play", "Materials and what is included", "Safety and care"]);
  if (category === 10 && /groom|shampoo/.test(slug)) set("pet-grooming", ["Choose for coat and skin", "Ingredients and suitability", "Grooming instructions"], true);
  if (category === 10 && /food|treat|nutrition/.test(slug)) set("pet-nutrition", ["Species and life-stage guidance", "Ingredients and feeding information", "Storage and precautions"]);
  if (category === 12 && /car-care/.test(slug)) set("vehicle-care", ["Check the finish and surface", "Directions and precautions", "Maintain the finish"], true);
  if (category === 12 && /tools/.test(slug)) set("tools", ["Choose the right tool", "Specifications and attachments", "Safe use and care"]);
  if (category === 12 && /helmet|seat|boot|jacket|glove/.test(slug)) set("riding-fit", ["Choose your size and fit", "Read verified safety information", "Fitting and maintenance"]);
  if (category === 38 && /helmet|safety|protective/.test(slug)) set("cycling-safety", ["Find the correct fit", "Read verified safety specifications", "Fitting and replacement guidance"]);
  else if (category === 38 && /apparel|footwear/.test(slug)) set("cycling-fit", ["Choose your riding fit", "Fabric and construction", "Washing and care"]);
  return Object.freeze({
    id: `${category}:${subcategory.slug}`, category_id: category, slug: subcategory.slug,
    topic: subcategory.name, family, guides: Object.freeze([...guides]), comparison,
  });
}

// All 340 authoritative product subcategories receive a stable, scoped profile.
export const SUBCATEGORY_SECTION_PROFILES = Object.freeze(Object.fromEntries(
  TAXONOMY.subcategories.map(subcategory => [`${subcategory.category_id}:${subcategory.slug}`, needs(subcategory)]),
));
const DEFAULTS = {
  editorial: [1, "womens-clothing"], boutique: [2, "skincare"],
  architectural: [1, "mens-clothing"], minimal: [4, "home-decor"], vintage: [1, "bags-and-luggage"],
};

export function showcaseProfile(data = {}, style = "editorial") {
  const explicit = data.showcase_niche;
  if (explicit) {
    const profile = SUBCATEGORY_SECTION_PROFILES[`${Number(explicit.category_id)}:${explicit.slug}`];
    if (profile) return profile;
    const parent = TAXONOMY.categories.find(category => category.id === Number(explicit.category_id));
    if (parent) return needs({ category_id: parent.id, slug: parent.slug, name: parent.name });
  }
  const [category, slug] = DEFAULTS[style] || DEFAULTS.editorial;
  const exact = SUBCATEGORY_SECTION_PROFILES[`${category}:${slug}`];
  return exact || needs({ category_id: category, slug, name: style === "vintage" ? "Leather bags" : "The collection" });
}

const GUIDE_COPY = {
  skincare: ["Start with the product's stated skin-type guidance, rather than assuming every formula suits every routine.", "Read the verified ingredients and precautions on the product and its packaging. No ingredients or efficacy claims are invented in this preview.", "Follow the product's own usage instructions. Replace these sample notes with the brand's verified routine and precautions."],
  haircare: ["Compare the product's hair-type and shade guidance before choosing.", "Check the verified ingredient list, precautions and any testing instructions supplied by the brand.", "Use the product according to its published application instructions."],
  wardrobe: ["Compare your measurements with the product's own garment measurements and fit notes.", "Look for the verified composition, texture and construction details for each piece.", "Follow the care label. Add the brand's washing, drying and storage guidance here."],
  footwear: ["Compare your foot measurements with the product's size chart and fit notes.", "Check the product's stated upper, lining and sole materials.", "Follow the manufacturer's cleaning and storage guidance."],
  carry: ["Compare the stated dimensions with what you carry each day.", "Check the real pocket layout, closure and strap details before choosing.", "Follow the verified care guidance for the actual material and finish."],
  "health-information": ["Read the verified label and product information. This preview is not medical advice.", "Check the warnings and seek qualified professional guidance where appropriate.", "Follow only the manufacturer's or qualified professional's directions. No treatment outcomes are shown."],
  "nutrition-information": ["Compare the product's verified nutrition facts and serving information.", "Read the full ingredient list, allergens and relevant warnings.", "Follow the published directions and seek qualified guidance when needed. No health outcomes are implied."],
  furniture: ["Compare the product's actual dimensions with your space and access route.", "Check the stated construction, materials and assembly requirements.", "Follow the supplied care and installation guidance."],
};

export function profileGuidance(profile) {
  return GUIDE_COPY[profile.family] || [
    `Explore the product's verified ${profile.topic.toLowerCase()} details and choose the option that fits your needs.`,
    "Compare the actual specifications, materials and suitability information before choosing.",
    "Follow the product's own instructions and care guidance. Replace this sample copy with the brand's verified details.",
  ];
}

function comparison(profile) {
  return `<section class="sc-niche sc-comparison" data-niche-section="before-after" data-showcase-reveal data-reveal-kind="fade">
    <div><p class="sc-niche-kicker">A closer look · ${esc(profile.topic)}</p><h2>Before &amp; after</h2>
    <p class="sc-demo-label">Layout demonstration only. No product results are shown or claimed.</p></div>
    <div class="sc-compare" data-before-after style="--compare:50%">
      <div class="sc-compare-panel"><span>After photo</span><b>Your approved image belongs here</b><small>Genuine comparison media required</small></div>
      <div class="sc-compare-panel sc-compare-before"><span>Before photo</span><b>Your approved image belongs here</b><small>Genuine comparison media required</small></div>
      <i class="sc-compare-line" aria-hidden="true"></i>
      <label class="sc-compare-control">Slide to compare<input type="range" min="0" max="100" value="50" data-before-after-range aria-label="Before and after image comparison"></label>
    </div>
    <p class="sc-niche-note">Before publishing, add genuine comparison images with the necessary permissions and accurate context. Do not generate or retouch evidence of product efficacy.</p>
  </section>`;
}

export function renderNicheSections(context, data) {
  if (data.style_demo !== true || !["home", "collection", "product"].includes(context.page)) return "";
  const profile = showcaseProfile(data, context.style);
  const copy = profileGuidance(profile);
  const source = safeImage(context.media?.lifestyle?.url);
  return `<section class="sc-niche" data-niche-profile="${esc(profile.id)}" data-niche-family="${esc(profile.family)}">
    <div class="sc-niche-heading" data-showcase-reveal><p class="sc-niche-kicker">The ${esc(profile.topic)} guide</p><h2>Details that help you choose.</h2><p>Thoughtful guidance for ${esc(profile.topic.toLowerCase())}, not one checklist for every product.</p></div>
    <div class="sc-niche-grid">${profile.guides.map((heading, i) => `<article data-showcase-reveal data-reveal-kind="slide" style="--i:${i}"><span class="sc-niche-number">0${i + 1}</span><h3>${esc(heading)}</h3><p>${esc(copy[i])}</p></article>`).join("")}</div>
    ${context.page === "product" && source ? `<figure class="sc-niche-photo" data-showcase-reveal><img src="${esc(source)}" width="1024" height="1024" alt="Illustrative styling reference, not evidence of product results" loading="lazy"><figcaption>Illustrative reference image. Product guidance must come from verified product information.</figcaption></figure>` : ""}
  </section>${profile.comparison && context.page !== "collection" ? comparison(profile) : ""}`;
}

export const NICHE_SECTION_CSS = `
.sc-niche{padding:clamp(2.5rem,7vw,6rem) 1.5rem;border-top:1px solid var(--line);display:grid;gap:2rem}.sc-niche-heading{max-width:46rem}.sc-niche h2{font-size:clamp(2rem,4.5vw,4rem);line-height:1.08;margin:.6rem 0 1rem}.sc-niche h3{font:500 1.3rem var(--disp);margin:.8rem 0}.sc-niche p{max-width:58rem}.sc-niche-kicker{text-transform:uppercase;letter-spacing:.14em;font-size:.7rem}.sc-niche-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5rem}.sc-niche-grid article{padding:1.5rem;border-top:1px solid var(--ink)}.sc-niche-number{font:400 2rem var(--disp);color:var(--acc)}.sc-niche-grid p{font-size:.9rem}.sc-demo-label,.sc-niche-note{font-size:.8rem;line-height:1.6}.sc-demo-label{display:inline-block;margin-top:1rem!important;padding:.55rem .8rem;background:var(--tint);border:1px solid var(--line)}.sc-niche-photo{margin:0;max-width:38rem}.sc-niche-photo img{aspect-ratio:4/3;object-fit:cover}.sc-niche-photo figcaption{font-size:.7rem;margin-top:.5rem}
.sc-compare{position:relative;height:clamp(19rem,40vw,28rem);overflow:hidden;border:1px solid var(--line);isolation:isolate}.sc-compare-panel{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:.8rem;padding:2rem;background:repeating-linear-gradient(45deg,var(--tint),var(--tint) 1px,transparent 1px,transparent 18px);text-align:center}.sc-compare-panel span{font:400 clamp(2rem,5vw,4rem) var(--disp)}.sc-compare-panel b{font-weight:500;font-size:.85rem}.sc-compare-panel small{font-size:.7rem}.sc-compare-before{background:var(--paper,#fff);clip-path:inset(0 calc(100% - var(--compare)) 0 0)}.sc-compare-line{position:absolute;top:0;bottom:4rem;left:var(--compare);width:2px;background:var(--ink);pointer-events:none}.sc-compare-line:after{content:"↔";display:grid;place-items:center;position:absolute;top:45%;left:-20px;width:42px;height:42px;border:1px solid var(--ink);border-radius:50%;background:var(--paper,#fff);font-style:normal}.sc-compare-control{position:absolute;bottom:0;left:0;right:0;display:grid;gap:.3rem;padding:.6rem 1.2rem;background:var(--paper,#fff);font-size:.7rem;border-top:1px solid var(--line)}.sc-compare-control input{width:100%;accent-color:var(--acc);cursor:ew-resize}.sc-compare-control input:focus-visible{outline:2px solid var(--acc);outline-offset:3px}
.sc-boutique .sc-niche-grid article{background:var(--tint);border:0;border-radius:1.5rem}.sc-boutique .sc-compare{border-radius:2rem}.sc-architectural .sc-niche-grid{gap:0;border:3px solid var(--ink)}.sc-architectural .sc-niche-grid article{border-right:2px solid var(--ink);border-top:0}.sc-architectural .sc-niche-number{font-weight:700}.sc-minimal .sc-niche{padding-top:7rem;padding-bottom:7rem}.sc-minimal .sc-niche-grid article{padding-left:0}.sc-vintage .sc-niche-heading{text-align:center;margin:auto}.sc-vintage .sc-niche-grid article{border-top:3px double var(--line)}.sc-vintage .sc-compare{border:5px double var(--line)}
.sc-compare-panel>span{position:absolute;top:1rem;right:1rem;font:600 .8rem var(--body);padding:.3rem .6rem;background:var(--paper,#fff);border:1px solid var(--line)}.sc-compare-before>span{right:auto;left:1rem}
@media(max-width:640px){.sc-niche-grid{grid-template-columns:1fr}.sc-niche{padding:3rem 1rem}.sc-niche-grid article{padding:1rem}.sc-architectural .sc-niche-grid article{border-right:0;border-bottom:2px solid var(--ink)}.sc-compare-panel{padding:1rem}.sc-compare-panel b{max-width:15rem}}
`;
