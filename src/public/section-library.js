// Presentation metadata only. Existing persisted section types and page rules
// remain authoritative; this catalogue never grants insertion permissions.
const THEMES = ["editorial","boutique","architectural","minimal","vintage","social-pop","creator-feed","proof-detail"];
const CLASSIC = THEMES.slice(0,5);
const THEME_NAMES = ["Editorial","Modern Boutique","Bold Architectural","Minimal","Vintage","Social Pop","Creator Feed","Proof & Detail"];
export const SECTION_THEMES = Object.freeze(THEMES.map((id,i)=>Object.freeze({id,name:THEME_NAMES[i]})));
export const SECTION_CATEGORIES = Object.freeze([
  {id:"banners",name:"Banners & Messages"},
  {id:"products",name:"Products & Collections"},
  {id:"images",name:"Images & Galleries"},
  {id:"brand",name:"Brand & Story"},
  {id:"information",name:"Product Information"},
  {id:"trust",name:"Reviews & Trust"},
  {id:"offers",name:"Offers & Product Sets"},
  {id:"help",name:"Help & Policies"},
  {id:"layout",name:"Store Layout"},
].map(Object.freeze));
function entry(id,name,category,description,aliases=[],optionalType=null,themeIds=THEMES,layouts=null) {
  return Object.freeze({id,name,category,description,aliases:Object.freeze(aliases),optionalType,
    kind:category==="layout"?"global":"content",themeIds:Object.freeze([...themeIds]),
    layouts:Object.freeze((layouts||[{id:"shared",name:"Shared layout",themeId:"shared"}]).map(Object.freeze))});
}
export const SECTION_LIBRARY = Object.freeze([
  entry("announcement-bar","Announcement Bar","banners","A short store announcement with an optional link.",["announcement"]),
  entry("hero-banner","Hero Banner","banners","A main headline, image or video and call to action.",["hero"],null,THEMES,
    THEMES.map((themeId,i)=>({id:themeId,name:`${THEME_NAMES[i]} layout`,themeId}))),
  entry("intro-text","Intro Text","banners","A short introduction to a page or collection.",["top","introduction"]),
  entry("brand-statement","Brand Statement","banners","A prominent brand message or quotation.",["statement","quote","band"],"statement"),
  entry("closing-message","Closing Message","banners","A final message at the end of a page.",["end","closing-statement"]),
  entry("product-grid","Product Grid","products","Selected products, a collection or a catalogue in a visual layout.",
    ["featured-products","featured-collection","product-catalogue","product-feed","product-range","cat","feed","range","shelf","spreads","grid-sec","picks"],null,THEMES,
    THEMES.map((themeId,i)=>({id:themeId,name:`${THEME_NAMES[i]} product layout`,themeId}))),
  entry("featured-product","Featured Product","products","A single product highlighted with supporting content.",["spotlight","feature","product-spotlight"]),
  entry("collection-cards","Collection Cards","products","Visual links to store collections.",["cols","index","rooms","contents","collections","collection-nav"]),
  entry("collection-header","Collection Header","products","The collection title and opening information.",["collection-heading","collection-head"]),
  entry("collection-description","Collection Description","products","An introduction to a collection.",["collection-introduction"],"collection-description"),
  entry("related-products","Related Products","products","Suggestions for other products to explore."),
  entry("related-collections","Related Collections","products","Suggestions for other collections to explore.",[],"related-collections"),
  entry("image-banner","Image Banner","images","A large supporting lifestyle or product image.",["plate","lifestyle-image"]),
  entry("image-gallery","Image Gallery","images","Multiple images in a gallery or lookbook layout.",["gallery","lookbook","plates"],"lookbook"),
  entry("before-after","Before & After","images","A comparison of two images with supporting content.",["before-and-after"],null,["boutique"]),
  entry("brand-story","Brand Story","brand","The story of the brand or its founder.",["founder","story","duo","note","moment","founder-story"],"founder"),
  entry("about-brand","About the Brand","brand","An introduction to the business and its identity.",["about"]),
  entry("craft-materials","Craft & Materials","brand","How products are made and the materials used.",["craft","craft-and-materials"],"craft"),
  entry("store-highlights","Store Highlights","brand","Short facts and highlights about the store.",["stats","strip"]),
  entry("product-description","Product Description","information","Descriptive product text without purchase controls.",["product-description-text"]),
  entry("product-specifications","Product Specifications","information","Structured product attributes and details.",["product-specs"]),
  entry("materials-care","Materials & Care","information","Materials and product-care instructions.",["material-care","materials-and-care"],"material-care"),
  entry("size-guide","Size Guide","information","Sizing information for customers.",[],"size-guide"),
  entry("how-to-use","How to Use","information","Instructions for using a product.",[],"how-to-use"),
  entry("product-guide","Product Guide","information","Product guidance and explanatory information.",["niche","product-details-and-guidance","product-information-highlights"]),
  entry("routine-guide","Routine Guide","information","Products or instructions arranged as a routine.",["routine","routine-and-product-guide"]),
  entry("customer-reviews","Customer Reviews","trust","A presentation of genuine customer feedback.",["reviews"],"reviews"),
  entry("customer-photos","Customer Photos","trust","A gallery or strip of customer photographs.",["ugc","ugcs","community-photos"],null,CLASSIC),
  entry("press-logos","Press & Logos","trust","Press mentions and supporting logos.",["press"]),
  entry("store-details","Store Details","trust","Verified business information and store details.",["trust","trust-and-store-details"],"trust"),
  entry("shopping-information","Shopping Information","trust","Payment, delivery and returns information.",["badges","payment-delivery-and-trust"]),
  entry("offer-cards","Offer Cards","offers","Promotional messages. Actual discounts are configured separately.",["offers","offers-and-promotions"],null,CLASSIC),
  entry("product-set","Product Set","offers","Products displayed together. This does not configure bundle pricing.",["bundle","product-bundle"],null,CLASSIC),
  entry("faq","Frequently Asked Questions","help","Expandable questions and answers.",[],"faq"),
  entry("delivery-information","Delivery Information","help","Shipping and delivery information.",["shipping-info"]),
  entry("contact-information","Contact Information","help","Store contact details.",["contact"]),
  entry("policy-text","Policy Text","help","Store policy content.",["policy"]),
  entry("header","Header","layout","Store-wide logo, navigation and shopping links."),
  entry("footer","Footer","layout","Store-wide footer links and business information."),
]);
const normalize = value => String(value??"").replace(/\s*\(optional\)\s*$/i,"").replace(/&amp;|&/g,"and").toLowerCase().replace(/[^a-z0-9]/g,"");
const index = new Map();
for(const item of SECTION_LIBRARY) for(const key of [item.id,item.name,...item.aliases]) {
  const normalized=normalize(key);
  if(index.has(normalized)&&index.get(normalized)!==item) throw new Error("Duplicate section library alias.");
  index.set(normalized,item);
}
export function sectionLibraryEntry(value) {
  const text=String(value??"").replace(/^(?:sc|ed|bq|ar|mn|vt|sp|cf|pd)-/,"");
  return index.get(normalize(text))||null;
}
export function sectionDisplayName(value,fallback=String(value??"")) {
  return sectionLibraryEntry(value)?.name||fallback;
}
export function selectedLibraryTypes(types,info={}) {
  const hidden=new Set();
  for(const [id,meta] of info.meta||[]) if(meta.hidden) {
    const type=info.map?.get(id)?.type;
    if(type)hidden.add(type);
  }
  return (Array.isArray(types)?types:[]).filter(type=>!hidden.has(type));
}
export function libraryEntries({query="",category="",theme="",allowedTypes=[],selectedTypes=[]}={}) {
  const words=String(query).trim().toLowerCase().slice(0,160).split(/\s+/).filter(Boolean);
  const allowed=new Set(Array.isArray(allowedTypes)?allowedTypes:[]), selected=new Set(Array.isArray(selectedTypes)?selectedTypes:[]);
  return SECTION_LIBRARY.filter(item=>{
    if(category&&category!=="all"&&item.category!==category)return false;
    if(theme&&theme!=="all"&&!item.themeIds.includes(theme))return false;
    const text=[item.name,item.description,...item.aliases,
      SECTION_CATEGORIES.find(c=>c.id===item.category)?.name,...item.layouts.map(l=>l.name)].join(" ").toLowerCase();
    return words.every(word=>text.includes(word));
  }).map(item=>({...item,
    available:item.kind!=="global"&&Boolean(item.optionalType)&&allowed.has(item.optionalType),
    selected:Boolean(item.optionalType)&&selected.has(item.optionalType),
  }));
}
